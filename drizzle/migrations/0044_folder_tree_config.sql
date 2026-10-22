-- 0044: folder_tree_config table
-- Stores the editable Drive folder tree used by client onboarding.
-- Single-row design (id = 1): the JSON tree is the source of truth.

CREATE TABLE IF NOT EXISTS folder_tree_config (
  id          integer     PRIMARY KEY DEFAULT 1,
  tree        jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  CHECK (id = 1)
);
