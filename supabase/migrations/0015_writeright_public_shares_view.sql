-- supabase/migrations/0015_writeright_public_shares_view.sql
-- Exposes an anonymous-accessible view of public shares for the /share/[token] page.
-- The view filters out expired shares and exposes only the columns needed for rendering.

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
