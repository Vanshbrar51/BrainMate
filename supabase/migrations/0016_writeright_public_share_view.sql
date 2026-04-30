-- Materialized view for the public share page — pre-joins jobs and shares
-- Refreshed when a new share is created (via function call in share/route.ts)
-- Not strictly necessary but speeds up the public share endpoint significantly

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

-- No RLS needed — this is a server-side view accessed only by the API route with service key
