// ── Log Servisi İstemcisi ──────────────────────────────────────
const LOG_SERVICE_URL = process.env.LOG_SERVICE_URL || "http://log-service:5001";

export const sendLog = async ({ level, service, action, message, metadata }) => {
  try {
    await fetch(`${LOG_SERVICE_URL}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, service, action, message, metadata }),
    });
  } catch (err) {
    // Log servisi çökse bile uygulama durmuyor
    console.error("[LogClient] Log gönderilemedi:", err.message);
  }
};