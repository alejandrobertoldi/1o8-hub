-- 0057: Separate textarea for user-added notes on the SEO project's S1.5
-- brand-guidelines step. The auto-imported `brand_guidelines` column is
-- overwritten on every "Refresh from client" click; `brand_guidelines_notes`
-- holds project-specific context that survives re-imports.
-- Applied via Supabase MCP (mcp__supabase__apply_migration) on 2026-05-08.
-- Drizzle journal frozen at 0004 by codebase convention; this file is docs.

ALTER TABLE seo_projects
  ADD COLUMN brand_guidelines_notes text;

COMMENT ON COLUMN seo_projects.brand_guidelines_notes IS
  'Project-specific notes on top of the auto-imported brand_guidelines. Never overwritten by the Refresh-from-client flow.';
