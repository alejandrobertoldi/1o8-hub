-- Add the self-referencing FK on drive_folders that the schema comment always
-- claimed existed but never did. ON DELETE CASCADE: deleting a folder row
-- removes its descendant folder rows, preventing orphaned children that later
-- collide on the unique (client_id_code, path) index and permanently block
-- re-creation (root cause of the brand-story "Failed to create version" bug).
--
-- Pre-flight verified 0 dangling parent_folder_id rows before applying, so the
-- constraint validates cleanly. idx_drive_folders_parent already indexes the
-- referencing column for the cascade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'drive_folders'::regclass
      AND conname = 'drive_folders_parent_fk'
  ) THEN
    ALTER TABLE drive_folders
      ADD CONSTRAINT drive_folders_parent_fk
      FOREIGN KEY (parent_folder_id) REFERENCES drive_folders(id) ON DELETE CASCADE;
  END IF;
END $$;
