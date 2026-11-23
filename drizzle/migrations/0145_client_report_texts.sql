-- 0145: written parts of client monthly reports, one row per version. Additive only.
CREATE TABLE IF NOT EXISTS "client_report_texts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL REFERENCES "client_reports"("id") ON DELETE CASCADE,
  "section" varchar(30) NOT NULL,
  "html" text NOT NULL,
  "source" varchar(20) NOT NULL,
  "instruction" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_client_report_texts_report" ON "client_report_texts" ("report_id", "section", "created_at");
