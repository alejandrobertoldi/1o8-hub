-- 0130: store AWD stock on each sent recommendation row, so the portal's sent
-- view can show the same AWD / FBA lines as the hub. Additive: existing rows
-- read as 0 (no AWD stored).
ALTER TABLE "inventory_rec_snapshot_rows"
  ADD COLUMN IF NOT EXISTS "awd_available" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "awd_inbound" integer NOT NULL DEFAULT 0;
