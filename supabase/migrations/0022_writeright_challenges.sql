-- 0022_writeright_challenges.sql
-- Daily writing challenges and leaderboard completion tracking.

CREATE TABLE IF NOT EXISTS writeright_daily_challenges (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date         date NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text NOT NULL,
  mode         text NOT NULL,
  difficulty   text NOT NULL DEFAULT 'medium',
  prompt_text  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writeright_challenge_completions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id uuid NOT NULL REFERENCES writeright_daily_challenges(id),
  user_id      text NOT NULL,
  job_id       uuid REFERENCES writeright_ai_jobs(id),
  score        int NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wr_challenge_completions_date
  ON writeright_challenge_completions (challenge_id, score DESC);

ALTER TABLE writeright_daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_challenge_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wr_daily_challenges_select ON writeright_daily_challenges;
CREATE POLICY wr_daily_challenges_select
  ON writeright_daily_challenges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS wr_challenge_completions_own ON writeright_challenge_completions;
CREATE POLICY wr_challenge_completions_own
  ON writeright_challenge_completions
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
