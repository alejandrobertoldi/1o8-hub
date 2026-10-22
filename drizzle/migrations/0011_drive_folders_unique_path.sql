-- Apply via Supabase SQL editor (NOT drizzle-kit push — hangs on connection pooler port 6543)
-- Prevents concurrent duplicate ASIN subfolder creation (race condition guard)

CREATE UNIQUE INDEX IF NOT EXISTS "idx_drive_folders_unique_path"
  ON "drive_folders" ("client_id_code", "path");
