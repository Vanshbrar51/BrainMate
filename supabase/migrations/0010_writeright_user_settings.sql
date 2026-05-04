-- supabase/migrations/0010_writeright_user_settings.sql
-- User tier settings for subscription-based quota enforcement (F-BE-01)

-- Enable the moddatetime extension to support auto-updating updated_at columns
CREATE EXTENSION IF NOT EXISTS moddatetime;


CREATE TABLE IF NOT EXISTS writeright_user_settings (
  user_id     text        PRIMARY KEY,
  tier        text        NOT NULL DEFAULT 'free'
                          CHECK (tier IN ('free', 'pro', 'team')),
  settings    jsonb       NOT NULL DEFAULT '{}',
  upgraded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every row change
CREATE TRIGGER trg_wr_user_settings_updated_at
  BEFORE UPDATE ON writeright_user_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE writeright_user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own settings row
CREATE POLICY wr_user_settings_all ON writeright_user_settings
  FOR ALL USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
