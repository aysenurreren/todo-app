import { createClient } from "redis";
import logger from "../logger.js";

// ── Redis Client ───────────────────────────────────────────────
const redisClient = createClient({
  url: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

redisClient.on("error", (err) =>
  logger.error(`[Redis] Hata: ${err.message}`)
);

redisClient.on("connect", () =>
  logger.info("[Redis] Bağlandı")
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

// ── Login Deneme Sayacı ────────────────────────────────────────

// Başarısız denemeyi kaydet
export const incrementLoginAttempts = async (email) => {
  const key = `login_attempts:${email}`;
  const attempts = await redisClient.incr(key);
  // İlk denemeyse TTL ayarla (15 dakika)
  if (attempts === 1) {
    await redisClient.expire(key, 15 * 60);
  }
  return attempts;
};

// Kaç deneme yapıldığını getir
export const getLoginAttempts = (email) =>
  redisClient.get(`login_attempts:${email}`);

// Başarılı girişte sayacı sıfırla
export const resetLoginAttempts = (email) =>
  redisClient.del(`login_attempts:${email}`);

// ── Task Cache ─────────────────────────────────────────────────

// Görevleri cache'e kaydet (5 dakika TTL)
export const cacheUserTasks = (userId, tasks) =>
  redisClient.setEx(
    `tasks:${userId}`,
    5 * 60,
    JSON.stringify(tasks)
  );

// Cache'den görevleri getir
export const getCachedTasks = async (userId) => {
  const data = await redisClient.get(`tasks:${userId}`);
  return data ? JSON.parse(data) : null;
};

// Cache'i temizle (veri değişince)
export const invalidateTaskCache = async (userId) => {
  const keys = await redisClient.keys(`tasks:${userId}*`);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
};

export default redisClient;