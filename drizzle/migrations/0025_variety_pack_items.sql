-- Variety pack composition: links pack products to their included items
CREATE TABLE variety_pack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_product_id UUID NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  included_product_id UUID REFERENCES master(id) ON DELETE SET NULL,
  flavor VARCHAR(200),
  size VARCHAR(200),
  color VARCHAR(200),
  style VARCHAR(200),
  custom_label VARCHAR(255),
  units INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX idx_variety_pack_items_pack ON variety_pack_items(pack_product_id);
CREATE INDEX idx_variety_pack_items_included ON variety_pack_items(included_product_id);
