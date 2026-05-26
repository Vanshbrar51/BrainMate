-- supabase/migrations/0027_writeright_collab_comments.sql
-- Description: Creates the writeright_collab_comments table for anonymous feedback and AI suggestions on shared drafts.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: writeright_collab_comments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS writeright_collab_comments (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    share_token         text        NOT NULL,
    display_name        text        NOT NULL CHECK (char_length(display_name) <= 50),
    comment             text        NOT NULL CHECK (char_length(comment) <= 500),
    is_ai_suggestion    boolean     NOT NULL DEFAULT false,
    created_at          timestamptz DEFAULT now() NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_collab_comments_token
    ON writeright_collab_comments (share_token, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (Public access with rate-limiting at API layer)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE writeright_collab_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "writeright_collab_comments_public_select"
    ON writeright_collab_comments FOR SELECT
    USING (true);

CREATE POLICY "writeright_collab_comments_public_insert"
    ON writeright_collab_comments FOR INSERT
    WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON writeright_collab_comments TO anon, authenticated;
