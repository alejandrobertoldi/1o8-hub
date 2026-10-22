-- 0134: 1o8 team directory. Additive only.
-- 1) 1o8 Agency departments (enum values are append-only in Postgres).
ALTER TYPE "team_department" ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE "team_department" ADD VALUE IF NOT EXISTS 'creative';
ALTER TYPE "team_department" ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE "team_department" ADD VALUE IF NOT EXISTS 'paid_media';
ALTER TYPE "team_department" ADD VALUE IF NOT EXISTS 'web';
ALTER TYPE "team_department" ADD VALUE IF NOT EXISTS 'social_media';

-- 2) Per-person directory facts from the 1o8_Performance_Team sheet.
CREATE TABLE IF NOT EXISTS "team_directory_profiles" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company" varchar(120),
  "expertise" varchar(120),
  "employment_type" varchar(80),
  "location" varchar(160),
  "time_zone" varchar(60),
  "work_days" text[] DEFAULT '{}'::text[] NOT NULL,
  "work_start_local" varchar(12),
  "work_end_local" varchar(12),
  "work_start_chicago" varchar(12),
  "work_end_chicago" varchar(12),
  "source" varchar(20) DEFAULT 'hub' NOT NULL,
  "sheet_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
