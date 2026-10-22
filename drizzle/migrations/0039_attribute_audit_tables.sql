-- 0039_attribute_audit_tables.sql

-- 1. Add is_key column to category_attributes
ALTER TABLE category_attributes ADD COLUMN is_key boolean NOT NULL DEFAULT false;

-- 2. Create product_key_overrides table
CREATE TABLE product_key_overrides (
  id serial PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  attribute_name text NOT NULL,
  category_definition_id integer REFERENCES category_definitions(id) ON DELETE CASCADE,
  is_key boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, attribute_name)
);

CREATE INDEX idx_pko_product ON product_key_overrides(product_id);
CREATE INDEX idx_pko_definition ON product_key_overrides(category_definition_id);

-- 3. Create attribute_template_requests table
CREATE TABLE attribute_template_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code text NOT NULL,
  product_type text NOT NULL,
  scope text NOT NULL,
  levels text[] NOT NULL,
  product_ids text[],
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_atr_client ON attribute_template_requests(client_id_code);

-- 4. RLS policies
ALTER TABLE product_key_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_product_key_overrides" ON product_key_overrides FOR ALL TO anon USING (false);
CREATE POLICY "deny_auth_product_key_overrides" ON product_key_overrides FOR ALL TO authenticated USING (false);

ALTER TABLE attribute_template_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_attribute_template_requests" ON attribute_template_requests FOR ALL TO anon USING (false);
CREATE POLICY "deny_auth_attribute_template_requests" ON attribute_template_requests FOR ALL TO authenticated USING (false);
