-- 0143: whether a person logs hours (contractors may not). Additive only.
ALTER TABLE "team_directory_profiles" ADD COLUMN IF NOT EXISTS "logs_time" boolean DEFAULT true NOT NULL;
