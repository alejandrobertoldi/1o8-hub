-- Add new scope fields to aplus_sets: groupNumber, parentAsin, coveredAsins
-- Replace old grpName + grpAsinCount with structured variation tracking

ALTER TABLE "aplus_sets" ADD COLUMN "group_number" integer;
ALTER TABLE "aplus_sets" ADD COLUMN "parent_asin" varchar(20);
ALTER TABLE "aplus_sets" ADD COLUMN "covered_asins" jsonb;

-- Drop old GRP fields (replaced by groupNumber + coveredAsins)
ALTER TABLE "aplus_sets" DROP COLUMN IF EXISTS "grp_name";
ALTER TABLE "aplus_sets" DROP COLUMN IF EXISTS "grp_asin_count";
