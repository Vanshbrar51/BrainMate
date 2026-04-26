-- 0006_writeright_search_indexes.sql — Full-text indexes for history search

CREATE INDEX IF NOT EXISTS idx_wr_messages_content_fts
  ON writeright_messages
  USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_wr_chats_title_fts
  ON writeright_chats
  USING gin(to_tsvector('english', title));
