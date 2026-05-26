-- supabase/migrations/0025_writeright_template_categories.sql
-- Description: Alters writeright_templates to support categorization, tagging, sorting, and AI generation metadata.

-- ─────────────────────────────────────────────────────────────────────────────
-- Alter writeright_templates
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE writeright_templates
    ADD COLUMN IF NOT EXISTS category         text DEFAULT 'All' NOT NULL,
    ADD COLUMN IF NOT EXISTS tags             text[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN IF NOT EXISTS is_ai_generated  boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS preview_text     text,
    ADD COLUMN IF NOT EXISTS sort_order       integer DEFAULT 0 NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_writeright_templates_category
    ON writeright_templates (user_id, category);

CREATE INDEX IF NOT EXISTS idx_writeright_templates_sort_order
    ON writeright_templates (user_id, sort_order ASC);
