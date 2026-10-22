-- Amazon Sync: Snapshots
CREATE TABLE IF NOT EXISTS "amazon_sync_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" VARCHAR(100) NOT NULL,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "asin" TEXT NOT NULL,
  "amazon_domain" TEXT NOT NULL DEFAULT 'amazon.com',
  "snapshot_data" JSONB NOT NULL,
  "credits_used" INT DEFAULT 1,
  "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_snapshots_client" ON "amazon_sync_snapshots"("client_id_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_snapshots_product" ON "amazon_sync_snapshots"("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_snapshots_asin" ON "amazon_sync_snapshots"("asin");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_snapshots_fetched" ON "amazon_sync_snapshots"("fetched_at" DESC);
--> statement-breakpoint

-- Amazon Sync: Runs
CREATE TABLE IF NOT EXISTS "amazon_sync_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" VARCHAR(100),
  "run_type" TEXT NOT NULL CHECK ("run_type" IN ('manual', 'scheduled')),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'running', 'completed', 'failed')),
  "total_products" INT DEFAULT 0,
  "completed_products" INT DEFAULT 0,
  "failed_products" INT DEFAULT 0,
  "credits_used" INT DEFAULT 0,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- Amazon Sync: Discrepancies
CREATE TABLE IF NOT EXISTS "amazon_sync_discrepancies" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" UUID NOT NULL REFERENCES "amazon_sync_snapshots"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "client_id_code" VARCHAR(100) NOT NULL,
  "asin" TEXT NOT NULL,
  "field_name" TEXT NOT NULL,
  "field_group" TEXT NOT NULL,
  "catalog_value" TEXT,
  "amazon_value" TEXT,
  "status" TEXT NOT NULL CHECK ("status" IN ('match', 'mismatch', 'missing_in_catalog', 'missing_in_amazon')),
  "resolved" BOOLEAN DEFAULT FALSE,
  "resolved_at" TIMESTAMPTZ,
  "resolved_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_disc_product" ON "amazon_sync_discrepancies"("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_disc_client" ON "amazon_sync_discrepancies"("client_id_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_disc_status" ON "amazon_sync_discrepancies"("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_disc_resolved" ON "amazon_sync_discrepancies"("resolved");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_disc_snapshot" ON "amazon_sync_discrepancies"("snapshot_id");
