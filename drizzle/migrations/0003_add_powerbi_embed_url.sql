-- Add Power BI embed URL column to aac_clients
ALTER TABLE aac_clients ADD COLUMN IF NOT EXISTS powerbi_embed_url TEXT;
