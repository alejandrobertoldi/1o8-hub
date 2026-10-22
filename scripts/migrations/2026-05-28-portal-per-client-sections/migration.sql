-- scripts/migrations/2026-05-28-portal-per-client-sections/migration.sql
-- Add aac.allowed_sections + backfill from existing per-user grants.
-- Idempotent: re-running won't double-apply (ADD COLUMN IF NOT EXISTS,
-- and the backfill UPDATE matches on clientIdCode).
--
-- Run AFTER backup.sql. Requires DATABASE_URL pointing at prod Supabase
-- (per CLAUDE.md, .env.local DATABASE_URL == prod).

-- 1. Add column with default matching DEFAULT_CLIENT_SECTIONS in
--    src/lib/permissions.ts (keep these arrays in sync manually).
ALTER TABLE "aac"
  ADD COLUMN IF NOT EXISTS "allowed_sections" text[] NOT NULL
  DEFAULT ARRAY[
    'timeline','sales','products','seo','design','reports','finances',
    'brandstory','aplus','listing-images','storefront','files','finance-reports'
  ]::text[];

-- 2. Backfill: for each client_id_code seen on a client/prospect user,
--    write the union of those users' allowed_sections to the aac row.
--    Handles multi-client users (comma-separated client_id_code) by
--    unnesting the codes.
WITH user_unions AS (
  SELECT
    TRIM(unnested_code) AS code,
    array_agg(DISTINCT section) AS union_sections
  FROM users u
  CROSS JOIN LATERAL unnest(string_to_array(u.client_id_code, ',')) AS unnested_code
  CROSS JOIN LATERAL unnest(u.allowed_sections) AS section
  WHERE u.role IN ('client','prospect')
    AND u.client_id_code IS NOT NULL
    AND u.allowed_sections IS NOT NULL
  GROUP BY TRIM(unnested_code)
)
UPDATE "aac" a
SET allowed_sections = uu.union_sections
FROM user_unions uu
WHERE uu.code = a.client_id_code
  AND uu.union_sections IS NOT NULL
  AND array_length(uu.union_sections, 1) > 0;

-- 3. Verification — copy this output into the PR description.
SELECT
  client_id_code,
  client_name,
  allowed_sections,
  array_length(allowed_sections, 1) AS section_count
FROM "aac"
ORDER BY client_id_code;
