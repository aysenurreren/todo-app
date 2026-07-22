import { createClient } from "redis";

// ── Redis Client ───────────────────────────────────────────────
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    // Bağlantı koparsa: 100ms, 200ms, 300ms... max 3sn bekleyerek tekrar dene
  },
});

redisClient.on("error", (err) =>
  console.error("[Redis] Hata:", err.message)
);

redisClient.on("connect", () =>
  console.log("[Redis] Bağlandı")
);

await redisClient.connect();

// ── Yardımcı Fonksiyonlar ──────────────────────────────────────

// Token'ı Redis'e yaz, TTL ver
export const setTokenActive = (jti, userId, ttlSaniye) =>
  redisClient.setEx(`token:${jti}`, ttlSaniye, userId);

// Token var mı kontrol et
export const isTokenActive = (jti) =>
  redisClient.get(`token:${jti}`);

// Token'ı sil (logout)
export const revokeToken = (jti) =>
  redisClient.del(`token:${jti}`);

export default redisClient;