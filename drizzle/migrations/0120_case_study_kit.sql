-- 0120: Case Study Kit — two formats per client, stage workflow, metrics snapshot.
-- Additive: legacy `status` column kept until the follow-up cleanup migration.
DO $$ BEGIN
  CREATE TYPE case_study_format AS ENUM ('high_level', 'detailed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE case_study_stage AS ENUM ('drafting', 'in_review', 'approved', 'sent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE case_studies
  ADD COLUMN IF NOT EXISTS format   case_study_format NOT NULL DEFAULT 'detailed',
  ADD COLUMN IF NOT EXISTS stage    case_study_stage  NOT NULL DEFAULT 'drafting',
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS metrics  jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE case_studies DROP CONSTRAINT IF EXISTS case_studies_client_id_code_unique;
ALTER TABLE case_studies DROP CONSTRAINT IF EXISTS case_studies_client_id_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS case_studies_client_format_key ON case_studies (client_id_code, format);
CREATE INDEX IF NOT EXISTS idx_cs_stage ON case_studies (stage);

ALTER TABLE case_studies
  ALTER COLUMN contact_email    SET DEFAULT 'hello@marketfoundry.com',
  ALTER COLUMN office_locations SET DEFAULT '';
