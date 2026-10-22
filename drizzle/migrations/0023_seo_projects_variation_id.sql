-- Add variation_id FK to seo_projects (links SEO projects to locked variations)
ALTER TABLE seo_projects
  ADD COLUMN variation_id UUID REFERENCES variations(id) ON DELETE SET NULL;

CREATE INDEX idx_seo_projects_variation ON seo_projects(variation_id);
