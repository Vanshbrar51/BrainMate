-- 0003_writeright_shares.sql — Share links for WriteRight before/after cards

CREATE TABLE IF NOT EXISTS writeright_shares (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text        NOT NULL,
  chat_id    uuid        NOT NULL REFERENCES writeright_chats(id) ON DELETE CASCADE,
  job_id     uuid        NOT NULL REFERENCES writeright_ai_jobs(id) ON DELETE CASCADE,
  token      text        NOT NULL UNIQUE,
  metadata   jsonb       NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writeright_shares_token   ON writeright_shares (token);
CREATE INDEX IF NOT EXISTS idx_writeright_shares_user_id ON writeright_shares (user_id);
CREATE INDEX IF NOT EXISTS idx_writeright_shares_job_id  ON writeright_shares (job_id);

ALTER TABLE writeright_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS writeright_shares_select ON writeright_shares;
CREATE POLICY writeright_shares_select
  ON writeright_shares
  FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_shares_insert ON writeright_shares;
CREATE POLICY writeright_shares_insert
  ON writeright_shares
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);
