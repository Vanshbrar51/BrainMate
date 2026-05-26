-- 0021_writeright_hardening.sql
-- Backend hardening for quota, lookup hot paths, and atomic quota increments.

ALTER TABLE writeright_quota
  ADD COLUMN IF NOT EXISTS tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'writeright_quota_user_period_unique'
  ) THEN
    ALTER TABLE writeright_quota
      ADD CONSTRAINT writeright_quota_user_period_unique
      UNIQUE (user_id, period_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wr_shares_token_expires
  ON writeright_shares (token, expires_at);

CREATE INDEX IF NOT EXISTS idx_wr_messages_chat_created
  ON writeright_messages (chat_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wr_jobs_pending
  ON writeright_ai_jobs (status, created_at ASC)
  WHERE status IN ('pending', 'processing') AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wr_quota_user_period
  ON writeright_quota (user_id, period_key);

CREATE OR REPLACE FUNCTION increment_wr_quota(
  p_user_id text, p_period text, p_reqs int, p_tokens int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO writeright_quota (user_id, period_key, requests, tokens)
  VALUES (p_user_id, p_period, p_reqs, p_tokens)
  ON CONFLICT (user_id, period_key) DO UPDATE SET
    requests = writeright_quota.requests + EXCLUDED.requests,
    tokens   = writeright_quota.tokens   + EXCLUDED.tokens,
    updated_at = now();
END;
$$;

ALTER TABLE writeright_ai_jobs
  DROP CONSTRAINT IF EXISTS writeright_ai_jobs_chat_id_fkey,
  ADD CONSTRAINT writeright_ai_jobs_chat_id_fkey
    FOREIGN KEY (chat_id) REFERENCES writeright_chats(id) ON DELETE CASCADE;

ALTER TABLE writeright_streaks
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
