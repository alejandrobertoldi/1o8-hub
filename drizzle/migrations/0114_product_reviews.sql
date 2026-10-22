-- 0114: Amazon product reviews store.
--
-- Until now customer reviews only existed inside one SEO project (seo_reviews,
-- filled from a hand-uploaded CSV in phase S3). Every other surface that could
-- use them (A+ QA, portal, reports, Rufus prompts) had nothing. This adds a
-- product-level store keyed by ASIN and client so reviews are fetched once and
-- read everywhere.
--
-- Sources:
--   product_reviews          individual review text. Rainforest `type=reviews`
--                            is the primary scraper, Firecrawl the fallback,
--                            CSV upload the manual path. Upsert on
--                            (asin, external_id): re-syncs never duplicate and
--                            never delete a review Amazon stopped serving.
--   review_topic_snapshots   Amazon Customer Feedback topic analysis (positive
--                            / negative themes, snippets, star-rating impact,
--                            6-month trends) via the shared Helium 10 MCP
--                            connection. Kept as snapshots so drift is visible.
--   review_rating_history    daily rating + review count per ASIN (Helium 10).
--   review_asin_status       one row per ASIN: Amazon rating summary plus sync
--                            bookkeeping (stalest-first scheduling, last error).
--   review_sync_runs         job log for manual and cron syncs.

CREATE TABLE IF NOT EXISTS "product_reviews" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "asin"              varchar(20)  NOT NULL,
  "client_id_code"    varchar(100),
  "marketplace"       varchar(10)  NOT NULL DEFAULT 'US',
  "source"            varchar(20)  NOT NULL,
  "external_id"       varchar(100) NOT NULL,
  "title"             text,
  "body"              text,
  "rating"            smallint,
  "reviewer_name"     varchar(255),
  "review_date"       date,
  "review_date_raw"   varchar(100),
  "verified_purchase" boolean      NOT NULL DEFAULT false,
  "is_vine"           boolean      NOT NULL DEFAULT false,
  "helpful_votes"     integer      NOT NULL DEFAULT 0,
  "variation"         text,
  "images"            jsonb,
  "review_country"    varchar(10),
  "link"              text,
  "raw"               jsonb,
  "sentiment"         varchar(20),
  "key_themes"        text,
  "first_seen_at"     timestamptz  NOT NULL DEFAULT now(),
  "last_seen_at"      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT "uq_product_reviews_asin_external" UNIQUE ("asin", "external_id")
);
CREATE INDEX IF NOT EXISTS "idx_product_reviews_asin"   ON "product_reviews" ("asin");
CREATE INDEX IF NOT EXISTS "idx_product_reviews_client" ON "product_reviews" ("client_id_code");
CREATE INDEX IF NOT EXISTS "idx_product_reviews_date"   ON "product_reviews" ("review_date");
CREATE INDEX IF NOT EXISTS "idx_product_reviews_rating" ON "product_reviews" ("rating");

CREATE TABLE IF NOT EXISTS "review_asin_status" (
  "asin"                   varchar(20) PRIMARY KEY,
  "client_id_code"         varchar(100),
  "marketplace"            varchar(10) NOT NULL DEFAULT 'US',
  "item_name"              text,
  "rating"                 numeric(3, 2),
  "ratings_total"          integer,
  "reviews_total"          integer,
  "rating_breakdown"       jsonb,
  "stored_reviews"         integer     NOT NULL DEFAULT 0,
  "last_reviews_fetch_at"  timestamptz,
  "last_topics_fetch_at"   timestamptz,
  "last_history_fetch_at"  timestamptz,
  "last_error"             text,
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_review_asin_status_client" ON "review_asin_status" ("client_id_code");

CREATE TABLE IF NOT EXISTS "review_topic_snapshots" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "asin"            varchar(20)  NOT NULL,
  "client_id_code"  varchar(100),
  "marketplace"     varchar(10)  NOT NULL DEFAULT 'US',
  "source"          varchar(20)  NOT NULL DEFAULT 'helium10',
  "item_name"       text,
  "range_start"     date,
  "range_end"       date,
  "positive_topics" jsonb        NOT NULL DEFAULT '[]'::jsonb,
  "negative_topics" jsonb        NOT NULL DEFAULT '[]'::jsonb,
  "trends"          jsonb,
  "raw"             jsonb,
  "fetched_at"      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_review_topic_snapshots_asin_fetched" ON "review_topic_snapshots" ("asin", "fetched_at");
CREATE INDEX IF NOT EXISTS "idx_review_topic_snapshots_client"       ON "review_topic_snapshots" ("client_id_code");

CREATE TABLE IF NOT EXISTS "review_rating_history" (
  "asin"         varchar(20) NOT NULL,
  "day"          date        NOT NULL,
  "review_count" integer,
  "rating"       numeric(3, 2),
  "source"       varchar(20) NOT NULL DEFAULT 'helium10',
  CONSTRAINT "review_rating_history_asin_day_pk" PRIMARY KEY ("asin", "day")
);

CREATE TABLE IF NOT EXISTS "review_sync_runs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code"   varchar(100),
  "trigger"          varchar(20)  NOT NULL DEFAULT 'manual',
  "triggered_by"     varchar(255),
  "status"           varchar(20)  NOT NULL DEFAULT 'running',
  "providers"        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  "asins_total"      integer      NOT NULL DEFAULT 0,
  "asins_done"       integer      NOT NULL DEFAULT 0,
  "asins_failed"     integer      NOT NULL DEFAULT 0,
  "reviews_added"    integer      NOT NULL DEFAULT 0,
  "topics_refreshed" integer      NOT NULL DEFAULT 0,
  "errors"           jsonb        NOT NULL DEFAULT '[]'::jsonb,
  "started_at"       timestamptz  NOT NULL DEFAULT now(),
  "completed_at"     timestamptz
);
CREATE INDEX IF NOT EXISTS "idx_review_sync_runs_client_started" ON "review_sync_runs" ("client_id_code", "started_at");
