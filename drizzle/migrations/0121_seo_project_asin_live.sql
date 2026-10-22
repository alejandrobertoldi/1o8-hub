CREATE TABLE IF NOT EXISTS seo_project_asin_live (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin varchar(20) NOT NULL,
  client_id_code varchar(100) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('live', 'deprecated')),
  live_date date NOT NULL,
  deprecated_date date,
  deprecated_by_project_id uuid REFERENCES seo_projects(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_seo_project_asin_live_project_asin UNIQUE (project_id, asin)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_seo_project_asin_live_one_live
  ON seo_project_asin_live (client_id_code, asin) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_seo_project_asin_live_client
  ON seo_project_asin_live (client_id_code);
