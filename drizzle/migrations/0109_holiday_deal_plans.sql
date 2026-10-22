-- Q4 2026 holiday deal planning sheet (PBDD / Black Friday Week / Cyber Monday)
CREATE TABLE IF NOT EXISTS holiday_deal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code varchar(100) NOT NULL,
  product_id uuid REFERENCES master(id) ON DELETE SET NULL,
  asin varchar(20),
  sku varchar(100),
  item_name text,
  event varchar(32) NOT NULL,
  deal_type varchar(40),
  discount_percent numeric(6, 2),
  promo_price numeric(12, 2),
  start_date date,
  end_date date,
  ad_budget numeric(12, 2),
  estimated_units integer,
  inbound_method varchar(32) NOT NULL DEFAULT 'fba_optimized',
  submission_status varchar(32) NOT NULL DEFAULT 'not_started',
  inbound_status varchar(32) NOT NULL DEFAULT 'not_planned',
  submitted_at date,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holiday_deal_plans_client
  ON holiday_deal_plans (client_id_code);
CREATE INDEX IF NOT EXISTS idx_holiday_deal_plans_event
  ON holiday_deal_plans (event);
CREATE INDEX IF NOT EXISTS idx_holiday_deal_plans_status
  ON holiday_deal_plans (submission_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holiday_deal_plans_client_event_asin
  ON holiday_deal_plans (client_id_code, event, asin)
  WHERE asin IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_holiday_deal_plans_client_event_sku
  ON holiday_deal_plans (client_id_code, event, sku)
  WHERE asin IS NULL AND sku IS NOT NULL;
