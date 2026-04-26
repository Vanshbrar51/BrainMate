-- Migration: 0001_auth_schema.sql
-- Auth persistence layer for brainmate-auth-gateway.
-- Apply once to Supabase via the SQL editor or psql.
-- Safe to run repeatedly: all objects use IF NOT EXISTS / OR REPLACE.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Sessions: source of truth for active sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_sessions (
    id            TEXT        PRIMARY KEY,          -- Clerk session ID (sid)
    user_id       TEXT        NOT NULL,
    issued_at     BIGINT,                           -- Unix timestamp secs, nullable
    device_info   TEXT,
    expires_at    BIGINT      NOT NULL,             -- Unix timestamp secs
    revoked       BOOLEAN     NOT NULL DEFAULT FALSE,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id    ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
-- Partial index: active session count queries only scan non-revoked rows.
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
    ON auth_sessions(user_id, expires_at)
    WHERE revoked = FALSE;

-- ============================================================
-- Token blacklist: persists revoked JTIs across Redis restarts
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_blacklist (
    jti           TEXT        PRIMARY KEY,
    expires_at    BIGINT      NOT NULL,             -- Unix timestamp secs
    revoked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Covering index: IS_BLACKLISTED query returns both columns from the index alone
-- (index-only scan), avoiding a heap fetch.
CREATE INDEX IF NOT EXISTS idx_auth_blacklist_jti_exp
    ON auth_blacklist(jti, expires_at);

-- ============================================================
-- Refresh tokens: persistent source of truth
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    token_hash    TEXT        PRIMARY KEY,          -- SHA256 of raw token (hex)
    user_id       TEXT        NOT NULL,
    device_id     TEXT        NOT NULL,
    expires_at    BIGINT      NOT NULL,
    revoked       BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Hash of the successor token set atomically during rotation.
    -- NULL means this token has never been rotated.
    rotated_to    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_user_id    ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_expires_at ON auth_refresh_tokens(expires_at);

-- ============================================================
-- Cleanup function: remove expired records
-- Called by the reconciliation worker DbCleanup op every 6 hours.
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_auth() RETURNS void AS $$
DECLARE
    now_epoch BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
BEGIN
    -- Expired AND revoked sessions: safe to hard-delete.
    DELETE FROM auth_sessions
        WHERE expires_at < now_epoch
          AND revoked = TRUE;

    -- Expired blacklist entries: they can no longer be used anyway.
    DELETE FROM auth_blacklist
        WHERE expires_at < now_epoch;

    -- Expired refresh tokens (revoked or not).
    DELETE FROM auth_refresh_tokens
        WHERE expires_at < now_epoch;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Rotation integrity guard:
-- Prevent two concurrent rotations from inserting the same
-- successor token hash. The PRIMARY KEY on token_hash already
-- prevents duplicates, but this is here for documentation clarity.
-- ============================================================

-- ============================================================
-- Active session count function used by the guarded insert.
-- Returns the count of non-expired, non-revoked sessions for a user.
-- Executed inside the same transaction as the INSERT to prevent TOCTOU.
-- ============================================================
CREATE OR REPLACE FUNCTION count_active_sessions_for_user(p_user_id TEXT)
RETURNS BIGINT AS $$
    SELECT COUNT(*)
    FROM   auth_sessions
    WHERE  user_id    = p_user_id
      AND  revoked    = FALSE
      AND  expires_at > EXTRACT(EPOCH FROM NOW())::BIGINT;
$$ LANGUAGE sql STABLE;
