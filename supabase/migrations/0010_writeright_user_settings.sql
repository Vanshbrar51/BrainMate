CREATE TABLE IF NOT EXISTS writeright_user_settings (
  user_id     text        PRIMARY KEY,
  tier        text        NOT NULL DEFAULT 'free'
                          CHECK (tier IN ('free', 'pro', 'team')),
  settings    jsonb       NOT NULL DEFAULT '{}',
  upgraded_at timestamptz DEFAULT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_wr_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wr_user_settings_updated_at
  BEFORE UPDATE ON writeright_user_settings
  FOR EACH ROW EXECUTE FUNCTION update_wr_user_settings_updated_at();

ALTER TABLE writeright_user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY wr_user_settings_all ON writeright_user_settings
  FOR ALL USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
