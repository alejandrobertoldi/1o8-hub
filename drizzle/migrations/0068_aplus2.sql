-- Supabase pooler sets a short statement_timeout; CREATE TABLE under load can
-- exceed it. Override per-session. No FK references to aac (lock contention,
-- matches brand_story / drive_folders precedent).
SET statement_timeout = 0;
SET lock_timeout = '30s';

-- ─── aplus2_sets ─────────────────────────────────────────────────────
-- One set per (client_id_code, marketplace, scope_identifier).
-- scope_identifier is the raw ASIN string for ASIN scope, or the parent ASIN
-- for PARENT scope.
CREATE TABLE aplus2_sets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code     varchar(100) NOT NULL,
  product_id         uuid         NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  scope_type         varchar(8)   NOT NULL,
  scope_identifier   varchar(20)  NOT NULL,
  marketplace        varchar(5)   NOT NULL,
  parent_asin        varchar(20),
  covered_asins      jsonb,
  platform           varchar(2)   NOT NULL DEFAULT 'SC',
  content_type       varchar(3)   NOT NULL DEFAULT 'PA+',
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  CHECK (scope_type IN ('ASIN', 'PARENT')),
  CHECK (platform = 'SC'),
  CHECK (content_type = 'PA+'),
  UNIQUE (client_id_code, marketplace, scope_identifier)
);
CREATE INDEX idx_aplus2_sets_client   ON aplus2_sets(client_id_code);
CREATE INDEX idx_aplus2_sets_product  ON aplus2_sets(product_id);

-- ─── aplus2_versions ─────────────────────────────────────────────────
CREATE TABLE aplus2_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id          uuid        NOT NULL REFERENCES aplus2_sets(id) ON DELETE CASCADE,
  version_number  int         NOT NULL,
  status          text        NOT NULL DEFAULT 'not_started',
  drive_folder_id uuid REFERENCES drive_folders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('not_started','in_progress','in_review','approved','live')),
  UNIQUE (set_id, version_number)
);
CREATE INDEX idx_aplus2_versions_set ON aplus2_versions(set_id);

-- ─── aplus2_modules ──────────────────────────────────────────────────
-- module_type is free text (validated by Zod against module-specs.ts at the
-- API boundary). Char limits per text column live in Zod, not DB CHECKs.
CREATE TABLE aplus2_modules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id           uuid        NOT NULL REFERENCES aplus2_versions(id) ON DELETE CASCADE,
  position             int         NOT NULL,
  module_type          text        NOT NULL,
  status               text        NOT NULL DEFAULT 'draft',
  headline_text        text,
  subheadline_text     text,
  body_text            text,
  overlay_text         text,
  alt_text             text,
  image_description    text,
  ai_image_prompt      text,
  cosmo_relation_type  varchar(100),
  video_drive_file_id  text,
  video_title          text,
  video_description    text,
  text_position        varchar(10),
  font_color           varchar(10),
  figma_url            text,
  markup_url           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft','in_review','approved','uploaded','live')),
  CHECK (position BETWEEN 1 AND 7),
  UNIQUE (version_id, position)
);
CREATE INDEX idx_aplus2_modules_version ON aplus2_modules(version_id);
CREATE INDEX idx_aplus2_modules_status  ON aplus2_modules(status);

-- ─── aplus2_module_items ─────────────────────────────────────────────
-- Generic repeatable child. data JSONB stores a TS-discriminated-union shape
-- keyed by the parent module's type. Zod validates the shape at the API
-- boundary — there is no DB CHECK because the schema varies per module.
CREATE TABLE aplus2_module_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid        NOT NULL REFERENCES aplus2_modules(id) ON DELETE CASCADE,
  position    int         NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, position)
);
CREATE INDEX idx_aplus2_module_items_module ON aplus2_module_items(module_id);

-- ─── aplus2_assets ───────────────────────────────────────────────────
-- One row per filled image/video slot per variant (desktop|mobile).
-- Video slots only use the desktop variant.
CREATE TABLE aplus2_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid        NOT NULL REFERENCES aplus2_versions(id) ON DELETE CASCADE,
  module_id       uuid REFERENCES aplus2_modules(id) ON DELETE CASCADE,
  module_item_id  uuid REFERENCES aplus2_module_items(id) ON DELETE CASCADE,
  kind            text        NOT NULL,
  slot_key        text        NOT NULL,
  variant         text        NOT NULL DEFAULT 'desktop',
  drive_file_id   uuid        NOT NULL REFERENCES drive_files(id) ON DELETE CASCADE,
  filename        text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('image','video')),
  CHECK (variant IN ('desktop','mobile'))
);
CREATE INDEX idx_aplus2_assets_version       ON aplus2_assets(version_id);
CREATE INDEX idx_aplus2_assets_module        ON aplus2_assets(module_id);
CREATE INDEX idx_aplus2_assets_module_item   ON aplus2_assets(module_item_id);

-- Partial unique: one asset per (module slot key + variant) when not inside
-- a repeatable item.
CREATE UNIQUE INDEX uq_aplus2_assets_module_slot_variant
  ON aplus2_assets(module_id, slot_key, variant)
  WHERE module_item_id IS NULL AND module_id IS NOT NULL;

-- Partial unique: one asset per (module_item slot key + variant) when inside
-- a repeatable item.
CREATE UNIQUE INDEX uq_aplus2_assets_item_slot_variant
  ON aplus2_assets(module_item_id, slot_key, variant)
  WHERE module_item_id IS NOT NULL;
