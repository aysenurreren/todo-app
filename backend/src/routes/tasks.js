import { authenticate } from "../middleware/auth.js";
import { query } from "../db/pool.js";
import { Router } from "express";
import logger from "../logger.js";
import { validate, schemas, sanitizeTask, checkSanitization } from "../middleware/validate.js";
import { cacheUserTasks, getCachedTasks, invalidateTaskCache } from "../db/redis.js";
import { logAction } from "../audit.js";
import { sendLog } from "../logClient.js";

const router = Router();

// Görevleri listele
router.get("/", authenticate, async (req, res) => {
  try {
    // Sayfalama parametreleri
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Cache anahtarına sayfa bilgisi ekle
    const cacheKey = `${req.user.id}:page:${page}:limit:${limit}`;
    const cached = await getCachedTasks(cacheKey);
    if (cached) {
      logger.info(`[Tasks] Cache hit: ${cacheKey}`);
      return res.status(200).json(cached);
    }

    // Toplam görev sayısı
    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM tasks 
       WHERE user_id = $1 AND is_deleted = FALSE`,
      [req.user.id]
    );
    const total = parseInt(countRows[0].count);

    // Görevleri getir
    const { rows } = await query(
      `SELECT * FROM tasks
       WHERE user_id = $1 AND is_deleted = FALSE
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const response = {
      tasks: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };

    // Cache'e kaydet
    await cacheUserTasks(cacheKey, response);
    logger.info(`[Tasks] Cache miss: ${cacheKey}`);

    return res.status(200).json(response);
  } catch (err) {
    await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_LIST_ERROR",
      message: err.message,
      metadata: { userId: req.user?.id },
  });
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

    // Audit log
    await logAction({
      userId:     req.user.id,
      action:     "TASK_CREATED",
      entityType: "task",
      entityId:   rows[0].id,
      ipAddress:  req.headers["x-real-ip"] || req.ip,
  });

    // Log servisi
    await sendLog({
      level:   "INFO",
      service: "tasks",
      action:  "TASK_CREATED",
      message: `Görev oluşturuldu: ${rows[0].title}`,
      metadata: { userId: req.user.id, taskId: rows[0].id },
    });

    return res.status(201).json({ task: rows[0] });
  } catch (err) {
    await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_CREATE_ERROR",
      message: err.message,
      metadata: { userId: req.user?.id },
  });
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
    await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_UPDATE_ERROR",
      message: err.message,
      metadata: { userId: req.user?.id },
  });
    logger.error(`[PUT /tasks] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Görev sil
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

    // Audit log
    await logAction({
      userId:     req.user.id,
      action:     "TASK_DELETED",
      entityType: "task",
      entityId:   id,
      ipAddress:  req.headers["x-real-ip"] || req.ip,
  });

    await sendLog({
    level:   "INFO",
    service: "tasks",
    action:  "TASK_DELETED",
    message: `Görev silindi`,
    metadata: { userId: req.user.id, taskId: id },
  });


    return res.status(204).send();
  } catch (err) {
    await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_DELETE_ERROR",
      message: err.message,
      metadata: { userId: req.user?.id },
  });
    logger.error(`[DELETE /tasks] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /:id/restore ──────────────────────────────────────────
router.post("/:id/restore", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { rowCount } = await query(
      `UPDATE tasks
       SET is_deleted = FALSE,
           deleted_at = NULL
       WHERE id = $1 AND user_id = $2 AND is_deleted = TRUE`,
      [id, req.user.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Silinmiş görev bulunamadı." });
    }

    // Cache'i temizle
    await invalidateTaskCache(req.user.id);

    // Audit log
    await logAction({
      userId:     req.user.id,
      action:     "TASK_RESTORED",
      entityType: "task",
      entityId:   id,
      ipAddress:  req.headers["x-real-ip"] || req.ip,
  });

    await sendLog({
      level:   "INFO",
      service: "tasks",
      action:  "TASK_RESTORED",
      message: `Görev geri alındı`,
      metadata: { userId: req.user.id, taskId: id },
    });


    return res.status(200).json({ message: "Görev geri alındı." });
  } catch (err) {
      await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_RESTORE_ERROR",
      message: err.message,
      metadata: { userId: req.user?.id },
  });
    logger.error(`[RESTORE /tasks] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /deleted ───────────────────────────────────────────────
router.get("/deleted", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM tasks
       WHERE user_id = $1
       AND is_deleted = TRUE
       ORDER BY deleted_at DESC`,
      [req.user.id]
    );

    return res.status(200).json({ tasks: rows });
  } catch (err) {
    await sendLog({
      level:   "ERROR",
      service: "tasks",
      action:  "TASK_LIST_ERROR",
      message: err.message,
      metadata: { userId: req.user?.id },
  });
    logger.error(`[GET /tasks/deleted] ${err.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;