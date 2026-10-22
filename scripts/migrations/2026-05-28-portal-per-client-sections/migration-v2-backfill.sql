-- scripts/migrations/2026-05-28-portal-per-client-sections/migration-v2-backfill.sql
-- v2: fixes the failed backfill from migration.sql.
-- Original migration.sql used unnest() which only works on PG arrays, but
-- users.allowed_sections is jsonb in prod. This version uses
-- jsonb_array_elements_text() to flatten the jsonb array, then unions per
-- client across all that client's assigned users.
--
-- Idempotent: re-running just re-writes the same union.

-- Section 1: DRY-RUN preview (no writes). Comment OUT to skip.
WITH user_unions AS (
  SELECT
    TRIM(unnested_code) AS code,
    array_agg(DISTINCT section ORDER BY section) AS union_sections,
    COUNT(DISTINCT u.id) AS user_count
  FROM users u
  CROSS JOIN LATERAL unnest(string_to_array(u.client_id_code, ',')) AS unnested_code
  CROSS JOIN LATERAL jsonb_array_elements_text(u.allowed_sections) AS section
  WHERE u.role IN ('client','prospect')
    AND u.client_id_code IS NOT NULL
    AND u.allowed_sections IS NOT NULL
    AND jsonb_typeof(u.allowed_sections) = 'array'
  GROUP BY TRIM(unnested_code)
)
SELECT
  uu.code,
  a.client_name,
  uu.user_count,
  array_length(uu.union_sections, 1) AS section_count,
  uu.union_sections
FROM user_unions uu
LEFT JOIN aac a ON a.client_id_code = uu.code
ORDER BY uu.code;
