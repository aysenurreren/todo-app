import { createClient } from "redis";

const publisher = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

publisher.on("error", (err) =>
  console.error("[LogClient] Redis hatası:", err.message)
);

await publisher.connect();
console.log("[LogClient] Redis bağlandı");

// Stream adı
const STREAM = "logs-stream";

// Stream oluştur (yoksa otomatik oluşturulur)
export const sendLog = async ({ level, service, action, message, metadata }) => {
  try {
    await publisher.xAdd(STREAM, "*", {
      level:    level || "INFO",
      service:  service || "unknown",
      action:   action  || "",
      message:  message || "",
      metadata: metadata ? JSON.stringify(metadata) : "{}",
    });
  } catch (err) {
    console.error("[LogClient] Stream'e yazılamadı:", err.message);
  }
};