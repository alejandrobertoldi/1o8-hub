-- Apply via Supabase SQL editor (NOT drizzle-kit push — hangs on connection pooler port 6543)

-- Drive Folders: registry of Google Drive folders per client
CREATE TABLE IF NOT EXISTS "drive_folders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" VARCHAR(100) NOT NULL,
  "drive_folder_id" TEXT NOT NULL,
  "folder_type" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "parent_folder_id" UUID,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- Self-referencing FK: parent_folder_id -> drive_folders(id), ON DELETE SET NULL
ALTER TABLE "drive_folders"
  ADD CONSTRAINT "fk_drive_folders_parent"
  FOREIGN KEY ("parent_folder_id")
  REFERENCES "drive_folders"("id")
  ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_drive_folders_client" ON "drive_folders"("client_id_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_folders_type" ON "drive_folders"("folder_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_folders_client_type" ON "drive_folders"("client_id_code", "folder_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_folders_parent" ON "drive_folders"("parent_folder_id");
--> statement-breakpoint

-- Drive Files: tracks all files uploaded to Drive, with optional entity linkage
CREATE TABLE IF NOT EXISTS "drive_files" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "drive_file_id" TEXT NOT NULL,
  "folder_id" UUID NOT NULL REFERENCES "drive_folders"("id") ON DELETE CASCADE,
  "original_name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INT,
  "entity_type" TEXT,
  "entity_id" UUID,
  "uploaded_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_files_folder" ON "drive_files"("folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_files_entity" ON "drive_files"("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drive_files_drive_id" ON "drive_files"("drive_file_id");
