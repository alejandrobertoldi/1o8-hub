-- drizzle/migrations/0126_inventory_final_rec.sql
--
-- Thread AG slice 1. Additive only.
--   1. inventory_rec_settings: per-client method / windows / uplift. pct_* left in place, unused.
--   2. inventory_rec_overrides: one sticky per-SKU override per client.
--   3. inventory_rec_snapshots + _rows: what was sent to the client, frozen.

ALTER TABLE "inventory_rec_settings"
  ADD COLUMN "method" text NOT NULL DEFAULT 'recent',
  ADD COLUMN "recent_days" integer NOT NULL DEFAULT 90,
  ADD COLUMN "seasonal_start" text,
  ADD COLUMN "seasonal_end" text,
  ADD COLUMN "uplift_pct" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "inventory_rec_settings"
  ADD CONSTRAINT "inventory_rec_settings_method_chk" CHECK ("method" IN ('recent', 'seasonal', 'average')),
  ADD CONSTRAINT "inventory_rec_settings_recent_days_chk" CHECK ("recent_days" BETWEEN 7 AND 365),
  ADD CONSTRAINT "inventory_rec_settings_uplift_chk" CHECK ("uplift_pct" BETWEEN 0 AND 200);
--> statement-breakpoint
CREATE TABLE "inventory_rec_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" varchar(50) NOT NULL,
  "asin" text NOT NULL,
  "sku" text NOT NULL,
  "qty" integer NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "set_by" varchar(255) NOT NULL,
  "set_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_rec_overrides_client_sku_uq"
  ON "inventory_rec_overrides" ("client_id_code", "sku");
--> statement-breakpoint
CREATE TABLE "inventory_rec_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" varchar(50) NOT NULL,
  "sent_by" varchar(255) NOT NULL,
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  "method" text NOT NULL,
  "recent_days" integer NOT NULL,
  "seasonal_start" text,
  "seasonal_end" text,
  "uplift_pct" integer NOT NULL,
  "sku_count" integer NOT NULL,
  "units_to_send" integer NOT NULL,
  "overstock_skus" integer NOT NULL,
  "overstock_units" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_rec_snapshots_client_sent_idx"
  ON "inventory_rec_snapshots" ("client_id_code", "sent_at");
--> statement-breakpoint
CREATE TABLE "inventory_rec_snapshot_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" uuid NOT NULL REFERENCES "inventory_rec_snapshots"("id") ON DELETE CASCADE,
  "asin" text NOT NULL,
  "sku" text NOT NULL,
  "product_name" text NOT NULL DEFAULT '',
  "main_image_url" text NOT NULL DEFAULT '',
  "available" integer NOT NULL,
  "inbound" integer NOT NULL,
  "reserved" integer NOT NULL,
  "stock_position" integer NOT NULL,
  "basis_units" integer NOT NULL,
  "live_calc" integer NOT NULL,
  "override_qty" integer,
  "note" text NOT NULL DEFAULT '',
  "final" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_rec_snapshot_rows_snapshot_idx"
  ON "inventory_rec_snapshot_rows" ("snapshot_id");
