import { authenticate } from "../middleware/auth.js";
import { validate, schemas } from "../middleware/validate.js";
import { query } from "../db/pool.js";
import { Router } from "express";
import logger from "../logger.js";

const router = Router();

// Görevleri listele
router.get("/", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.status(200).json({ tasks: rows });
  } catch (err) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Görev ekle
router.post("/", authenticate, validate(schemas.createTask), async (req, res) => {
  try {
    const { title } = req.body;
    const { rows } = await query(
      "INSERT INTO tasks (user_id, title) VALUES ($1, $2) RETURNING *",
      [req.user.id, title]
    );
    return res.status(201).json({ task: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Görev güncelle
router.put("/:id", authenticate, validate(schemas.updateTask), async (req, res) => {
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
    return res.status(200).json({ task: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Görev sil
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await query(
      "DELETE FROM tasks WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Görev bulunamadı." });
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;