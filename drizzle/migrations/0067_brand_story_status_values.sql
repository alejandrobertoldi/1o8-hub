-- Brand Story per-version status enum: replace placeholder values
-- ('draft' | 'active' | 'archived') with the real workflow:
-- ('not_started' | 'in_progress' | 'in_review' | 'approved' | 'live').
-- Manually updated by an editor from a Select in the version card header.
--
-- Safe to run with zero rows in brand_story_versions (verified pre-migration).

SET statement_timeout = 0;
SET lock_timeout = '30s';

ALTER TABLE brand_story_versions
  DROP CONSTRAINT IF EXISTS brand_story_versions_status_check;

ALTER TABLE brand_story_versions
  ALTER COLUMN status SET DEFAULT 'not_started';

ALTER TABLE brand_story_versions
  ADD CONSTRAINT brand_story_versions_status_check
  CHECK (status IN ('not_started', 'in_progress', 'in_review', 'approved', 'live'));
