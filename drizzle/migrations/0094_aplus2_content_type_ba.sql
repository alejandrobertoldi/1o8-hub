-- 0094_aplus2_content_type_ba.sql
--
-- aplus2_sets.content_type was created with CHECK (content_type = 'PA+')
-- (0068_aplus2.sql). App support for Basic A+ ("BA+") landed later without a
-- matching DDL change, so POST /api/aplus2/sets with contentType=BA+ fails
-- the check (Failed query: insert into "aplus2_sets" ... 'BA+').
-- Allow both Premium and Basic.

ALTER TABLE "aplus2_sets" DROP CONSTRAINT IF EXISTS "aplus2_sets_content_type_check";

-- Catch leftover unnamed/auto-named CHECKs that still pin content_type to PA+ only.
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
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ~* 'content_type'
      AND pg_get_constraintdef(con.oid) !~* 'BA\+'
  LOOP
    EXECUTE format('ALTER TABLE public.aplus2_sets DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE "aplus2_sets"
  ADD CONSTRAINT "aplus2_sets_content_type_check"
  CHECK ("content_type" IN ('PA+', 'BA+'));
