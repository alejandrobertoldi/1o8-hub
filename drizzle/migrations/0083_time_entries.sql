CREATE TABLE IF NOT EXISTS "time_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "client_id_code" text NOT NULL,
  "entry_date" date NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "hours" numeric(4,2) NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz,
  CONSTRAINT "time_entries_end_after_start" CHECK ("end_time" > "start_time")
);

CREATE INDEX IF NOT EXISTS "idx_time_entries_user_date"
  ON "time_entries" ("user_id", "entry_date");
CREATE INDEX IF NOT EXISTS "idx_time_entries_client_date"
  ON "time_entries" ("client_id_code", "entry_date");
