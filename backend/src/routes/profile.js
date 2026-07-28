import { Router } from "express";
import { query } from "../db/pool.js";
import { authenticate } from "../middleware/auth.js";
import logger from "../logger.js";
import { sanitizeProfile, checkSanitization } from "../middleware/validate.js";

const router = Router();

// ── GET /api/profile ───────────────────────────────────────────
router.get("/", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, email, full_name, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    logger.error(`[GET / profile] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── PUT /api/profile ───────────────────────────────────────────
router.put("/", authenticate,sanitizeProfile,checkSanitization,async (req, res) => {
  try {
    const { full_name } = req.body;

    if (!full_name || full_name.trim().length === 0) {
      return res.status(400).json({ error: "Ad soyad boş olamaz." });
    }

    if (full_name.trim().length > 100) {
      return res.status(400).json({ error: "Ad soyad en fazla 100 karakter olabilir." });
    }

    const { rows } = await query(
      `UPDATE users
       SET full_name = $1
       WHERE id = $2
       RETURNING id, email, full_name, created_at`,
      [full_name.trim(), req.user.id]
    );

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    logger.error(`[PUT /profile] ${err.message}`);;
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;