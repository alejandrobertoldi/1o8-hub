CREATE TABLE "sales_summary_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"cache_type" varchar(20) NOT NULL,
	"cache_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_sales_cache_type_key" UNIQUE("cache_type","cache_key")
);
--> statement-breakpoint
CREATE INDEX "idx_sales_cache_updated" ON "sales_summary_cache" USING btree ("updated_at");