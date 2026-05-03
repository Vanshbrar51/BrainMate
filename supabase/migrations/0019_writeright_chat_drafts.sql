-- Chat-scoped collaborative draft rows (distinct from writeright_collab_drafts share links in 0015).

CREATE TABLE IF NOT EXISTS writeright_chat_drafts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid        NOT NULL REFERENCES writeright_chats(id) ON DELETE CASCADE,
  owner_id    text        NOT NULL,
  content     text        NOT NULL DEFAULT '',
  version     int         NOT NULL DEFAULT 1,
  locked_by   text,
  locked_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_chat_drafts_chat ON writeright_chat_drafts(chat_id);
CREATE INDEX IF NOT EXISTS idx_wr_chat_drafts_owner ON writeright_chat_drafts(owner_id);

ALTER TABLE writeright_chat_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY wr_chat_drafts_all ON writeright_chat_drafts
  FOR ALL USING (auth.uid()::text = owner_id)
  WITH CHECK (auth.uid()::text = owner_id);
