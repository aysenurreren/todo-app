import express from "express";
import { query } from "./db/pool.js";

const app  = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());

// ── Sağlık Kontrolü ───────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    return res.status(200).json({ status: "ok", service: "log-service" });
  } catch (err) {
    return res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Log Kaydet ─────────────────────────────────────────────────
app.post("/logs", async (req, res) => {
  try {
    const { level, service, action, message, metadata } = req.body;

    // Zorunlu alan kontrolü
    if (!level || !service) {
      return res.status(400).json({ error: "level ve service zorunludur." });
    }

    // Geçerli seviye mi?
    const validLevels = ["INFO", "WARN", "ERROR"];
    if (!validLevels.includes(level.toUpperCase())) {
      return res.status(400).json({ error: "Geçersiz level. INFO, WARN veya ERROR olmalı." });
    }

    await query(
      `INSERT INTO logs (level, service, action, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        level.toUpperCase(),
        service,
        action   || null,
        message  || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("[POST /logs]", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── Logları Getir ──────────────────────────────────────────────
app.get("/logs", async (req, res) => {
  try {
    const { level, service, limit = 50 } = req.query;

    let sql    = "SELECT * FROM logs WHERE 1=1";
    const params = [];
    let   i    = 1;

    if (level) {
      sql += ` AND level = $${i++}`;
      params.push(level.toUpperCase());
    }

    if (service) {
      sql += ` AND service = $${i++}`;
      params.push(service);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(parseInt(limit));

    const { rows } = await query(sql, params);
    return res.status(200).json({ logs: rows, total: rows.length });
  } catch (err) {
    console.error("[GET /logs]", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── Sunucu Başlat ──────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Log Service] ${PORT} portunda çalışıyor`);
});