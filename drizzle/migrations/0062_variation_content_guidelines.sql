-- drizzle/migrations/0062_variation_content_guidelines.sql
-- Adds content_guidelines JSONB to variations (variation-level defaults)
-- and variation_groups (per-group overrides).
-- Cascade: group guidelines > variation defaults > brand guidelines voice.

BEGIN;

ALTER TABLE variations
  ADD COLUMN IF NOT EXISTS content_guidelines jsonb;

ALTER TABLE variation_groups
  ADD COLUMN IF NOT EXISTS content_guidelines jsonb;

COMMIT;
