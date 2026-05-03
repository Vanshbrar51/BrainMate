-- supabase/migrations/0014_writeright_collab_drafts.sql
-- Collaborative draft table — stores shared work-in-progress text for future collab feature.

CREATE TABLE IF NOT EXISTS writeright_collab_drafts (
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

CREATE INDEX IF NOT EXISTS idx_wr_collab_drafts_chat ON writeright_collab_drafts(chat_id);
CREATE INDEX IF NOT EXISTS idx_wr_collab_drafts_owner ON writeright_collab_drafts(owner_id);

ALTER TABLE writeright_collab_drafts ENABLE ROW LEVEL SECURITY;

-- Only the owner can view and modify their drafts
CREATE POLICY wr_collab_drafts_all ON writeright_collab_drafts
  FOR ALL USING (auth.uid()::text = owner_id)
  WITH CHECK (auth.uid()::text = owner_id);
