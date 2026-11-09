-- 0142: monthly estimated hours per client × department (Hours Analytics → Client hours vs estimate). Additive only.
CREATE TABLE IF NOT EXISTS "client_hour_estimates" (
  "client_id_code" varchar(100) NOT NULL,
  "department" varchar(60) NOT NULL,
  "monthly_hours" numeric(7, 2) NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_hour_estimates_pk" PRIMARY KEY ("client_id_code", "department")
);
