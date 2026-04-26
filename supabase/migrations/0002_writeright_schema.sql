-- 0002_writeright_schema.sql — WriteRight AI Writing Assistant
--
-- Tables:
--   writeright_chats       — chat sessions per user
--   writeright_messages    — messages within chats (user + assistant)
--   writeright_ai_jobs     — AI job tracking (queue state, retries, output)
--   writeright_usage       — token consumption tracking per model/user/request
--
-- All user_id fields store Clerk user IDs (text, no FK to a users table).
-- RLS is enabled on all tables — users can only access their own rows.
-- Service role key bypasses RLS for the Python worker.

-- ---------------------------------------------------------------------------
-- 1. writeright_chats
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS writeright_chats (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text        NOT NULL,
  title      text        NOT NULL DEFAULT 'Untitled Chat',
  mode       text        NOT NULL DEFAULT 'email',
  metadata   jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz          DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_writeright_chats_user_id    ON writeright_chats (user_id);
CREATE INDEX IF NOT EXISTS idx_writeright_chats_created_at ON writeright_chats (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_writeright_chats_deleted_at ON writeright_chats (deleted_at) WHERE deleted_at IS NULL;

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_writeright_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_writeright_chats_updated_at ON writeright_chats;
CREATE TRIGGER trg_writeright_chats_updated_at
  BEFORE UPDATE ON writeright_chats
  FOR EACH ROW
  EXECUTE FUNCTION update_writeright_chats_updated_at();

-- ---------------------------------------------------------------------------
-- 2. writeright_messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS writeright_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id    uuid        NOT NULL REFERENCES writeright_chats(id) ON DELETE CASCADE,
  user_id    text        NOT NULL,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL,
  metadata   jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writeright_messages_chat_id    ON writeright_messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_writeright_messages_user_id    ON writeright_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_writeright_messages_created_at ON writeright_messages (created_at ASC);

-- ---------------------------------------------------------------------------
-- 3. writeright_ai_jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS writeright_ai_jobs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id     uuid        NOT NULL REFERENCES writeright_chats(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  message_id  uuid        NOT NULL REFERENCES writeright_messages(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  attempt     int         NOT NULL DEFAULT 0,
  max_retries int         NOT NULL DEFAULT 3,
  output      jsonb       NOT NULL DEFAULT '{}',
  error       text                 DEFAULT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz         DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_writeright_ai_jobs_chat_id    ON writeright_ai_jobs (chat_id);
CREATE INDEX IF NOT EXISTS idx_writeright_ai_jobs_user_id    ON writeright_ai_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_writeright_ai_jobs_status     ON writeright_ai_jobs (status);
CREATE INDEX IF NOT EXISTS idx_writeright_ai_jobs_created_at ON writeright_ai_jobs (created_at DESC);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_writeright_ai_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_writeright_ai_jobs_updated_at ON writeright_ai_jobs;
CREATE TRIGGER trg_writeright_ai_jobs_updated_at
  BEFORE UPDATE ON writeright_ai_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_writeright_ai_jobs_updated_at();

-- ---------------------------------------------------------------------------
-- 4. writeright_usage
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS writeright_usage (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           text        NOT NULL,
  chat_id           uuid        NOT NULL REFERENCES writeright_chats(id) ON DELETE CASCADE,
  job_id            uuid        NOT NULL REFERENCES writeright_ai_jobs(id) ON DELETE CASCADE,
  model             text        NOT NULL,
  prompt_tokens     int         NOT NULL DEFAULT 0,
  completion_tokens int         NOT NULL DEFAULT 0,
  total_tokens      int         NOT NULL DEFAULT 0,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writeright_usage_user_id    ON writeright_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_writeright_usage_chat_id    ON writeright_usage (chat_id);
CREATE INDEX IF NOT EXISTS idx_writeright_usage_created_at ON writeright_usage (created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- ---------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE writeright_chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_ai_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_usage    ENABLE ROW LEVEL SECURITY;

-- writeright_chats policies
CREATE POLICY writeright_chats_select ON writeright_chats
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY writeright_chats_insert ON writeright_chats
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY writeright_chats_update ON writeright_chats
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY writeright_chats_delete ON writeright_chats
  FOR DELETE USING (auth.uid()::text = user_id);

-- writeright_messages policies
CREATE POLICY writeright_messages_select ON writeright_messages
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY writeright_messages_insert ON writeright_messages
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY writeright_messages_delete ON writeright_messages
  FOR DELETE USING (auth.uid()::text = user_id);

-- writeright_ai_jobs policies
CREATE POLICY writeright_ai_jobs_select ON writeright_ai_jobs
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY writeright_ai_jobs_insert ON writeright_ai_jobs
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- writeright_usage policies
CREATE POLICY writeright_usage_select ON writeright_usage
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY writeright_usage_insert ON writeright_usage
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
