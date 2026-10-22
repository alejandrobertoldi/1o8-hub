-- 0140: contracted service providers (agencies / freelancers, not employees). Additive only.
CREATE TABLE IF NOT EXISTS "service_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL CONSTRAINT "service_providers_name_unique" UNIQUE,
  "kind" varchar(20) DEFAULT 'agency' NOT NULL,
  "contact_name" varchar(255),
  "department" varchar(40),
  "services" text,
  "emails" text[] DEFAULT '{}'::text[] NOT NULL,
  "website" text,
  "location" varchar(160),
  "time_zone" varchar(60),
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "asana_assignee_map" ADD COLUMN IF NOT EXISTS "provider_id" uuid REFERENCES "service_providers"("id") ON DELETE SET NULL;
ALTER TABLE "readiness_snapshots" ADD COLUMN IF NOT EXISTS "provider_id" uuid;

-- Seed the two providers seen on the Readiness board (2026-10-21).
INSERT INTO "service_providers" ("name", "kind", "department", "services", "emails")
VALUES
  ('WODO', 'agency', 'Web', 'Web development', ARRAY['projects.wodo@gmail.com']),
  ('Althea Ordonez', 'freelancer', 'Email', 'Email production', ARRAY['althea.ordonez@1o8.agency'])
ON CONFLICT ("name") DO NOTHING;
