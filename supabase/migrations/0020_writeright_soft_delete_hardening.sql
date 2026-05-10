-- 0020_writeright_soft_delete_hardening.sql
-- Adds deleted_at column to tables that were missing it to support soft-deletes and satisfy Rule 3.3.

-- 1. Profiles
ALTER TABLE writeright_writing_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Templates
ALTER TABLE writeright_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Messages
ALTER TABLE writeright_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. AI Jobs
ALTER TABLE writeright_ai_jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 5. Achievements
ALTER TABLE writeright_achievements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 6. Streaks
ALTER TABLE writeright_streaks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 7. Feedback
ALTER TABLE writeright_feedback ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 8. User Settings
ALTER TABLE writeright_user_settings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 9. Quota
ALTER TABLE writeright_quota ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add indexes for performance on soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_wr_writing_profiles_deleted_at ON writeright_writing_profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wr_templates_deleted_at ON writeright_templates(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wr_messages_deleted_at ON writeright_messages(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wr_ai_jobs_deleted_at ON writeright_ai_jobs(deleted_at) WHERE deleted_at IS NULL;
