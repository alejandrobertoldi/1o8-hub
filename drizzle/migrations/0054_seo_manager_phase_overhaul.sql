-- 0054_seo_manager_phase_overhaul.sql
-- Adds 9-phase pipeline schema: S7 Premium A+, S8 Listing Images, S9 Scoring.
-- Backwards compatible: legacy seo_asins.generated_content + seo_compliance_reports retained.

BEGIN;

-- ─── seo_projects: phase timestamps + skip flags ───
ALTER TABLE seo_projects
  ADD COLUMN s7_approved_at timestamptz,
  ADD COLUMN s8_approved_at timestamptz,
  ADD COLUMN s9_approved_at timestamptz,
  ADD COLUMN s7_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN s8_skipped boolean NOT NULL DEFAULT false;

-- Extend current_phase to allow S7/S8/S9
ALTER TABLE seo_projects
  ALTER COLUMN current_phase TYPE varchar(5);
-- (already varchar(5), no-op if so — kept for clarity)

-- ─── seo_keywords: Helium 10 + COSMO fields ───
ALTER TABLE seo_keywords
  ADD COLUMN semantic_group varchar(100),
  ADD COLUMN cerebro_iq integer,
  ADD COLUMN competing_products integer,
  ADD COLUMN title_density integer,
  ADD COLUMN cpr integer,
  ADD COLUMN competitor_rank_avg numeric,
  ADD COLUMN ppc_suggested_bid numeric,
  ADD COLUMN ppc_suggested_min_bid numeric,
  ADD COLUMN ppc_suggested_max_bid numeric,
  ADD COLUMN cosmo_domain varchar(50),
  ADD COLUMN composite_score numeric,
  ADD COLUMN is_negative boolean NOT NULL DEFAULT false,
  ADD COLUMN negative_reason text,
  ADD COLUMN is_competitor boolean NOT NULL DEFAULT false;
-- keyword_source kept (defaults to 'Helium 10' going forward; no flag rename)

-- ─── seo_rufus: stable IDs + per-sub-phase approval ───
ALTER TABLE seo_rufus
  ADD COLUMN phase1_approved_at timestamptz,
  ADD COLUMN phase2_approved_at timestamptz,
  ADD COLUMN phase3_approved_at timestamptz;
-- phase{1,2,3}_questions remain jsonb but new entries follow {id, text, intent_tier, batch_char_count} shape;
-- runner upgrades old string[] payloads on read.

-- ─── seo_cosmo_maps: confidence per triple + 16 categories enforced via runner ───
ALTER TABLE seo_cosmo_maps
  ADD COLUMN relationship_categories_evaluated jsonb DEFAULT '[]'::jsonb;
-- triples remain jsonb; runner now stamps {id, confidence_level: 'High'|'Medium'|'Low', ...} per triple.

-- ─── seo_listings: Amazon flat-file ready, 1 per ASIN ───
CREATE TABLE seo_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  title varchar(220),                              -- 190-200 target, hard cap 220
  bullets jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { detailed:[5], concise:[5], content:[5], key_features:[5] }
  product_description text,                        -- 1000-1200 target

  backend_search_terms text,                       -- ≤500 bytes single string
  backend_categories jsonb NOT NULL DEFAULT '{}'::jsonb,
                                                   -- { core, supplement, symptom, audience, longtail }
  subject_matter text,
  subject_matter_byte_length integer,

  byte_usage jsonb NOT NULL DEFAULT '{}'::jsonb,   -- per-field char/byte tracking
  category_required_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  compliance_violations jsonb NOT NULL DEFAULT '[]'::jsonb,

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asin_id, version)
);
CREATE INDEX idx_seo_listings_project ON seo_listings(project_id);
CREATE INDEX idx_seo_listings_asin ON seo_listings(asin_id);

-- ─── seo_aplus_plans: exactly 7 modules, last MUST be premium_qa ───
CREATE TABLE seo_aplus_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ position, module_type, cosmo_relationship, fields:{...}, images:[{technical_name, alt_text, overlay_text, ai_prompt, dimensions}] }]

  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asin_id, version)
);
CREATE INDEX idx_seo_aplus_project ON seo_aplus_plans(project_id);

-- ─── seo_images: 9 per ASIN, MAIN + PT01-PT08 ───
CREATE TABLE seo_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  image_number smallint NOT NULL,                  -- 1-9
  technical_name varchar(10) NOT NULL,             -- MAIN | PT01 | PT02 | ... | PT08
  image_type varchar(50),
  image_purpose text,
  cosmo_relationship varchar(50),
  buyer_stage varchar(20),                         -- Awareness | Consideration | Decision

  file_format varchar(10) NOT NULL DEFAULT 'PNG',
  width_px integer NOT NULL DEFAULT 2000,
  height_px integer NOT NULL DEFAULT 2000,
  color_mode varchar(10) NOT NULL DEFAULT 'RGB',

  overlay_text text,                               -- Not Applicable for MAIN
  overlay_text_length integer,
  alt_text text,                                   -- 95-100 chars
  alt_text_length integer,

  image_direction text,
  ai_image_prompt text,

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asin_id, image_number, version),
  CHECK (image_number BETWEEN 1 AND 9),
  CHECK (technical_name IN ('MAIN','PT01','PT02','PT03','PT04','PT05','PT06','PT07','PT08'))
);
CREATE INDEX idx_seo_images_project ON seo_images(project_id);
CREATE INDEX idx_seo_images_asin ON seo_images(asin_id);

-- ─── seo_qa: single Q&A artifact, 3 derived consumers ───
CREATE TABLE seo_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid REFERENCES seo_asins(id) ON DELETE CASCADE,
  -- asin_id null = project-level Q&A (variation-family wide)

  pairs jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ id, question, answer_short, answer_long, intent_tier, source_rufus_question_id, source_review_themes:[] }]

  -- Derived views (computed at S6 write, refreshed on regenerate)
  aplus_qa_subset jsonb NOT NULL DEFAULT '[]'::jsonb,        -- 5 pairs for A+ Q&A module
  customer_qa_export jsonb NOT NULL DEFAULT '[]'::jsonb,     -- full set for Amazon Customer Q&A
  passage_map_qa jsonb NOT NULL DEFAULT '[]'::jsonb,         -- pairs tagged with Rufus + COSMO ids

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asin_id, version)
);
CREATE INDEX idx_seo_qa_project ON seo_qa(project_id);
CREATE INDEX idx_seo_qa_asin ON seo_qa(asin_id);

-- ─── seo_passage_map: audit trail for which passage covers which Rufus Q + COSMO triple ───
CREATE TABLE seo_passage_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  passages jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ section: 'title'|'bullet1'|...|'description'|'aplus_module_3'|'image_pt02', text, rufus_question_ids:[], cosmo_triple_ids:[], keywords_used:[] }]

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_passage_map_asin ON seo_passage_map(asin_id);
CREATE INDEX idx_seo_passage_map_project ON seo_passage_map(project_id);

-- ─── seo_scores: S9 hard gate output ───
CREATE TABLE seo_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  rufus_coverage_pct numeric NOT NULL DEFAULT 0,
  rufus_5_canonical_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cosmo_coverage_pct numeric NOT NULL DEFAULT 0,
  cosmo_density_per_100_words numeric NOT NULL DEFAULT 0,
  cosmo_relationship_categories_evaluated jsonb NOT NULL DEFAULT '[]'::jsonb,
  buyer_journey_alignment jsonb NOT NULL DEFAULT '{}'::jsonb,
  byte_budget_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  prohibited_word_violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_rufus_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_cosmo_triples jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_grade varchar(2),                        -- A | B | C | D | F
  probe_transcript jsonb,                          -- only on opt-in deep audit
  rerun_count smallint NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  score_version integer NOT NULL DEFAULT 1,
  UNIQUE(asin_id, score_version)
);
CREATE INDEX idx_seo_scores_project ON seo_scores(project_id);
CREATE INDEX idx_seo_scores_asin ON seo_scores(asin_id);

COMMIT;
