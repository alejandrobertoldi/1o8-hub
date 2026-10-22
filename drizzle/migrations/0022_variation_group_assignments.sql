-- Multi-group membership: junction table for products belonging to multiple groups
CREATE TABLE IF NOT EXISTS "variation_group_assignments" (
  "group_id" uuid NOT NULL REFERENCES "variation_groups"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "master"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "pk_variation_group_assignments" UNIQUE("group_id", "product_id")
);

CREATE INDEX IF NOT EXISTS "idx_variation_group_assignments_product" ON "variation_group_assignments" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "idx_variation_group_assignments_group" ON "variation_group_assignments" USING btree ("group_id");

-- Migrate existing group_ref data into junction table
INSERT INTO "variation_group_assignments" ("group_id", "product_id")
SELECT "group_ref", "id" FROM "master" WHERE "group_ref" IS NOT NULL
ON CONFLICT DO NOTHING;
