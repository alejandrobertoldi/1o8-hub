-- Enable RLS on clr_unmatched_fields to match the project-wide convention
-- established in 0034_enable_rls_all_tables.sql. This table was added in
-- 0047_attributes_unification.sql and missed at the time. No policies are
-- attached: server-side access uses the postgres connection (bypasses RLS),
-- and there is no anon/authenticated PostgREST consumer for this audit table.
ALTER TABLE public.clr_unmatched_fields ENABLE ROW LEVEL SECURITY;
