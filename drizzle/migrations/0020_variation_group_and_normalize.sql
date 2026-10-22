-- Add variation_group column for user-defined sub-groups within variation families
ALTER TABLE "master" ADD COLUMN IF NOT EXISTS "variation_group" varchar(100);
ALTER TABLE "seo_asins" ADD COLUMN IF NOT EXISTS "variation_group" varchar(100);

-- Fix unique constraint: allow multiple SKUs per ASIN within a project
ALTER TABLE "seo_asins" DROP CONSTRAINT IF EXISTS "seo_asins_project_id_asin_key";
ALTER TABLE "seo_asins" ADD CONSTRAINT "seo_asins_project_id_asin_sku_key" UNIQUE ("project_id", "asin", "sku");

-- Fix double-encoded JSONB strings across ALL blob columns
-- (stored as '"{ ... }"' instead of '{ ... }' due to early import bug)
UPDATE "master" SET variations = (variations #>> '{}')::jsonb
WHERE variations IS NOT NULL AND jsonb_typeof(variations) = 'string';

UPDATE "master" SET content_seo = (content_seo #>> '{}')::jsonb
WHERE content_seo IS NOT NULL AND jsonb_typeof(content_seo) = 'string';

UPDATE "master" SET packaging = (packaging #>> '{}')::jsonb
WHERE packaging IS NOT NULL AND jsonb_typeof(packaging) = 'string';

UPDATE "master" SET target_audience = (target_audience #>> '{}')::jsonb
WHERE target_audience IS NOT NULL AND jsonb_typeof(target_audience) = 'string';

UPDATE "master" SET fulfillment = (fulfillment #>> '{}')::jsonb
WHERE fulfillment IS NOT NULL AND jsonb_typeof(fulfillment) = 'string';

UPDATE "master" SET nutrition_supplements = (nutrition_supplements #>> '{}')::jsonb
WHERE nutrition_supplements IS NOT NULL AND jsonb_typeof(nutrition_supplements) = 'string';

UPDATE "master" SET compliance_safety = (compliance_safety #>> '{}')::jsonb
WHERE compliance_safety IS NOT NULL AND jsonb_typeof(compliance_safety) = 'string';

UPDATE "master" SET images = (images #>> '{}')::jsonb
WHERE images IS NOT NULL AND jsonb_typeof(images) = 'string';

UPDATE "master" SET dimensions_weight = (dimensions_weight #>> '{}')::jsonb
WHERE dimensions_weight IS NOT NULL AND jsonb_typeof(dimensions_weight) = 'string';

UPDATE "master" SET other_attributes = (other_attributes #>> '{}')::jsonb
WHERE other_attributes IS NOT NULL AND jsonb_typeof(other_attributes) = 'string';

-- Normalize variation JSONB keys to PascalCase
-- Fixes inconsistent casing (e.g., "color" → "Color", "variationId" → "VariationID")
-- Unknown keys are preserved unchanged via ELSE clause
UPDATE "master" SET variations = (
  SELECT jsonb_object_agg(
    CASE lower(key)
      WHEN 'variationid' THEN 'VariationID'
      WHEN 'variationproduct' THEN 'VariationProduct'
      WHEN 'variationthemename' THEN 'VariationThemeName'
      WHEN 'childrelationshiptype' THEN 'ChildRelationshipType'
      WHEN 'color' THEN 'Color'
      WHEN 'size' THEN 'Size'
      WHEN 'flavor' THEN 'Flavor'
      WHEN 'style' THEN 'Style'
      ELSE key
    END,
    value
  ) FROM jsonb_each_text(variations)
)
WHERE variations IS NOT NULL AND jsonb_typeof(variations) = 'object';
