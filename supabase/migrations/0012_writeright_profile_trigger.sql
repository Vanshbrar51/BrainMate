-- After every 5th usage row for a user, re-compute their top_mistakes profile
CREATE OR REPLACE FUNCTION fn_update_writeright_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_count bigint;
  v_mistakes text[];
BEGIN
  SELECT COUNT(*) INTO v_count FROM writeright_usage WHERE user_id = NEW.user_id;
  IF v_count % 5 <> 0 THEN RETURN NEW; END IF;

  SELECT ARRAY(
    SELECT mistake FROM (
      SELECT jsonb_array_elements_text(
        (content::jsonb -> 'teaching' -> 'mistakes')
      ) AS mistake
      FROM writeright_messages
      WHERE user_id = NEW.user_id AND role = 'assistant'
      ORDER BY created_at DESC
      LIMIT 100
    ) sub
    GROUP BY mistake
    ORDER BY COUNT(*) DESC
    LIMIT 5
  ) INTO v_mistakes;

  INSERT INTO writeright_writing_profiles (user_id, top_mistakes, improvement_count, last_analyzed_at)
  VALUES (NEW.user_id, to_jsonb(v_mistakes), v_count, now())
  ON CONFLICT (user_id) DO UPDATE SET
    top_mistakes     = EXCLUDED.top_mistakes,
    improvement_count = EXCLUDED.improvement_count,
    last_analyzed_at = EXCLUDED.last_analyzed_at,
    updated_at       = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_wr_usage_profile ON writeright_usage;
CREATE TRIGGER trg_wr_usage_profile
  AFTER INSERT ON writeright_usage
  FOR EACH ROW EXECUTE FUNCTION fn_update_writeright_profile();
