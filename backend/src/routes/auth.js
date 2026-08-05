import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.js";
import { setTokenActive, revokeToken, incrementLoginAttempts, getLoginAttempts, resetLoginAttempts } from "../db/redis.js";
import { authenticate } from "../middleware/auth.js";
import { sendVerificationEmail, sendLoginAlertEmail, sendPasswordResetEmail } from "../mailer.js";
import logger from "../logger.js";
import { validate, schemas, sanitizeRegister, checkSanitization } from "../middleware/validate.js";
import { logAction } from "../audit.js";
import { sendLog } from "../logClient.js";

const router = Router();

// ── Yardımcı: JWT üret ve Redis'e kaydet ──────────────────────
const issueToken = async (user, res) => {
  const jti       = uuidv4();
  const expiresIn = "15m"; // Access Token → 15 dakika

  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, jti },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  // 15 dakika = 900 saniye
  await setTokenActive(jti, user.id, 900);

  // Refresh Token → ayrı secret ile imzala
  const refreshToken = jwt.sign(
    { sub: user.id },
    process.env.REFRESH_SECRET,
    { expiresIn: "7d" }
  );

  // Refresh Token → HttpOnly Cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,     // JavaScript erişemez
    secure: false,      // HTTPS olmadığı için false (production'da true)
    sameSite: "strict", // CSRF koruması
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
  });

  return accessToken;
};


// ── POST /register ─────────────────────────────────────────────
router.post("/register", sanitizeRegister, checkSanitization, validate(schemas.register), async (req, res) => {
  try {
    const { email, password } = req.body;

    const password_hash = await bcrypt.hash(password, 12);
    const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
    const verification_expires = new Date(Date.now() + 10 * 60 * 1000); // 10 dakika

    const { rows } = await query(
      `INSERT INTO users (email, password_hash, verification_code, verification_expires)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email`,
      [email, password_hash, verification_code, verification_expires]
    );

    await sendVerificationEmail(email, verification_code);

    return res.status(201).json({
      message: "Kayıt başarılı. Email adresine doğrulama kodu gönderildi.",
      userId: rows[0].id,
    });

  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Bu email zaten kayıtlı." });
    }
    logger.error(`[Register] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

// ── POST /login ────────────────────────────────────────────────
router.post("/login", sanitizeRegister, checkSanitization, validate(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Email bazlı rate limit kontrolü ───────────────────────
    const attempts = await getLoginAttempts(email);
    if (attempts && parseInt(attempts) >= 5) {
      return res.status(429).json({
        error: "Çok fazla başarısız deneme. 15 dakika sonra tekrar dene.",
      });
    }

    const { rows } = await query(
      "SELECT id, email, password_hash, is_verified FROM users WHERE email = $1",
      [email]
    );

    const user = rows[0];

    // Timing attack koruması
    const dummy   = "$2b$12$invaliddummyhashfortiming000000000000000000";
    const isMatch = await bcrypt.compare(
      password,
      user ? user.password_hash : dummy
    );

    if (!user || !isMatch) {
      // ── Başarısız deneme → sayacı artır ───────────────────
      await incrementLoginAttempts(email);
      const newAttempts = await getLoginAttempts(email);
      const remaining = 5 - parseInt(newAttempts);

      // 5. denemede uyarı maili gönder
      if (parseInt(newAttempts) === 5 && user) {
        await sendLoginAlertEmail(email);

        logger.warn(`[Login] Şüpheli giriş uyarısı gönderildi: ${email}`);

        await sendLog({
          level:   "WARN",
          service: "auth",
          action:  "RATE_LIMIT",
          message: `5 başarısız deneme: ${email}`,
          metadata: { email, ip: req.headers["x-real-ip"] || req.ip },
  });
  }

      return res.status(401).json({
        error: "Unauthorized",
        remaining: remaining > 0 ? remaining : 0,
      });
    }

    // Email doğrulanmış mı?
    if (!user.is_verified) {
      return res.status(403).json({
        error: "Email adresiniz doğrulanmamış.",
        userId: user.id,
      });
    }

    // Audit log
    await logAction({
      userId:     user.id,
      action:     "LOGIN",
      ipAddress:  req.headers["x-real-ip"] || req.ip,
  });
    // ── Başarılı giriş → sayacı sıfırla ───────────────────────
    await resetLoginAttempts(email);

    await sendLog({
      level:   "INFO",
      service: "auth",
      action:  "LOGIN",
      message: `Kullanıcı giriş yaptı: ${email}`,
      metadata: { userId: user.id, ip: req.headers["x-real-ip"] || req.ip },
});

    const accessToken = await issueToken(user, res);
    return res.status(200).json({
      user: { id: user.id, email: user.email },
      token: accessToken,
});

  } catch (err) {
    console.error("[Login]", err.message);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

// ── POST /verify ───────────────────────────────────────────────
router.post("/verify", async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: "userId ve code alanları zorunludur." });
    }

    const { rows } = await query(
      `SELECT id, email, verification_code, verification_expires, is_verified
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    if (user.is_verified) {
      return res.status(400).json({ error: "Bu hesap zaten doğrulanmış." });
    }

    // Kodun süresi dolmuş mu? (DÜZELTME EKLENDİ)
    if (new Date() > new Date(user.verification_expires)) {
      return res.status(400).json({ error: "Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin." });
    }

    // Kod doğru mu?
    if (user.verification_code !== code) {
      return res.status(400).json({ error: "Doğrulama kodu yanlış." });
    }

    await query(
      `UPDATE users
       SET is_verified = TRUE,
           verification_code = NULL,
           verification_expires = NULL
       WHERE id = $1`,
      [userId]
    );

    const accessToken = await issueToken(user, res);
    return res.status(200).json({
      user: { id: user.id, email: user.email },
      token: accessToken,
});

  } catch (err) {
    logger.error(`[Verify] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

// ── POST /resend-code ──────────────────────────────────────────
router.post("/resend-code", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId alanı zorunludur." });
    }

    const { rows } = await query(
      "SELECT id, email, is_verified, verification_expires FROM users WHERE id = $1",
      [userId]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    if (user.is_verified) {
      return res.status(400).json({ error: "Bu hesap zaten doğrulanmış." });
    }

    // Rate Limit Kontrolü: En son kodun üzerinden 1 dk geçmediyse engelle (DÜZELTME EKLENDİ)
    if (user.verification_expires) {
      const now = new Date();
      const expiresAt = new Date(user.verification_expires);
      const diffInSeconds = (expiresAt - now) / 1000;

      if (diffInSeconds > 540) { // 10dk'lık sürenin dolmasına 9dk'dan fazla varsa
        return res.status(429).json({ error: "Lütfen yeni kod istemeden önce 1 dakika bekleyin." });
      }
    }

    const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
    const verification_expires = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `UPDATE users
       SET verification_code = $1,
           verification_expires = $2
       WHERE id = $3`,
      [verification_code, verification_expires, userId]
    );

    await sendVerificationEmail(user.email, verification_code);

    return res.status(200).json({
      message: "Yeni doğrulama kodu email adresine gönderildi.",
    });

  } catch (err) {
    logger.error(`[Resend Code] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

// ── POST /forgot-password ──────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email zorunludur." });
    }

    const { rows } = await query(
      "SELECT id, email FROM users WHERE email = $1",
      [email]
    );

    // Güvenlik: kullanıcı yoksa da aynı mesajı dön
    // Email varlığını sızdırma
    if (!rows[0]) {
      return res.status(200).json({
        message: "Eğer bu email kayıtlıysa sıfırlama linki gönderildi.",
      });
    }

    // Rastgele token üret (64 karakter)
    const resetToken   = uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "");
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

    // DB'ye kaydet
    await query(
      `UPDATE users
       SET reset_token = $1, reset_token_expires = $2
       WHERE id = $3`,
      [resetToken, resetExpires, rows[0].id]
    );

    // Email gönder
    await sendPasswordResetEmail(email, resetToken);

    logger.info(`[ForgotPassword] Sıfırlama emaili gönderildi: ${email}`);

    return res.status(200).json({
      message: "Eğer bu email kayıtlıysa sıfırlama linki gönderildi.",
    });

  } catch (err) {
    logger.error(`[ForgotPassword] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

// ── POST /reset-password ───────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token ve şifre zorunludur." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Şifre en az 8 karakter olmalıdır." });
    }

    // Token'ı bul
    const { rows } = await query(
      `SELECT id, email FROM users
       WHERE reset_token = $1
       AND reset_token_expires > NOW()`,
      [token]
    );

    if (!rows[0]) {
      return res.status(400).json({
        error: "Geçersiz veya süresi dolmuş token.",
      });
    }

    // Yeni şifreyi hash'le
    const password_hash = await bcrypt.hash(password, 12);

    // Şifreyi güncelle, token'ı temizle
    await query(
      `UPDATE users
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires = NULL
       WHERE id = $2`,
      [password_hash, rows[0].id]
    );

    // Audit log
    await logAction({
      userId:    rows[0].id,
      action:    "PASSWORD_RESET",
      ipAddress: req.headers["x-real-ip"] || req.ip,
  });

    // Tüm aktif token'ları Redis'ten sil (güvenlik)
    logger.info(`[ResetPassword] Şifre sıfırlandı: ${rows[0].email}`);

    return res.status(200).json({
      message: "Şifreniz başarıyla sıfırlandı. Giriş yapabilirsiniz.",
    });

  } catch (err) {
    logger.error(`[ResetPassword] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

// ── POST /refresh ──────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  try {
    // Cookie'den refresh token al
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token bulunamadı." });
    }

    // Refresh token'ı doğrula
    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: "Geçersiz refresh token." });
    }

    // Kullanıcıyı bul
    const { rows } = await query(
      "SELECT id, email FROM users WHERE id = $1",
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: "Kullanıcı bulunamadı." });
    }

    // Yeni access token üret
    const accessToken = await issueToken(rows[0], res);

    return res.status(200).json({ token: accessToken });

  } catch (err) {
    logger.error(`[Refresh] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

// ── POST /logout ───────────────────────────────────────────────
router.post("/logout", authenticate, async (req, res) => {
  try {
    await revokeToken(req.user.jti);
    // Audit log
    await logAction({
      userId:    req.user.id,
      action:    "LOGOUT",
      ipAddress: req.headers["x-real-ip"] || req.ip,
  });

    return res.status(200).json({ message: "Çıkış yapıldı." });
  } catch (err) {
    logger.error(`[Logout] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });

     await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user.id, path: req.path },
  });
  }
});

export default router;