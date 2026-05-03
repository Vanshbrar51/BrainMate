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
