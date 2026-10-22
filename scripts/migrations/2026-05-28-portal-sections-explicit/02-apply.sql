-- APPLY: backfill explicit subsection grants for client/prospect users that
-- currently rely on the dept→subsection cascade in canAccess(), and normalize
-- double-encoded string values to arrays.
--
-- See 01-dry-run.sql for the rule. This is the apply step. Run inside a
-- transaction with backup so we can rollback if the verification line shows
-- something unexpected.
--
-- HOW TO ROLLBACK: the BEGIN…ROLLBACK fence preserves the original data if
-- anything looks wrong before the COMMIT.

BEGIN;

-- 1. Snapshot before
CREATE TEMP TABLE _portal_sections_pre AS
SELECT id, email, allowed_sections FROM users WHERE role IN ('client','prospect');

-- 2. Apply
WITH normalized AS (
  SELECT u.id,
         CASE
           WHEN jsonb_typeof(u.allowed_sections) = 'string'
             THEN (u.allowed_sections #>> '{}')::jsonb
           ELSE u.allowed_sections
         END AS sections
  FROM users u
  WHERE u.role IN ('client','prospect')
),
classified AS (
  SELECT n.id, n.sections,
         (n.sections ? 'design'
            AND NOT (n.sections ?| ARRAY['brandstory','aplus','listing-images','storefront','files']))
           AS expand_design,
         (n.sections ? 'catalog'
            AND NOT (n.sections ?| ARRAY['products','sync']))
           AS expand_catalog,
         (n.sections ? 'clients'
            AND NOT (n.sections ?| ARRAY['portal']))
           AS expand_clients,
         (n.sections ? 'ppc' AND NOT (n.sections ? 'sales')) AS expand_ppc,
         (n.sections ? 'finances' AND NOT (n.sections ? 'finance-reports')) AS expand_finances
  FROM normalized n
),
desired AS (
  SELECT c.id,
         (
           SELECT to_jsonb(array_agg(DISTINCT s ORDER BY s))
           FROM (
             SELECT jsonb_array_elements_text(c.sections) AS s
             UNION
             SELECT unnest(ARRAY['brandstory','aplus','listing-images','storefront','files'])
               WHERE c.expand_design
             UNION
             SELECT unnest(ARRAY['products','sync']) WHERE c.expand_catalog
             UNION
             SELECT 'portal' WHERE c.expand_clients
             UNION
             SELECT 'sales' WHERE c.expand_ppc
             UNION
             SELECT 'finance-reports' WHERE c.expand_finances
           ) AS combined
         ) AS new_sections
  FROM classified c
)
UPDATE users u
SET allowed_sections = d.new_sections
FROM desired d
WHERE u.id = d.id
  AND u.allowed_sections::text <> d.new_sections::text;

-- 3. Verify: count rows changed, list any that look wrong
SELECT 'Rows changed:' AS label, COUNT(*) AS n
FROM users u
JOIN _portal_sections_pre p ON p.id = u.id
WHERE u.allowed_sections::text <> p.allowed_sections::text;

SELECT 'CRITICAL: brandstory was re-added to ayers rock' AS label, u.email
FROM users u
WHERE u.email = 'uuluuruu@gmail.com'
  AND u.allowed_sections ? 'brandstory';

SELECT 'Pre/post string-typed entries:' AS label,
       (SELECT COUNT(*) FROM _portal_sections_pre WHERE jsonb_typeof(allowed_sections)='string') AS pre,
       (SELECT COUNT(*) FROM users WHERE role IN ('client','prospect') AND jsonb_typeof(allowed_sections)='string') AS post;

-- If anything above is unexpected, run ROLLBACK; otherwise COMMIT;
COMMIT;
