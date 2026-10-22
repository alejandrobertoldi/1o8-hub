-- 0046: Enable Row Level Security on server-only tables flagged by Supabase
-- linter (rls_disabled_in_public). These tables are written by cron jobs and
-- the onboarding flow only — they are never read or written by anon/auth
-- Supabase clients. The app connects via the `postgres` superuser role,
-- which bypasses RLS, so enabling RLS without policies effectively blocks
-- PostgREST anon/authenticated access while leaving server flows untouched.
--
-- Companion to 0034_enable_rls_all_tables.sql — same pattern, no policies.

ALTER TABLE public.staged_clr_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_tree_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports_cache       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staged_alr_links    ENABLE ROW LEVEL SECURITY;
