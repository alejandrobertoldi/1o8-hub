-- scripts/migrations/2026-05-28-portal-per-client-sections/backup.sql
-- Rollback snapshots — run BEFORE migration.sql.
-- Restore via:
--   TRUNCATE "aac";
--   INSERT INTO "aac" SELECT * FROM "_backup_aac_2026_05_28";
-- (users.allowed_sections is not modified by migration; the snapshot
--  exists as defence-in-depth only.)

DROP TABLE IF EXISTS "_backup_aac_2026_05_28";
CREATE TABLE "_backup_aac_2026_05_28" AS
  SELECT * FROM "aac";

DROP TABLE IF EXISTS "_backup_users_sections_2026_05_28";
CREATE TABLE "_backup_users_sections_2026_05_28" AS
  SELECT id, email, role, client_id_code, allowed_sections
  FROM users
  WHERE role IN ('client','prospect');

-- Verify row counts (print to stdout)
SELECT 'aac_rows' AS label, COUNT(*) AS n FROM "_backup_aac_2026_05_28"
UNION ALL
SELECT 'users_rows' AS label, COUNT(*) AS n FROM "_backup_users_sections_2026_05_28";
