-- 0118_team_multi_dept.sql
--
-- Additive only. Two changes:
--   1. user_department_leads junction: one person may lead many departments,
--      each department still has at most one lead (UNIQUE(department)). Replaces
--      the single users.leads_department scalar as source of truth.
--   2. users.departments array: a person may belong to many departments.
-- The scalar users.department / users.leads_department / users.is_department_lead
-- columns are LEFT IN PLACE, frozen and unused.

CREATE TABLE "user_department_leads" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "department" "public"."team_department" NOT NULL,
  PRIMARY KEY ("user_id", "department")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_department_leads_one_per_dept"
  ON "user_department_leads" ("department");
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN "departments" "public"."team_department"[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
-- Backfill membership from the scalar so nothing regresses.
UPDATE "users"
SET "departments" = ARRAY["department"]::"public"."team_department"[]
WHERE "department" IS NOT NULL
  AND "departments" = '{}';
--> statement-breakpoint
-- Seed the leads junction from the authoritative scalar (4 rows on 2026-09-21).
INSERT INTO "user_department_leads" ("user_id", "department")
SELECT "id", "leads_department" FROM "users"
WHERE "leads_department" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Seed the one title-implied lead the scalar could not hold: data -> Manu.
INSERT INTO "user_department_leads" ("user_id", "department")
SELECT "id", 'data'::"public"."team_department" FROM "users"
WHERE "email" = 'manu@marketfoundry.agency'
ON CONFLICT DO NOTHING;
