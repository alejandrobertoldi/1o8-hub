-- 0047_attributes_unification.sql
-- Rename column_attributes → attributes; add label-variant columns; add
-- category_meta JSONB; add clr_unmatched_fields audit table; add IsVP flag
-- column. Idempotent (IF EXISTS / IF NOT EXISTS guards).

BEGIN;

-- 1) Rename table.
ALTER TABLE IF EXISTS column_attributes RENAME TO attributes;

-- 2) Rename existing columns (idempotent: skip if already renamed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attributes' AND column_name = 'specific_label'
  ) THEN
    ALTER TABLE attributes RENAME COLUMN specific_label TO sc_label;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attributes' AND column_name = 'bigquery_label'
  ) THEN
    ALTER TABLE attributes RENAME COLUMN bigquery_label TO bq_label;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attributes' AND column_name = 'label_details'
  ) THEN
    ALTER TABLE attributes RENAME COLUMN label_details TO description;
  END IF;
END$$;

-- 3) Add new columns.
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS sc_label_multi varchar(20);
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS vc_label       text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS sb_label       text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS alr_label      text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS clr_label      text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS is_vp_flag     boolean NOT NULL DEFAULT false;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS category_meta  jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- 4) Indexes.
-- Drop old-named indexes carried over from the pre-rename table name to avoid
-- duplicate index pairs on the same columns (idempotent: IF EXISTS).
DROP INDEX IF EXISTS idx_col_attr_general_label;
DROP INDEX IF EXISTS idx_col_attr_reference_group;
DROP INDEX IF EXISTS idx_col_attr_subgroup;
DROP INDEX IF EXISTS idx_col_attr_essential;

CREATE INDEX IF NOT EXISTS idx_attributes_general_label   ON attributes (general_label);
CREATE INDEX IF NOT EXISTS idx_attributes_reference_group ON attributes (reference_group);
CREATE INDEX IF NOT EXISTS idx_attributes_subgroup        ON attributes (subgroup);
CREATE INDEX IF NOT EXISTS idx_attributes_essential       ON attributes (is_essential);
CREATE INDEX IF NOT EXISTS idx_attributes_alr_label       ON attributes (alr_label);
CREATE INDEX IF NOT EXISTS idx_attributes_category_meta   ON attributes USING GIN (category_meta);

-- 5) New audit table for CLR fields that didn't match any attribute.
CREATE TABLE IF NOT EXISTS clr_unmatched_fields (
  id          serial PRIMARY KEY,
  upload_id   integer NOT NULL REFERENCES category_definitions(id) ON DELETE CASCADE,
  field_name  text    NOT NULL,
  logged_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clr_unmatched_upload ON clr_unmatched_fields (upload_id);

-- 6) New boolean column on master for VP detection (replaces string match).
ALTER TABLE master ADD COLUMN IF NOT EXISTS is_vp boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_master_is_vp ON master (is_vp);

COMMIT;

-- Note: DROP TABLE category_attributes runs in a SEPARATE migration (0048)
-- after backfill verification. Do not drop here.
