-- Redshift archival catalog (spec §5).
-- One row per (schema, table) discovered to carry an account_id column.
-- Doubles as the identifier allowlist for dynamic SQL (spec §10): a table
-- absent from this catalog is never queried.
CREATE TABLE IF NOT EXISTS "redshift_archive_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schema_name" varchar(128) NOT NULL,
  "table_name" varchar(128) NOT NULL,
  "table_kind" varchar(20) NOT NULL,
  "date_column" varchar(128),
  "source_refresh_window_days" integer,
  "repull_window_days" integer NOT NULL DEFAULT 14,
  "retention_days" integer,
  "enabled" boolean NOT NULL DEFAULT false,
  "est_rows" bigint,
  "est_bytes" bigint,
  "columns" jsonb,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_profiled_at" timestamptz,
  "notes" text,
  CONSTRAINT "redshift_archive_catalog_kind_check"
    CHECK ("table_kind" IN ('timeseries', 'snapshot', 'period')),
  -- A snapshot table has no date column by definition; anything else must
  -- have one, or the load strategy has nothing to partition on.
  CONSTRAINT "redshift_archive_catalog_date_column_check"
    CHECK (("table_kind" = 'snapshot' AND "date_column" IS NULL)
        OR ("table_kind" <> 'snapshot' AND "date_column" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_redshift_archive_catalog_table"
  ON "redshift_archive_catalog" ("schema_name", "table_name");
CREATE INDEX IF NOT EXISTS "idx_redshift_archive_catalog_enabled"
  ON "redshift_archive_catalog" ("enabled");

-- Per (table × account) profiling stats. Spec §5 asks the profiler to record
-- per-account_id row counts with min/max dates but gives them nowhere to
-- live. They are load-bearing for retention measurement (§5.1), backfill
-- window sizing (§7.3), and the §8.1 "catalog says rows exist but the
-- archive holds none" hard failure.
CREATE TABLE IF NOT EXISTS "redshift_archive_account_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "catalog_id" uuid NOT NULL
    REFERENCES "redshift_archive_catalog"("id") ON DELETE CASCADE,
  "account_id" varchar(50) NOT NULL,
  "row_count" bigint NOT NULL,
  "min_date" date,
  "max_date" date,
  "distinct_dates" integer,
  "profiled_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_redshift_archive_account_stats"
  ON "redshift_archive_account_stats" ("catalog_id", "account_id");
CREATE INDEX IF NOT EXISTS "idx_redshift_archive_account_stats_account"
  ON "redshift_archive_account_stats" ("account_id");
