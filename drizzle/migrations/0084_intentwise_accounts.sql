-- Intentwise account registry.
-- Today the Intentwise account IDs live only in a hardcoded array in
-- src/lib/report-clients.ts, keyed by display name and wrong for 8 of 23
-- accounts. This makes them real, queryable data.
--
-- client_id_code is NULLABLE on purpose: seeding discovers account IDs from
-- Redshift, and an account whose owner we cannot yet attribute must be
-- recordable and loud, not absent. No FK to aac(client_id_code) — matches
-- the existing drive_folders pattern.
--
-- is_active is the CAPTURE GATE, not a display flag (see "Lifecycle-gated
-- archival" in the plan). stopped_at records when capture stopped and is the
-- audit trail for it. "Stopped" means stopped CAPTURING — the BigQuery
-- archive is never deleted.
CREATE TABLE IF NOT EXISTS "intentwise_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" varchar(100),
  "account_id" varchar(50) NOT NULL,
  "label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "stopped_at" timestamptz,
  "added_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  -- "Active but stopped" is incoherent and would silently skip a live client.
  -- Re-onboarding a returning client therefore clears stopped_at in the same
  -- statement that sets is_active = true.
  CONSTRAINT "intentwise_accounts_stopped_check"
    CHECK ("stopped_at" IS NULL OR "is_active" = false)
);

-- An Intentwise account belongs to exactly one client, so account_id alone is
-- unique. One client may hold several accounts (Cloud23 holds 2348430 and
-- 2557190), which is why this is a table and not a column on aac.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_intentwise_accounts_account_id"
  ON "intentwise_accounts" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_intentwise_accounts_client"
  ON "intentwise_accounts" ("client_id_code");
CREATE INDEX IF NOT EXISTS "idx_intentwise_accounts_active"
  ON "intentwise_accounts" ("is_active");
