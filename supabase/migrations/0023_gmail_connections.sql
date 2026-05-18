-- 0023_gmail_connections.sql
-- Gmail OAuth connection storage with extensible integration architecture.
-- Tokens are stored server-side only. Never returned to clients raw.

-- ---------------------------------------------------------------------------
-- Core Gmail connections table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gmail_connections (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  gmail_email      text        NOT NULL,
  -- Tokens are AES-256-GCM encrypted before storage (see encryption note below)
  access_token     text        NOT NULL,
  refresh_token    text        NOT NULL,
  token_expiry     timestamptz NOT NULL,
  scope            text        NOT NULL DEFAULT 'https://www.googleapis.com/auth/gmail.readonly',
  is_active        boolean     NOT NULL DEFAULT true,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, gmail_email)
);

-- ---------------------------------------------------------------------------
-- Extensible integration architecture for future providers (Outlook, Yahoo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mail_integrations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  provider         text        NOT NULL CHECK (provider IN ('gmail', 'outlook', 'yahoo')),
  email_address    text        NOT NULL,
  display_name     text,
  avatar_url       text,
  is_active        boolean     NOT NULL DEFAULT true,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, provider, email_address)
);

-- ---------------------------------------------------------------------------
-- Imported email audit log (tracks which emails were brought into WriteRight)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gmail_imported_emails (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id    text        NOT NULL,
  gmail_message_id text        NOT NULL,
  gmail_thread_id  text,
  subject          text,
  sender_email     text,
  sender_name      text,
  snippet          text,
  imported_at      timestamptz NOT NULL DEFAULT now(),
  writeright_chat_id uuid      REFERENCES writeright_chats(id) ON DELETE SET NULL,
  -- Store which action the user took
  ai_action        text        CHECK (ai_action IN (
    'improve', 'summarize', 'rewrite', 'change_tone', 'shorten', 'professionalize', 'reply'
  )),
  UNIQUE (clerk_user_id, gmail_message_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gmail_connections_clerk_user
  ON gmail_connections (clerk_user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_gmail_connections_email
  ON gmail_connections (gmail_email);

CREATE INDEX IF NOT EXISTS idx_mail_integrations_clerk_user
  ON mail_integrations (clerk_user_id, provider);

CREATE INDEX IF NOT EXISTS idx_gmail_imported_clerk_user
  ON gmail_imported_emails (clerk_user_id, imported_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE gmail_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_integrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_imported_emails  ENABLE ROW LEVEL SECURITY;

-- gmail_connections: user sees only their own rows
-- API routes use service role (bypasses RLS) — these policies protect direct client access
DROP POLICY IF EXISTS gmail_connections_owner ON gmail_connections;
CREATE POLICY gmail_connections_owner ON gmail_connections
  FOR ALL USING (auth.uid()::text = clerk_user_id)
  WITH CHECK (auth.uid()::text = clerk_user_id);

DROP POLICY IF EXISTS mail_integrations_owner ON mail_integrations;
CREATE POLICY mail_integrations_owner ON mail_integrations
  FOR ALL USING (auth.uid()::text = clerk_user_id)
  WITH CHECK (auth.uid()::text = clerk_user_id);

DROP POLICY IF EXISTS gmail_imported_emails_owner ON gmail_imported_emails;
CREATE POLICY gmail_imported_emails_owner ON gmail_imported_emails
  FOR ALL USING (auth.uid()::text = clerk_user_id)
  WITH CHECK (auth.uid()::text = clerk_user_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for gmail_connections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_gmail_connections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_gmail_connections_updated_at ON gmail_connections;
CREATE TRIGGER trg_gmail_connections_updated_at
  BEFORE UPDATE ON gmail_connections
  FOR EACH ROW EXECUTE FUNCTION update_gmail_connections_updated_at();
