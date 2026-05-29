-- 0034_writeright_projects.sql
-- WriteRight Projects & Artifacts Schema

CREATE TABLE IF NOT EXISTS writeright_projects (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text        NOT NULL,
  name        text        NOT NULL,
  description text                 DEFAULT NULL,
  icon        text        NOT NULL DEFAULT 'Folder',
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz          DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_wr_projects_user_id ON writeright_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_projects_deleted_at ON writeright_projects (deleted_at) WHERE deleted_at IS NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_writeright_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wr_projects_updated_at ON writeright_projects;
CREATE TRIGGER trg_wr_projects_updated_at
  BEFORE UPDATE ON writeright_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_writeright_projects_updated_at();


CREATE TABLE IF NOT EXISTS writeright_artifacts (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid        NOT NULL REFERENCES writeright_projects(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  title       text        NOT NULL DEFAULT 'Untitled',
  content     text        NOT NULL,
  type        text        NOT NULL DEFAULT 'draft' CHECK (type IN ('draft', 'paragraph', 'template')),
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz          DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_wr_artifacts_project_id ON writeright_artifacts (project_id);
CREATE INDEX IF NOT EXISTS idx_wr_artifacts_user_id ON writeright_artifacts (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_artifacts_deleted_at ON writeright_artifacts (deleted_at) WHERE deleted_at IS NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_writeright_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wr_artifacts_updated_at ON writeright_artifacts;
CREATE TRIGGER trg_wr_artifacts_updated_at
  BEFORE UPDATE ON writeright_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_writeright_artifacts_updated_at();

-- Optional: Link existing chats to projects
-- ALTER TABLE writeright_chats ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES writeright_projects(id) ON DELETE SET NULL;
-- CREATE INDEX IF NOT EXISTS idx_wr_chats_project_id ON writeright_chats (project_id);

-- Row Level Security
ALTER TABLE writeright_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY writeright_projects_select ON writeright_projects
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY writeright_projects_insert ON writeright_projects
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY writeright_projects_update ON writeright_projects
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY writeright_projects_delete ON writeright_projects
  FOR DELETE USING (auth.uid()::text = user_id);

CREATE POLICY writeright_artifacts_select ON writeright_artifacts
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY writeright_artifacts_insert ON writeright_artifacts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY writeright_artifacts_update ON writeright_artifacts
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY writeright_artifacts_delete ON writeright_artifacts
  FOR DELETE USING (auth.uid()::text = user_id);
