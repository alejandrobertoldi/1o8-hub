-- 0042: report_section_config table
-- Drives per-client and global toggles for Monthly Report sections.

CREATE TABLE IF NOT EXISTS report_section_config (
  scope        text        NOT NULL,
  scope_key    text        NOT NULL,
  section_key  text        NOT NULL,
  enabled      boolean     NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_key, section_key),
  CHECK (scope IN ('global','client'))
);

CREATE INDEX IF NOT EXISTS idx_rsc_scope
  ON report_section_config(scope, scope_key);
