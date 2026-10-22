-- Add variety pack columns to variation_groups
ALTER TABLE variation_groups
  ADD COLUMN is_variety_pack BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN variety_pack_details JSONB;
