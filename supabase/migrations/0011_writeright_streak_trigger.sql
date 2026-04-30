-- Trigger that auto-updates writeright_streaks after each writeright_usage insert
-- (replaces the Python worker's update_streak_and_achievements — keeps streak logic server-side)
CREATE OR REPLACE FUNCTION fn_update_writeright_streak()
RETURNS TRIGGER AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM writeright_streaks WHERE user_id = NEW.user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO writeright_streaks (user_id, current_streak, longest_streak, last_activity_date)
    VALUES (NEW.user_id, 1, 1, v_today)
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF v_row.last_activity_date = v_today THEN
    NULL; -- same day, no change
  ELSIF v_row.last_activity_date = v_today - INTERVAL '1 day' THEN
    UPDATE writeright_streaks SET
      current_streak    = v_row.current_streak + 1,
      longest_streak    = GREATEST(v_row.longest_streak, v_row.current_streak + 1),
      last_activity_date = v_today,
      updated_at        = now()
    WHERE user_id = NEW.user_id;
  ELSE
    UPDATE writeright_streaks SET
      current_streak     = 1,
      last_activity_date = v_today,
      updated_at         = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_wr_usage_streak ON writeright_usage;
CREATE TRIGGER trg_wr_usage_streak
  AFTER INSERT ON writeright_usage
  FOR EACH ROW EXECUTE FUNCTION fn_update_writeright_streak();
