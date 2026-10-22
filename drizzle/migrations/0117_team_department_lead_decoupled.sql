-- 0117_team_department_lead_decoupled.sql
--
-- Additive only. Decouples the department a person LEADS from the department
-- they are a MEMBER of (users.department). Old model (0116): is_department_lead
-- = true with the led department IMPLIED by users.department, so a person could
-- only lead their own department and an Account Manager (department = NULL)
-- could never be a lead. New model: an explicit nullable leads_department.
ALTER TABLE "users"
  ADD COLUMN "leads_department" "public"."team_department";
--> statement-breakpoint
-- Carry over any lead assigned under the old boolean model so nothing regresses.
UPDATE "users"
SET "leads_department" = "department"
WHERE "is_department_lead" = true
  AND "department" IS NOT NULL
  AND "leads_department" IS NULL;
--> statement-breakpoint
-- At most one lead per department. Load-bearing constraint; the route clears the
-- prior holder in the same transaction before setting the new one.
CREATE UNIQUE INDEX "idx_users_one_lead_per_department_v2"
  ON "users" ("leads_department")
  WHERE "leads_department" IS NOT NULL;
