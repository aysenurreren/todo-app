import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db/pool.js";
import { setTokenActive, revokeToken} from "../db/redis.js";
import { validate, schemas } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// ── Yardımcı: JWT üret ve Redis'e kaydet ──────────────────────
const issueToken = async (user) => {
  const jti      = uuidv4();
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
router.post("/register", validate(schemas.register), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Şifreyi hash'le
    const password_hash = await bcrypt.hash(password, 12);

    // DB'ye kaydet
    const { rows } = await query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, password_hash]
    );

    const user  = rows[0];
    const token = await issueToken(user);

    return res.status(201).json({
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (err) {
    // PostgreSQL unique constraint → email zaten kayıtlı
    if (err.code === "23505") {
      return res.status(409).json({ error: "Bu email zaten kayıtlı." });
    }
    console.error("[Register]", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /login ────────────────────────────────────────────────
router.post("/login", validate(schemas.register), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    const user = rows[0];

    // Timing attack koruması — kullanıcı olmasa da bcrypt çalışsın
    const dummy   = "$2b$12$invaliddummyhashfortiming000000000000000000";
    const isMatch = await bcrypt.compare(
      password,
      user ? user.password_hash : dummy
    );

    if (!user || !isMatch) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = await issueToken(user);

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (err) {
    console.error("[Login]", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /logout ───────────────────────────────────────────────
router.post("/logout", authenticate, async (req, res) => {
  try {
    await revokeToken(req.user.jti);
    return res.status(200).json({ message: "Çıkış yapıldı." });
  } catch (err) {
    console.error("[Logout]", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;