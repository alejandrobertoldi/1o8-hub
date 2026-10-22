-- Create listing_image_slot_versions table for per-slot version control
CREATE TABLE "listing_image_slot_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id_code" text NOT NULL,
  "product_id" text NOT NULL,
  "slot" text NOT NULL,
  "version_number" integer NOT NULL,
  "drive_file_id" uuid REFERENCES "drive_files"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  CONSTRAINT "lisv_product_slot_version_unique" UNIQUE("product_id", "slot", "version_number")
);

CREATE INDEX "idx_lisv_client" ON "listing_image_slot_versions" ("client_id_code");
CREATE INDEX "idx_lisv_product" ON "listing_image_slot_versions" ("product_id");
