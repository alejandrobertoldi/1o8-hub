-- 0077: Amazon 2026-07-27 mandate — Item Highlight field (≤125 chars) on SEO listings + Master.
-- Title shortens to ≤75 chars (enforced in app code; itemName/seo_listings.title columns unchanged).
-- Both columns nullable, no backfill — historical rows stay null until regenerated.
ALTER TABLE seo_listings ADD COLUMN IF NOT EXISTS item_highlight varchar(130);
ALTER TABLE master ADD COLUMN IF NOT EXISTS item_highlight text;
