-- DRY RUN: show which client/prospect users would gain which subsection IDs.
-- Side-effect free. Run this before the apply step to verify the diff.
--
-- Reason: src/lib/permissions.ts previously cascaded department grants to
-- subsections inside canAccess(). The new strict semantics require each
-- subsection to be listed explicitly, so we backfill the implicit grants
-- before flipping the function.
--
-- Rule: for each multi-subsection dept, expand ONLY if the user is on the
-- legacy pattern (dept granted, zero subsections of that dept listed). If
-- the user already has any subsection of that dept explicitly listed, treat
-- them as already managing subsections individually — leave their choices
-- intact, including intentional unchecks (e.g. ayers rock's brandstory).
--
-- Also normalizes 2 users (sam/simon @goelk) whose allowed_sections is a
-- double-encoded JSON string instead of a jsonb array.

WITH normalized AS (
  SELECT u.id, u.email, u.allowed_sections AS old_sections,
         CASE
           WHEN jsonb_typeof(u.allowed_sections) = 'string'
             THEN (u.allowed_sections #>> '{}')::jsonb
           ELSE u.allowed_sections
         END AS sections
  FROM users u
  WHERE u.role IN ('client','prospect')
),
classified AS (
  SELECT n.*,
         -- "Has dept but no explicit subsection" → expand for that dept.
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
  SELECT c.id, c.email, c.old_sections, c.sections AS normalized_sections,
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
SELECT email,
       jsonb_typeof(old_sections) AS old_type,
       jsonb_array_length(normalized_sections) AS old_count,
       jsonb_array_length(new_sections) AS new_count,
       ARRAY(
         SELECT jsonb_array_elements_text(new_sections)
         EXCEPT
         SELECT jsonb_array_elements_text(normalized_sections)
       ) AS will_add
FROM desired
WHERE old_sections::text <> new_sections::text
ORDER BY email;
