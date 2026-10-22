-- 0045: dedup duplicate (client_id_code, sku) rows in master, then add unique
-- index. Enables `INSERT ... ON CONFLICT (client_id_code, sku) DO UPDATE` so
-- the onboarding merge-master flow can update existing rows in place rather
-- than DELETE + re-INSERT. The DELETE+INSERT pattern was cascade-deleting
-- every FK-bound row (activity_log, field_comments, aplus_sets, aplus_comments,
-- amazon_snapshots, product_key_overrides, amazon_sync_*, brand_story,
-- variation_group_assignments, variation_tag_assignments, variety_pack_items,
-- content_impact_snapshots, seo_projects.linked_product_id) on every re-merge,
-- silently destroying per-product data.
--
-- DEDUP STRATEGY: For each duplicate (client_id_code, sku) group, keep the
-- row with the most recent updated_at as the canonical "keeper". Rewrite
-- every FK reference (cascade and set-null both) from the older "loser" rows
-- to point at the keeper, then DELETE the losers. This preserves every
-- dependent row that previously pointed at a loser.
--
-- NOTE FOR PROD DEPLOY: Run on staging first. If any child table has a
-- unique constraint on (product_id, ...) that would conflict during the
-- rewrite, the migration aborts loudly — investigate and resolve before
-- retrying. Staging test against the same shape of duplicates we have in
-- local (activity_log + content_impact_snapshots only, no aplus/comments)
-- passes clean; adapt if prod has different dep distribution.
--
-- ATOMICITY: This file is executed inside a single transaction by
-- scripts/run-migration-0045.ts via sql.begin(...). Don't run via psql
-- directly without `BEGIN; ... COMMIT;` — the dedup must be all-or-nothing.

-- Step 1: Identify keepers + losers and rewrite FK references.
-- We materialize the loser→keeper mapping into a TEMP TABLE so each FK-update
-- query can join against it.
CREATE TEMP TABLE master_dup_remap (
  loser_id  uuid PRIMARY KEY,
  keeper_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO master_dup_remap (loser_id, keeper_id)
WITH ranked AS (
  SELECT id, client_id_code, sku, updated_at,
         ROW_NUMBER() OVER (
           PARTITION BY client_id_code, sku
           ORDER BY updated_at DESC, id
         ) AS rn
    FROM master
   WHERE client_id_code IS NOT NULL AND sku IS NOT NULL
),
keepers AS (
  SELECT client_id_code, sku, id AS keeper_id FROM ranked WHERE rn = 1
)
SELECT r.id AS loser_id, k.keeper_id
  FROM ranked r
  JOIN keepers k USING (client_id_code, sku)
 WHERE r.rn > 1;

-- Step 2: Rewrite FK references on every table that points at master.id.
-- Cascade tables: rows would be deleted if we delete the loser → must rewrite.
-- Set-null tables: rows would lose their FK to master → must rewrite to
--   preserve the link to the canonical row.

UPDATE activity_log              SET product_id        = r.keeper_id FROM master_dup_remap r WHERE activity_log.product_id              = r.loser_id;
UPDATE field_comments            SET product_id        = r.keeper_id FROM master_dup_remap r WHERE field_comments.product_id            = r.loser_id;
UPDATE amazon_snapshots          SET product_id        = r.keeper_id FROM master_dup_remap r WHERE amazon_snapshots.product_id          = r.loser_id;
UPDATE product_key_overrides     SET product_id        = r.keeper_id FROM master_dup_remap r WHERE product_key_overrides.product_id     = r.loser_id;
UPDATE amazon_sync_snapshots     SET product_id        = r.keeper_id FROM master_dup_remap r WHERE amazon_sync_snapshots.product_id     = r.loser_id;
UPDATE amazon_sync_discrepancies SET product_id        = r.keeper_id FROM master_dup_remap r WHERE amazon_sync_discrepancies.product_id = r.loser_id;
UPDATE aplus_sets                SET product_id        = r.keeper_id FROM master_dup_remap r WHERE aplus_sets.product_id                = r.loser_id;
UPDATE aplus_modules             SET product_id        = r.keeper_id FROM master_dup_remap r WHERE aplus_modules.product_id             = r.loser_id;
UPDATE aplus_comments            SET product_id        = r.keeper_id FROM master_dup_remap r WHERE aplus_comments.product_id            = r.loser_id;
UPDATE brand_story               SET product_id        = r.keeper_id FROM master_dup_remap r WHERE brand_story.product_id               = r.loser_id;
UPDATE variation_tag_assignments SET product_id        = r.keeper_id FROM master_dup_remap r WHERE variation_tag_assignments.product_id = r.loser_id;
UPDATE variation_group_assignments SET product_id      = r.keeper_id FROM master_dup_remap r WHERE variation_group_assignments.product_id = r.loser_id;
UPDATE variety_pack_items        SET pack_product_id   = r.keeper_id FROM master_dup_remap r WHERE variety_pack_items.pack_product_id   = r.loser_id;
UPDATE variety_pack_items        SET included_product_id = r.keeper_id FROM master_dup_remap r WHERE variety_pack_items.included_product_id = r.loser_id;
UPDATE content_impact_snapshots  SET product_id        = r.keeper_id FROM master_dup_remap r WHERE content_impact_snapshots.product_id  = r.loser_id;
UPDATE seo_projects              SET linked_product_id = r.keeper_id FROM master_dup_remap r WHERE seo_projects.linked_product_id       = r.loser_id;

-- Step 3: Delete the losers from master. With every FK now pointing at the
-- keeper, no dependent rows are lost (cascade has nothing to cascade onto).
DELETE FROM master WHERE id IN (SELECT loser_id FROM master_dup_remap);

-- Step 4: Verify the dedup actually worked. Aborts with a clear error if any
-- duplicates somehow survived (e.g. a race during migration).
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) - count(DISTINCT (client_id_code, sku))
    INTO dup_count
    FROM master
    WHERE client_id_code IS NOT NULL AND sku IS NOT NULL;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'master still has % duplicate (client_id_code, sku) rows after dedup', dup_count;
  END IF;
END $$;

-- Step 5: Add the unique index. Postgres NULLS-DISTINCT semantics mean rows
-- where either column is NULL never conflict — merge-master always inserts
-- both non-null, so the constraint applies exactly where we need it for
-- ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_client_sku
  ON master (client_id_code, sku);
