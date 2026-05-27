CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ==========================================
-- FILE: 0002_writeright_schema.sql
-- ==========================================

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
DROP POLICY IF EXISTS writeright_chats_select ON writeright_chats;
CREATE POLICY writeright_chats_select ON writeright_chats
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_chats_insert ON writeright_chats;
CREATE POLICY writeright_chats_insert ON writeright_chats
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_chats_update ON writeright_chats;
CREATE POLICY writeright_chats_update ON writeright_chats
  FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_chats_delete ON writeright_chats;
CREATE POLICY writeright_chats_delete ON writeright_chats
  FOR DELETE USING (auth.uid()::text = user_id);

-- writeright_messages policies
DROP POLICY IF EXISTS writeright_messages_select ON writeright_messages;
CREATE POLICY writeright_messages_select ON writeright_messages
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_messages_insert ON writeright_messages;
CREATE POLICY writeright_messages_insert ON writeright_messages
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_messages_delete ON writeright_messages;
CREATE POLICY writeright_messages_delete ON writeright_messages
  FOR DELETE USING (auth.uid()::text = user_id);

-- writeright_ai_jobs policies
DROP POLICY IF EXISTS writeright_ai_jobs_select ON writeright_ai_jobs;
CREATE POLICY writeright_ai_jobs_select ON writeright_ai_jobs
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_ai_jobs_insert ON writeright_ai_jobs;
CREATE POLICY writeright_ai_jobs_insert ON writeright_ai_jobs
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- writeright_usage policies
DROP POLICY IF EXISTS writeright_usage_select ON writeright_usage;
CREATE POLICY writeright_usage_select ON writeright_usage
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_usage_insert ON writeright_usage;
CREATE POLICY writeright_usage_insert ON writeright_usage
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);


-- ==========================================
-- FILE: 0003_writeright_shares.sql
-- ==========================================

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


-- ==========================================
-- FILE: 0004_writeright_templates.sql
-- ==========================================

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


-- ==========================================
-- FILE: 0005_writeright_stats.sql
-- ==========================================

-- 0005_writeright_stats.sql — Streaks and achievements for WriteRight stats panel

CREATE TABLE IF NOT EXISTS writeright_streaks (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          text        NOT NULL UNIQUE,
  current_streak   int         NOT NULL DEFAULT 0,
  longest_streak   int         NOT NULL DEFAULT 0,
  last_activity_date date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writeright_achievements (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text        NOT NULL,
  achievement  text        NOT NULL,
  earned_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement)
);

CREATE INDEX IF NOT EXISTS idx_wr_streaks_user      ON writeright_streaks (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_achievements_user ON writeright_achievements (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_achievements_date ON writeright_achievements (earned_at DESC);

ALTER TABLE writeright_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wr_streaks_all ON writeright_streaks;
CREATE POLICY wr_streaks_all
  ON writeright_streaks
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS wr_achievements_all ON writeright_achievements;
CREATE POLICY wr_achievements_all
  ON writeright_achievements
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);


-- ==========================================
-- FILE: 0006_writeright_search_indexes.sql
-- ==========================================

-- 0006_writeright_search_indexes.sql — Full-text indexes for history search

CREATE INDEX IF NOT EXISTS idx_wr_messages_content_fts
  ON writeright_messages
  USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_wr_chats_title_fts
  ON writeright_chats
  USING gin(to_tsvector('english', title));


-- ==========================================
-- FILE: 0007_writeright_profiles.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS public.writeright_writing_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT UNIQUE NOT NULL,
    top_mistakes JSONB DEFAULT '[]'::JSONB,
    improvement_count INTEGER DEFAULT 0,
    last_analyzed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.writeright_writing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own writing profile" ON public.writeright_writing_profiles;
CREATE POLICY "Users can read own writing profile"
    ON public.writeright_writing_profiles
    FOR SELECT
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update own writing profile" ON public.writeright_writing_profiles;
CREATE POLICY "Users can update own writing profile"
    ON public.writeright_writing_profiles
    FOR UPDATE
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert own writing profile" ON public.writeright_writing_profiles;
CREATE POLICY "Users can insert own writing profile"
    ON public.writeright_writing_profiles
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Function used by the trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a generic trigger to auto-update the 'updated_at' column
DROP TRIGGER IF EXISTS trg_writeright_writing_profiles_updated_at
ON public.writeright_writing_profiles;

CREATE TRIGGER trg_writeright_writing_profiles_updated_at
BEFORE UPDATE ON public.writeright_writing_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- FILE: 0008_writeright_feedback.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS writeright_feedback (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text NOT NULL,
  chat_id     uuid NOT NULL REFERENCES writeright_chats(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES writeright_ai_jobs(id) ON DELETE CASCADE,
  rating      text NOT NULL CHECK(rating IN ('up','down')),
  reason      text,
  mode        text,
  tone        text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_feedback_user ON writeright_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_feedback_job  ON writeright_feedback (job_id);

ALTER TABLE writeright_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wr_feedback_insert ON writeright_feedback;
CREATE POLICY wr_feedback_insert ON writeright_feedback
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS wr_feedback_select ON writeright_feedback;
CREATE POLICY wr_feedback_select ON writeright_feedback
  FOR SELECT USING (auth.uid()::text = user_id);


-- ==========================================
-- FILE: 0009_writeright_message_history_index.sql
-- ==========================================

-- 0009_writeright_message_history_index.sql — history lookup performance

CREATE INDEX IF NOT EXISTS idx_wr_messages_chat_role_created_desc
  ON writeright_messages (chat_id, role, created_at DESC);


-- ==========================================
-- FILE: 0010_writeright_user_settings.sql
-- ==========================================

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
DROP TRIGGER IF EXISTS trg_wr_user_settings_updated_at ON writeright_user_settings;
CREATE TRIGGER trg_wr_user_settings_updated_at
  BEFORE UPDATE ON writeright_user_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE writeright_user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own settings row
DROP POLICY IF EXISTS wr_user_settings_all ON writeright_user_settings;
CREATE POLICY wr_user_settings_all ON writeright_user_settings
  FOR ALL USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);


-- ==========================================
-- FILE: 0011_writeright_streak_trigger.sql
-- ==========================================

-- supabase/migrations/0011_writeright_streak_trigger.sql
-- DB trigger for streak updates on writeright_usage INSERT (F-BE-07)
-- Replaces the Python-side asyncio.create_task() which could be silently lost.

CREATE OR REPLACE FUNCTION fn_update_writeright_streak()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_row   RECORD;
BEGIN
  SELECT * INTO v_row FROM writeright_streaks WHERE user_id = NEW.user_id FOR UPDATE;

  IF NOT FOUND THEN
    -- First ever job for this user — create streak row
    INSERT INTO writeright_streaks
      (user_id, current_streak, longest_streak, last_activity_date)
    VALUES (NEW.user_id, 1, 1, v_today)
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF v_row.last_activity_date = v_today THEN
    NULL; -- Already counted today — do nothing
  ELSIF v_row.last_activity_date = v_today - INTERVAL '1 day' THEN
    -- Consecutive day — extend streak
    UPDATE writeright_streaks SET
      current_streak     = v_row.current_streak + 1,
      longest_streak     = GREATEST(v_row.longest_streak, v_row.current_streak + 1),
      last_activity_date = v_today,
      updated_at         = now()
    WHERE user_id = NEW.user_id;
  ELSE
    -- Streak broken — reset to 1
    UPDATE writeright_streaks SET
      current_streak     = 1,
      last_activity_date = v_today,
      updated_at         = now()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wr_usage_streak ON writeright_usage;
CREATE TRIGGER trg_wr_usage_streak
  AFTER INSERT ON writeright_usage
  FOR EACH ROW EXECUTE FUNCTION fn_update_writeright_streak();


-- ==========================================
-- FILE: 0012_writeright_profile_trigger.sql
-- ==========================================

-- supabase/migrations/0012_writeright_profile_trigger.sql
-- DB trigger for atomic writing-profile updates on writeright_usage INSERT (F-BE-08)
-- Collects last 20 unique mistakes from writeright_messages and upserts writeright_writing_profiles.
-- This trigger runs AFTER the usage row is committed, so it never blocks job completion.

CREATE OR REPLACE FUNCTION fn_update_writeright_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count    INT;
  v_mistakes TEXT[];
  v_row      RECORD;
BEGIN
  -- Total usage count for this user
  SELECT COUNT(*) INTO v_count FROM writeright_usage WHERE user_id = NEW.user_id;

  -- Collect up to 50 recent mistakes from assistant messages.
  -- content may be plain text (error/fallback) or JSON; gracefully degrade on cast failure.
  BEGIN
    SELECT ARRAY_AGG(DISTINCT mistake) INTO v_mistakes
    FROM (
      SELECT jsonb_array_elements_text(
        (content::jsonb -> 'teaching' -> 'mistakes')
      ) AS mistake
      FROM writeright_messages
      WHERE user_id = NEW.user_id
        AND role = 'assistant'
        AND (content::jsonb -> 'teaching' -> 'mistakes') IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 50
    ) sub
    WHERE mistake IS NOT NULL AND mistake <> ''
    LIMIT 20;
  EXCEPTION WHEN OTHERS THEN
    -- content was plain text or malformed JSON — skip mistake extraction
    v_mistakes := '{}';
  END;

  -- Upsert the profile row
  INSERT INTO writeright_writing_profiles
    (user_id, top_mistakes, improvement_count, last_analyzed_at)
  VALUES (
    NEW.user_id,
    COALESCE(to_jsonb(v_mistakes), '[]'::jsonb),
    v_count,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    top_mistakes       = EXCLUDED.top_mistakes,
    improvement_count  = EXCLUDED.improvement_count,
    last_analyzed_at   = EXCLUDED.last_analyzed_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wr_usage_profile ON writeright_usage;
CREATE TRIGGER trg_wr_usage_profile
  AFTER INSERT ON writeright_usage
  FOR EACH ROW EXECUTE FUNCTION fn_update_writeright_profile();


-- ==========================================
-- FILE: 0013_writeright_composite_indexes.sql
-- ==========================================

-- Chat history query (hot path: called on every job)
CREATE INDEX IF NOT EXISTS idx_wr_messages_chat_role_time
  ON writeright_messages (chat_id, role, created_at DESC);

-- Stats query: monthly usage per user
CREATE INDEX IF NOT EXISTS idx_wr_usage_user_month
  ON writeright_usage (user_id, created_at DESC);

-- Profile trigger: recent mistakes per user
CREATE INDEX IF NOT EXISTS idx_wr_messages_user_assistant_time
  ON writeright_messages (user_id, role, created_at DESC)
  WHERE role = 'assistant';

-- Share token lookup
CREATE INDEX IF NOT EXISTS idx_wr_shares_token_expires
  ON writeright_shares (token, expires_at);

-- Active jobs query (health check)
CREATE INDEX IF NOT EXISTS idx_wr_jobs_status_created
  ON writeright_ai_jobs (status, created_at DESC)
  WHERE status IN ('pending', 'processing');

-- Search: FTS on message content
CREATE INDEX IF NOT EXISTS idx_wr_messages_fts
  ON writeright_messages
  USING gin(to_tsvector('english', content))
  WHERE role = 'user';


-- ==========================================
-- FILE: 0013_writeright_quota.sql
-- ==========================================

-- supabase/migrations/0013_writeright_quota.sql
-- Quota tracking table for tier enforcement (F-BE-01 — quota/route.ts)
-- Tracks per-period usage for free/pro/team tier limits.

CREATE TABLE IF NOT EXISTS writeright_quota (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  period_key  text        NOT NULL,  -- e.g. '2025-05' (YYYY-MM) for monthly quota
  requests    int         NOT NULL DEFAULT 0,
  tokens      int         NOT NULL DEFAULT 0,
  tier        text        NOT NULL DEFAULT 'free',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_wr_quota_user_period ON writeright_quota(user_id, period_key);

ALTER TABLE writeright_quota ENABLE ROW LEVEL SECURITY;

-- Users can read their own quota (write only via service role / Python worker)
DROP POLICY IF EXISTS wr_quota_select ON writeright_quota;
CREATE POLICY wr_quota_select ON writeright_quota
  FOR SELECT USING (auth.uid()::text = user_id);


-- ==========================================
-- FILE: 0014_writeright_rate_limit_table.sql
-- ==========================================

-- Persistent rate limit tracking for quota enforcement (supplements Redis counters)
-- Used as Redis fallback when circuit breaker is open
CREATE TABLE IF NOT EXISTS writeright_daily_usage (
  user_id       text        NOT NULL,
  usage_date    date        NOT NULL DEFAULT CURRENT_DATE,
  request_count int         NOT NULL DEFAULT 0,
  char_count    bigint      NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_wr_daily_usage_user_date
  ON writeright_daily_usage (user_id, usage_date DESC);

ALTER TABLE writeright_daily_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wr_daily_usage_select ON writeright_daily_usage;
CREATE POLICY wr_daily_usage_select ON writeright_daily_usage
  FOR SELECT USING (auth.uid()::text = user_id);

-- Auto-increment function called by message/route.ts
CREATE OR REPLACE FUNCTION increment_wr_daily_usage(
  p_user_id text, p_chars int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO writeright_daily_usage (user_id, usage_date, request_count, char_count)
  VALUES (p_user_id, CURRENT_DATE, 1, p_chars)
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    request_count = writeright_daily_usage.request_count + 1,
    char_count    = writeright_daily_usage.char_count + p_chars;
END;
$$ ;


-- ==========================================
-- FILE: 0015_writeright_collab_drafts.sql
-- ==========================================

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
DROP POLICY IF EXISTS wr_collab_drafts_owner ON writeright_collab_drafts;
CREATE POLICY wr_collab_drafts_owner ON writeright_collab_drafts
  FOR ALL USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
-- No public SELECT policy — public access goes through the API route which bypasses RLS with service role


-- ==========================================
-- FILE: 0015_writeright_public_shares_view.sql
-- ==========================================

-- supabase/migrations/0015_writeright_public_shares_view.sql
-- Exposes an anonymous-accessible view of public shares for the /share/[token] page.
-- The view filters out expired shares and exposes only the columns needed for rendering.

DROP VIEW IF EXISTS writeright_public_shares CASCADE;
CREATE OR REPLACE VIEW writeright_public_shares AS
  SELECT
    s.token,
    s.user_id,
    s.chat_id,
    s.job_id,
    s.metadata,
    s.expires_at,
    j.output         AS result,
    m.content        AS message_content,
    c.title          AS chat_title,
    c.mode           AS chat_mode
  FROM writeright_shares s
  JOIN writeright_ai_jobs     j ON j.id = s.job_id
  JOIN writeright_chats       c ON c.id = s.chat_id
  LEFT JOIN writeright_messages m
    ON m.chat_id = s.chat_id
   AND m.role    = 'user'
  WHERE s.expires_at > now()
    AND j.status = 'completed'
    AND c.deleted_at IS NULL;

-- Allow anonymous and authenticated users to read from this view
GRANT SELECT ON writeright_public_shares TO anon;
GRANT SELECT ON writeright_public_shares TO authenticated;


-- ==========================================
-- FILE: 0016_writeright_gdpr_account_data.sql
-- ==========================================

-- supabase/migrations/0016_writeright_gdpr_account_data.sql
-- GDPR compliance: function to hard-delete all PII for a user.
-- Called from DELETE /api/writeright/account/data with the X-Confirm-Erasure header.

CREATE OR REPLACE FUNCTION fn_erase_writeright_user_data(p_user_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Hard delete in dependency order to satisfy FK constraints
  DELETE FROM writeright_achievements    WHERE user_id = p_user_id;
  DELETE FROM writeright_usage           WHERE user_id = p_user_id;
  DELETE FROM writeright_feedback        WHERE user_id = p_user_id;
  DELETE FROM writeright_streaks         WHERE user_id = p_user_id;
  DELETE FROM writeright_writing_profiles WHERE user_id = p_user_id;
  DELETE FROM writeright_quota           WHERE user_id = p_user_id;
  DELETE FROM writeright_user_settings   WHERE user_id = p_user_id;
  DELETE FROM writeright_shares          WHERE user_id = p_user_id;
  DELETE FROM writeright_templates       WHERE user_id = p_user_id;
  -- Cascade: chats → messages, jobs, collab_drafts via ON DELETE CASCADE
  DELETE FROM writeright_chats           WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION fn_erase_writeright_user_data(TEXT) IS
  'Hard-deletes all WriteRight data for a user. Called only from the GDPR erasure API route '
  '(DELETE /api/writeright/account/data). Must be invoked via service role only.';


-- ==========================================
-- FILE: 0016_writeright_public_share_view.sql
-- ==========================================

-- Drop the existing view first to allow changing the column structure
DROP VIEW IF EXISTS writeright_public_shares CASCADE;

CREATE OR REPLACE VIEW writeright_public_shares AS
SELECT
  s.token,
  s.expires_at,
  s.created_at,
  j.output->>'improved_text'   AS after_text,
  j.metadata->>'mode'          AS mode,
  j.metadata->>'tone'          AS tone,
  j.output->'scores'           AS scores
FROM writeright_shares s
JOIN writeright_ai_jobs j ON j.id = s.job_id
WHERE s.expires_at > now()
  AND j.status = 'completed';

-- Allow anonymous and authenticated users to read from this view
GRANT SELECT ON writeright_public_shares TO anon;
GRANT SELECT ON writeright_public_shares TO authenticated;


-- ==========================================
-- FILE: 0017_writeright_brand_voice.sql
-- ==========================================

-- 0017_writeright_brand_voice.sql
-- Enable the vector extension to allow high-dimensional similarity searches
CREATE EXTENSION IF NOT EXISTS vector;

-- Table to store user writing examples and their embeddings
CREATE TABLE IF NOT EXISTS public.writeright_brand_voice (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768), -- Optimized for Google text-embedding-004
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.writeright_brand_voice ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only see/edit their own data
DROP POLICY IF EXISTS writeright_brand_voice_select ON public.writeright_brand_voice;
CREATE POLICY writeright_brand_voice_select ON public.writeright_brand_voice
    FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_brand_voice_insert ON public.writeright_brand_voice;
CREATE POLICY writeright_brand_voice_insert ON public.writeright_brand_voice
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_brand_voice_update ON public.writeright_brand_voice;
CREATE POLICY writeright_brand_voice_update ON public.writeright_brand_voice
    FOR UPDATE USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS writeright_brand_voice_delete ON public.writeright_brand_voice;
CREATE POLICY writeright_brand_voice_delete ON public.writeright_brand_voice
    FOR DELETE USING (auth.uid()::text = user_id);

-- Create a GIST index for efficient vector search
CREATE INDEX ON public.writeright_brand_voice USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_writeright_brand_voice_updated_at ON public.writeright_brand_voice;
CREATE TRIGGER trg_writeright_brand_voice_updated_at
    BEFORE UPDATE ON public.writeright_brand_voice
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_brand_voice (
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT,
  p_user_id TEXT
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wbv.id,
    wbv.content,
    1 - (wbv.embedding <=> query_embedding) AS similarity
  FROM public.writeright_brand_voice wbv
  WHERE wbv.user_id = p_user_id
    AND 1 - (wbv.embedding <=> query_embedding) > match_threshold
  ORDER BY wbv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ==========================================
-- FILE: 0019_writeright_chat_drafts.sql
-- ==========================================

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

DROP POLICY IF EXISTS wr_chat_drafts_all ON writeright_chat_drafts;
CREATE POLICY wr_chat_drafts_all ON writeright_chat_drafts
  FOR ALL USING (auth.uid()::text = owner_id)
  WITH CHECK (auth.uid()::text = owner_id);


-- ==========================================
-- FILE: 0020_writeright_soft_delete_hardening.sql
-- ==========================================

-- 0020_writeright_soft_delete_hardening.sql
-- Adds deleted_at column to tables that were missing it to support soft-deletes and satisfy Rule 3.3.

-- 1. Profiles
ALTER TABLE writeright_writing_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Templates
ALTER TABLE writeright_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Messages
ALTER TABLE writeright_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. AI Jobs
ALTER TABLE writeright_ai_jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 5. Achievements
ALTER TABLE writeright_achievements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 6. Streaks
ALTER TABLE writeright_streaks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 7. Feedback
ALTER TABLE writeright_feedback ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 8. User Settings
ALTER TABLE writeright_user_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 9. Quota
ALTER TABLE writeright_quota ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add indexes for performance on soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_wr_writing_profiles_deleted_at ON writeright_writing_profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wr_templates_deleted_at ON writeright_templates(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wr_messages_deleted_at ON writeright_messages(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wr_ai_jobs_deleted_at ON writeright_ai_jobs(deleted_at) WHERE deleted_at IS NULL;


-- ==========================================
-- FILE: 0021_writeright_hardening.sql
-- ==========================================

-- 0021_writeright_hardening.sql
-- Backend hardening for quota, lookup hot paths, and atomic quota increments.

ALTER TABLE writeright_quota
  ADD COLUMN IF NOT EXISTS tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'writeright_quota_user_period_unique'
  ) THEN
    ALTER TABLE writeright_quota
      ADD CONSTRAINT writeright_quota_user_period_unique
      UNIQUE (user_id, period_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wr_shares_token_expires
  ON writeright_shares (token, expires_at);

CREATE INDEX IF NOT EXISTS idx_wr_messages_chat_created
  ON writeright_messages (chat_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wr_jobs_pending
  ON writeright_ai_jobs (status, created_at ASC)
  WHERE status IN ('pending', 'processing') AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wr_quota_user_period
  ON writeright_quota (user_id, period_key);

CREATE OR REPLACE FUNCTION increment_wr_quota(
  p_user_id text, p_period text, p_reqs int, p_tokens int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO writeright_quota (user_id, period_key, requests, tokens)
  VALUES (p_user_id, p_period, p_reqs, p_tokens)
  ON CONFLICT (user_id, period_key) DO UPDATE SET
    requests = writeright_quota.requests + EXCLUDED.requests,
    tokens   = writeright_quota.tokens   + EXCLUDED.tokens,
    updated_at = now();
END;
$$;

ALTER TABLE writeright_ai_jobs
  DROP CONSTRAINT IF EXISTS writeright_ai_jobs_chat_id_fkey,
  ADD CONSTRAINT writeright_ai_jobs_chat_id_fkey
    FOREIGN KEY (chat_id) REFERENCES writeright_chats(id) ON DELETE CASCADE;

ALTER TABLE writeright_streaks
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';


-- ==========================================
-- FILE: 0022_writeright_challenges.sql
-- ==========================================

-- 0022_writeright_challenges.sql
-- Daily writing challenges and leaderboard completion tracking.

CREATE TABLE IF NOT EXISTS writeright_daily_challenges (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date         date NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text NOT NULL,
  mode         text NOT NULL,
  difficulty   text NOT NULL DEFAULT 'medium',
  prompt_text  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writeright_challenge_completions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id uuid NOT NULL REFERENCES writeright_daily_challenges(id),
  user_id      text NOT NULL,
  job_id       uuid REFERENCES writeright_ai_jobs(id),
  score        int NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wr_challenge_completions_date
  ON writeright_challenge_completions (challenge_id, score DESC);

ALTER TABLE writeright_daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_challenge_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wr_daily_challenges_select ON writeright_daily_challenges;
CREATE POLICY wr_daily_challenges_select
  ON writeright_daily_challenges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS wr_challenge_completions_own ON writeright_challenge_completions;
CREATE POLICY wr_challenge_completions_own
  ON writeright_challenge_completions
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);


-- ==========================================
-- FILE: 0023_gmail_connections.sql
-- ==========================================

-- 0023_gmail_connections.sql
-- Gmail OAuth connection storage with extensible integration architecture.
-- Tokens are stored server-side only. Never returned to clients raw.

-- ---------------------------------------------------------------------------
-- Core Gmail connections table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gmail_connections (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  gmail_email      text        NOT NULL,
  -- Tokens are AES-256-GCM encrypted before storage (see encryption note below)
  access_token     text        NOT NULL,
  refresh_token    text        NOT NULL,
  token_expiry     timestamptz NOT NULL,
  scope            text        NOT NULL DEFAULT 'https://www.googleapis.com/auth/gmail.readonly',
  is_active        boolean     NOT NULL DEFAULT true,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, gmail_email)
);

-- ---------------------------------------------------------------------------
-- Extensible integration architecture for future providers (Outlook, Yahoo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mail_integrations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  provider         text        NOT NULL CHECK (provider IN ('gmail', 'outlook', 'yahoo')),
  email_address    text        NOT NULL,
  display_name     text,
  avatar_url       text,
  is_active        boolean     NOT NULL DEFAULT true,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, provider, email_address)
);

-- ---------------------------------------------------------------------------
-- Imported email audit log (tracks which emails were brought into WriteRight)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gmail_imported_emails (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  gmail_message_id text        NOT NULL,
  gmail_thread_id  text,
  subject          text,
  sender_email     text,
  sender_name      text,
  snippet          text,
  imported_at      timestamptz NOT NULL DEFAULT now(),
  writeright_chat_id uuid      REFERENCES writeright_chats(id) ON DELETE SET NULL,
  -- Store which action the user took
  ai_action        text        CHECK (ai_action IN (
    'improve', 'summarize', 'rewrite', 'change_tone', 'shorten', 'professionalize', 'reply'
  )),
  UNIQUE (clerk_user_id, gmail_message_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gmail_connections_clerk_user
  ON gmail_connections (clerk_user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_gmail_connections_email
  ON gmail_connections (gmail_email);

CREATE INDEX IF NOT EXISTS idx_mail_integrations_clerk_user
  ON mail_integrations (clerk_user_id, provider);

CREATE INDEX IF NOT EXISTS idx_gmail_imported_clerk_user
  ON gmail_imported_emails (clerk_user_id, imported_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE gmail_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_integrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_imported_emails  ENABLE ROW LEVEL SECURITY;

-- gmail_connections: user sees only their own rows
-- API routes use service role (bypasses RLS) — these policies protect direct client access
DROP POLICY IF EXISTS gmail_connections_owner ON gmail_connections;
CREATE POLICY gmail_connections_owner ON gmail_connections
  FOR ALL USING (auth.uid()::text = clerk_user_id)
  WITH CHECK (auth.uid()::text = clerk_user_id);

DROP POLICY IF EXISTS mail_integrations_owner ON mail_integrations;
CREATE POLICY mail_integrations_owner ON mail_integrations
  FOR ALL USING (auth.uid()::text = clerk_user_id)
  WITH CHECK (auth.uid()::text = clerk_user_id);

DROP POLICY IF EXISTS gmail_imported_emails_owner ON gmail_imported_emails;
CREATE POLICY gmail_imported_emails_owner ON gmail_imported_emails
  FOR ALL USING (auth.uid()::text = clerk_user_id)
  WITH CHECK (auth.uid()::text = clerk_user_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for gmail_connections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_gmail_connections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_gmail_connections_updated_at ON gmail_connections;
CREATE TRIGGER trg_gmail_connections_updated_at
  BEFORE UPDATE ON gmail_connections
  FOR EACH ROW EXECUTE FUNCTION update_gmail_connections_updated_at();


-- ==========================================
-- FILE: 0024_gmail_scheduled_sends.sql
-- ==========================================

-- supabase/migrations/0024_gmail_scheduled_sends.sql
-- Description: Creates the gmail_scheduled_sends table to track deferred email sending tasks.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: gmail_scheduled_sends
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gmail_scheduled_sends (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    clerk_user_id       text        NOT NULL,
    gmail_email         text        NOT NULL,
    recipient_email     text        NOT NULL,
    subject             text        NOT NULL,
    body                text        NOT NULL,
    scheduled_at        timestamptz NOT NULL,
    status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    created_at          timestamptz DEFAULT now() NOT NULL,
    updated_at          timestamptz DEFAULT now() NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gmail_scheduled_sends_clerk_user_id
    ON gmail_scheduled_sends (clerk_user_id);

CREATE INDEX IF NOT EXISTS idx_gmail_scheduled_sends_created_at
    ON gmail_scheduled_sends (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmail_scheduled_sends_status_time
    ON gmail_scheduled_sends (status, scheduled_at ASC);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_gmail_scheduled_sends_updated_at ON gmail_scheduled_sends;
CREATE TRIGGER update_gmail_scheduled_sends_updated_at
    BEFORE UPDATE ON gmail_scheduled_sends
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gmail_scheduled_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gmail_scheduled_sends_select_own" ON gmail_scheduled_sends;
CREATE POLICY "gmail_scheduled_sends_select_own"
    ON gmail_scheduled_sends FOR SELECT
    USING (clerk_user_id = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS "gmail_scheduled_sends_insert_own" ON gmail_scheduled_sends;
CREATE POLICY "gmail_scheduled_sends_insert_own"
    ON gmail_scheduled_sends FOR INSERT
    WITH CHECK (clerk_user_id = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS "gmail_scheduled_sends_update_own" ON gmail_scheduled_sends;
CREATE POLICY "gmail_scheduled_sends_update_own"
    ON gmail_scheduled_sends FOR UPDATE
    USING (clerk_user_id = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS "gmail_scheduled_sends_delete_own" ON gmail_scheduled_sends;
CREATE POLICY "gmail_scheduled_sends_delete_own"
    ON gmail_scheduled_sends FOR DELETE
    USING (clerk_user_id = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON gmail_scheduled_sends TO authenticated;


-- ==========================================
-- FILE: 0025_writeright_template_categories.sql
-- ==========================================

-- supabase/migrations/0025_writeright_template_categories.sql
-- Description: Alters writeright_templates to support categorization, tagging, sorting, and AI generation metadata.

-- ─────────────────────────────────────────────────────────────────────────────
-- Alter writeright_templates
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE writeright_templates
    ADD COLUMN IF NOT EXISTS category         text DEFAULT 'All' NOT NULL,
    ADD COLUMN IF NOT EXISTS tags             text[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN IF NOT EXISTS is_ai_generated  boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS preview_text     text,
    ADD COLUMN IF NOT EXISTS sort_order       integer DEFAULT 0 NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_writeright_templates_category
    ON writeright_templates (user_id, category);

CREATE INDEX IF NOT EXISTS idx_writeright_templates_sort_order
    ON writeright_templates (user_id, sort_order ASC);


-- ==========================================
-- FILE: 0026_writeright_preferences.sql
-- ==========================================

-- supabase/migrations/0026_writeright_preferences.sql
-- Description: Alters writeright_user_settings to add a preferences JSONB column for persistent user options.

-- ─────────────────────────────────────────────────────────────────────────────
-- Alter writeright_user_settings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE writeright_user_settings
    ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb NOT NULL;


-- ==========================================
-- FILE: 0027_writeright_collab_comments.sql
-- ==========================================

-- supabase/migrations/0027_writeright_collab_comments.sql
-- Description: Creates the writeright_collab_comments table for anonymous feedback and AI suggestions on shared drafts.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: writeright_collab_comments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS writeright_collab_comments (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    share_token         text        NOT NULL,
    display_name        text        NOT NULL CHECK (char_length(display_name) <= 50),
    comment             text        NOT NULL CHECK (char_length(comment) <= 500),
    is_ai_suggestion    boolean     NOT NULL DEFAULT false,
    created_at          timestamptz DEFAULT now() NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_collab_comments_token
    ON writeright_collab_comments (share_token, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (Public access with rate-limiting at API layer)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE writeright_collab_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "writeright_collab_comments_public_select" ON writeright_collab_comments;
CREATE POLICY "writeright_collab_comments_public_select"
    ON writeright_collab_comments FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "writeright_collab_comments_public_insert" ON writeright_collab_comments;
CREATE POLICY "writeright_collab_comments_public_insert"
    ON writeright_collab_comments FOR INSERT
    WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON writeright_collab_comments TO anon, authenticated;
