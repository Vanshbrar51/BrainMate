-- supabase/migrations/0028_fix_profile_trigger_type.sql
-- Fix the PostgreSQL type mismatch where v_mistakes (TEXT[]) is inserted into top_mistakes (JSONB)

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

  -- Upsert the profile row with v_mistakes cast to jsonb
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
