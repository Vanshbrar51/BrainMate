-- supabase/migrations/0024_gmail_scheduled_sends.sql
-- Description: Creates the gmail_scheduled_sends table to track deferred email sending tasks.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: gmail_scheduled_sends
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gmail_scheduled_sends (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    clerk_user_id       text        NOT NULL,
    gmail_email         text        NOT NULL,
    recipient_email     text        NOT NULL,
    subject             text        NOT NULL,
    body                text        NOT NULL,
    scheduled_at        timestamptz NOT NULL,
    status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    created_at          timestamptz DEFAULT now() NOT NULL,
    updated_at          timestamptz DEFAULT now() NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gmail_scheduled_sends_clerk_user_id
    ON gmail_scheduled_sends (clerk_user_id);

CREATE INDEX IF NOT EXISTS idx_gmail_scheduled_sends_created_at
    ON gmail_scheduled_sends (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmail_scheduled_sends_status_time
    ON gmail_scheduled_sends (status, scheduled_at ASC);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER update_gmail_scheduled_sends_updated_at
    BEFORE UPDATE ON gmail_scheduled_sends
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gmail_scheduled_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmail_scheduled_sends_select_own"
    ON gmail_scheduled_sends FOR SELECT
    USING (clerk_user_id = current_setting('app.current_user_id', true));

CREATE POLICY "gmail_scheduled_sends_insert_own"
    ON gmail_scheduled_sends FOR INSERT
    WITH CHECK (clerk_user_id = current_setting('app.current_user_id', true));

CREATE POLICY "gmail_scheduled_sends_update_own"
    ON gmail_scheduled_sends FOR UPDATE
    USING (clerk_user_id = current_setting('app.current_user_id', true));

CREATE POLICY "gmail_scheduled_sends_delete_own"
    ON gmail_scheduled_sends FOR DELETE
    USING (clerk_user_id = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON gmail_scheduled_sends TO authenticated;
