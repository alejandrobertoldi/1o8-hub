-- Add 'discontinued' to brand_story_versions status check constraint
ALTER TABLE brand_story_versions DROP CONSTRAINT IF EXISTS brand_story_versions_status_check;
ALTER TABLE brand_story_versions ADD CONSTRAINT brand_story_versions_status_check
  CHECK (status IN ('not_started', 'in_progress', 'in_review', 'approved', 'live', 'discontinued'));
