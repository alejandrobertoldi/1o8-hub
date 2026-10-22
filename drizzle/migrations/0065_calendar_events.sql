-- drizzle/migrations/0064_calendar_events.sql
-- Calendar events table — replaces hardcoded HOLIDAYS array and localStorage
-- custom events. Supports multi-day events via end_date.
-- Seeds existing holidays + Amazon dates so first run preserves UX.
-- Idempotent: re-running this migration is a no-op (ON CONFLICT DO NOTHING
-- on legacy_id UNIQUE).

BEGIN;

CREATE TYPE "public"."calendar_event_type" AS ENUM ('holiday', 'deadline', 'content', 'milestone');

CREATE TABLE "calendar_events" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id varchar(50) UNIQUE,
  title varchar(200) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type "calendar_event_type" NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX idx_calendar_events_type ON calendar_events(type);
CREATE INDEX idx_calendar_events_range ON calendar_events(start_date, end_date);

-- ── Seeds: US holidays + Amazon key dates 2025-2027 ──────────────────
-- end_date = start_date for all seeds (single-day). User edits inline to
-- extend (e.g. Prime Day → 4 days).
-- ON CONFLICT (legacy_id) DO NOTHING so re-running is safe.

INSERT INTO calendar_events (legacy_id, title, start_date, end_date, type) VALUES
  -- 2025
  ('h-2025-01', 'New Year''s Day', '2025-01-01', '2025-01-01', 'holiday'),
  ('h-2025-02', 'MLK Day', '2025-01-20', '2025-01-20', 'holiday'),
  ('h-2025-03', 'Valentine''s Day', '2025-02-14', '2025-02-14', 'holiday'),
  ('h-2025-04', 'Presidents'' Day', '2025-02-17', '2025-02-17', 'holiday'),
  ('h-2025-05', 'St. Patrick''s Day', '2025-03-17', '2025-03-17', 'holiday'),
  ('h-2025-06', 'Easter', '2025-04-20', '2025-04-20', 'holiday'),
  ('h-2025-07', 'Mother''s Day', '2025-05-11', '2025-05-11', 'holiday'),
  ('h-2025-08', 'Memorial Day', '2025-05-26', '2025-05-26', 'holiday'),
  ('h-2025-09', 'Father''s Day', '2025-06-15', '2025-06-15', 'holiday'),
  ('h-2025-10', 'Independence Day', '2025-07-04', '2025-07-04', 'holiday'),
  ('h-2025-prime', 'Prime Day (Est.)', '2025-07-15', '2025-07-15', 'milestone'),
  ('h-2025-bts', 'Back to School', '2025-08-01', '2025-08-01', 'milestone'),
  ('h-2025-11', 'Labor Day', '2025-09-01', '2025-09-01', 'holiday'),
  ('h-2025-12', 'Halloween', '2025-10-31', '2025-10-31', 'holiday'),
  ('h-2025-13', 'Veterans Day', '2025-11-11', '2025-11-11', 'holiday'),
  ('h-2025-14', 'Thanksgiving', '2025-11-27', '2025-11-27', 'holiday'),
  ('h-2025-bf', 'Black Friday', '2025-11-28', '2025-11-28', 'milestone'),
  ('h-2025-cm', 'Cyber Monday', '2025-12-01', '2025-12-01', 'milestone'),
  ('h-2025-15', 'Christmas', '2025-12-25', '2025-12-25', 'holiday'),
  ('h-2025-16', 'New Year''s Eve', '2025-12-31', '2025-12-31', 'holiday'),
  -- 2026
  ('h-2026-01', 'New Year''s Day', '2026-01-01', '2026-01-01', 'holiday'),
  ('h-2026-02', 'MLK Day', '2026-01-19', '2026-01-19', 'holiday'),
  ('h-2026-03', 'Valentine''s Day', '2026-02-14', '2026-02-14', 'holiday'),
  ('h-2026-04', 'Presidents'' Day', '2026-02-16', '2026-02-16', 'holiday'),
  ('h-2026-05', 'St. Patrick''s Day', '2026-03-17', '2026-03-17', 'holiday'),
  ('h-2026-06', 'Easter', '2026-04-05', '2026-04-05', 'holiday'),
  ('h-2026-07', 'Mother''s Day', '2026-05-10', '2026-05-10', 'holiday'),
  ('h-2026-08', 'Memorial Day', '2026-05-25', '2026-05-25', 'holiday'),
  ('h-2026-09', 'Father''s Day', '2026-06-21', '2026-06-21', 'holiday'),
  ('h-2026-10', 'Independence Day', '2026-07-04', '2026-07-04', 'holiday'),
  ('h-2026-prime', 'Prime Day (Est.)', '2026-07-14', '2026-07-14', 'milestone'),
  ('h-2026-bts', 'Back to School', '2026-08-01', '2026-08-01', 'milestone'),
  ('h-2026-11', 'Labor Day', '2026-09-07', '2026-09-07', 'holiday'),
  ('h-2026-12', 'Halloween', '2026-10-31', '2026-10-31', 'holiday'),
  ('h-2026-13', 'Veterans Day', '2026-11-11', '2026-11-11', 'holiday'),
  ('h-2026-14', 'Thanksgiving', '2026-11-26', '2026-11-26', 'holiday'),
  ('h-2026-bf', 'Black Friday', '2026-11-27', '2026-11-27', 'milestone'),
  ('h-2026-cm', 'Cyber Monday', '2026-11-30', '2026-11-30', 'milestone'),
  ('h-2026-15', 'Christmas', '2026-12-25', '2026-12-25', 'holiday'),
  ('h-2026-16', 'New Year''s Eve', '2026-12-31', '2026-12-31', 'holiday'),
  -- 2027
  ('h-2027-01', 'New Year''s Day', '2027-01-01', '2027-01-01', 'holiday'),
  ('h-2027-02', 'MLK Day', '2027-01-18', '2027-01-18', 'holiday'),
  ('h-2027-03', 'Valentine''s Day', '2027-02-14', '2027-02-14', 'holiday'),
  ('h-2027-04', 'Presidents'' Day', '2027-02-15', '2027-02-15', 'holiday'),
  ('h-2027-05', 'St. Patrick''s Day', '2027-03-17', '2027-03-17', 'holiday'),
  ('h-2027-06', 'Easter', '2027-03-28', '2027-03-28', 'holiday'),
  ('h-2027-07', 'Mother''s Day', '2027-05-09', '2027-05-09', 'holiday'),
  ('h-2027-08', 'Memorial Day', '2027-05-31', '2027-05-31', 'holiday'),
  ('h-2027-09', 'Father''s Day', '2027-06-20', '2027-06-20', 'holiday'),
  ('h-2027-10', 'Independence Day', '2027-07-04', '2027-07-04', 'holiday'),
  ('h-2027-prime', 'Prime Day (Est.)', '2027-07-13', '2027-07-13', 'milestone'),
  ('h-2027-bts', 'Back to School', '2027-08-01', '2027-08-01', 'milestone'),
  ('h-2027-11', 'Labor Day', '2027-09-06', '2027-09-06', 'holiday'),
  ('h-2027-12', 'Halloween', '2027-10-31', '2027-10-31', 'holiday'),
  ('h-2027-13', 'Veterans Day', '2027-11-11', '2027-11-11', 'holiday'),
  ('h-2027-14', 'Thanksgiving', '2027-11-25', '2027-11-25', 'holiday'),
  ('h-2027-bf', 'Black Friday', '2027-11-26', '2027-11-26', 'milestone'),
  ('h-2027-cm', 'Cyber Monday', '2027-11-29', '2027-11-29', 'milestone'),
  ('h-2027-15', 'Christmas', '2027-12-25', '2027-12-25', 'holiday'),
  ('h-2027-16', 'New Year''s Eve', '2027-12-31', '2027-12-31', 'holiday')
ON CONFLICT (legacy_id) DO NOTHING;

COMMIT;
