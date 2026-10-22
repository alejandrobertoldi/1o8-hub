-- drizzle/migrations/0063_attributes_master_junctions.sql
-- Wire attributes_master as canonical registry for /admin/attributes.
-- Adds:
--   1. Case-insensitive unique partial index on attributes_master("Attributes_HubLabel")
--      for upload-time dedupe matching.
--   2. attribute_category_index — drives the category-first UI list.
--   3. attribute_client_provenance — tracks per-client usage and per-field divergences.
--
-- See docs/superpowers/specs/2026-05-26-attributes-category-first-design.md.
-- Idempotent: each statement uses IF NOT EXISTS where possible.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_am_hub_label_ci
  ON attributes_master (LOWER("Attributes_HubLabel"))
  WHERE "Attributes_HubLabel" IS NOT NULL;

CREATE TABLE IF NOT EXISTS attribute_category_index (
  product_type              text NOT NULL,
  marketplace_id            text NOT NULL,
  attribute_uuid            uuid NOT NULL REFERENCES attributes_master("UUID") ON DELETE CASCADE,
  first_seen_at             timestamptz NOT NULL DEFAULT now(),
  first_seen_client_id_code text NOT NULL,
  PRIMARY KEY (product_type, marketplace_id, attribute_uuid)
);

CREATE INDEX IF NOT EXISTS idx_aci_attr
  ON attribute_category_index (attribute_uuid);
CREATE INDEX IF NOT EXISTS idx_aci_category
  ON attribute_category_index (product_type, marketplace_id);

CREATE TABLE IF NOT EXISTS attribute_client_provenance (
  attribute_uuid     uuid    NOT NULL REFERENCES attributes_master("UUID") ON DELETE CASCADE,
  client_id_code     text    NOT NULL,
  product_type       text    NOT NULL,
  marketplace_id     text    NOT NULL,
  source_upload_id   integer NOT NULL REFERENCES category_definitions(id) ON DELETE CASCADE,
  first_uploaded_at  timestamptz NOT NULL DEFAULT now(),
  last_uploaded_at   timestamptz NOT NULL DEFAULT now(),
  client_requirement  text  NULL,
  client_valid_values jsonb NULL,
  client_description  text  NULL,
  PRIMARY KEY (attribute_uuid, client_id_code, product_type, marketplace_id)
);

CREATE INDEX IF NOT EXISTS idx_acp_client
  ON attribute_client_provenance (client_id_code);
CREATE INDEX IF NOT EXISTS idx_acp_category
  ON attribute_client_provenance (product_type, marketplace_id);
CREATE INDEX IF NOT EXISTS idx_acp_diverged
  ON attribute_client_provenance (attribute_uuid)
  WHERE client_requirement IS NOT NULL
     OR client_valid_values IS NOT NULL
     OR client_description IS NOT NULL;

COMMIT;
