-- 0041: Google Sheets attribute template migration
-- Adds sheet provisioning columns, finalize audit fields, status, and seeded snapshot

ALTER TABLE attribute_template_requests
  ADD COLUMN IF NOT EXISTS google_sheet_id    text,
  ADD COLUMN IF NOT EXISTS sheet_url          text,
  ADD COLUMN IF NOT EXISTS drive_folder_id    text,
  ADD COLUMN IF NOT EXISTS archive_folder_id  text,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS seeded_snapshot    jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at       timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by       text;

-- Mark all pre-migration rows as legacy (they have no sheet_url and predate this flow)
UPDATE attribute_template_requests
  SET status = 'legacy'
  WHERE google_sheet_id IS NULL AND sheet_url IS NULL;

-- Index for admin list view (filter active requests by client + status)
CREATE INDEX IF NOT EXISTS idx_atr_client_status
  ON attribute_template_requests(client_id_code, status);
