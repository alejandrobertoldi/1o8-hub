-- 0135: 1o8 org chart as seats (supports open positions). Additive only.
CREATE TABLE IF NOT EXISTS "org_positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(120) NOT NULL,
  "area" varchar(40),
  "parent_id" uuid REFERENCES "org_positions"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_org_positions_parent" ON "org_positions" ("parent_id");
