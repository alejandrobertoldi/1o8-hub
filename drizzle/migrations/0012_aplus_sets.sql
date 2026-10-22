-- A+ Content: Sets table
-- Tracks scope, platform, version per product A+ set.
-- One row per product. Auto-created with defaults on first access.
-- Apply via Supabase SQL editor (NOT drizzle-kit push)

CREATE TABLE IF NOT EXISTS "aplus_sets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL UNIQUE REFERENCES "products"("id") ON DELETE CASCADE,
  "scope_type" VARCHAR(4) NOT NULL DEFAULT 'ASIN',
  "scope_identifier" VARCHAR(100) NOT NULL,
  "platform" VARCHAR(2) NOT NULL DEFAULT 'SC',
  "content_type" VARCHAR(3) NOT NULL DEFAULT 'PA+',
  "version" INT NOT NULL DEFAULT 1,
  "grp_name" VARCHAR(100),
  "grp_asin_count" INT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_sets_product" ON "aplus_sets"("product_id");
