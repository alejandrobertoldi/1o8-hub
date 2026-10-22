-- Phase 1 preflight: find values that would FAIL to cast to date/numeric/enum.
-- Read-only. Lists bad values per column so we can decide whether to NULL them
-- out or clean them before Phase 1.

\echo '=== Date columns: rows where NULLIF(trim(col),'''') would fail ::date / ::timestamptz ==='
WITH candidates AS (
  SELECT "ClientIDCode" AS cid, 'OnboardingDate' AS col, "OnboardingDate" AS val FROM "AAC_master"
  UNION ALL SELECT "ClientIDCode", 'OffboardingDate', "OffboardingDate" FROM "AAC_master"
  UNION ALL SELECT "ClientIDCode", 'Promo1StartDate', "Promo1StartDate" FROM "AAC_master"
  UNION ALL SELECT "ClientIDCode", 'Promo1EndDate', "Promo1EndDate" FROM "AAC_master"
  UNION ALL SELECT "ClientIDCode", 'Promo2StartDate', "Promo2StartDate" FROM "AAC_master"
  UNION ALL SELECT "ClientIDCode", 'Promo2EndDate', "Promo2EndDate" FROM "AAC_master"
  UNION ALL SELECT "ClientIDCode", 'Promo3StartDate', "Promo3StartDate" FROM "AAC_master"
  UNION ALL SELECT "ClientIDCode", 'Promo3EndDate', "Promo3EndDate" FROM "AAC_master"
)
SELECT col, val, count(*) AS n
FROM candidates
WHERE NULLIF(trim(val), '') IS NOT NULL
  AND val !~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(.\d+)?(Z|[+-]\d{2}:\d{2})?)?$'
GROUP BY col, val
ORDER BY col, n DESC;

\echo ''
\echo '=== Numeric columns: rows where NULLIF(trim(col),'''') would fail ::numeric (with optional %) ==='
WITH numeric_candidates AS (
  SELECT "ClientIDCode" AS cid, column_name AS col, val
  FROM "AAC_master",
  LATERAL (
    VALUES
      ('ACOSGoal1D',  "ACOSGoal1D"),
      ('ACOSGoal1M',  "ACOSGoal1M"),
      ('ACOSGoal1W',  "ACOSGoal1W"),
      ('ACOSGoal1Y',  "ACOSGoal1Y"),
      ('ACOSGoal3M',  "ACOSGoal3M"),
      ('ACOSGoal6M',  "ACOSGoal6M"),
      ('ADSpendBudget1D',  "ADSpendBudget1D"),
      ('ADSpendBudget1M',  "ADSpendBudget1M"),
      ('ADSpendBudget1W',  "ADSpendBudget1W"),
      ('ADSpendBudget1Y',  "ADSpendBudget1Y"),
      ('ADSpendBudget3M',  "ADSpendBudget3M"),
      ('ADSpendBudget6M',  "ADSpendBudget6M"),
      ('PercentageOrgRevGoal1D',  "PercentageOrgRevGoal1D"),
      ('PercentageOrgRevGoal1M',  "PercentageOrgRevGoal1M"),
      ('PercentageOrgRevGoal1W',  "PercentageOrgRevGoal1W"),
      ('PercentageOrgRevGoal1Y',  "PercentageOrgRevGoal1Y"),
      ('PercentageOrgRevGoal3M',  "PercentageOrgRevGoal3M"),
      ('PercentageOrgRevGoal6M',  "PercentageOrgRevGoal6M"),
      ('ROASGoal1D',  "ROASGoal1D"),
      ('ROASGoal1M',  "ROASGoal1M"),
      ('ROASGoal1W',  "ROASGoal1W"),
      ('ROASGoal1Y',  "ROASGoal1Y"),
      ('ROASGoal3M',  "ROASGoal3M"),
      ('ROASGoal6M',  "ROASGoal6M"),
      ('SalesForecast1D',  "SalesForecast1D"),
      ('SalesForecast1M',  "SalesForecast1M"),
      ('SalesForecast1W',  "SalesForecast1W"),
      ('SalesForecast1Y',  "SalesForecast1Y"),
      ('SalesForecast3M',  "SalesForecast3M"),
      ('SalesForecast6M',  "SalesForecast6M"),
      ('TACOSGoal1D',  "TACOSGoal1D"),
      ('TACOSGoal1M',  "TACOSGoal1M"),
      ('TACOSGoal1W',  "TACOSGoal1W"),
      ('TACOSGoal1Y',  "TACOSGoal1Y"),
      ('TACOSGoal3M',  "TACOSGoal3M"),
      ('TACOSGoal6M',  "TACOSGoal6M")
  ) AS t(column_name, val)
)
SELECT col, val, count(*) AS n
FROM numeric_candidates
WHERE NULLIF(trim(val), '') IS NOT NULL
  AND val !~ '^-?\d+(\.\d+)?%?$'
GROUP BY col, val
ORDER BY col, n DESC;

\echo ''
\echo '=== ClientType: values that would fail ::client_type enum cast ==='
SELECT "ClientType", count(*) FROM "AAC_master"
WHERE "ClientType" IS NOT NULL
  AND trim("ClientType") <> ''
  AND "ClientType" NOT IN (SELECT unnest(enum_range(NULL::client_type))::text)
GROUP BY "ClientType"
ORDER BY count(*) DESC;

\echo ''
\echo '=== Summary: total rows per table ==='
SELECT (SELECT count(*) FROM "AAC_master") AS aac_master_total_rows;
