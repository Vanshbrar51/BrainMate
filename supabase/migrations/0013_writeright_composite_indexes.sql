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
