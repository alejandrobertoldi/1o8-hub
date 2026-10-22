ALTER TABLE aplus2_sets
  ALTER COLUMN scope_identifier TYPE varchar(64);

COMMENT ON COLUMN aplus2_sets.scope_type IS
  'A+ assignment scope: ASIN, PARENT (entire live variation), or GROUP (stored variation subset)';

COMMENT ON COLUMN aplus2_sets.covered_asins IS
  'Stored membership for GROUP scope; snapshot/fallback only for PARENT scope';
