-- UUID üretimi için extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users Tablosu ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Tasks Tablosu ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(500) NOT NULL,
    is_completed BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Email doğrulama sütunları
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code    VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified          BOOLEAN NOT NULL DEFAULT FALSE;

-- ── B-Tree Index ───────────────────────────────────────────────
-- full_name sütunu (sonradan eklendi)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
-- Performans: user_id + created_at composite index
CREATE INDEX IF NOT EXISTS idx_tasks_user_created
ON tasks(user_id, created_at DESC);
-- Şifre sıfırlama sütunları
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token       VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;