-- Supabase pooler sets a short statement_timeout; FK creation against the
-- aac table can exceed it under load. Override per-session.
SET statement_timeout = 0;
SET lock_timeout = '30s';

-- Brand Story per-version editor: 5 new tables.
--
-- Hybrid normalisation: shared text fields live as typed columns on
-- brand_story_modules; repeated children (ASINs, Q&A items) get their own
-- child tables; image slot bindings reference drive_files.
--
-- Char limits are enforced at the API layer (Zod) because the same column
-- (body) has different limits per module type.

-- ─── Versions ────────────────────────────────────────────────────────
CREATE TABLE brand_story_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No FK to aac(client_id_code) — matches existing pattern (driveFolders,
  -- inventoryRecSettings). Cascade cleanup on client delete handled by app
  -- code or a future trigger; aac DDL locks block FK creation here.
  client_id_code  varchar(100) NOT NULL,
  version_number  int          NOT NULL,
  drive_folder_id uuid REFERENCES drive_folders(id) ON DELETE SET NULL,
  status          text         NOT NULL DEFAULT 'draft',
  desktop_bg_alt  text         NOT NULL DEFAULT '',
  mobile_bg_alt   text         NOT NULL DEFAULT '',
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (client_id_code, version_number),
  CHECK (status IN ('draft', 'active', 'archived'))
);
CREATE INDEX idx_brand_story_versions_client ON brand_story_versions(client_id_code);

-- ─── Modules (1..19 per version, position-ordered) ───────────────────
CREATE TABLE brand_story_modules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES brand_story_versions(id) ON DELETE CASCADE,
  position        int  NOT NULL,
  type            text NOT NULL,
  -- Shared text columns (NULL where the type doesn't use them):
  headline        text,
  body            text,
  image_alt       text,
  brand_store_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, position),
  CHECK (type IN ('asin-showcase', 'focus-image', 'logo-description', 'qa')),
  CHECK (position BETWEEN 1 AND 19)
);
CREATE INDEX idx_brand_story_modules_version ON brand_story_modules(version_id);

-- ─── ASIN items (4 rows pre-seeded per asin-showcase module) ─────────
CREATE TABLE brand_story_asin_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid NOT NULL REFERENCES brand_story_modules(id) ON DELETE CASCADE,
  position    int  NOT NULL,
  asin        text NOT NULL DEFAULT '',
  image_alt   text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, position),
  CHECK (position BETWEEN 1 AND 4)
);

-- ─── Q&A items (3 rows pre-seeded per qa module) ─────────────────────
CREATE TABLE brand_story_qa_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid NOT NULL REFERENCES brand_story_modules(id) ON DELETE CASCADE,
  position    int  NOT NULL,
  question    text NOT NULL DEFAULT '',
  answer      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, position),
  CHECK (position BETWEEN 1 AND 3)
);

-- ─── Assets (image slot bindings to drive_files) ─────────────────────
CREATE TABLE brand_story_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id    uuid NOT NULL REFERENCES brand_story_versions(id) ON DELETE CASCADE,
  module_id     uuid REFERENCES brand_story_modules(id) ON DELETE CASCADE,
  asin_item_id  uuid REFERENCES brand_story_asin_items(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  drive_file_id uuid NOT NULL REFERENCES drive_files(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('screenview', 'bg_desktop', 'bg_mobile', 'focus', 'logo', 'asin'))
);
CREATE INDEX idx_brand_story_assets_version ON brand_story_assets(version_id);
CREATE INDEX idx_brand_story_assets_module  ON brand_story_assets(module_id);
CREATE INDEX idx_brand_story_assets_asin    ON brand_story_assets(asin_item_id);

-- One screenview / bg_desktop / bg_mobile per version
CREATE UNIQUE INDEX uq_brand_story_assets_version_kind
  ON brand_story_assets(version_id, kind)
  WHERE kind IN ('screenview', 'bg_desktop', 'bg_mobile');

-- One focus / logo per module
CREATE UNIQUE INDEX uq_brand_story_assets_module_kind
  ON brand_story_assets(module_id, kind)
  WHERE module_id IS NOT NULL AND kind IN ('focus', 'logo');

-- One asset per ASIN item slot
CREATE UNIQUE INDEX uq_brand_story_assets_asin_item
  ON brand_story_assets(asin_item_id)
  WHERE asin_item_id IS NOT NULL;
