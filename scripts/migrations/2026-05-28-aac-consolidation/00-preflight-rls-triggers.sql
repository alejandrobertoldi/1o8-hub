-- Phase 1 preflight: RLS policies + triggers on AAC_master and aac
-- Read-only. Run with: psql "$DATABASE_URL" -f scripts/migrations/2026-05-28-aac-consolidation/00-preflight-rls-triggers.sql

\echo '=== RLS policies on aac ==='
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('aac', 'AAC_master');

\echo '=== RLS enabled flag ==='
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('aac', 'AAC_master');

\echo '=== Triggers ==='
SELECT event_object_table, trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('aac', 'AAC_master');

\echo '=== Foreign keys referencing aac or AAC_master ==='
SELECT
  tc.table_name AS dependent_table,
  kcu.column_name AS dependent_column,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
JOIN information_schema.constraint_column_usage ccu USING (constraint_name, table_schema)
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name IN ('aac', 'AAC_master');
