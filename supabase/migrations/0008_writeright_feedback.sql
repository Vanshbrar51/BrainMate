CREATE TABLE IF NOT EXISTS writeright_feedback (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text NOT NULL,
  chat_id     uuid NOT NULL REFERENCES writeright_chats(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES writeright_ai_jobs(id) ON DELETE CASCADE,
  rating      text NOT NULL CHECK(rating IN ('up','down')),
  reason      text,
  mode        text,
  tone        text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_feedback_user ON writeright_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_feedback_job  ON writeright_feedback (job_id);

ALTER TABLE writeright_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY wr_feedback_insert ON writeright_feedback
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY wr_feedback_select ON writeright_feedback
  FOR SELECT USING (auth.uid()::text = user_id);
