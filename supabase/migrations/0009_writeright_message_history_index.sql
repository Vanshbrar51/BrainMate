-- 0009_writeright_message_history_index.sql — history lookup performance

CREATE INDEX IF NOT EXISTS idx_wr_messages_chat_role_created_desc
  ON writeright_messages (chat_id, role, created_at DESC);
