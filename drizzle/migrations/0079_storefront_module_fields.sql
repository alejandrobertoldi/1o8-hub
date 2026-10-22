ALTER TABLE "storefront_modules"
  ADD COLUMN "contains_ai_people" boolean NOT NULL DEFAULT false,
  ADD COLUMN "section_layout" text,
  ADD COLUMN "poster_drive_file_id" text,
  ADD COLUMN "poster_mime_type" text,
  ADD COLUMN "poster_filename" text;
