-- 0129: per-product safety buffer for the inventory recommendation.
-- One row per client + SKU; no row => the app default (10%). Additive only.
CREATE TABLE IF NOT EXISTS "inventory_rec_buffers" (
  "client_id_code" varchar(50) NOT NULL,
  "sku" text NOT NULL,
  "buffer_pct" integer NOT NULL,
  "set_by" varchar(255) NOT NULL,
  "set_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_rec_buffers_pk" PRIMARY KEY ("client_id_code", "sku"),
  CONSTRAINT "inventory_rec_buffers_pct_chk" CHECK ("buffer_pct" BETWEEN 0 AND 200)
);
