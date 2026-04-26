-- 0004_writeright_templates.sql — Reusable template library for WriteRight

CREATE TABLE IF NOT EXISTS writeright_templates (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text        NOT NULL,
  name        text        NOT NULL DEFAULT 'Untitled Template',
  content     text        NOT NULL,
  mode        text        NOT NULL DEFAULT 'email',
  tone        text        NOT NULL DEFAULT 'Professional',
  use_count   int         NOT NULL DEFAULT 0,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writeright_templates_user_id ON writeright_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_writeright_templates_mode    ON writeright_templates (mode);
CREATE INDEX IF NOT EXISTS idx_writeright_templates_updated ON writeright_templates (updated_at DESC);

CREATE OR REPLACE FUNCTION update_writeright_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_writeright_templates_updated_at ON writeright_templates;
CREATE TRIGGER trg_writeright_templates_updated_at
  BEFORE UPDATE ON writeright_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_writeright_templates_updated_at();

ALTER TABLE writeright_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wr_templates_select ON writeright_templates;
CREATE POLICY wr_templates_select
  ON writeright_templates
  FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS wr_templates_insert ON writeright_templates;
CREATE POLICY wr_templates_insert
  ON writeright_templates
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS wr_templates_update ON writeright_templates;
CREATE POLICY wr_templates_update
  ON writeright_templates
  FOR UPDATE
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS wr_templates_delete ON writeright_templates;
CREATE POLICY wr_templates_delete
  ON writeright_templates
  FOR DELETE
  USING (auth.uid()::text = user_id);
