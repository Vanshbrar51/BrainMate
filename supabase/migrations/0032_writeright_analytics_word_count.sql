-- supabase/migrations/0032_writeright_analytics_word_count.sql
-- Adds word_count to writing sessions for vocabulary tracking in the analytics engine.
-- Also adds a cached total_improvements column to avoid full table scans in analytics queries.

ALTER TABLE writeright_writing_sessions
  ADD COLUMN IF NOT EXISTS word_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_wr_sessions_user_date_covering
  ON writeright_writing_sessions (clerk_user_id, session_date DESC)
  INCLUDE (improvements, avg_clarity, avg_tone_score, avg_impact_score, modes_used, word_count);

-- Update upsert_writing_session to track word count
CREATE OR REPLACE FUNCTION upsert_writing_session(
  p_user_id       text,
  p_clarity       numeric,
  p_tone          numeric,
  p_impact        numeric,
  p_tokens        integer,
  p_mode          text,
  p_word_count    integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO writeright_writing_sessions(
    clerk_user_id, session_date, improvements, total_tokens,
    avg_clarity, avg_tone_score, avg_impact_score, modes_used, word_count
  )
  VALUES(
    p_user_id, CURRENT_DATE, 1, p_tokens,
    p_clarity, p_tone, p_impact, ARRAY[p_mode], p_word_count
  )
  ON CONFLICT (clerk_user_id, session_date)
  DO UPDATE SET
    improvements     = writeright_writing_sessions.improvements + 1,
    total_tokens     = writeright_writing_sessions.total_tokens + p_tokens,
    word_count       = writeright_writing_sessions.word_count + p_word_count,
    avg_clarity      = ROUND(
                         (writeright_writing_sessions.avg_clarity * writeright_writing_sessions.improvements
                          + p_clarity) / (writeright_writing_sessions.improvements + 1), 1),
    avg_tone_score   = ROUND(
                         (writeright_writing_sessions.avg_tone_score * writeright_writing_sessions.improvements
                          + p_tone) / (writeright_writing_sessions.improvements + 1), 1),
    avg_impact_score = ROUND(
                         (writeright_writing_sessions.avg_impact_score * writeright_writing_sessions.improvements
                          + p_impact) / (writeright_writing_sessions.improvements + 1), 1),
    modes_used       = ARRAY(SELECT DISTINCT unnest(writeright_writing_sessions.modes_used || ARRAY[p_mode])),
    updated_at       = now();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_writing_session TO service_role;
