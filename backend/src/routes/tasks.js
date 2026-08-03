import { authenticate } from "../middleware/auth.js";
import { query } from "../db/pool.js";
import { Router } from "express";
import logger from "../logger.js";
import { validate, schemas, sanitizeTask, checkSanitization } from "../middleware/validate.js";
import { cacheUserTasks, getCachedTasks, invalidateTaskCache } from "../db/redis.js";

const router = Router();

// Görevleri listele
router.get("/", authenticate, async (req, res) => {
  try {
    const cached = await getCachedTasks(req.user.id);
    if (cached) {
      logger.info(`[Tasks] Cache hit: ${req.user.id}`);
      return res.status(200).json({ tasks: cached });
    }

    const { rows } = await query(
      `SELECT * FROM tasks 
       WHERE user_id = $1 
       AND is_deleted = FALSE    
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    await cacheUserTasks(req.user.id, rows);
    logger.info(`[Tasks] Cache miss: ${req.user.id}`);

    return res.status(200).json({ tasks: rows });
  } catch (err) {
    logger.error(`[GET /tasks] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Görev ekle
router.post("/", authenticate, sanitizeTask, checkSanitization, validate(schemas.createTask), async (req, res) => {
  try {
    const { title } = req.body;
    const { rows } = await query(
      "INSERT INTO tasks (user_id, title) VALUES ($1, $2) RETURNING *",
      [req.user.id, title]
    );

    // Cache'i temizle
    await invalidateTaskCache(req.user.id);

    return res.status(201).json({ task: rows[0] });
  } catch (err) {
    logger.error(`[POST /tasks] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Görev güncelle
router.put("/:id", authenticate, sanitizeTask, checkSanitization, validate(schemas.updateTask), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, is_completed } = req.body;

    const { rows } = await query(
      `UPDATE tasks
       SET title        = COALESCE($1, title),
           is_completed = COALESCE($2, is_completed)
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [title ?? null, is_completed ?? null, id, req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Görev bulunamadı." });
    }

    // Cache'i temizle
    await invalidateTaskCache(req.user.id);

    return res.status(200).json({ task: rows[0] });
  } catch (err) {
    logger.error(`[PUT /tasks] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Görev sil
// ── DELETE /:id ────────────────────────────────────────────────
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Gerçekten silme — soft delete yap
    const { rowCount } = await query(
      `UPDATE tasks
       SET is_deleted = TRUE,
           deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE`,
      [id, req.user.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Görev bulunamadı." });
    }

    // Cache'i temizle
    await invalidateTaskCache(req.user.id);

    return res.status(204).send();
  } catch (err) {
    logger.error(`[DELETE /tasks] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;