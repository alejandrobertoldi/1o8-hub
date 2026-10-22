-- 0092_owner_super_admin_roles.sql
--
-- Promote Super Admin from a boolean flag to a real user_role, and add Owner
-- at the top of the staff ladder:
--   Owner > Super Admin > Admin > Editor > Viewer
--
-- ADD VALUE must commit before the new labels are used in UPDATE on some PG
-- versions — the apply script runs this file as one simple-query transaction
-- (PG 12+ allows use in the same txn). Hand-applied via scripts/_apply-0092.ts.

ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'super_admin';
--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'owner';
--> statement-breakpoint
-- Collapse the legacy flag into the real role. Leave is_super_admin true for
-- dual-read until callers fully derive from role (app dual-writes on role change).
UPDATE "users"
SET "role" = 'super_admin'
WHERE "is_super_admin" = true
  AND "role" NOT IN ('owner', 'super_admin');
