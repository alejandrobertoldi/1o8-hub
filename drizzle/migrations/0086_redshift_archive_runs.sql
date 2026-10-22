-- Nightly/monthly/backfill/verify work queue (spec §7.1).
-- One row per (run_date, run_kind, schema, table, account_id). This table is
-- what turns "did last night fully complete?" into a query instead of a
-- guess — the Plan 2C verification gate reads it directly.
CREATE TABLE IF NOT EXISTS "redshift_archive_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_date" date NOT NULL,
  "run_kind" varchar(20) NOT NULL,
  "schema_name" varchar(128) NOT NULL,
  "table_name" varchar(128) NOT NULL,
  "account_id" varchar(50) NOT NULL,
  "window_from" date,
  "window_to" date,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "rows_read" bigint,
  "rows_written" bigint,
  "attempts" integer NOT NULL DEFAULT 0,
  "error" text,
  "claimed_at" timestamptz,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  CONSTRAINT "redshift_archive_runs_kind_check"
    CHECK ("run_kind" IN ('nightly', 'monthly', 'backfill', 'verify')),
  CONSTRAINT "redshift_archive_runs_status_check"
    CHECK ("status" IN ('pending', 'running', 'done', 'failed'))
);

-- Re-triggering the enqueuer for a date that already has rows must never
-- duplicate work units — the enqueuer upserts with onConflictDoNothing
-- against this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_redshift_archive_runs_unit"
  ON "redshift_archive_runs" ("run_date", "run_kind", "schema_name", "table_name", "account_id");
CREATE INDEX IF NOT EXISTS "idx_redshift_archive_runs_status_date"
  ON "redshift_archive_runs" ("status", "run_date");
CREATE INDEX IF NOT EXISTS "idx_redshift_archive_runs_lookup"
  ON "redshift_archive_runs" ("run_date", "schema_name", "table_name", "account_id");
