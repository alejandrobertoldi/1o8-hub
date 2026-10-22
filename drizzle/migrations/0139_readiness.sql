-- 0139: Readiness board (assignee mapping + daily snapshots). Additive only.
CREATE TABLE IF NOT EXISTS "asana_assignee_map" (
  "assignee_key" varchar(255) PRIMARY KEY NOT NULL,
  "assignee_name" varchar(255),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "department" varchar(40),
  "excluded" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "readiness_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_date" date NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "scope" varchar(20) NOT NULL,
  "key" varchar(255) NOT NULL,
  "label" varchar(255) NOT NULL,
  "department" varchar(40),
  "user_id" uuid,
  "open" integer NOT NULL,
  "due_today" integer NOT NULL,
  "overdue" integer NOT NULL,
  CONSTRAINT "uq_readiness_snapshot" UNIQUE ("snapshot_date", "scope", "key")
);
CREATE INDEX IF NOT EXISTS "idx_readiness_snapshot_date" ON "readiness_snapshots" ("snapshot_date");
