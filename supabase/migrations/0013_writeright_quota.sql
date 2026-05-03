-- supabase/migrations/0013_writeright_quota.sql
-- Quota tracking table for tier enforcement (F-BE-01 — quota/route.ts)
-- Tracks per-period usage for free/pro/team tier limits.

CREATE TABLE IF NOT EXISTS writeright_quota (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  period_key  text        NOT NULL,  -- e.g. '2025-05' (YYYY-MM) for monthly quota
  requests    int         NOT NULL DEFAULT 0,
  tokens      int         NOT NULL DEFAULT 0,
  tier        text        NOT NULL DEFAULT 'free',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_wr_quota_user_period ON writeright_quota(user_id, period_key);

ALTER TABLE writeright_quota ENABLE ROW LEVEL SECURITY;

-- Users can read their own quota (write only via service role / Python worker)
CREATE POLICY wr_quota_select ON writeright_quota
  FOR SELECT USING (auth.uid()::text = user_id);
