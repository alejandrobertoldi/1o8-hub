-- Variation Builder: hierarchical product grouping system
-- Approach C: exclusive groups via FK + cross-cutting tags via junction

-- Top-level variation definition
CREATE TABLE IF NOT EXISTS "variations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" varchar(20) NOT NULL,
  "name" varchar(200) NOT NULL,
  "code" varchar(50) NOT NULL UNIQUE,
  "amazon_variation_id" varchar(100),
  "theme_attributes" jsonb DEFAULT '[]',
  "primary_dimension" varchar(50),
  "description" text,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_variations_client" ON "variations" ("client_id");

-- Exclusive groups within a variation
CREATE TABLE IF NOT EXISTS "variation_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "variation_id" uuid NOT NULL REFERENCES "variations"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "dimension" varchar(50) NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  UNIQUE("variation_id", "name")
);

CREATE INDEX IF NOT EXISTS "idx_variation_groups_variation" ON "variation_groups" ("variation_id");

-- Cross-cutting tags
CREATE TABLE IF NOT EXISTS "variation_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "variation_id" uuid NOT NULL REFERENCES "variations"("id") ON DELETE CASCADE,
  "dimension" varchar(50) NOT NULL,
  "value" varchar(200) NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  UNIQUE("variation_id", "dimension", "value")
);

CREATE INDEX IF NOT EXISTS "idx_variation_tags_variation" ON "variation_tags" ("variation_id");

-- Tag assignments junction
CREATE TABLE IF NOT EXISTS "variation_tag_assignments" (
  "tag_id" uuid NOT NULL REFERENCES "variation_tags"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "master"("id") ON DELETE CASCADE,
  PRIMARY KEY ("tag_id", "product_id")
);

CREATE INDEX IF NOT EXISTS "idx_variation_tag_assignments_product" ON "variation_tag_assignments" ("product_id");

-- Add FK columns to master (ON DELETE SET NULL)
ALTER TABLE "master" ADD COLUMN IF NOT EXISTS "variation_ref" uuid REFERENCES "variations"("id") ON DELETE SET NULL;
ALTER TABLE "master" ADD COLUMN IF NOT EXISTS "group_ref" uuid REFERENCES "variation_groups"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_master_variation_ref" ON "master" ("variation_ref");
CREATE INDEX IF NOT EXISTS "idx_master_group_ref" ON "master" ("group_ref");
