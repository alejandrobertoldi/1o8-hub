# MFHub Google Cloud Migration — Design / Spec

**Date:** 2026-07-09
**Status:** In progress. Decomposed into 3 sub-projects; #1 (app identity + core BQ re-point) is active.
**Context:** 1o8 is being DISCONTINUED. All Google infra (OAuth, BigQuery, Drive) moves from the 1o8.agency
Google side to a new MarketFoundry Google Cloud. This supersedes the old "keep 1o8 infra verbatim" decision.

## Current-state facts (verified this session)

- Live 1o8Hub deploys from `origin/main` (repo `1o8-Marketplace/1o8Hub`). Old GCP project = `amazon-data-461918`.
- New MF GCP project = **`mfhub-501815`** (label "MFHub"), **currently in BigQuery Sandbox mode** (billing NOT enabled).
- BigQuery data lake `amazon-data-461918` is SHARED: ~16 datasets, fed by EXTERNAL producers (n8n, scrapers,
  a daily-updated `1o8MInventory` = 337k rows/177MB). Copying datasets = one-time snapshot; producers still
  write to the old project, so MF copies go stale until producers are re-pointed (that's sub-project #2).
- Mixed regions: most datasets `us-west1`; `amazon_master_data` + `s` are `US` (cross-region copy needs Transfer Service).
- User has already COPIED+RENAMED datasets into `mfhub-501815` with an "MF" prefix:
  `1o8Hub`→`MFHub`, `1o8BibleApp`→`MFBibleApp`, `1o8MAAC`→`MFMAAC`, `1o8MSEO`→`MFMSEO`, etc.
  `MFHub` dataset kept inner table names: `AAC, Attributes, Master, Master_Staging`.
- Supabase storefront migrations 0078–0082 are ALREADY applied to prod (verified by probe). Nothing to run.
- `mfhub-staging` branch pushed to origin @ `72d13bc6` (does NOT touch origin/main; live 1o8Hub safe).
- Vercel project "mfhub" (org Market Foundry, Pro) git-connected to this repo; domain mfhub.vercel.app.

## Decomposition

1. **App Google identity + core BQ re-point** (ACTIVE, this spec's focus) — new OAuth client, new service
   account, Drive, and point core BigQuery at `mfhub-501815.MFHub`. Gets mfhub.vercel.app working.
2. **BigQuery data-lake migration** (LATER) — re-point external producers (n8n, scrapers, Intentwise/Redshift)
   from `amazon-data-461918` to `mfhub-501815`, recreate views, region-aware backfill. Gated on a full
   producer inventory (the app's service account lacks `bigquery.jobs.list`, so needs broader GCP/IAM access).
3. **Decommission 1o8** (LATER) — only after 1+2 verified in parallel run.

## Sub-project #1 scope (NARROWED per user: only tables MFHub needs to work)

MFHub core = `mfhub-501815.MFHub` dataset (Master/AAC/Attributes/Master_Staging). 1o8Hub keeps its data in
`amazon-data-461918.1o8Hub`. Everything else ("fix the rest later").

### The core path needs NO CODE CHANGE — it is fully env-driven
`src/lib/bigquery.ts:32-37` builds target as `${GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE}`.

**Vercel env (mfhub project) — user sets:**
| Var | Value |
|---|---|
| `GCP_PROJECT_ID` | `mfhub-501815` |
| `BQ_DATASET` | `MFHub` (NOTE: code default is wrongly `MarketFoundryHub` — env must be explicit) |
| `BQ_TABLE` | `Master` |
| `GCP_CLIENT_EMAIL` / `GCP_PRIVATE_KEY` | NEW MF service account (BigQuery Data Editor + Job User on mfhub-501815) |
| `NEXTAUTH_URL` / `AUTH_URL` | `https://mfhub.vercel.app` |
| `AUTH_TRUST_HOST` | `true` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | new MF OAuth client (or reuse; add redirect URI either way) |
| `GOOGLE_SHARED_DRIVE_ID` / `GOOGLE_DRIVE_FOLDER_ID` | MF Drive (Drive migration = separate task) |

**Non-code steps (user only — Claude cannot do these):**
- Enable BILLING on `mfhub-501815` (sandbox tables expire in 60 days + limited load jobs).
- Google OAuth: add Authorized redirect URI `https://mfhub.vercel.app/api/auth/callback/google`.
- Vercel: Production Branch = `mfhub-staging`; add env vars above; redeploy.

### Consequences accepted as "fix later" (out of scope now)
Setting `GCP_PROJECT_ID=mfhub-501815` makes env-driven routes follow, but hardcoded literals do not:
- `src/lib/sync-tables.ts:71,166` + `src/app/admin/sync/page.tsx:52,59` — `1o8BibleApp.*` → will hit
  `mfhub-501815.1o8BibleApp` (doesn't exist; it's `MFBibleApp`) → **BibleApp sync breaks on MFHub**.
- `src/app/api/aplus/asins/route.ts:11-12`, `aplus/import/route.ts:20-21` — hardcode
  `amazon-data-461918.1o8MSEO.\`OUT_PA+\`` → keep reading OLD project (still works until 1o8 dies).
- `src/app/api/reports/advertising-audit/route.ts:70`, `reports/overview/route.ts:142`,
  `api/debug/bigquery-aac-columns/route.ts:8` — hardcode `amazon-data-461918.1o8MAAC.1o8MAAC_AAC` → OLD project.

### The "fix later" code task (sub-project #1b, do in fresh session)
Rewrite the 5-6 files above to use env-driven project + MF-prefixed dataset names, and verify each target
table/view exists in `mfhub-501815` (views don't copy as data — must be recreated with rewritten SQL).
MUST first confirm inner table names inside MFMAAC/MFMSEO (were they kept as `1o8MAAC_AAC`/`OUT_PA+` or
renamed with MF prefix?).

## Verification method
Once new SA creds + billing exist, probe `mfhub-501815.MFHub.Master` — expect **1157 rows** (matches old
`1o8Hub.Master`). Pattern: temp tsx script using `@google-cloud/bigquery` with GCP_* env, run via `npx tsx`,
then delete. (Same pattern used to probe Supabase + inventory BQ this session.)

## Hard rules
Never push without explicit OK. DEV DB = PROD Supabase (additive only). PORT=3000. Stage explicit files,
never `git add .`. `rm -rf` hook-blocked (use `find … -delete`). Commit trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
