CREATE TABLE IF NOT EXISTS "seo_quality_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "seo_projects"("id") ON DELETE CASCADE,
  "overall_score" integer NOT NULL,
  "compliance_score" integer,
  "keyword_coverage" integer,
  "cosmo_density" integer,
  "rufus_coverage" integer,
  "human_voice" integer,
  "buyer_journey" integer,
  "variation_consistency" integer,
  "findings_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_seo_quality_scores_project" ON "seo_quality_scores" ("project_id");
