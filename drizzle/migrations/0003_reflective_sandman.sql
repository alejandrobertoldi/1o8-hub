CREATE TYPE "public"."impact_snapshot_type" AS ENUM('before', 'after');--> statement-breakpoint
ALTER TYPE "public"."aplus_module_status" ADD VALUE 'live';--> statement-breakpoint
CREATE TABLE "content_impact_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"asin" varchar(20) NOT NULL,
	"client_id_code" varchar(100),
	"snapshot_type" "impact_snapshot_type" NOT NULL,
	"avg_daily_units" integer,
	"avg_daily_revenue" integer,
	"avg_daily_sessions" integer,
	"live_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_impact_snapshots" ADD CONSTRAINT "content_impact_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_impact_product" ON "content_impact_snapshots" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_impact_type" ON "content_impact_snapshots" USING btree ("snapshot_type");--> statement-breakpoint
CREATE INDEX "idx_impact_captured" ON "content_impact_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "idx_impact_client" ON "content_impact_snapshots" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_impact_live_at" ON "content_impact_snapshots" USING btree ("live_at");