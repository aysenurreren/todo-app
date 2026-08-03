import { query } from "./db/pool.js";
import logger from "./logger.js";

// ── Audit Log Kaydet ───────────────────────────────────────────
export const logAction = async ({
  userId,
  action,
  entityType = null,
  entityId   = null,
  ipAddress  = null,
}) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, ipAddress]
    );
  } catch (err) {
    // Audit log hatası sistemi durdurmasın — sadece logla
    logger.error(`[Audit] Kayıt hatası: ${err.message}`);
  }
};