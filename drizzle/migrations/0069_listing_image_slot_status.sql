SET statement_timeout = 0;
SET lock_timeout = '30s';

-- Per-slot design status for listing image cells.
-- product_id references master(id) — no FK to avoid lock contention.
CREATE TABLE IF NOT EXISTS listing_image_slot_status (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code TEXT     NOT NULL,
  product_id  TEXT        NOT NULL,
  slot        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'not_started',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT,
  CONSTRAINT listing_image_slot_status_product_slot_unique UNIQUE (product_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_liss_client ON listing_image_slot_status (client_id_code);
CREATE INDEX IF NOT EXISTS idx_liss_product ON listing_image_slot_status (product_id);
