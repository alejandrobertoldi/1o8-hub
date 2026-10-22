-- ═══════════════════════════════════════════════════════════
-- 1o8 SEO Manager — Database Schema (Supabase/PostgreSQL)
-- Run this in Supabase SQL Editor to create all tables
-- ═══════════════════════════════════════════════════════════

-- Projects
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'archived')),
  current_phase TEXT DEFAULT 'S1' CHECK (current_phase IN ('S1','S2','S3','S4','S5','S6','S7','S8')),

  -- S1 Metadata
  date TEXT,
  client_id_code TEXT,
  brand_name TEXT NOT NULL DEFAULT '',
  client_name TEXT,
  client_bible_url TEXT,
  brand_url TEXT,

  -- Competitors (JSONB array)
  competitors JSONB DEFAULT '[]'::jsonb,

  -- Variation
  variation_theme TEXT,
  size_present BOOLEAN DEFAULT false,

  -- Brand Guidelines
  brand_guidelines TEXT DEFAULT '',
  brand_guidelines_lock JSONB,

  -- Variety Pack
  variety_pack_details TEXT,

  -- Phase approvals
  s1_approved_at TIMESTAMPTZ,
  s2_approved_at TIMESTAMPTZ,
  s3_approved_at TIMESTAMPTZ,
  s4_approved_at TIMESTAMPTZ,
  s5_approved_at TIMESTAMPTZ,
  s6_approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ASINs
CREATE TABLE asins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  asin TEXT NOT NULL,
  sku TEXT NOT NULL,
  amazon_url TEXT,
  website_url TEXT,
  variation_id TEXT,
  variation_product TEXT,
  parentage_level TEXT CHECK (parentage_level IN ('Parent', 'Child')),
  variation_theme_name TEXT,
  flavor TEXT,
  style TEXT,
  color TEXT,
  size TEXT,

  -- Existing content (JSONB — columns M-AM)
  existing_content JSONB DEFAULT '{}'::jsonb,

  -- Baseline analysis
  baseline_analysis JSONB,

  -- Generated content (S7 output)
  generated_content JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, asin)
);

-- Keywords (S2 — OUT_KEY)
CREATE TABLE keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  search_volume INTEGER DEFAULT 0,
  priority_tier TEXT CHECK (priority_tier IN ('T1', 'T2', 'T3', 'T4')),
  search_intent TEXT,
  primary_use_location TEXT,
  match_type TEXT,
  cosmo_relationship TEXT,
  buyer_stage TEXT CHECK (buyer_stage IN ('Awareness', 'Consideration', 'Decision')),
  notes TEXT DEFAULT '',
  keyword_source TEXT DEFAULT 'Client',

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Reviews (S3 — OUT_REV)
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  review_id TEXT,
  date TEXT,
  reviewer_name TEXT,
  asin TEXT,
  product_variation TEXT,
  star_rating INTEGER,
  title TEXT,
  text TEXT,
  sentiment TEXT,
  key_themes TEXT,
  usage_mentioned TEXT,
  packaging_feedback TEXT,
  price_feedback TEXT,
  heat_level_feedback TEXT,
  rufus_usable_insight TEXT,
  bullet_mapping TEXT,
  helpful_votes INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rufus Data (S4 — OUT_RUF)
CREATE TABLE rufus_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  phase1_questions JSONB DEFAULT '[]'::jsonb,
  phase1_answers JSONB DEFAULT '[]'::jsonb,
  phase2_questions JSONB DEFAULT '[]'::jsonb,
  phase2_answers JSONB DEFAULT '[]'::jsonb,
  phase3_questions JSONB DEFAULT '[]'::jsonb,
  phase3_answers JSONB DEFAULT '[]'::jsonb,
  optimization_summary JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- COSMO Map (S5 — OUT_COS)
CREATE TABLE cosmo_maps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  triples JSONB DEFAULT '[]'::jsonb,
  keyword_coverage JSONB DEFAULT '{}'::jsonb,
  competitive_positioning TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Compliance Reports (S6)
CREATE TABLE compliance_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  issues JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'clean' CHECK (status IN ('clean', 'has_issues', 'bypassed')),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Export History
CREATE TABLE exports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('google_doc', 'csv', 'tsv')),
  url TEXT,
  content_snapshot JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_asins_project ON asins(project_id);
CREATE INDEX idx_keywords_project ON keywords(project_id);
CREATE INDEX idx_reviews_project ON reviews(project_id);
CREATE INDEX idx_projects_user ON projects(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rufus_data_updated_at
  BEFORE UPDATE ON rufus_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cosmo_maps_updated_at
  BEFORE UPDATE ON cosmo_maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
