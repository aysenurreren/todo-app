import express from "express";
import { createClient } from "redis";
import { query } from "./db/pool.js";

const app  = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());

// ── Redis Stream Consumer ──────────────────────────────────────
const consumer = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

consumer.on("error", (err) =>
  console.error("[Consumer] Redis hatası:", err.message)
);

await consumer.connect();
console.log("[Consumer] Redis bağlandı");

const STREAM   = "logs-stream";
const GROUP    = "log-service-group";
const CONSUMER = "log-service-1";

// Consumer group oluştur
try {
  await consumer.xGroupCreate(STREAM, GROUP, "0", { MKSTREAM: true });
  console.log("[Consumer] Group oluşturuldu");
} catch (err) {
  if (err.message.includes("BUSYGROUP")) {
    console.log("[Consumer] Group zaten var");
  } else {
    console.error("[Consumer] Group hatası:", err.message);
  }
}

// Stream'i dinle
const processMessages = async () => {
  while (true) {
    try {
      const results = await consumer.xReadGroup(
        GROUP,
        CONSUMER,
        [{ key: STREAM, id: ">" }],
        { COUNT: 10, BLOCK: 5000 }
      );

      if (!results) continue;

      for (const { messages } of results) {
        for (const { id, message } of messages) {
          try {
            const { level, service, action, message: msg, metadata } = message;

            await query(
              `INSERT INTO logs (level, service, action, message, metadata)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                level.toUpperCase(),
                service,
                action   || null,
                msg      || null,
                metadata || null,
              ]
            );

            // Mesajı işlendi olarak işaretle
            await consumer.xAck(STREAM, GROUP, id);

            console.log(`[Log] ${level} | ${service} | ${action}`);
          } catch (err) {
            console.error("[Consumer] Mesaj işlenemedi:", err.message);
            // ACK yapmıyoruz — başarısız mesaj tekrar denenir
          }
        }
      }
    } catch (err) {
      console.error("[Consumer] Stream okuma hatası:", err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};

// Arka planda başlat
processMessages();

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