-- 0137 (1o8):
-- 1) Holiday calendars are now US + MX only (VALID_COUNTRY_CODES). Drop the
--    MarketFoundry calendars (PK, ES, PT, PH, FI): their seeded holidays, and
--    any user assigned to one goes back to "no calendar" so an admin re-assigns
--    them (time-off submissions are refused until a calendar is set).
DELETE FROM "public_holidays" WHERE "country_code" NOT IN ('US', 'MX');
UPDATE "users" SET "country_code" = NULL WHERE "country_code" IS NOT NULL AND "country_code" NOT IN ('US', 'MX');

-- 2) Asana "Go Live Date" custom field: the date an email is sent (Email → Send dates calendar).
ALTER TABLE "asana_tasks" ADD COLUMN IF NOT EXISTS "go_live_date" date;
CREATE INDEX IF NOT EXISTS "idx_asana_tasks_go_live" ON "asana_tasks" ("go_live_date");
