-- A+ Content: Enums, Tables, and Indexes
-- Apply via Supabase SQL editor (NOT drizzle-kit push — hangs on connection pooler port 6543)

-- 1. Enum: aplus_module_type (18 Amazon A+ module types)
CREATE TYPE "public"."aplus_module_type" AS ENUM(
  'standard_image_text',
  'standard_image_text_overlay',
  'standard_header_image_text',
  'standard_four_image_text',
  'standard_text',
  'standard_single_side_image',
  'standard_image_sidebar',
  'standard_three_image_text',
  'standard_comparison_table',
  'standard_tech_specs',
  'standard_multiple_image_text',
  'standard_product_description',
  'standard_single_image_highlights',
  'standard_single_image_specs_detail',
  'standard_image_text_quad',
  'standard_company_logo',
  'standard_header_text_list_block',
  'standard_full_image'
);
--> statement-breakpoint

-- 2. Enum: aplus_module_status (design/review workflow)
CREATE TYPE "public"."aplus_module_status" AS ENUM(
  'draft',
  'in_review',
  'approved',
  'uploaded'
);
--> statement-breakpoint

-- 3. Table: aplus_modules
-- One row per A+ module. module_number is 1-based (1-7).
-- 7-module limit enforced in app logic. DB enforces uniqueness per position.
CREATE TABLE IF NOT EXISTS "aplus_modules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "module_number" INT NOT NULL CHECK ("module_number" BETWEEN 1 AND 7),
  "module_type" "aplus_module_type" NOT NULL,
  -- Shared nullable text columns across all module types
  "headline_text" TEXT,
  "subheadline_text" TEXT,
  "body_text" TEXT,
  "alt_text" TEXT,
  "overlay_text" TEXT,
  "image_description" TEXT,
  "ai_image_prompt" TEXT,
  "cosmo_relation_type" VARCHAR(100),
  -- Design tracking
  "figma_url" TEXT,
  "markup_url" TEXT,
  "status" "aplus_module_status" NOT NULL DEFAULT 'draft',
  "imported_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "uq_aplus_module_position" UNIQUE ("product_id", "module_number")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_modules_product" ON "aplus_modules"("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_modules_status" ON "aplus_modules"("status");
--> statement-breakpoint

-- 4. Table: aplus_module_images
-- One row per image slot within a module. image_slot is 1-based.
-- client_id_code + asin + sku + custom_label form the structured UUID identifier.
CREATE TABLE IF NOT EXISTS "aplus_module_images" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "module_id" UUID NOT NULL REFERENCES "aplus_modules"("id") ON DELETE CASCADE,
  "image_slot" INT NOT NULL,
  "alt_text" VARCHAR(100),
  "image_description" TEXT,
  "ai_image_prompt" TEXT,
  -- Structured UUID: 4 separate columns (hyphen-delimited composite string is unparseable)
  "client_id_code" VARCHAR(100),
  "asin" VARCHAR(20),
  "sku" VARCHAR(100),
  "custom_label" VARCHAR(100),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "uq_aplus_image_slot" UNIQUE ("module_id", "image_slot")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_aplus_module_images_module" ON "aplus_module_images"("module_id");
--> statement-breakpoint

-- 5. Table: brand_story
-- Stub schema — full typed columns deferred until Brand Story specs arrive.
-- data JSONB is the extensible blob. Unique product_id enforces one row per product.
CREATE TABLE IF NOT EXISTS "brand_story" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL UNIQUE REFERENCES "products"("id") ON DELETE CASCADE,
  "data" JSONB DEFAULT '{}'::jsonb,
  "imported_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brand_story_product" ON "brand_story"("product_id");
