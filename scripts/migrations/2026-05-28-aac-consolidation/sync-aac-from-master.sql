-- =============================================================================
-- One-shot sync: AAC_master -> aac
-- =============================================================================
-- Strategy change (2026-05-28): abandoned the rename/swap path. App stays
-- linked to `aac` permanently. This script makes `aac` a fresh mirror of
-- `AAC_master` so it can be safely dropped after this runs.
--
-- WHAT THIS DOES
--   - Upserts all 71 AAC_master rows into aac, keyed on client_id_code.
--   - Populates the 8 typed cols (client_id_code, client_status, client_name,
--     client_type, onboarding_date, offboarding_date, powerbi_embed_url,
--     client_logo_url) from AAC_master.
--   - Stashes every remaining AAC_master column (the rich 122 PascalCase cols)
--     into aac.raw_data as a jsonb object, so dropping AAC_master loses
--     nothing.
--   - Preserves any existing aac.raw_data keys that AAC_master doesn't
--     supply (e.g. BrandName, AINotetakerApproval, ClientBibleID, etc).
--     Merge rule: existing_raw_data || master_derived_json — master wins on
--     overlapping keys (BillingEmail1/2/3, AccountManager_1o8M); existing
--     wins on keys master doesn't have.
--   - Forces DAR_SC_US.client_type = 'AIA' per user instruction.
--
-- SAFETY
--   - Single BEGIN/COMMIT transaction.
--   - ON_ERROR_STOP=1.
--   - Preflight confirmed: 0 invalid ClientType enum values; 7 OnboardingDate
--     rows with "+00:00" suffix (handled natively by ::timestamptz).
--   - aac has a UNIQUE constraint on client_id_code so ON CONFLICT is valid.
--
-- RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/migrations/2026-05-28-aac-consolidation/sync-aac-from-master.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO aac (
  client_id_code,
  client_status,
  client_name,
  client_type,
  onboarding_date,
  offboarding_date,
  powerbi_embed_url,
  client_logo_url,
  raw_data,
  updated_at
)
SELECT
  m."ClientIDCode",
  m."ClientStatus",
  m."ClientName",
  CASE
    WHEN m."ClientIDCode" = 'DAR_SC_US' THEN 'AIA'::client_type
    ELSE NULLIF(trim(m."ClientType"), '')::client_type
  END                                                                   AS client_type,
  NULLIF(trim(m."OnboardingDate"), '')::timestamptz                     AS onboarding_date,
  NULLIF(trim(m."OffboardingDate"), '')::timestamptz                    AS offboarding_date,
  NULLIF(trim(m."PowerBIEmbedURL"), '')                                 AS powerbi_embed_url,
  NULLIF(trim(m."ClientLogoUrl"), '')                                   AS client_logo_url,
  -- Stash every AAC_master col into raw_data, minus the 8 already-typed cols.
  -- The remaining ~122 keys are the rich PascalCase content (goals, contacts,
  -- billing, competitors, promos, team, etc) that the app will read via
  -- raw_data ->> 'Key' (the same shape the 2 existing raw_data consumers use).
  ( to_jsonb(m.*)
      - 'ClientIDCode' - 'ClientStatus' - 'ClientName' - 'ClientType'
      - 'OnboardingDate' - 'OffboardingDate'
      - 'PowerBIEmbedURL' - 'ClientLogoUrl'
  )                                                                     AS raw_data,
  now()                                                                 AS updated_at
FROM "AAC_master" m
ON CONFLICT (client_id_code) DO UPDATE SET
  client_status     = EXCLUDED.client_status,
  client_name       = EXCLUDED.client_name,
  client_type       = EXCLUDED.client_type,
  onboarding_date   = EXCLUDED.onboarding_date,
  offboarding_date  = EXCLUDED.offboarding_date,
  powerbi_embed_url = EXCLUDED.powerbi_embed_url,
  client_logo_url   = EXCLUDED.client_logo_url,
  -- Merge existing raw_data with the new master-derived object.
  -- Existing raw_data may be double-encoded (jsonb_typeof = 'string'), so
  -- unwrap that first. Then master wins on overlapping keys.
  raw_data          = COALESCE(
                        CASE
                          WHEN jsonb_typeof(aac.raw_data) = 'string'
                            THEN (aac.raw_data #>> '{}')::jsonb
                          ELSE aac.raw_data
                        END,
                        '{}'::jsonb
                      ) || EXCLUDED.raw_data,
  updated_at        = now();

COMMIT;

-- =============================================================================
-- Verification (read-only, outside the transaction)
-- =============================================================================
\echo
\echo '====================================================================='
\echo ' Sync verification'
\echo '====================================================================='

\echo
\echo '-- Row count (expect 71) --------------------------------------------'
SELECT count(*) AS total_rows FROM aac;

\echo
\echo '-- DAR_SC_US present with client_type = AIA -------------------------'
SELECT
  client_id_code,
  client_name,
  client_status,
  client_type,
  onboarding_date,
  (raw_data IS NOT NULL)                              AS has_raw_data,
  (SELECT count(*) FROM jsonb_object_keys(raw_data))  AS raw_keys_count
FROM aac
WHERE client_id_code = 'DAR_SC_US';

\echo
\echo '-- Raw data coverage ------------------------------------------------'
SELECT
  count(*)                                            AS total,
  count(*) FILTER (WHERE raw_data IS NOT NULL)        AS with_raw_data,
  count(*) FILTER (WHERE client_type IS NOT NULL)     AS with_client_type,
  count(*) FILTER (WHERE onboarding_date IS NOT NULL) AS with_onboarding_date
FROM aac;

\echo
\echo '-- Spot-check the previously-bad sales_forecast values (as text in raw_data) ---'
\echo '   (Should appear as "1,333" / "40,000" / "10,000" — comma format preserved)'
SELECT client_id_code,
       raw_data->>'SalesForecast1D' AS sf_1d,
       raw_data->>'SalesForecast1W' AS sf_1w,
       raw_data->>'SalesForecast1M' AS sf_1m
FROM aac
WHERE raw_data->>'SalesForecast1D' IS NOT NULL
   OR raw_data->>'SalesForecast1W' IS NOT NULL
   OR raw_data->>'SalesForecast1M' IS NOT NULL
ORDER BY client_id_code
LIMIT 10;

\echo
\echo '-- Merge verification: BrandName should still be present in raw_data ---'
\echo '   (BrandName came from old aac.raw_data, not from AAC_master)'
SELECT client_id_code, raw_data->>'BrandName' AS brand_name
FROM aac
WHERE raw_data->>'BrandName' IS NOT NULL
ORDER BY client_id_code
LIMIT 5;

\echo
\echo '====================================================================='
\echo ' If everything looks right, you can DROP TABLE "AAC_master"; manually.'
\echo '====================================================================='
