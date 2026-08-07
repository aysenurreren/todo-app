import { createClient } from "redis";

const publisher = createClient({
  url: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

publisher.on("error", (err) =>
  console.error("[LogClient] Redis hatası:", err.message)
);

await publisher.connect();
console.log("[LogClient] Redis bağlandı");

export const sendLog = async ({ level, service, action, message, metadata }) => {
  try {
    const event = JSON.stringify({
      level,
      service,
      action:   action   || null,
      message:  message  || null,
      metadata: metadata || null,
    });

    await publisher.publish("logs", event);
  } catch (err) {
    console.error("[LogClient] Event gönderilemedi:", err.message);
  }
};