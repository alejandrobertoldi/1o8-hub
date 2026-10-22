-- Add SKU and variation attributes to forecast_tool_asins
ALTER TABLE "forecast_tool_asins" ADD COLUMN IF NOT EXISTS "sku" varchar(100);
ALTER TABLE "forecast_tool_asins" ADD COLUMN IF NOT EXISTS "variation_attributes" jsonb;
