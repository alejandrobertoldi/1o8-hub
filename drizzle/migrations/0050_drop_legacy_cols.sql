-- Drop master_row (sort order replaced by reference_group/subgroup/general_label)
ALTER TABLE attributes DROP COLUMN IF EXISTS master_row;

-- Drop client_requirements (requirement levels now from category_meta per (marketplace, productType))
ALTER TABLE attributes DROP COLUMN IF EXISTS client_requirements;
