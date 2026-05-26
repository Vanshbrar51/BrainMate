-- supabase/migrations/0026_writeright_preferences.sql
-- Description: Alters writeright_user_settings to add a preferences JSONB column for persistent user options.

-- ─────────────────────────────────────────────────────────────────────────────
-- Alter writeright_user_settings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE writeright_user_settings
    ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb NOT NULL;
