import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import tasksRouter from "./routes/tasks.js";
import profileRouter from "./routes/profile.js";
import logger from "./logger.js";
import pool, { query } from "./db/pool.js";
import redisClient from "./db/redis.js";
import { dbCircuitBreaker, redisCircuitBreaker } from "./circuitBreaker.js";
import cookieParser from "cookie-parser";

const app = express();

// ── Middleware'ler ─────────────────────────────────────────────
app.use(helmet({
  // X-Frame-Options: SAMEORIGIN
  // Siten başka bir sitede iframe içinde açılamasın
  frameguard: { action: "sameorigin" },

  // X-Content-Type-Options: nosniff
  // Tarayıcı dosya tipini tahmin etmesin, header'a güvensin
  noSniff: true,

  // X-XSS-Protection: 1; mode=block
  // Eski tarayıcılarda XSS koruması
  xssFilter: true,

  // Referrer-Policy
  // Başka siteye gidince URL bilgisi gönderilmesin
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },

  // HSTS — HTTPS olmadan açma
  hsts: false,

  // Content-Security-Policy — şimdilik kapalı
  // Frontend ayrı servis olduğu için karmaşıklaşır
  contentSecurityPolicy: false,
}));
app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use(express.json());


// ── Request Timeout ────────────────────────────────────────────
app.use((req, res, next) => {
  // Her istek için 30 saniye timeout
  req.setTimeout(30000, () => {
    logger.warn(`[Timeout] İstek zaman aşımına uğradı: ${req.method} ${req.path}`);
    res.status(503).json({ error: "İstek zaman aşımına uğradı." });
  });
  next();
});


// ── Request Logger ─────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── Health Check ───────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  const health = {
    status: "ok",
    instance: process.env.INSTANCE_ID,
    timestamp: new Date().toISOString(),
    services: {
      database: "unknown",
      redis: "unknown",
    },
    circuitBreakers: {
      database: dbCircuitBreaker.getState(),
      redis:    redisCircuitBreaker.getState(),
    },
  };

  // PostgreSQL kontrolü
  try {
    await query("SELECT 1");
    health.services.database = "ok";
  } catch {
    health.services.database = "error";
    health.status = "degraded";
  }

  // Redis kontrolü
  try {
    await redisClient.ping();
    health.services.redis = "ok";
  } catch {
    health.services.redis = "error";
    health.status = "degraded";
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return res.status(statusCode).json(health);
});

// ── Route'lar ──────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/profile", profileRouter);

// ── Sunucu ────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Sunucu ${PORT} portunda çalışıyor`);
});

// ── Graceful Shutdown ──────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`[Server] ${signal} alındı, kapatılıyor...`);

  server.close(async () => {
    logger.info("[Server] Yeni bağlantı kabul edilmiyor");

    try {
      // PostgreSQL bağlantı havuzunu kapat
      await pool.end();
      logger.info("[DB Pool] Kapatıldı");
    } catch (err) {
      logger.error(`[DB Pool] Kapatma hatası: ${err.message}`);
    }

    try {
      // Redis bağlantısını kapat
      await redisClient.quit();
      logger.info("[Redis] Bağlantı kapatıldı");
    } catch (err) {
      logger.error(`[Redis] Kapatma hatası: ${err.message}`);
    }

    logger.info("[Server] Temiz kapatma tamamlandı");
    process.exit(0);
  });

  // 10 saniye içinde kapanmazsa zorla kapat
  setTimeout(() => {
    logger.error("[Server] Zorla kapatılıyor");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

export default app;