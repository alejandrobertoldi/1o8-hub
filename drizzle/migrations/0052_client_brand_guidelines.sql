-- 0052: Client Brand Guidelines (3 tables)
-- Per-client brand book + structured summary + dated team notes.
-- Synthetic uuid PK on client_brand_guidelines so polymorphic
-- drive_files.entityId (uuid) can reference logo uploads.
-- See src/lib/db/schema.ts for the canonical Drizzle definitions
-- (clientBrandGuidelines, clientBrandGuidelineVersions, clientBrandGuidelineNotes).
--
-- Hand-written SQL (not drizzle-kit generated): the meta/_journal.json
-- snapshot only tracks 0000-0004, so `npm run db:generate` cannot emit
-- a clean diff for late migrations. Migrations 0005-0051 follow the
-- same hand-written pattern.

-- ─── client_brand_guidelines ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_brand_guidelines (
  id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code           varchar(100) NOT NULL,
  active_version_id        uuid,

  summary_logo             jsonb        DEFAULT '{"primary_description":null,"secondary_description":null,"monochrome_description":null,"clearspace_notes":null,"misuse_notes":null,"primary_url":null,"secondary_url":null,"monochrome_url":null}'::jsonb,
  summary_colors           jsonb        DEFAULT '[]'::jsonb,
  summary_typography       jsonb        DEFAULT '{"primary":null,"secondary":null}'::jsonb,
  summary_voice            jsonb        DEFAULT '{"attributes":[],"dos":[],"donts":[],"sample_copy":null}'::jsonb,

  extraction_status        varchar(20)  NOT NULL DEFAULT 'idle', -- 'idle' | 'extracting' | 'failed'
  last_extracted_at        timestamptz,
  last_extraction_model    text,
  last_extraction_error    text,

  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT uq_cbg_client UNIQUE (client_id_code)
);

CREATE INDEX IF NOT EXISTS idx_cbg_client
  ON client_brand_guidelines (client_id_code);

-- ─── client_brand_guideline_versions ────────────────────────────────
CREATE TABLE IF NOT EXISTS client_brand_guideline_versions (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code      varchar(100) NOT NULL,
  version_number      integer      NOT NULL,
  drive_file_id       text         NOT NULL,
  original_filename   text         NOT NULL,
  byte_size           integer,
  page_count          integer,
  extracted_md        text,
  uploaded_by         text         NOT NULL,
  uploaded_at         timestamptz  NOT NULL DEFAULT now(),
  archived_at         timestamptz,

  CONSTRAINT uq_cbgv_client_version UNIQUE (client_id_code, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cbgv_client
  ON client_brand_guideline_versions (client_id_code);

CREATE INDEX IF NOT EXISTS idx_cbgv_active
  ON client_brand_guideline_versions (client_id_code, archived_at);

-- ─── client_brand_guideline_notes ───────────────────────────────────
CREATE TABLE IF NOT EXISTS client_brand_guideline_notes (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code  varchar(100) NOT NULL,
  body_md         text         NOT NULL,
  author_email    text         NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cbgn_client
  ON client_brand_guideline_notes (client_id_code);

CREATE INDEX IF NOT EXISTS idx_cbgn_created
  ON client_brand_guideline_notes (client_id_code, created_at);
