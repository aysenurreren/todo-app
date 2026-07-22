import pg from "pg";
const { Pool } = pg;

// ── Bağlantı Havuzu ────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: 2,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Havuz hatalarını yakala — process çökmesini önler
pool.on("error", (err) => {
  console.error("[DB Pool] Beklenmeyen hata:", err.message);
});

// ── Dışarıya Açılan Fonksiyonlar ───────────────────────────────

// Tek seferlik sorgu: havuzdan al → çalıştır → geri bırak
export const query = (text, params) => pool.query(text, params);

// Transaction için: bağlantıyı sen yönet, bitince release() çağır
export const getClient = () => pool.connect();
