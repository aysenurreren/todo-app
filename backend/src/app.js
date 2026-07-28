import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import tasksRouter from "./routes/tasks.js";
import profileRouter from "./routes/profile.js";
import logger from "./logger.js";

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
app.use(cors());
app.use(express.json());


// ── Request Logger ─────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── Route'lar ──────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/profile", profileRouter);

// ── Sunucu ────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`Sunucu ${PORT} portunda çalışıyor`);
});

export default app;