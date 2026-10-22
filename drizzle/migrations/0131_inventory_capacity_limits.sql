-- 0131: FBA capacity limits typed in by the team from Seller Central's Capacity
-- Monitor (Amazon exposes them nowhere we can read). One row per client, storage
-- type and month. Additive only.
CREATE TABLE IF NOT EXISTS "inventory_capacity_limits" (
  "client_id_code" varchar(50) NOT NULL,
  "storage_type" text NOT NULL,
  "month" text NOT NULL,
  "limit_ft3" double precision NOT NULL,
  "set_by" varchar(255) NOT NULL,
  "set_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_capacity_limits_pk" PRIMARY KEY ("client_id_code", "storage_type", "month"),
  CONSTRAINT "inventory_capacity_limits_month_chk" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "inventory_capacity_limits_ft3_chk" CHECK ("limit_ft3" >= 0 AND "limit_ft3" <= 100000000)
);
