-- Backfill Sales/Reports sub-card permissions for existing clients.
--
-- Context: 2026-05-28 — added granular toggles for Sales (4 sub-cards) and
-- Reports (6 sub-cards) to /portal. Without backfill, any client whose
-- aac.allowed_sections has the parent ("sales" or "reports") but NOT the new
-- sub-IDs would silently lose access to those cards, because canAccess()
-- does NOT cascade from department to subsection (see src/lib/permissions.ts).
--
-- Effect: for every client that already has the parent section granted, add
-- the new sub-IDs so the current visibility surface is preserved 1:1.
-- Re-running is idempotent: ARRAY || ARRAY produces duplicates, then
-- ARRAY(SELECT DISTINCT …) collapses them.
--
-- Run against DEV DB (= PROD Supabase per CLAUDE.md). Read-only verify first:
--
--   SELECT client_id_code, allowed_sections FROM aac
--   WHERE 'sales' = ANY(allowed_sections) OR 'reports' = ANY(allowed_sections);

BEGIN;

-- Sales sub-cards — apply to clients with 'sales' granted
UPDATE aac
SET allowed_sections = ARRAY(
  SELECT DISTINCT unnest(
    allowed_sections || ARRAY[
      'sales-overview',
      'sales-inventory',
      'sales-forecast',
      'sales-monitor'
    ]::text[]
  )
)
WHERE 'sales' = ANY(allowed_sections);

-- Reports sub-cards — apply to clients with 'reports' granted
UPDATE aac
SET allowed_sections = ARRAY(
  SELECT DISTINCT unnest(
    allowed_sections || ARRAY[
      'reports-overview',
      'reports-period-comparative',
      'reports-inventory',
      'reports-share-of-voice',
      'reports-subscribe-save',
      'reports-advertising-audit'
    ]::text[]
  )
)
WHERE 'reports' = ANY(allowed_sections);

-- Sanity check: show every client touched and the new section count
SELECT
  client_id_code,
  client_name,
  array_length(allowed_sections, 1) AS section_count,
  allowed_sections
FROM aac
WHERE 'sales' = ANY(allowed_sections) OR 'reports' = ANY(allowed_sections)
ORDER BY client_id_code;

COMMIT;
