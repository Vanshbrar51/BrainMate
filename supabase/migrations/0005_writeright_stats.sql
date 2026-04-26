-- 0005_writeright_stats.sql — Streaks and achievements for WriteRight stats panel

CREATE TABLE IF NOT EXISTS writeright_streaks (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          text        NOT NULL UNIQUE,
  current_streak   int         NOT NULL DEFAULT 0,
  longest_streak   int         NOT NULL DEFAULT 0,
  last_activity_date date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writeright_achievements (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text        NOT NULL,
  achievement  text        NOT NULL,
  earned_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement)
);

CREATE INDEX IF NOT EXISTS idx_wr_streaks_user      ON writeright_streaks (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_achievements_user ON writeright_achievements (user_id);
CREATE INDEX IF NOT EXISTS idx_wr_achievements_date ON writeright_achievements (earned_at DESC);

ALTER TABLE writeright_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeright_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wr_streaks_all ON writeright_streaks;
CREATE POLICY wr_streaks_all
  ON writeright_streaks
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS wr_achievements_all ON writeright_achievements;
CREATE POLICY wr_achievements_all
  ON writeright_achievements
  FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
