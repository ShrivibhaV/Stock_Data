-- ============================================================================
-- AUTH SCHEMA — Stock_Data Database
-- Run this ONCE to add authentication tables to your existing database.
-- PostgreSQL 15+
-- ============================================================================

-- Required extension for password hashing (pgcrypto) and UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE: users
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT,                          -- NULL for OAuth-only accounts
    avatar_url      TEXT,
    provider        VARCHAR(20)  NOT NULL DEFAULT 'local', -- 'local' | 'google'
    provider_id     TEXT,                          -- Google sub ID for OAuth
    role            VARCHAR(20)  NOT NULL DEFAULT 'viewer',
    is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_role     CHECK (role     IN ('admin', 'viewer')),
    CONSTRAINT chk_user_provider CHECK (provider IN ('local', 'google'))
);

CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider, provider_id);

-- ============================================================================
-- TABLE: sessions
-- Stores persistent login sessions ("Remember me")
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT         NOT NULL UNIQUE,  -- SHA-256 hash of the cookie token
    expires_at      TIMESTAMP    NOT NULL,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- TABLE: password_reset_tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT         NOT NULL UNIQUE,
    expires_at      TIMESTAMP    NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    used_at         TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id    ON password_reset_tokens(user_id);

-- ============================================================================
-- Auto-update updated_at trigger for users
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at();

-- ============================================================================
-- Cleanup job: delete expired sessions and reset tokens
-- Run periodically (e.g. via pg_cron or your daily fetch script)
-- ============================================================================
CREATE OR REPLACE PROCEDURE sp_cleanup_auth()
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM sessions              WHERE expires_at  < CURRENT_TIMESTAMP;
    DELETE FROM password_reset_tokens WHERE expires_at  < CURRENT_TIMESTAMP
                                        AND used_at     IS NULL;
    RAISE NOTICE 'Auth cleanup complete';
END;
$$;

-- ============================================================================
-- Verify
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'sessions', 'password_reset_tokens')
ORDER BY table_name;