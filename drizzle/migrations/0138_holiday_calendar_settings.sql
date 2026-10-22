-- 0138: show/hide each holiday calendar on the general Content Calendar (admins). Additive only.
CREATE TABLE IF NOT EXISTS "holiday_calendar_settings" (
  "country_code" char(2) PRIMARY KEY NOT NULL,
  "visible" boolean DEFAULT true NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
