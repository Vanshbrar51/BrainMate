-- supabase/migrations/0031_writeright_writing_sessions.sql
-- New table to track granular writing sessions for the heatmap and analytics engine.

CREATE TABLE IF NOT EXISTS writeright_writing_sessions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  session_date     date        NOT NULL DEFAULT CURRENT_DATE,
  improvements     integer     NOT NULL DEFAULT 1,
  total_tokens     integer     NOT NULL DEFAULT 0,
  avg_clarity      numeric(4,1),
  avg_tone_score   numeric(4,1),
  avg_impact_score numeric(4,1),
  modes_used       text[]      NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_wr_sessions_user_date
  ON writeright_writing_sessions (clerk_user_id, session_date DESC);

CREATE TRIGGER trg_wr_sessions_updated_at
  BEFORE UPDATE ON writeright_writing_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE writeright_writing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wr_sessions_own" ON writeright_writing_sessions
  FOR ALL USING (clerk_user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE ON writeright_writing_sessions TO authenticated;

-- DB function: upsert session daily counter (atomic, call from API layer)
CREATE OR REPLACE FUNCTION upsert_writing_session(
  p_user_id       text,
  p_clarity       numeric,
  p_tone          numeric,
  p_impact        numeric,
  p_tokens        integer,
  p_mode          text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO writeright_writing_sessions(
    clerk_user_id, session_date, improvements, total_tokens,
    avg_clarity, avg_tone_score, avg_impact_score, modes_used
  )
  VALUES(
    p_user_id, CURRENT_DATE, 1, p_tokens,
    p_clarity, p_tone, p_impact, ARRAY[p_mode]
  )
  ON CONFLICT (clerk_user_id, session_date)
  DO UPDATE SET
    improvements     = writeright_writing_sessions.improvements + 1,
    total_tokens     = writeright_writing_sessions.total_tokens + p_tokens,
    avg_clarity      = (writeright_writing_sessions.avg_clarity * writeright_writing_sessions.improvements
                        + p_clarity) / (writeright_writing_sessions.improvements + 1),
    avg_tone_score   = (writeright_writing_sessions.avg_tone_score * writeright_writing_sessions.improvements
                        + p_tone) / (writeright_writing_sessions.improvements + 1),
    avg_impact_score = (writeright_writing_sessions.avg_impact_score * writeright_writing_sessions.improvements
                        + p_impact) / (writeright_writing_sessions.improvements + 1),
    modes_used       = ARRAY(SELECT DISTINCT unnest(writeright_writing_sessions.modes_used || ARRAY[p_mode])),
    updated_at       = now();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_writing_session TO service_role;
