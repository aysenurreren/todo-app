import winston from "winston";

// ── Log Formatı ────────────────────────────────────────────────
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level.toUpperCase().padEnd(5)} [instance-${process.env.INSTANCE_ID}] ${message}`;
  })
);

// ── Logger ─────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    // Konsola yaz
    new winston.transports.Console(),

    // Tüm logları dosyaya yaz
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880,  // 5MB dolunca yeni dosya aç
      maxFiles: 5,       // En fazla 5 dosya tut
    }),

    // Sadece hataları ayrı dosyaya yaz
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

export default logger;