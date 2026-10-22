-- 0122_fulfillment_centers.sql
--
-- Additive only. New table: Amazon facility directory (US + Canada) that the
-- FBA inventory map uses to place FC codes. Seeded by
-- scripts/_import-fulfillment-centers.ts from AMZ Prep's 2025 master list.

CREATE TABLE IF NOT EXISTS "fulfillment_centers" (
  "code" varchar(16) PRIMARY KEY,
  "country" char(2) NOT NULL,
  "region" char(2) NOT NULL,
  "city" text,
  "postal_code" varchar(16),
  "address" text,
  "facility_type" text,
  "latitude" numeric(9, 6),
  "longitude" numeric(9, 6),
  "source" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fulfillment_centers_country_check" CHECK ("country" IN ('US', 'CA'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_centers_country_region_idx"
  ON "fulfillment_centers" ("country", "region");
