-- 0043: reports_cache table
-- Pre-warmed Redshift responses for /reports section pages
-- (excluding Monthly Reports). Mirrors sales_summary_cache pattern.

CREATE TABLE IF NOT EXISTS "reports_cache" (
  "id"           serial       PRIMARY KEY,
  "cache_type"   varchar(64)  NOT NULL,
  "cache_key"    text         NOT NULL,
  "data"         jsonb        NOT NULL,
  "created_at"   timestamptz  NOT NULL DEFAULT now(),
  "updated_at"   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT "uq_reports_cache_type_key" UNIQUE ("cache_type", "cache_key")
);

CREATE INDEX IF NOT EXISTS "idx_reports_cache_updated"
  ON "reports_cache"("updated_at");
