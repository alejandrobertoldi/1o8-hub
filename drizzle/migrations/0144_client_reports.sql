-- 0144: client monthly reports (1o8, built on kpi_daily). Additive only.
CREATE TABLE IF NOT EXISTS "client_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id_code" varchar(20) NOT NULL,
  "period" varchar(7) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "data" jsonb NOT NULL,
  "data_through" date,
  "generated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_reports_client_period" ON "client_reports" ("client_id_code", "period");
CREATE INDEX IF NOT EXISTS "idx_client_reports_period" ON "client_reports" ("period");
