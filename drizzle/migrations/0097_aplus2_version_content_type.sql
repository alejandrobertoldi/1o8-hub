-- 0097_aplus2_version_content_type.sql
--
-- NTA flow: one set per ASIN; V01 is typically BA+, later versions PA+.
-- content_type lives on each version so the editor and Drive name
-- (_ABasic_V## vs _APlus_V##) follow that version, not the set.
-- Restores set uniqueness to (client, marketplace, scope) — PA+ after BA+
-- is V02 on the same set, not a second set.

ALTER TABLE "aplus2_versions"
  ADD COLUMN IF NOT EXISTS "content_type" varchar(3) NOT NULL DEFAULT 'PA+';

UPDATE "aplus2_versions" v
SET "content_type" = s."content_type"
FROM "aplus2_sets" s
WHERE s.id = v.set_id
  AND s."content_type" IN ('PA+', 'BA+');

ALTER TABLE "aplus2_versions" DROP CONSTRAINT IF EXISTS "aplus2_versions_content_type_check";
ALTER TABLE "aplus2_versions"
  ADD CONSTRAINT "aplus2_versions_content_type_check"
  CHECK ("content_type" IN ('PA+', 'BA+'));

-- If 0096 created a second set for the same ASIN, fold its versions onto the
-- oldest set (renumber after the keeper's max version), then drop extras.
DO $$
DECLARE
  grp RECORD;
  keeper uuid;
  extra uuid;
  max_v int;
BEGIN
  FOR grp IN
    SELECT client_id_code, marketplace, scope_identifier
    FROM aplus2_sets
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper
    FROM aplus2_sets
    WHERE client_id_code = grp.client_id_code
      AND marketplace = grp.marketplace
      AND scope_identifier = grp.scope_identifier
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT COALESCE(MAX(version_number), 0) INTO max_v
    FROM aplus2_versions WHERE set_id = keeper;

    FOR extra IN
      SELECT id FROM aplus2_sets
      WHERE client_id_code = grp.client_id_code
        AND marketplace = grp.marketplace
        AND scope_identifier = grp.scope_identifier
        AND id <> keeper
      ORDER BY created_at ASC
    LOOP
      UPDATE aplus2_versions v
      SET set_id = keeper,
          version_number = v.version_number + max_v
      WHERE v.set_id = extra;

      SELECT COALESCE(MAX(version_number), 0) INTO max_v
      FROM aplus2_versions WHERE set_id = keeper;

      DELETE FROM aplus2_sets WHERE id = extra;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "aplus2_sets"
  DROP CONSTRAINT IF EXISTS "aplus2_sets_client_marketplace_scope_content_key";
ALTER TABLE "aplus2_sets"
  DROP CONSTRAINT IF EXISTS "aplus2_sets_client_id_code_marketplace_scope_identifier_content_type_key";

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'aplus2_sets'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ~* 'content_type'
  LOOP
    EXECUTE format('ALTER TABLE public.aplus2_sets DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'aplus2_sets_client_marketplace_scope_key'
      AND conrelid = 'public.aplus2_sets'::regclass
  ) THEN
    ALTER TABLE "aplus2_sets"
      ADD CONSTRAINT "aplus2_sets_client_marketplace_scope_key"
      UNIQUE ("client_id_code", "marketplace", "scope_identifier");
  END IF;
END $$;
