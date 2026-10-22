ALTER TABLE master
  ADD COLUMN IF NOT EXISTS content_guidelines jsonb;
