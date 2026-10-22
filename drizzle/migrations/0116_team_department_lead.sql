-- 0116_team_department_lead.sql
--
-- Additive only. Marks which person leads a functional department (the org-tree
-- axis from 0115). At most one lead per department: the partial unique index
-- is the load-bearing constraint. drizzle-orm has no partial-unique primitive
-- that matches PG, so the index lives in SQL and is commented on the column
-- in schema.ts so a later generate does not "fix" it as drift.

ALTER TABLE "users"
  ADD COLUMN "is_department_lead" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_one_lead_per_department"
  ON "users" ("department")
  WHERE "is_department_lead" AND "department" IS NOT NULL;
