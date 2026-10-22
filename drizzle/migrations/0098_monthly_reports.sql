-- 0098: persist monthly reports (generate JSON + Drive archive URLs)
CREATE TABLE IF NOT EXISTS "monthly_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id_code" varchar(100) NOT NULL,
  "period" varchar(7) NOT NULL,
  "status" varchar(20) DEFAULT 'generated' NOT NULL,
  "report" jsonb,
  "skipped" jsonb DEFAULT '[]'::jsonb,
  "drive_url" text,
  "html_url" text,
  "data_through" date,
  "generated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_monthly_reports_client_period"
  ON "monthly_reports" ("client_id_code", "period");
CREATE INDEX IF NOT EXISTS "idx_monthly_reports_period"
  ON "monthly_reports" ("period");
CREATE INDEX IF NOT EXISTS "idx_monthly_reports_status"
  ON "monthly_reports" ("status");
