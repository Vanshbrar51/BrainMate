-- Drop the existing view first to allow changing the column structure
DROP VIEW IF EXISTS writeright_public_shares CASCADE;

CREATE OR REPLACE VIEW writeright_public_shares AS
SELECT
  s.token,
  s.expires_at,
  s.created_at,
  j.output->>'improved_text'   AS after_text,
  j.metadata->>'mode'          AS mode,
  j.metadata->>'tone'          AS tone,
  j.output->'scores'           AS scores
FROM writeright_shares s
JOIN writeright_ai_jobs j ON j.id = s.job_id
WHERE s.expires_at > now()
  AND j.status = 'completed';

-- Allow anonymous and authenticated users to read from this view
GRANT SELECT ON writeright_public_shares TO anon;
GRANT SELECT ON writeright_public_shares TO authenticated;
