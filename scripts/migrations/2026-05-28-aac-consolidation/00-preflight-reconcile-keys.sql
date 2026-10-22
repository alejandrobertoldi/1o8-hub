-- Phase 1 preflight: reconcile decisions for keys that exist in BOTH
-- aac.raw_data AND AAC_master as a column.

\echo '=== AccountManager_1o8M (raw_data) vs AccountManager1_1o8M / AccountManager2_1o8M (AAC_master) ==='
SELECT
  a.client_id_code,
  (CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)
    ->>'AccountManager_1o8M' AS rd_value,
  m."AccountManager1_1o8M" AS master_am1,
  m."AccountManager2_1o8M" AS master_am2
FROM aac a
LEFT JOIN "AAC_master" m ON m."ClientIDCode" = a.client_id_code
WHERE (CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)
        ->>'AccountManager_1o8M' IS NOT NULL
  AND (CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)
        ->>'AccountManager_1o8M' <> '';

\echo '=== BillingEmail1 (raw_data) vs ClientBillingEmail1 (AAC_master) ==='
SELECT
  a.client_id_code,
  (CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)
    ->>'BillingEmail1' AS rd_value,
  m."ClientBillingEmail1" AS master_value,
  CASE
    WHEN COALESCE(m."ClientBillingEmail1", '') = '' THEN 'rd wins'
    WHEN COALESCE((CASE WHEN jsonb_typeof(a.raw_data)='string' THEN (a.raw_data#>>'{}')::jsonb ELSE a.raw_data END)->>'BillingEmail1','') = '' THEN 'master wins'
    WHEN (CASE WHEN jsonb_typeof(a.raw_data)='string' THEN (a.raw_data#>>'{}')::jsonb ELSE a.raw_data END)->>'BillingEmail1' = m."ClientBillingEmail1" THEN 'match'
    ELSE 'CONFLICT'
  END AS disposition
FROM aac a
LEFT JOIN "AAC_master" m ON m."ClientIDCode" = a.client_id_code
WHERE COALESCE(m."ClientBillingEmail1", '') <> ''
   OR COALESCE((CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)->>'BillingEmail1', '') <> '';

\echo '=== BillingEmail2 vs ClientBillingEmail2 ==='
SELECT
  a.client_id_code,
  (CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)
    ->>'BillingEmail2' AS rd_value,
  m."ClientBillingEmail2" AS master_value,
  CASE
    WHEN COALESCE(m."ClientBillingEmail2", '') = '' THEN 'rd wins'
    WHEN COALESCE((CASE WHEN jsonb_typeof(a.raw_data)='string' THEN (a.raw_data#>>'{}')::jsonb ELSE a.raw_data END)->>'BillingEmail2','') = '' THEN 'master wins'
    WHEN (CASE WHEN jsonb_typeof(a.raw_data)='string' THEN (a.raw_data#>>'{}')::jsonb ELSE a.raw_data END)->>'BillingEmail2' = m."ClientBillingEmail2" THEN 'match'
    ELSE 'CONFLICT'
  END AS disposition
FROM aac a
LEFT JOIN "AAC_master" m ON m."ClientIDCode" = a.client_id_code
WHERE COALESCE(m."ClientBillingEmail2", '') <> ''
   OR COALESCE((CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)->>'BillingEmail2', '') <> '';

\echo '=== BillingEmail3 vs ClientBillingEmail3 ==='
SELECT
  a.client_id_code,
  (CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)
    ->>'BillingEmail3' AS rd_value,
  m."ClientBillingEmail3" AS master_value,
  CASE
    WHEN COALESCE(m."ClientBillingEmail3", '') = '' THEN 'rd wins'
    WHEN COALESCE((CASE WHEN jsonb_typeof(a.raw_data)='string' THEN (a.raw_data#>>'{}')::jsonb ELSE a.raw_data END)->>'BillingEmail3','') = '' THEN 'master wins'
    WHEN (CASE WHEN jsonb_typeof(a.raw_data)='string' THEN (a.raw_data#>>'{}')::jsonb ELSE a.raw_data END)->>'BillingEmail3' = m."ClientBillingEmail3" THEN 'match'
    ELSE 'CONFLICT'
  END AS disposition
FROM aac a
LEFT JOIN "AAC_master" m ON m."ClientIDCode" = a.client_id_code
WHERE COALESCE(m."ClientBillingEmail3", '') <> ''
   OR COALESCE((CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END)->>'BillingEmail3', '') <> '';

\echo '=== Disposition rollup ==='
WITH parsed AS (
  SELECT a.client_id_code,
         CASE WHEN jsonb_typeof(a.raw_data) = 'string' THEN (a.raw_data #>> '{}')::jsonb ELSE a.raw_data END AS rd,
         m."ClientBillingEmail1" AS m1,
         m."ClientBillingEmail2" AS m2,
         m."ClientBillingEmail3" AS m3
  FROM aac a LEFT JOIN "AAC_master" m ON m."ClientIDCode" = a.client_id_code
),
flat AS (
  SELECT 'BillingEmail1' AS key,
         CASE
           WHEN COALESCE(m1,'')='' AND COALESCE(rd->>'BillingEmail1','')='' THEN 'both empty'
           WHEN COALESCE(m1,'')='' THEN 'rd wins'
           WHEN COALESCE(rd->>'BillingEmail1','')='' THEN 'master wins'
           WHEN rd->>'BillingEmail1' = m1 THEN 'match'
           ELSE 'CONFLICT'
         END AS disp
  FROM parsed
  UNION ALL
  SELECT 'BillingEmail2',
         CASE
           WHEN COALESCE(m2,'')='' AND COALESCE(rd->>'BillingEmail2','')='' THEN 'both empty'
           WHEN COALESCE(m2,'')='' THEN 'rd wins'
           WHEN COALESCE(rd->>'BillingEmail2','')='' THEN 'master wins'
           WHEN rd->>'BillingEmail2' = m2 THEN 'match'
           ELSE 'CONFLICT'
         END
  FROM parsed
  UNION ALL
  SELECT 'BillingEmail3',
         CASE
           WHEN COALESCE(m3,'')='' AND COALESCE(rd->>'BillingEmail3','')='' THEN 'both empty'
           WHEN COALESCE(m3,'')='' THEN 'rd wins'
           WHEN COALESCE(rd->>'BillingEmail3','')='' THEN 'master wins'
           WHEN rd->>'BillingEmail3' = m3 THEN 'match'
           ELSE 'CONFLICT'
         END
  FROM parsed
)
SELECT key, disp, count(*) AS n FROM flat GROUP BY key, disp ORDER BY key, disp;
