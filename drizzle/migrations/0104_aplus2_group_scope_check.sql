ALTER TABLE aplus2_sets
  DROP CONSTRAINT IF EXISTS aplus2_sets_scope_type_check;

ALTER TABLE aplus2_sets
  ADD CONSTRAINT aplus2_sets_scope_type_check
  CHECK (scope_type IN ('ASIN', 'PARENT', 'GROUP'));

COMMENT ON COLUMN aplus2_sets.covered_asins IS
  'Stored ASIN membership for GROUP scope; GROUP members may span variations';
