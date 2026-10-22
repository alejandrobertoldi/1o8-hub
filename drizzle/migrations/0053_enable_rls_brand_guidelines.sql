-- 0053: Enable RLS on the 3 brand-guidelines tables.
-- Matches repo convention: server-only tables get RLS enabled with no
-- policies (anon/authenticated roles blocked; the app uses the service-role
-- key via Drizzle so DB access continues to work).
-- See 0046_enable_rls_server_only_tables.sql + 0051_enable_rls_clr_unmatched_fields.sql
-- for prior precedent.

ALTER TABLE public.client_brand_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_brand_guideline_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_brand_guideline_notes ENABLE ROW LEVEL SECURITY;
