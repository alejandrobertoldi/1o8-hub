-- 0095_aplus2_version_discontinued.sql
--
-- aplus2_versions.status was created with
--   CHECK (status IN ('not_started','in_progress','in_review','approved','live'))
-- (0068_aplus2.sql). The API and set-list UI already accept "discontinued"
-- (same palette as brand story / listing images). The set editor dropdown
-- was missing the option, and the CHECK would reject it even after the UI
-- shows it. Allow discontinued.

ALTER TABLE "aplus2_versions" DROP CONSTRAINT IF EXISTS "aplus2_versions_status_check";

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
      AND rel.relname = 'aplus2_versions'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ~* 'status'
      AND pg_get_constraintdef(con.oid) !~* 'discontinued'
  LOOP
    EXECUTE format('ALTER TABLE public.aplus2_versions DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE "aplus2_versions"
  ADD CONSTRAINT "aplus2_versions_status_check"
  CHECK ("status" IN ('not_started', 'in_progress', 'in_review', 'approved', 'live', 'discontinued'));
