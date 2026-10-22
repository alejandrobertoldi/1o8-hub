ALTER TABLE "listing_image_slot_versions" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'not_started';
UPDATE "listing_image_slot_versions" v
SET "status" = s."status"
FROM "listing_image_slot_status" s
WHERE v."product_id" = s."product_id"
  AND v."slot" = s."slot"
  AND v."version_number" = (
    SELECT MAX(v2."version_number")
    FROM "listing_image_slot_versions" v2
    WHERE v2."product_id" = v."product_id" AND v2."slot" = v."slot"
  )
  AND s."status" <> 'not_started';
