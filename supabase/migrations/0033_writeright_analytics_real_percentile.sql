-- supabase/migrations/0033_writeright_analytics_real_percentile.sql

-- Drop the function if it exists to make the migration idempotent
DROP FUNCTION IF EXISTS get_global_percentile(text);

CREATE OR REPLACE FUNCTION get_global_percentile(p_user_id text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_percentile numeric;
  v_total_users integer;
  v_user_score integer;
BEGIN
  -- We base percentile on total improvements
  -- Get this user's total improvements
  SELECT COALESCE(SUM(improvements), 0) INTO v_user_score
  FROM writeright_writing_sessions
  WHERE clerk_user_id = p_user_id;

  -- If they have 0 improvements, they are in the 1st percentile
  IF v_user_score = 0 THEN
    RETURN 1.0;
  END IF;

  -- Get total users who have at least one session
  SELECT COUNT(DISTINCT clerk_user_id) INTO v_total_users
  FROM writeright_writing_sessions;

  IF v_total_users <= 1 THEN
    -- If they are the only user, default to a high percentile (99th) to feel good
    RETURN 99.0;
  END IF;

  -- Calculate percentile: (Number of users with score < user_score) / (Total users) * 100
  SELECT COALESCE(
    (COUNT(DISTINCT clerk_user_id)::numeric / v_total_users::numeric) * 100, 
    1.0
  ) INTO v_percentile
  FROM (
    SELECT clerk_user_id, SUM(improvements) as total_imp
    FROM writeright_writing_sessions
    GROUP BY clerk_user_id
  ) scores
  WHERE total_imp < v_user_score;

  -- Ensure it's between 1 and 99
  RETURN LEAST(GREATEST(ROUND(v_percentile, 1), 1.0), 99.0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_global_percentile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_global_percentile(text) TO service_role;
