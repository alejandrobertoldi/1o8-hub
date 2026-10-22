-- 0096_aplus2_sets_unique_content_type.sql
--
-- aplus2_sets was unique on (client_id_code, marketplace, scope_identifier),
-- so a Basic A+ set blocked creating Premium A+ for the same ASIN (and the
-- create API added V02 on the BA+ set). Allow one set per content type.

ALTER TABLE "aplus2_sets"
  DROP CONSTRAINT IF EXISTS "aplus2_sets_client_marketplace_scope_key";
ALTER TABLE "aplus2_sets"
  DROP CONSTRAINT IF EXISTS "aplus2_sets_client_id_code_marketplace_scope_identifier_key";
ALTER TABLE "aplus2_sets"
  DROP CONSTRAINT IF EXISTS "aplus2_sets_client_marketplace_scope_content_key";

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
      AND pg_get_constraintdef(con.oid) ~* 'scope_identifier'
      AND pg_get_constraintdef(con.oid) !~* 'content_type'
  LOOP
    EXECUTE format('ALTER TABLE public.aplus2_sets DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE "aplus2_sets"
  ADD CONSTRAINT "aplus2_sets_client_marketplace_scope_content_key"
  UNIQUE ("client_id_code", "marketplace", "scope_identifier", "content_type");
