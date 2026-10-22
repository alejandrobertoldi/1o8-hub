-- scripts/migrations/2026-05-28-portal-per-client-sections/migration-v2-apply.sql
-- v2 apply: write per-client allowed_sections from union of users.allowed_sections (jsonb).
-- Run only after migration-v2-backfill.sql preview looks correct.
-- Idempotent: re-running re-writes the same union.

WITH user_unions AS (
  SELECT
    TRIM(unnested_code) AS code,
    array_agg(DISTINCT section ORDER BY section) AS union_sections
  FROM users u
  CROSS JOIN LATERAL unnest(string_to_array(u.client_id_code, ',')) AS unnested_code
  CROSS JOIN LATERAL jsonb_array_elements_text(u.allowed_sections) AS section
  WHERE u.role IN ('client','prospect')
    AND u.client_id_code IS NOT NULL
    AND u.allowed_sections IS NOT NULL
    AND jsonb_typeof(u.allowed_sections) = 'array'
  GROUP BY TRIM(unnested_code)
)
UPDATE aac a
SET allowed_sections = uu.union_sections,
    updated_at = NOW()
FROM user_unions uu
WHERE uu.code = a.client_id_code
  AND uu.union_sections IS NOT NULL
  AND array_length(uu.union_sections, 1) > 0;

-- Verify
SELECT
  client_id_code,
  client_name,
  array_length(allowed_sections, 1) AS section_count
FROM aac
WHERE client_id_code IN ('C23_SC_US','C23_WF_US','DAR_SC_US','DRC_SC_US','DRE_SC_US','DUM_SC_US','ELK_SC_US','MIS_SC_US','TOA_SC_US','ZIN_SC_US')
ORDER BY client_id_code;
