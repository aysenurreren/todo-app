import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.LOG_DATABASE_URL,
  min: 1,
  max: 5,
});

pool.on("error", (err) => {
  console.error("[Log DB Pool] Hata:", err.message);
});

pool.on("connect", () => {
  console.log("[Log DB Pool] Bağlandı");
});

export const query = (text, params) => pool.query(text, params);
export default pool;