CREATE TABLE IF NOT EXISTS writeright_collab_drafts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text        NOT NULL,
  token      text        NOT NULL UNIQUE,
  text       text        NOT NULL,
  mode       text        NOT NULL DEFAULT 'email',
  tone       text        NOT NULL DEFAULT 'Professional',
  metadata   jsonb       NOT NULL DEFAULT '{}',
  view_count int         NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_collab_drafts_token  ON writeright_collab_drafts (token);
CREATE INDEX IF NOT EXISTS idx_wr_collab_drafts_user   ON writeright_collab_drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_collab_drafts_expiry ON writeright_collab_drafts (expires_at);

ALTER TABLE writeright_collab_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY wr_collab_drafts_owner ON writeright_collab_drafts
  FOR ALL USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
-- No public SELECT policy — public access goes through the API route which bypasses RLS with service role
