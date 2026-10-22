-- Add fine-grained extraction stage so the UI can show real progress instead
-- of an indeterminate shimmer while pdf-parse + Claude calls run (30-90s).
-- Applied via Supabase MCP (mcp__supabase__apply_migration) on 2026-05-07.
-- Drizzle journal frozen at 0004 by codebase convention; this file is docs.

ALTER TABLE client_brand_guidelines
  ADD COLUMN IF NOT EXISTS extraction_stage text;

COMMENT ON COLUMN client_brand_guidelines.extraction_stage IS
  'Sub-stage of extraction while extraction_status=extracting: parsing_pdf | extracting_md | extracting_summary | saving. NULL when idle/failed.';
