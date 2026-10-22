-- drizzle/migrations/0061_hub_features.sql
-- Public platform status tracker — stores feature list with status,
-- progress %, domain tag, and display order.

BEGIN;

CREATE TYPE "public"."hub_feature_status" AS ENUM ('done', 'in_progress', 'planned');

CREATE TABLE "hub_features" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  description text NOT NULL,
  status "hub_feature_status" NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  domain varchar(50) NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hub_features_status ON hub_features(status);
CREATE INDEX idx_hub_features_domain ON hub_features(domain);

COMMIT;
