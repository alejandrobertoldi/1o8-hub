-- Add 4 tables for the Forecast Tool feature
-- forecast_tool_versions: named snapshots per client
-- forecast_tool_cells: aggregate monthly metrics per version
-- forecast_tool_asins: ASIN-level rows per version
-- forecast_tool_asin_cells: monthly metrics per ASIN row

CREATE TABLE "forecast_tool_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id_code" varchar(100) NOT NULL,
  "name" varchar(200) NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "is_current" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX "idx_ftv_client" ON "forecast_tool_versions" ("client_id_code");
--> statement-breakpoint

CREATE TABLE "forecast_tool_cells" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL REFERENCES "forecast_tool_versions"("id") ON DELETE CASCADE,
  "month" varchar(7) NOT NULL,
  "metric" varchar(50) NOT NULL,
  "value" numeric(14, 2)
);
--> statement-breakpoint
CREATE INDEX "idx_ftc_version" ON "forecast_tool_cells" ("version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ftc_version_month_metric" ON "forecast_tool_cells" ("version_id", "month", "metric");
--> statement-breakpoint

CREATE TABLE "forecast_tool_asins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL REFERENCES "forecast_tool_versions"("id") ON DELETE CASCADE,
  "asin" varchar(20),
  "product_name" varchar(300) NOT NULL,
  "product_price" numeric(10, 2) NOT NULL,
  "share_pct" numeric(5, 2) NOT NULL,
  "is_new" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX "idx_fta_version" ON "forecast_tool_asins" ("version_id");
--> statement-breakpoint

CREATE TABLE "forecast_tool_asin_cells" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asin_id" uuid NOT NULL REFERENCES "forecast_tool_asins"("id") ON DELETE CASCADE,
  "month" varchar(7) NOT NULL,
  "metric" varchar(30) NOT NULL,
  "value" numeric(14, 2)
);
--> statement-breakpoint
CREATE INDEX "idx_ftac_asin" ON "forecast_tool_asin_cells" ("asin_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ftac_asin_month_metric" ON "forecast_tool_asin_cells" ("asin_id", "month", "metric");
