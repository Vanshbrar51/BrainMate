-- Persistent rate limit tracking for quota enforcement (supplements Redis counters)
-- Used as Redis fallback when circuit breaker is open
CREATE TABLE IF NOT EXISTS writeright_daily_usage (
  user_id       text        NOT NULL,
  usage_date    date        NOT NULL DEFAULT CURRENT_DATE,
  request_count int         NOT NULL DEFAULT 0,
  char_count    bigint      NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_wr_daily_usage_user_date
  ON writeright_daily_usage (user_id, usage_date DESC);

ALTER TABLE writeright_daily_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY wr_daily_usage_select ON writeright_daily_usage
  FOR SELECT USING (auth.uid()::text = user_id);

-- Auto-increment function called by message/route.ts
CREATE OR REPLACE FUNCTION increment_wr_daily_usage(
  p_user_id text, p_chars int
) RETURNS void AS $$
BEGIN
  INSERT INTO writeright_daily_usage (user_id, usage_date, request_count, char_count)
  VALUES (p_user_id, CURRENT_DATE, 1, p_chars)
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    request_count = writeright_daily_usage.request_count + 1,
    char_count    = writeright_daily_usage.char_count + p_chars;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
