-- Migration: Add missing columns to projects table
-- Run this in Supabase SQL Editor

-- Brand guidelines text (was being saved but column didn't exist)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_guidelines TEXT DEFAULT '';

-- Brand guidelines lock state (locked / not_applicable / pending)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_guidelines_lock JSONB;

-- Variety pack details (was being saved but column didn't exist)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS variety_pack_details TEXT;

-- Compliance summary (used by S6 SEO Content)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS compliance_summary JSONB;

-- SEO config (used by S6 SEO Content)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS seo_config JSONB;

-- Update current_phase constraint to reflect new numbering (S6 = SEO Content)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_current_phase_check;
ALTER TABLE projects ADD CONSTRAINT projects_current_phase_check
  CHECK (current_phase IN ('S1','S2','S3','S4','S5','S6','S7','S8'));
