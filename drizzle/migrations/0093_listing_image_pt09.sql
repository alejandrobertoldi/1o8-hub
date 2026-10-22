-- 0093_listing_image_pt09.sql
--
-- Allow PT09 as a 10th listing-image slot (MAIN + PT01–PT09).
-- listing_image_slot_versions.slot and listing_image_slot_status.slot were
-- unconstrained text; pin them to the same set. seo_images CHECKs previously
-- stopped at PT08 / image_number 9.

ALTER TABLE "listing_image_slot_versions"
  DROP CONSTRAINT IF EXISTS "listing_image_slot_versions_slot_check";
ALTER TABLE "listing_image_slot_versions"
  ADD CONSTRAINT "listing_image_slot_versions_slot_check"
  CHECK ("slot" IN ('MAIN','PT01','PT02','PT03','PT04','PT05','PT06','PT07','PT08','PT09'));

ALTER TABLE "listing_image_slot_status"
  DROP CONSTRAINT IF EXISTS "listing_image_slot_status_slot_check";
ALTER TABLE "listing_image_slot_status"
  ADD CONSTRAINT "listing_image_slot_status_slot_check"
  CHECK ("slot" IN ('MAIN','PT01','PT02','PT03','PT04','PT05','PT06','PT07','PT08','PT09'));

ALTER TABLE "seo_images" DROP CONSTRAINT IF EXISTS "seo_images_technical_name_check";
ALTER TABLE "seo_images"
  ADD CONSTRAINT "seo_images_technical_name_check"
  CHECK ("technical_name" IN ('MAIN','PT01','PT02','PT03','PT04','PT05','PT06','PT07','PT08','PT09'));

ALTER TABLE "seo_images" DROP CONSTRAINT IF EXISTS "seo_images_image_number_check";
ALTER TABLE "seo_images"
  ADD CONSTRAINT "seo_images_image_number_check"
  CHECK ("image_number" BETWEEN 1 AND 10);
