-- supabase/migrations/0012_writeright_profile_trigger.sql
-- DB trigger for atomic writing-profile updates on writeright_usage INSERT (F-BE-08)
-- Collects last 20 unique mistakes from writeright_messages and upserts writeright_writing_profiles.
-- This trigger runs AFTER the usage row is committed, so it never blocks job completion.

CREATE OR REPLACE FUNCTION fn_update_writeright_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count    INT;
  v_mistakes TEXT[];
  v_row      RECORD;
BEGIN
  -- Total usage count for this user
  SELECT COUNT(*) INTO v_count FROM writeright_usage WHERE user_id = NEW.user_id;

  -- Collect up to 50 recent mistakes from assistant messages
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

  -- Upsert the profile row
  INSERT INTO writeright_writing_profiles
    (user_id, top_mistakes, improvement_count, last_analyzed_at)
  VALUES (
    NEW.user_id,
    COALESCE(v_mistakes, '{}'),
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
