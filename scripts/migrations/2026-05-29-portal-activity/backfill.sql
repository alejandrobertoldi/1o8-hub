-- Backfill Recent Activity permission for existing clients.
--
-- Context: 2026-05-29 — added the `portal-activity` toggle so admins can
-- hide the dashboard's Recent Activity feed for individual clients. Before
-- this commit every client always saw the feed; to preserve current
-- behavior 1:1, grant `portal-activity` to every client that doesn't
-- already have it.
--
-- Idempotent: rows that already include `portal-activity` are skipped.
--
-- Run against DEV DB (= PROD Supabase per CLAUDE.md).

BEGIN;

UPDATE aac
SET allowed_sections = ARRAY(
  SELECT DISTINCT unnest(
    allowed_sections || ARRAY['portal-activity']::text[]
  )
)
WHERE NOT ('portal-activity' = ANY(allowed_sections));

-- Sanity check: every aac row should now include portal-activity
SELECT
  client_id_code,
  client_name,
  'portal-activity' = ANY(allowed_sections) AS has_activity,
  array_length(allowed_sections, 1) AS section_count
FROM aac
ORDER BY client_id_code;

COMMIT;
