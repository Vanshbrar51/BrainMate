-- supabase/migrations/0030_writeright_smart_suggestions.sql
-- New table for AI-powered contextual writing suggestions shown to the user mid-session.

CREATE TABLE IF NOT EXISTS writeright_smart_suggestions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  chat_id          uuid        REFERENCES writeright_chats(id) ON DELETE CASCADE,
  suggestion_text  text        NOT NULL CHECK (char_length(suggestion_text) <= 400),
  suggestion_type  text        NOT NULL DEFAULT 'follow_up'
                   CHECK (suggestion_type IN ('follow_up','rephrase','expand','clarify','tone_shift')),
  accepted         boolean     NOT NULL DEFAULT false,
  dismissed        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_smart_suggestions_user
  ON writeright_smart_suggestions (clerk_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wr_smart_suggestions_chat
  ON writeright_smart_suggestions (chat_id) WHERE dismissed = false;

CREATE TRIGGER trg_wr_smart_suggestions_updated_at
  BEFORE UPDATE ON writeright_smart_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE writeright_smart_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wr_smart_suggestions_own_select"
  ON writeright_smart_suggestions FOR SELECT
  USING (clerk_user_id = current_setting('app.current_user_id', true));

CREATE POLICY "wr_smart_suggestions_own_insert"
  ON writeright_smart_suggestions FOR INSERT
  WITH CHECK (clerk_user_id = current_setting('app.current_user_id', true));

CREATE POLICY "wr_smart_suggestions_own_update"
  ON writeright_smart_suggestions FOR UPDATE
  USING (clerk_user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE ON writeright_smart_suggestions TO authenticated;
