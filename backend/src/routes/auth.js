import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.js";
import { setTokenActive, revokeToken} from "../db/redis.js";
import { authenticate } from "../middleware/auth.js";
import { sendVerificationEmail } from "../mailer.js";
import logger from "../logger.js";
import { validate, schemas, sanitizeRegister, checkSanitization } from "../middleware/validate.js";

const router = Router();

// ── Yardımcı: JWT üret ve Redis'e kaydet ──────────────────────
const issueToken = async (user) => {
  const jti = uuidv4();
  const expiresIn = "7d";

  const token = jwt.sign(
    { sub: user.id, email: user.email, jti },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  // 7 gün = 604800 saniye
  await setTokenActive(jti, user.id, 604800);

  return token;
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
  }
});

// ── POST /login ────────────────────────────────────────────────
router.post("/login", sanitizeRegister, checkSanitization, validate(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      "SELECT id, email, password_hash, is_verified FROM users WHERE email = $1",
      [email]
    );

    const user = rows[0];

    // Timing attack koruması
    const dummy = "$2b$12$invaliddummyhashfortiming000000000000000000";
    const isMatch = await bcrypt.compare(
      password,
      user ? user.password_hash : dummy
    );

    if (!user || !isMatch) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        error: "Email adresiniz doğrulanmamış.",
        userId: user.id,
      });
    }

    const token = await issueToken(user);

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      token,
    });

  } catch (err) {
    logger.error(`[Login] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
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

    const token = await issueToken(user);

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      token,
    });

  } catch (err) {
    logger.error(`[Verify] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
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
  }
});

// ── POST /logout ───────────────────────────────────────────────
router.post("/logout", authenticate, async (req, res) => {
  try {
    await revokeToken(req.user.jti);
    return res.status(200).json({ message: "Çıkış yapıldı." });
  } catch (err) {
    logger.error(`[Logout] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;