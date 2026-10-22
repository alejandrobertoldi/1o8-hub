CREATE TABLE IF NOT EXISTS storefront_module_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES storefront_modules(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text,
  link_url text,
  link_label text,
  drive_file_id text,
  asset_mime_type text,
  asset_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, position)
);

CREATE INDEX IF NOT EXISTS idx_storefront_module_tiles_module
  ON storefront_module_tiles (module_id);
