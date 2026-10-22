-- Client conversation tracker for Q4 holiday deals:
-- talked with the client, when, and whether they agreed.
ALTER TABLE holiday_deal_plans
  ADD COLUMN IF NOT EXISTS client_talked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_talked_at date,
  ADD COLUMN IF NOT EXISTS client_agreement varchar(32) NOT NULL DEFAULT 'unset';
