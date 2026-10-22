-- Storefront per-version content: versions table + page.version_id.

CREATE TABLE IF NOT EXISTS "storefront_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id_code" varchar(100) NOT NULL,
  "version_number" integer NOT NULL,
  "status" text DEFAULT 'not_started' NOT NULL,
  "drive_folder_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "storefront_versions_client_version_key" UNIQUE ("client_id_code", "version_number")
);

DO $$ BEGIN
  ALTER TABLE "storefront_versions"
    ADD CONSTRAINT "storefront_versions_drive_folder_id_drive_folders_id_fk"
    FOREIGN KEY ("drive_folder_id") REFERENCES "drive_folders"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "idx_storefront_versions_client" ON "storefront_versions" ("client_id_code");

-- page.version_id (nullable during backfill).
ALTER TABLE "storefront_pages" ADD COLUMN IF NOT EXISTS "version_id" uuid;

DO $$ BEGIN
  ALTER TABLE "storefront_pages"
    ADD CONSTRAINT "storefront_pages_version_id_storefront_versions_id_fk"
    FOREIGN KEY ("version_id") REFERENCES "storefront_versions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Backfill: one V01 per client that has pages; link to its existing _V01 folder if present.
INSERT INTO "storefront_versions" ("client_id_code", "version_number", "status", "drive_folder_id")
SELECT DISTINCT p."client_id_code", 1, 'not_started',
  (SELECT df."id" FROM "drive_folders" df
     WHERE df."client_id_code" = p."client_id_code"
       AND df."folder_type" = 'storefront_version'
       AND df."name" LIKE '%\_V01' ESCAPE '\'
     LIMIT 1)
FROM "storefront_pages" p
ON CONFLICT ("client_id_code", "version_number") DO NOTHING;

UPDATE "storefront_pages" p
SET "version_id" = v."id"
FROM "storefront_versions" v
WHERE v."client_id_code" = p."client_id_code"
  AND v."version_number" = 1
  AND p."version_id" IS NULL;

-- Swap uniqueness from (client_id_code, slug) to (version_id, slug).
DO $$ BEGIN
  ALTER TABLE "storefront_pages" DROP CONSTRAINT "storefront_pages_client_id_code_slug_unique";
EXCEPTION WHEN undefined_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "storefront_pages"
    ADD CONSTRAINT "storefront_pages_version_id_slug_unique" UNIQUE ("version_id", "slug");
EXCEPTION WHEN duplicate_object THEN null; END $$;
