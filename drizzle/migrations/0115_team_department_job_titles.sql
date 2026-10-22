-- 0115_team_department_job_titles.sql
--
-- Additive only. Nothing is dropped, renamed or deleted.
--
-- Spec D7 originally forbade a department column because clientIdCode already
-- doubled as "which internal team" (agency / marketplace / external). That is a
-- different fact from functional department (Design, SEO, PPC, …). Both now
-- exist: clientIdCode stays the INTERNAL_TEAMS axis; department is the
-- org-chart axis used by the company-scale chart on /team.
--
-- job_title (varchar) stays as the primary / first title so existing directory
-- and picker consumers keep working. job_titles is the full list; the PATCH
-- route keeps the two in sync (job_title = job_titles[1], or NULL).
--
-- STATEMENT ORDER IS LOAD-BEARING:
--   1. CREATE TYPE — takes no lock on "users".
--   2. ONE combined ALTER adding both columns so the ACCESS EXCLUSIVE lock on
--      "users" is acquired exactly once.
--   3. Backfill job_titles from job_title where the array is still empty.
--   4. Index on department for the company-scale grouping.

CREATE TYPE "public"."team_department" AS ENUM(
  'finance',
  'admin',
  'account_management',
  'project_management',
  'design',
  'seo',
  'ppc',
  'catalog',
  'data'
);
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN "department" "public"."team_department",
  ADD COLUMN "job_titles" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
UPDATE "users"
SET "job_titles" = ARRAY["job_title"]
WHERE "job_title" IS NOT NULL
  AND btrim("job_title") <> ''
  AND "job_titles" = '{}';
--> statement-breakpoint
CREATE INDEX "idx_users_department" ON "users" ("department");
