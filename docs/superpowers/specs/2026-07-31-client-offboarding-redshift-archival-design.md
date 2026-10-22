# Client Offboarding — Redshift Data Archival

**Date:** 2026-07-31
**Status:** Design approved, pending implementation plan
**Author:** Manu + Claude (brainstorming session)

---

## 1. Purpose

When a client relationship ends we disconnect their Intentwise account, and with it our
access to every Redshift table holding their historical Amazon data. This project captures
that data into BigQuery before the disconnect so it stays usable afterwards — primarily for
case studies and cross-client benchmarking.

**The archive is internal.** It is not a client deliverable and not a data-portability
handover. BigQuery is the system of record; the Drive `_Offboarding` folder holds
human-facing evidence and extracts.

### In scope

- Nightly incremental archival of all Redshift tables carrying an `account_id`, for every
  active client — not only departing ones.
- A one-off historical backfill.
- A pre-disconnect verification gate that produces a recorded PASS/FAIL verdict.
- A `{clientIdCode}_Offboarding` Drive folder containing the verification evidence and
  report-shaped XLSX extracts.

### Out of scope

A complete client offboarding would also capture Postgres application data, Drive files,
SP-API credentials, and the BigQuery `Master` rows. **This project is Redshift only.** Those
are separate projects, deliberately excluded rather than overlooked.

Also excluded: a second physical copy as GCS Parquet (addable later with one `EXTRACT` job),
a client-facing handover pack, and migrating existing `report-clients.ts` consumers to the
new database table.

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Who the archive serves | Us, internally | Case studies and benchmarks; queryability is the point |
| Table scope | Every table in **both** Redshift schemas with an `account_id` column, discovered at runtime | A hand-maintained list was already wrong before implementation began (see §3.1) |
| Destination | BigQuery native tables, dataset `mfhub-501815.intentwise_archive` | A case study becomes a `SELECT`; existing load pattern; storage cost negligible |
| Re-pull window | Rolling **14 days**, per-table override | Matches Intentwise's own documented refresh window exactly (§3.3) |
| Deep re-pull | Monthly, last 90 days | Insurance against undocumented upstream change |
| Nightly verification | Row-count parity + per-partition checksum | Cheap, continuous |
| Offboarding gate | Cold full re-pull, diffed against the incremental archive | A gate that reuses the archive's own code path passes when both are wrong |
| Drive folder contents | Verification evidence + report-shaped XLSX extracts | The person writing a case study in 2027 wants a spreadsheet, not `bq query` |
| Backfill runtime | `scripts/` job, run outside Vercel | Vercel's 300s ceiling cannot hold a full-history load |
| Nightly runtime | Vercel cron + work queue | Fits the ceiling; makes "did last night complete?" a query |

---

## 3. Constraints and findings

Each item below is evidence-backed. They are the reason the design looks the way it does.

### 3.1 The table list spans two schemas, not one

Code already reads at least 15 tables across two Redshift schemas
([ppc-queries.ts:11-12](../../../src/lib/ppc-queries.ts#L11-L12) and the report routes):

| Schema | Tables referenced in current code |
|---|---|
| `intentwise_ecommerce_graph` | `account_summary`, `campaign_summary`, `keyword_summary`, `searchterm_summary`, `advertised_product_summary`, `product_summary` |
| `amazon_source_data` | `brandanalytics_searchqueryperformance_report`, `share_of_voice`, `sellercentral_alllistings_report`, `sellercentral_fbamanageinventory_report`, `sellercentral_fbamanageinventoryhealth_report`, `sellercentral_fbareservedinventory_report`, `sellercentral_restockinventory_report`, `replenishment_offer_metrics`, `catalog_item_images` |

The second schema was missed on a first read of the codebase during design. That is the
argument for runtime discovery: a curated list is wrong before it ships. Both schemas use
the same `account_id` filter key, so one discovery rule covers everything.

This list is **illustrative, not authoritative**. The authoritative list is whatever Phase 0
discovers.

### 3.2 `queryRedshift` swallows errors — the archive must not use it

[redshift.ts:81](../../../src/lib/redshift.ts#L81) returns `[]` after two failed attempts.
For dashboards that degrades gracefully. For archival it is catastrophic: an empty array is
indistinguishable from "this client legitimately had no data," so a Redshift outage would
mark every work unit successful with zero rows and the verification gate would pass on an
empty archive.

**The archive path uses a new throwing variant, `queryRedshiftOrThrow`.** Existing callers of
`queryRedshift` are left untouched.

### 3.3 Upstream refresh schedule and windows

From Intentwise's documentation
([Sponsored Ads](https://docs.intentwise.com/iac-source-data/data-models/amazon-source-data/sponsored-ads.md),
[Seller Central](https://docs.intentwise.com/iac-source-data/data-models/amazon-source-data/seller-central)):

- **Refresh window:** all tables update between **7:30 AM and 10:30 AM PST daily** — 18:30 UTC
  in winter, 17:30 UTC in summer.
- **Restatement (re-pull) window:** all Sponsored Ads reports = **14 days**. Seller Central
  Business and Order Reports = 10 days. Settlement = every 2 days. Beyond its window, source
  data cannot change, because nothing upstream is touching it.
- **Historical depth:** Sponsored Ads "60 days when first connecting an account as a data
  source." Seller Central varies: Sales/Traffic 24 months, most Business Reports 1 month,
  Order Reports 18 months, **other reports 1 day**.

The 14-day re-pull window therefore covers every documented upstream window with headroom.
The nightly job must run **after 18:30 UTC**, not before.

### 3.4 Read-only guest on Intentwise's cluster

No `UNLOAD`, no `CREATE TABLE`, no server-side export. Every row crosses the wire through
`pg`, paginated. This makes the Vercel function ceiling the binding runtime constraint.

### 3.5 Vercel caps functions at 300 seconds

[ppc-snapshot](../../../src/app/api/cron/ppc-snapshot/route.ts) already sits at that ceiling
with 3 queries per client. Roughly 15 tables × 17 clients ≈ 255 work units per night cannot
fit one invocation, hence the queue in §6.

### 3.6 Dynamic SQL is an injection surface

This codebase has been bitten before (`reports-overview`, fixed in PR #11), and
[forecast-redshift.ts:148](../../../src/lib/forecast-redshift.ts#L148) still interpolates
`account_id` directly. Since the archive builds SQL from discovered table names, §10 makes
the rules explicit.

---

## 4. Prerequisite — the Intentwise account ID becomes real data

Today Intentwise account IDs live in a hardcoded 17-entry array keyed by client *display
name* ([report-clients.ts:6-24](../../../src/lib/report-clients.ts#L6-L24)) — not by
`client_id_code`, and nowhere in the database. Nothing in this project can run until that is
addressed.

New Postgres table:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `client_id_code` | varchar(100) | matches `aac.client_id_code`; no FK, per the existing `drive_folders` pattern |
| `account_id` | varchar(50) | the Intentwise account ID used as the Redshift filter |
| `label` | text | e.g. "Seller Central", "Whole Foods" |
| `is_active` | boolean | false once disconnected; archival skips inactive accounts |
| `added_at`, `updated_at` | timestamptz | |

Unique on `(client_id_code, account_id)`, indexed on `client_id_code` and `is_active`.

A table rather than a column on `aac` because the relationship is genuinely 1:N — Cloud23
holds two accounts (`2348430`, `2557190`) — and each needs an independent active flag.

Seeded from `REPORT_CLIENTS` by a one-off script, reconciled against Intentwise's own account
list. **The hardcoded array stays in place** and continues serving its current UI consumers;
migrating them is a separate refactor.

---

## 5. Phase 0 — catalog profiling

A one-off script, `npm run profile-redshift`, re-run nightly thereafter. It walks
`svv_columns` across both schemas, selects every table having an `account_id` column, and for
each records its column list and types, its date column if any, and per-`account_id` row
counts with min/max dates.

Output persists to a new `redshift_archive_catalog` table:

| column | purpose |
|---|---|
| `schema_name`, `table_name` | identity; doubles as the SQL identifier allowlist |
| `table_kind` | `timeseries` \| `snapshot` \| `period` — selects the load strategy |
| `date_column` | partition key; null for snapshots |
| `source_refresh_window_days` | from documentation (§3.3): 14 ads / 10 business-order / 2 settlement |
| `repull_window_days` | effective window; defaults to 14 |
| `retention_days` | **measured**, never read from documentation |
| `enabled` | human-set; nothing is archived until flipped on |
| `est_rows`, `est_bytes` | the cost number, known before committing |
| `columns` | jsonb: source column names and types, for drift detection |
| `first_seen_at`, `last_profiled_at`, `notes` | drift audit trail |

### 5.1 Phase 0 is a decision point, not just setup

Intentwise's documented "1 day" and "60 days" historical depths are ambiguous between two
readings:

- **Backfill depth at connect time**, with the warehouse accumulating afterwards. This is the
  likelier reading — `/reports/monthly` and period-comparative routes query ads data across
  many months and work today, which they could not if only 60 days existed.
- **Rolling retention.** Under this reading every day without this system running loses client
  data permanently, for all active clients, and the project's priority changes from
  offboarding preparation to stopping active loss.

**This is resolved empirically, not from documentation.** `MIN(date_col)` per table per
`account_id` settles it: a minimum of yesterday means rolling retention; a minimum reaching
back years means accumulation. Phase 0 must be run and reviewed before the rest of the
sequencing is fixed.

### 5.2 Table kinds

Classification is set from profiling data, not guessed:

- **`timeseries`** — has a date column, values restate within the refresh window. Loaded by
  delete-and-replace over the window's partitions.
- **`snapshot`** — no date column; Redshift overwrites in place. Appended nightly with an
  `_archived_at` stamp. **For these tables the archive is the only history that will ever
  exist**, and a missed night is unrecoverable.
- **`period`** — keyed to a week or month, restated on its own cadence. Loaded like
  `timeseries`, windowed on whole periods.

A table Phase 0 discovers with `enabled = false` is reported as a loud alarm in the
verification output, never a silent skip. That is the mechanism preventing "we forgot a
table" from being discoverable only after the data is gone.

---

## 6. Archive layer — BigQuery

Dataset `mfhub-501815.intentwise_archive`. One table per source table, named
`{schema}__{table}` (e.g. `intentwise_ecommerce_graph__keyword_summary`), partitioned DAY on
the source date column, clustered on `account_id`, with one added column
`_archived_at TIMESTAMP`. `snapshot` tables partition on `_archived_at` instead.

Loading reuses the established NDJSON `createWriteStream` pattern from
[bigquery.ts:184](../../../src/lib/bigquery.ts#L184). Each work unit:

1. Streams its Redshift rows into a staging table `_stg_{table}` with `WRITE_TRUNCATE`.
2. Inside a BigQuery multi-statement transaction, deletes the target's
   `(account_id, date-range)` slice and inserts from staging.

So a crashed unit never leaves half-written data, and reruns are idempotent. `snapshot` units
append instead of replacing, keyed on the run's `_archived_at` date.

**Schema drift policy:** a new source column is admitted via `ALLOW_FIELD_ADDITION`; a dropped
source column is retained in BigQuery and nulled going forward; **a type change blocks that
table and alerts.** Silently coercing a type is how an archive becomes subtly wrong.

Redshift-to-BigQuery type mapping is an explicit table in code; unmapped types fall back to
`STRING` and are flagged in the catalog `notes`.

---

## 7. Jobs

### 7.1 Nightly

- **Enqueuer cron** — daily at **20:00 UTC** (≈90 minutes after the latest possible upstream
  refresh completion, §3.3). Inserts one row per work unit into `redshift_archive_runs`.
- **Drainer cron** — every 15 minutes. Claims pending units and works until a ~250s budget
  expires, then exits. Unfinished units wait for the next drain.

`redshift_archive_runs` columns: `id`, `run_date`, `run_kind`
(`nightly` | `monthly` | `backfill` | `verify`), `schema_name`, `table_name`, `account_id`,
`window_from`, `window_to`, `status` (`pending` | `running` | `done` | `failed`), `rows_read`,
`rows_written`, `attempts`, `error`, `claimed_at`, `started_at`, `finished_at`. Indexed on
`(status, run_date)` and `(run_date, schema_name, table_name, account_id)`.

The queue is not incidental. It is what makes *"did last night fully complete?"* a query
instead of a guess, and the verification gate depends on that answer.

### 7.2 Monthly deep re-pull

Same queue, `run_kind = 'monthly'`, `window = 90 days`, enqueued on the 1st. A mis-set 14-day
window degrades to "corrected within 30 days" rather than "permanently wrong."

### 7.3 Backfill

`npm run backfill-redshift-archive -- --client=<clientIdCode> [--table=schema.table]`, run outside
Vercel. Enqueues `run_kind = 'backfill'` units covering each table's full measured history and
drains them in-process with no time budget. Resumable: re-running skips units already `done`.

---

## 8. Verification

### 8.1 Nightly health

Per `(table, account_id)` across the re-pull window: row-count parity between Redshift and
BigQuery, plus an aggregate checksum per date partition. Results land in
`redshift_archive_checks` and surface on the existing `/admin/observability` page.

Row-count parity is the primary check and handles empty windows correctly on its own: if
Redshift reports 500 rows and BigQuery holds 0, the unit fails; if both report 0 — a client who
paused spend for a fortnight — it passes.

A second check catches the §3.2 failure mode that parity cannot see: a `(table, account_id)`
pair whose catalog row count is non-zero but which has **no rows at all** in the archive is a
**hard failure**, since it means every unit for that pair has silently produced nothing.

### 8.2 Offboarding gate

`npm run offboard-verify -- --client=<clientIdCode>`:

1. **Cold full re-pull** of the client's entire available history into
   `intentwise_archive_verify.{run_id}__{table}`.
2. **Diff** against the main archive: row counts, per-partition checksums, date coverage.
3. **Coverage check** — any `account_id`-bearing table not `enabled` is a hard fail.
4. **Continuity audit** (§8.3).
5. **Emit evidence** (§9) and write a PASS/FAIL verdict to a new `client_offboarding` table:
   `client_id_code`, `verdict`, `run_id`, `verified_at`, `verified_by`, `report_drive_file_id`,
   `findings` jsonb.

Step 1 exists because a gate that verifies the incremental archive using the incremental
archive's own code path will pass when both are wrong the same way. The cold re-pull is paid
once per client, at the one moment when being wrong is unrecoverable.

### 8.3 Continuity audit — for short-retention tables

The cold re-pull cannot verify a table whose source retention is shorter than the client
relationship; you cannot diff a five-year archive against a source holding one day.

For any table where measured `retention_days` is shorter than the relationship span, the gate
instead audits **our own archive** for gaps in daily `_archived_at` coverage since capture
began. A missing night in a 1-day-retention table is unrecoverable, so the gate reports it as
a permanent, documented hole rather than pretending it can be filled. Long-retention tables
still get the full cold re-pull.

### 8.4 The gate is procedural, not technical

The disconnection itself happens in Intentwise's UI, so this system cannot block it. The gate
is a recorded verdict plus a warning banner on the client detail page: it makes
disconnecting-before-verifying a visible, attributable choice rather than an accident. A hard
technical block would require making the Intentwise seat cancellation a two-person step, which
is a process change, not code.

---

## 9. Drive artifacts

A new `offboarding` folder type is registered in `folderTreeConfig`. The folder
`{clientIdCode}_Offboarding` is created under the client root **at offboarding time**, not at
onboarding — it is transient — and recorded in `drive_folders` following the existing
[create-drive-folders.ts](../../../src/lib/onboarding/create-drive-folders.ts) pattern.

Contents:

- `{clientIdCode}_Offboarding_Verification_{YYYY-MM-DD}.pdf` — the gate evidence: tables
  archived, count parity, date coverage, checksum results, cold re-pull diff, continuity
  findings, verdict, timestamp, operator.
- XLSX extracts generated **from the archive** via the existing
  [report-xlsx.ts](../../../src/lib/report-xlsx.ts) path: monthly report, advertising audit,
  share-of-voice, product performance.
- `manifest.json` — table list, row counts, date ranges, BigQuery table names, run ID.

Uploaded with `driveClient.uploadFile` and tracked in `drive_files`.

---

## 10. Security

- **Identifier allowlist.** Schema and table names in dynamic SQL are validated against
  `redshift_archive_catalog` before use. An identifier not present in the catalog is rejected,
  never interpolated.
- **Bound parameters.** `account_id` and all date bounds are always bound parameters. The
  interpolation at [forecast-redshift.ts:148](../../../src/lib/forecast-redshift.ts#L148) is
  the pattern not to copy.
- **Cron auth.** `CRON_SECRET` bearer token, matching the existing cron convention.
- **Dataset access.** `intentwise_archive` and `intentwise_archive_verify` are internal-only;
  no client-role or portal exposure.

---

## 11. Error handling

- Redshift reads use `queryRedshiftOrThrow` (§3.2). Errors propagate; they are never swallowed.
- Failures are **per unit**. A unit records `status = 'failed'` with its error text and is
  retried on the next drain, escalating to an alert after 3 attempts. One failing client or
  table never blocks the rest.
- Partial loads are impossible by construction: staging plus a transactional swap (§6).
- Zero-row results are distinguished from failures by the `est_rows` comparison in §8.1.
- BigQuery type-change conflicts block the affected table and alert, rather than coercing.

---

## 12. Testing

Vitest unit tests, `pg` and the BigQuery client mocked. No live cluster in tests.

- Catalog classification — a table with a date column becomes `timeseries`; without one,
  `snapshot`.
- Redshift-to-BigQuery type mapping, including the unmapped-type fallback.
- Window computation — nightly 14-day, per-table override, monthly 90-day, backfill full-history.
- SQL builder — an identifier absent from the catalog is **rejected**; `account_id` appears as
  a bound parameter and never inline.
- Queue claiming — a claimed unit is not double-claimed; the time budget stops the drain cleanly.
- Verification arithmetic — parity pass/fail, the `est_rows > 0` zero-row hard failure, and
  continuity gap detection.
- Manifest generation.

Vitest does not typecheck. `node_modules/.bin/tsc --noEmit` runs separately at every commit.

---

## 13. Open items

1. **Retention semantics** (§5.1) — resolved by running Phase 0. Determines project priority
   and sequencing.
2. **Volume and cost** — unknown until Phase 0 reports `est_bytes`. Expected to be a rounding
   error at BigQuery's $0.02/GB/month active rate, but confirm before the backfill.
3. **Bulk-extraction permission** — whether the Intentwise agreement permits full-table
   extraction to our own warehouse is a contractual question, not a technical one. Worth
   confirming.
4. **Intentwise post-deactivation retention** — whether Intentwise purges historical rows when
   an account is deactivated. If they do, the pre-disconnect gate is the only chance we ever
   get, and the nightly job stops being convenience.

## 14. Recommended sequencing

1. §4 prerequisite (`intentwise_accounts`) and §5 Phase 0 profiling.
2. **Review Phase 0 output and settle §13.1 before continuing.**
3. Nightly capture (§6, §7.1) — prioritising short-retention tables if Phase 0 shows rolling
   retention.
4. Backfill (§7.3) and monthly re-pull (§7.2).
5. Nightly verification (§8.1).
6. Offboarding gate (§8.2, §8.3) and Drive artifacts (§9).
