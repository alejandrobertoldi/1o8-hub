/**
 * Env-driven BigQuery dataset/table references for the NON-core datasets
 * (BibleApp, MAAC, MSEO).
 *
 * The core publish/AAC/SEO path lives in `bigquery.ts` and is already env-driven
 * via GCP_PROJECT_ID / BQ_DATASET / BQ_TABLE. These three datasets were the
 * leftover hardcoded literals (sub-project #1b of the 1o8 Hub migration).
 *
 * Every reference resolves from `process.env` at CALL TIME and defaults to the
 * mfhub-501815 values (post-migration 2026-07), so behavior is unchanged
 * until the corresponding env vars are set to point elsewhere.
 *
 * Helpers return RAW fully-qualified names WITHOUT backticks. Callers wrap the
 * reference once in SQL, e.g. `` FROM \`${maacAacTable()}\` ``.
 */

const DEFAULT_PROJECT = "mfhub-501815";

/** Read an env var, treating "" / undefined as "use the default". */
function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v : fallback;
}

// ── BibleApp (BQ → Supabase sync in sync-tables.ts) ──────────────────────
export function bibleAppProjectId(): string {
  return env("BQ_BIBLEAPP_PROJECT_ID", DEFAULT_PROJECT);
}
export function bibleAppDataset(): string {
  return env("BQ_BIBLEAPP_DATASET", "MFBibleApp");
}
export function bibleAppLocation(): string {
  return env("BQ_BIBLEAPP_LOCATION", "us-west1");
}
export function bibleAppTable(table: string): string {
  return `${bibleAppProjectId()}.${bibleAppDataset()}.${table}`;
}

// ── MSEO OUT_PA+ (A+ import/asins routes) ────────────────────────────────
export function seoProjectId(): string {
  return env("BQ_SEO_PROJECT_ID", DEFAULT_PROJECT);
}
export function seoDataset(): string {
  return env("BQ_SEO_DATASET", "MFSEO");
}
export function seoOutPaPlusTableName(): string {
  return env("BQ_SEO_OUTPAPLUS_TABLE", "OUT_PA+");
}
export function seoOutPaPlusTable(): string {
  return `${seoProjectId()}.${seoDataset()}.${seoOutPaPlusTableName()}`;
}

// ── MAAC AAC (reports overview / advertising-audit / debug columns) ──────
export function maacProjectId(): string {
  return env("BQ_MAAC_PROJECT_ID", DEFAULT_PROJECT);
}
export function maacDataset(): string {
  return env("BQ_MAAC_DATASET", "MFAAC");
}
export function maacTableName(): string {
  return env("BQ_MAAC_TABLE", "1o8MAAC_AAC");
}
export function maacAacTable(): string {
  return `${maacProjectId()}.${maacDataset()}.${maacTableName()}`;
}
