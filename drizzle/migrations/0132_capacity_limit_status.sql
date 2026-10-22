-- 0132: whether a capacity limit is Amazon's confirmed number or still an estimate.
-- Set by the team from Capacity Monitor (never derived from the date). Additive:
-- existing rows read as 'estimate'.
ALTER TABLE "inventory_capacity_limits"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'estimate';
ALTER TABLE "inventory_capacity_limits"
  ADD CONSTRAINT "inventory_capacity_limits_status_chk" CHECK ("status" IN ('confirmed', 'estimate'));
