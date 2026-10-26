-- 0141: two-way sync between the hub's aac table and the "AAC 1o8" Google Sheet. Additive only.
CREATE TABLE IF NOT EXISTS "aac_sheet_baseline" (
  "client_id_code" varchar(100) PRIMARY KEY NOT NULL,
  "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "aac_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trigger" varchar(40) NOT NULL,
  "dry_run" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "report" jsonb,
  "error" text
);
