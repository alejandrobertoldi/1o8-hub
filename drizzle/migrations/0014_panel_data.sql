-- Add panel_data JSONB column to aplus_module_images for per-panel text fields
ALTER TABLE "aplus_module_images" ADD COLUMN "panel_data" jsonb;
