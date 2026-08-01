import pg from "pg";
import { dbCircuitBreaker } from "../circuitBreaker.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: 2,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[DB Pool] Beklenmeyen hata:", err.message);
});

pool.on("connect", () => {
  console.log(`[DB Pool] Yeni bağlantı (instance: ${process.env.INSTANCE_ID})`);
});

// Circuit Breaker ile sarmalanmış query
export const query = (text, params) =>
  dbCircuitBreaker.execute(() => pool.query(text, params));

export const getClient = () =>
  dbCircuitBreaker.execute(() => pool.connect());

export default pool;