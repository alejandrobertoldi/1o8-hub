-- 0133: per-client brand voice + SEO writing context (mirrors the 1o8 SEO blog
-- tool's brand.md / keywords.md / product-facts.md / internal-links.md).
-- Additive only: new table, nothing existing changes.
CREATE TABLE IF NOT EXISTS "client_brand_voice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id_code" varchar(100) NOT NULL,
  "blog_url" text DEFAULT '' NOT NULL,
  "platform" text DEFAULT '' NOT NULL,
  "value_prop" text DEFAULT '' NOT NULL,
  "why_exists" text DEFAULT '' NOT NULL,
  "tone" text DEFAULT '' NOT NULL,
  "personality" text[] DEFAULT '{}'::text[] NOT NULL,
  "audience" jsonb DEFAULT '{"floor":"","middle":"","ceiling":""}'::jsonb NOT NULL,
  "voice_examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "signature_phrases" text[] DEFAULT '{}'::text[] NOT NULL,
  "banned_phrases" text[] DEFAULT '{}'::text[] NOT NULL,
  "competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reference_posts" text[] DEFAULT '{}'::text[] NOT NULL,
  "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "product_facts" text DEFAULT '' NOT NULL,
  "product_facts_scanned_urls" text[] DEFAULT '{}'::text[] NOT NULL,
  "internal_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source" varchar(120) DEFAULT 'hub' NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_client_brand_voice_client" UNIQUE ("client_id_code")
);
