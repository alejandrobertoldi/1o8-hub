CREATE TYPE "public"."impact_snapshot_status" AS ENUM('pending_before', 'pending_after', 'complete');--> statement-breakpoint
CREATE TABLE "content_impact_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id_code" varchar(100) NOT NULL,
	"product_id" uuid,
	"asin" varchar(20),
	"change_type" varchar(30) NOT NULL,
	"change_summary" text NOT NULL,
	"change_count" integer DEFAULT 1 NOT NULL,
	"changed_by" varchar(255) NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before_metrics" jsonb,
	"after_metrics" jsonb,
	"before_snapshot_at" timestamp with time zone,
	"after_snapshot_at" timestamp with time zone,
	"impact_window_days" integer DEFAULT 14 NOT NULL,
	"status" "impact_snapshot_status" DEFAULT 'pending_before' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_impact_snapshots" ADD CONSTRAINT "content_impact_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_impact_snapshots_client" ON "content_impact_snapshots" USING btree ("client_id_code");--> statement-breakpoint
CREATE INDEX "idx_impact_snapshots_product" ON "content_impact_snapshots" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_impact_snapshots_status" ON "content_impact_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_impact_snapshots_changed_at" ON "content_impact_snapshots" USING btree ("changed_at");