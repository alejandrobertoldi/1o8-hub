-- 0042: Add child_relationship_type column to master table
-- Supports Variation Builder inheritance sync (forces 'variation' value on children)

ALTER TABLE master
  ADD COLUMN IF NOT EXISTS child_relationship_type varchar(20);

-- Index for querying products by relationship type
CREATE INDEX IF NOT EXISTS idx_master_child_relationship_type
  ON master(child_relationship_type);