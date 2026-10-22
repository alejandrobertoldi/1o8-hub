-- 0136: 1o8 time tracking. Additive only.
-- 1) Asana mirror: what the time logger needs per task.
ALTER TABLE "asana_tasks" ADD COLUMN IF NOT EXISTS "internal_id" varchar(40);
ALTER TABLE "asana_tasks" ADD COLUMN IF NOT EXISTS "service_tags" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "asana_tasks" ADD COLUMN IF NOT EXISTS "project_names" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "asana_tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;

-- 2) Time logs: decimal hours per day × client × department × project number.
CREATE TABLE IF NOT EXISTS "time_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "entry_date" date NOT NULL,
  "hours" numeric(5, 2) NOT NULL CHECK ("hours" > 0 AND "hours" <= 24),
  "client_id_code" varchar(100) NOT NULL,
  "department" varchar(60) NOT NULL,
  "project_number" varchar(24) NOT NULL,
  "asana_task_gid" varchar(32),
  "project_name" text NOT NULL,
  "billing_type" varchar(40) NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_time_logs_user_date" ON "time_logs" ("user_id", "entry_date");
CREATE INDEX IF NOT EXISTS "idx_time_logs_client_date" ON "time_logs" ("client_id_code", "entry_date");
