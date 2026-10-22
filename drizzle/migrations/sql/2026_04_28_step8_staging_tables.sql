-- Step 8 CLR-first redesign: per-client transient staging tables.
-- Wiped on successful merge-to-master. PRIMARY KEY (client_id_code, sku)
-- ensures re-uploads idempotently replace prior staging rows for the client.

-- Drop redundant single-column indexes if they exist from a prior run —
-- the composite PK already covers left-prefix lookups on client_id_code.
DROP INDEX IF EXISTS idx_staged_clr_products_client;
DROP INDEX IF EXISTS idx_staged_alr_links_client;

CREATE TABLE IF NOT EXISTS staged_clr_products (
  client_id_code     VARCHAR(100) NOT NULL,
  sku                VARCHAR(100) NOT NULL,
  product_type       VARCHAR(255),
  attributes         JSONB NOT NULL,
  required_complete  BOOLEAN NOT NULL,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id_code, sku)
);

CREATE TABLE IF NOT EXISTS staged_alr_links (
  client_id_code  VARCHAR(100) NOT NULL,
  sku             VARCHAR(100) NOT NULL,
  asin            VARCHAR(20),
  status          VARCHAR(50),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id_code, sku)
);
