BEGIN;

-- 1. New globals columns on case_studies
ALTER TABLE case_studies
  ADD COLUMN IF NOT EXISTS client_sector    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email    text NOT NULL DEFAULT 'hello@1o8.agency',
  ADD COLUMN IF NOT EXISTS office_locations text NOT NULL DEFAULT 'Chicago / Portland';

-- 2. Wipe all section rows (verified 25 rows pre-migration, all on draft case studies)
DELETE FROM case_study_sections;

-- 3. Reset parent rows to new 13-section vocabulary + flag needs-regenerate
UPDATE case_studies
SET sections_enabled = ARRAY[
      'cover','brief','results_at_glance','channels','approach',
      'storefront','brand_story','product_listing','aplus','sns',
      'store_btp','ppc','next_steps'
    ],
    generated_at = NULL,
    updated_at   = NOW();

COMMIT;
