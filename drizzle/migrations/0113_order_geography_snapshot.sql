-- 0113: local snapshot of Seller Central order lines for the Order Geography report.
--
-- The source, amazon_source_data.sellercentral_ordersbydate_report, is an
-- external datashare from Intentwise's cluster (svv_external_tables reports
-- location 'local:amazonrs', and svv_table_info is permission-denied), so we
-- cannot add sort keys or partitions to it. A bare COUNT(*) filtered to one
-- account costs ~16s for 7 days and ~72s for 365, and the full report query
-- has exceeded 280s under load. Nothing about the SELECT list is the problem.
--
-- So the report stops reading Redshift interactively. A nightly job scans each
-- client once and mirrors the order lines here; the report then reads Postgres,
-- which also makes arbitrary custom date ranges fast rather than only the
-- pre-warmed presets.
--
-- Grain is one row per (order, ship-to, ASIN). order_id is kept rather than
-- pre-aggregated because distinct order counts have to stay exact at every
-- grain: one order carrying three products counts once for its state and once
-- for each product, which a summed daily rollup cannot reproduce.
--
-- Catalog fields (product title, SKU, master.id) are deliberately NOT stored.
-- They live in `master` in this same database and are resolved at read time,
-- so a catalog edit shows up immediately without re-running a snapshot.

CREATE TABLE IF NOT EXISTS "order_geography_lines" (
  "account_id"   varchar(64)  NOT NULL,
  "order_id"     varchar(64)  NOT NULL,
  "purchase_day" date         NOT NULL,
  "ship_state"   varchar(64),
  "ship_city"    varchar(128),
  "ship_country" varchar(8)   NOT NULL DEFAULT 'US',
  "asin"         varchar(32)  NOT NULL,
  "units"        integer      NOT NULL DEFAULT 0,
  "revenue"      numeric(14, 2) NOT NULL DEFAULT 0,
  "promo"        numeric(14, 2) NOT NULL DEFAULT 0
);

-- Every read is "one account, one date window".
CREATE INDEX IF NOT EXISTS "order_geography_lines_account_day_idx"
  ON "order_geography_lines" ("account_id", "purchase_day");

-- One row per account recording what its snapshot covers, so the report can
-- tell "this client has never been snapshotted" from "this window is empty",
-- and can show the user how fresh the figures are.
CREATE TABLE IF NOT EXISTS "order_geography_snapshots" (
  "account_id"    varchar(64) PRIMARY KEY,
  "covered_start" date        NOT NULL,
  "covered_end"   date        NOT NULL,
  "line_count"    integer     NOT NULL DEFAULT 0,
  "refreshed_at"  timestamptz NOT NULL DEFAULT now()
);
