import express    from "express";
import { createClient } from "redis";
import { query }  from "./db/pool.js";

const app  = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());

// ── Redis Subscriber ───────────────────────────────────────────
const subscriber = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

subscriber.on("error", (err) =>
  console.error("[Subscriber] Redis hatası:", err.message)
);

await subscriber.connect();
console.log("[Subscriber] Redis bağlandı");

// "logs" kanalını dinle
await subscriber.subscribe("logs", async (message) => {
  try {
    const { level, service, action, message: msg, metadata } = JSON.parse(message);

    await query(
      `INSERT INTO logs (level, service, action, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        level.toUpperCase(),
        service,
        action   || null,
        msg      || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    console.log(`[Log] ${level} | ${service} | ${action}`);
  } catch (err) {
    console.error("[Subscriber] Log yazılamadı:", err.message);
  }
});

// ── HTTP Endpoint'leri ─────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    return res.status(200).json({ status: "ok", service: "log-service" });
  } catch (err) {
    return res.status(503).json({ status: "error", message: err.message });
  }
});

app.get("/logs", async (req, res) => {
  try {
    const { level, service, limit = 50 } = req.query;

    let sql      = "SELECT * FROM logs WHERE 1=1";
    const params = [];
    let   i      = 1;

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Log Service] ${PORT} portunda çalışıyor`);
});