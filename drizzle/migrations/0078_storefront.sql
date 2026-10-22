CREATE TYPE "storefront_module_type" AS ENUM ('header','video','cover_image','image');
CREATE TABLE "storefront_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_homepage" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "storefront_pages_client_slug_uq" UNIQUE ("client_id_code","slug")
);
CREATE TABLE "storefront_modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "storefront_pages"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "module_type" "storefront_module_type" NOT NULL,
  "title" text, "link_url" text, "link_label" text,
  "drive_file_id" text, "asset_mime_type" text, "asset_filename" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "storefront_modules_page_pos_uq" UNIQUE ("page_id","position")
);
