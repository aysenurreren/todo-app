-- Log servisi veritabanı şeması

CREATE TABLE IF NOT EXISTS logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    level      VARCHAR(10) NOT NULL,   -- INFO, WARN, ERROR
    service    VARCHAR(50) NOT NULL,   -- hangi servis gönderdi
    action     VARCHAR(100),           -- ne oldu
    message    TEXT,                   -- detay mesaj
    metadata   JSONB,                  -- ekstra veri (userId, ip, vs.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seviyeye göre hızlı sorgulama
CREATE INDEX IF NOT EXISTS idx_logs_level
ON logs(level);

-- Servise göre hızlı sorgulama
CREATE INDEX IF NOT EXISTS idx_logs_service
ON logs(service);

-- Zamana göre hızlı sorgulama
CREATE INDEX IF NOT EXISTS idx_logs_created_at
ON logs(created_at DESC);