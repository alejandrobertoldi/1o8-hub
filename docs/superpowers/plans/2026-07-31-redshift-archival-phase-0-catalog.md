# Redshift Archival — Phase 0 (Account Registry + Table Catalog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two prerequisite registries — which Intentwise accounts exist, and which Redshift tables carry `account_id` — and measure each table's real retention, row count, and byte size, so the archival pipeline can be planned against facts instead of documentation.

**Architecture:** Two new Postgres tables (`intentwise_accounts`, `redshift_archive_catalog`) plus a per-account stats table (`redshift_archive_account_stats`). Two `scripts/` jobs seed them: one discovers account IDs from Redshift itself, one walks Redshift's system catalog to find every `account_id`-bearing table and profiles it. All Redshift reads go through a new throwing variant of the existing client. Classification and type-mapping logic lives in pure, unit-tested functions; the scripts are thin I/O wrappers around them.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres/Supabase), `pg` (Redshift), `tsx` for scripts, Vitest for tests.

**Source spec:** `docs/superpowers/specs/2026-07-31-client-offboarding-redshift-archival-design.md` (committed `27e2f175`)

**Scope:** Spec §3.2, §4, §5, and the §14 step-2 review checkpoint. Everything downstream — nightly capture, backfill, verification, the offboarding gate, Drive artifacts — is deliberately excluded and will be planned in Plan 2 once this plan's profiler output exists.

---

## Global Constraints

- **Never apply a migration without Manu's explicit per-action OK.** DEV DB = PROD Supabase. Additive changes only; no drops, no column type changes.
- **Never push, deploy, merge to main, or INSERT into prod without explicit per-action OK.**
- Work in a feature worktree. **Ask Manu before creating it.**
- Typecheck: `node_modules/.bin/tsc --noEmit` — slow (~2 min), run in background, at every commit. **Never `next build`.**
- Expect **exactly 1 pre-existing TS error** in `/Users/manu/MFHub`: `.next/dev/types/app/api/hours/route.ts`. It is dev-server-generated and already in prod. Verify with `grep -c "error TS"` == 1 and check the path before blaming your change.
- Tests: `node_modules/.bin/vitest run <path>`. **Vitest does not typecheck.**
- Lint: `npm run lint` exits 1 on main (3,421 pre-existing errors). Only ever scope eslint to explicit paths.
- Any command containing `.env` is hard-blocked for the agent — ask Manu.
- Recursive/force deletes (`rm -r`, `rm -f`) are hard-blocked — use `git rm` or ask.
- **Never `git add .`** — explicit pathspec on add AND commit. Verify the staged diff. Keep `graphify-out/*` and `.claude/*` out. A post-commit hook re-dirties `graphify-out`; that is expected, never stage it.
- Commit flag order: `git commit -m "msg" -- <pathspec>` (`-m` BEFORE `--`). One task per commit.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Read-only guest on Intentwise's Redshift cluster.** No `UNLOAD`, no `CREATE TABLE`, no `INSERT`, no server-side export. `SELECT` only.
- **Dynamic SQL rules (spec §10):** schema and table identifiers are validated against a known-good list before interpolation; `account_id` and all date bounds are always bound parameters (`$1`, `$2`). `src/lib/forecast-redshift.ts:148` is the pattern NOT to copy.
- Next migration number is **0084** (latest on disk is `drizzle/migrations/0083_time_entries.sql`).

---

## Deviations from the spec — read before starting

Three changes to spec §4 and §5, each driven by evidence gathered on 2026-07-31. They are deliberate. Do not "fix" them back.

**1. `intentwise_accounts.client_id_code` is NULLABLE (spec §4 says notNull), and the unique constraint is on `account_id` alone (spec §4 says `(client_id_code, account_id)`).**

Reason: the live Intentwise account list for org 18580 has 21 ACTIVE accounts. `src/lib/report-clients.ts` has 17 entries, of which only 15 exist upstream. Six live accounts have no entry at all (`169670` Culture Czars, `4121020` ELK Wellness, `4470600` Halfday, `919800` Hot_Shot_SC_CA, `4283010` Mission, `4353910` Sopreme Soursop) and two entries are dead (`3629290` Brad's, `563510` This PKN). A `NOT NULL` client code makes it impossible to record "this account has data in Redshift but we cannot attribute it," which is exactly the state that needs to be loud rather than absent. Unique on `account_id` alone is also strictly correct and stronger: an Intentwise account belongs to exactly one client, while one client may hold several accounts (Cloud23 holds `2348430` and `2557190`).

**2. Accounts are seeded by discovering `DISTINCT account_id` from Redshift, NOT from `REPORT_CLIENTS` (spec §4 says "seeded from `REPORT_CLIENTS`").**

Reason: `REPORT_CLIENTS` is demonstrably wrong for 8 of 23 distinct accounts. Seeding from it would silently omit six live clients from archival. The authoritative question for an archival tool is "which `account_id` values have rows in the cluster we are archiving," and Redshift answers that directly with no new credentials. `REPORT_CLIENTS` is downgraded to a *mapping hint* for attributing an `account_id` to a `client_id_code`, and every unmapped account is reported as a loud warning.

**3. The catalog is split across two tables: `redshift_archive_catalog` (per table) and `redshift_archive_account_stats` (per table × account).**

Reason: spec §5 asks the profiler to record "per-`account_id` row counts with min/max dates" but the catalog column list it specifies is per-table only, leaving that data nowhere to live. Those per-account numbers are load-bearing three times over: they measure retention (§5.1), they size the backfill window per account (§7.3), and §8.1's "catalog row count non-zero but archive holds nothing" hard failure is a join against them.

---

## Scope addition — lifecycle-gated archival

Approved by Manu on 2026-08-01, after the plan was first written. Not in spec §4 or §8.2; fold it in, do not treat it as optional.

**The rule.** Nightly work is enqueued only for accounts whose client is genuinely still live. On passing the §8.2 offboarding gate, the account's capture is stopped and the moment recorded. **"Stop storing" means stop CAPTURING. The BigQuery archive is never deleted — that is the entire point of the project.**

**What Phase 0 (this plan) owns:** the `stopped_at` column and the promotion of `is_active` from a display flag to the capture gate. Both land in Task 3. That is all — this plan has no enqueuer.

**What Plan 2 owns:** the predicate itself, in the §7.1 enqueuer. Written here so it is not re-derived:

```sql
-- Plan 2, §7.1 enqueuer. Reference only — do not build this in Phase 0.
SELECT ia.account_id, ia.client_id_code
  FROM intentwise_accounts ia
  JOIN aac ON aac.client_id_code = ia.client_id_code
 WHERE ia.is_active = true
   AND lower(aac.client_status) = 'active'
   AND (aac.offboarding_date IS NULL OR aac.offboarding_date > now());
```

`aac.client_status` is free-text `varchar(50)`, not an enum. Observed values include `Active`, `Inactive`, and `Prospect`, with inconsistent casing. Compare case-insensitively — `src/app/api/clients/route.ts:55` already uses `ilike(aac.clientStatus, "active")` and that is the convention to match. Note that this predicate consequently excludes `Prospect` clients.

**On passing the §8.2 gate:** `UPDATE intentwise_accounts SET is_active = false, stopped_at = now() WHERE account_id = $1`. The `intentwise_accounts_stopped_check` constraint means both columns must move together, and re-onboarding a returning client must clear `stopped_at` in the same statement that sets `is_active = true`.

### Two consequences that need Manu's decision — surface at Task 8, do not block on them

**1. The gate-pass-to-disconnect window.** The §8.2 gate runs *before* the Intentwise seat is cancelled, and §8.4 establishes that this system cannot block that cancellation. So flipping `is_active = false` on gate PASS stops capture while the account is still connected and still producing data. If the gate passes on the 3rd and the seat is cancelled on the 10th, seven days are never captured, the verdict already says PASS, and nothing detects the hole. For `snapshot` tables it is permanent (§5.2).

*Recommendation:* gate PASS writes the verdict only; `is_active = false` / `stopped_at` fire on **confirmed disconnect**. Costs one extra human step but removes the silent hole. Manu approved the flip-on-PASS version; implement that unless he changes it at the Task 8 checkpoint. Either way this is a Plan 2 decision — Phase 0's schema serves both.

**2. Unattributed accounts are silently excluded.** The `JOIN aac` drops every account with a NULL `client_id_code`. Deviation 1 exists specifically so that an account with Redshift data we cannot attribute is recorded *loudly rather than absent* — and this predicate makes it absent again, at the enqueuer instead of the registry. Six live accounts were unattributed as of 2026-07-31.

*Recommendation:* fail open. Archive unmapped accounts and report them loudly every night. Storage is ~$0.02/GB/month; missed history is permanent. Fail closed only on a *positive* offboarding signal, never on missing information. Needs Manu's call at Task 8.

---

## Findings that shape this plan

Established 2026-07-31, before writing. Do not re-derive.

**Retention is accumulation, not rolling — §5.1 and §13.1 are effectively settled.** Measured via the Intentwise AI Gateway on `intentwise_ecommerce_graph.account_summary`:

| Account | `MIN(report_date)` | `MAX(report_date)` | Distinct dates |
|---|---|---|---|
| `154290` Gaffer | 2020-12-19 | 2026-07-30 | 2050 |
| `1899670` Dr. Cuddles | 2025-08-11 | 2026-07-30 | 354 |
| `4470600` Halfday | 2026-05-30 | 2026-07-30 | 62 |

Three different floors tracking account age, and Gaffer's 2050 distinct dates across a ~2049-day span means complete daily coverage over 5.6 years. Data is **not** being lost daily. Spec §14's sequencing stands unchanged. Caveat: this was measured on the gateway's BigQuery (which also exposes an `mcp_custom_data` schema, so it is not a proven 1:1 mirror of our Redshift cluster) and covers 2 tables out of ~15. **The checkpoint in Task 8 confirms it against Redshift; it is no longer deciding the build order.**

**Snapshot tables already have holes at the source.** `amazon_source_data.sellercentral_fbaamazonfulfilledinventory_report` for account `1899670`: 278 distinct dates across a 345-day span — 67 missing days. The spec's `snapshot` table kind (§5.2) and continuity audit (§8.3) are load-bearing, not hedges. Note also that this table is not in spec §3.1's illustrative list, which is why runtime discovery is the locked decision.

**`intentwise_ecommerce_graph` tables are Redshift Spectrum EXTERNAL tables.** They do not appear in `pg_tables` and their columns are not in `information_schema.columns`. Source: the note block at `scripts/discover-monthly-redshift-schema.ts:8-13`, from a prior spike in this repo. Spec §5 says "walks `svv_columns`"; that must be implemented defensively with a fallback to `svv_external_tables` / `svv_external_columns`. Whether `amazon_source_data` is external too is **unknown** — Task 6 measures it.

**`SELECT COUNT(*) AS c` returns a STRING through this driver.** Same source, `scripts/discover-monthly-redshift-schema.ts:12-13`. Truthiness checks like `if (rows[0]?.c)` give false positives, and a string `"500"` will never `===` a number `500`. This is a direct threat to §8.1's row-count parity check. Task 1 ships a `toNumber` coercion helper and every count in this plan goes through it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/redshift.ts` (modify) | Add `queryRedshiftOrThrow` alongside the existing swallowing `queryRedshift`. Existing callers untouched. |
| `src/lib/archive/catalog.ts` (create) | Pure logic: `toNumber`, date-column detection, table-kind classification, Redshift→BigQuery type mapping, identifier validation. No I/O. |
| `src/lib/archive/catalog.test.ts` (create) | Unit tests for all of the above. |
| `src/lib/db/schema.ts` (modify) | Drizzle definitions for the three new tables. |
| `drizzle/migrations/0084_intentwise_accounts.sql` (create) | Account registry DDL. |
| `drizzle/migrations/0085_redshift_archive_catalog.sql` (create) | Catalog + per-account stats DDL. |
| `scripts/_apply-0084.ts`, `scripts/_apply-0085.ts` (create) | Migration runners, matching the `scripts/_apply-0083.ts` pattern. |
| `scripts/seed-intentwise-accounts.ts` (create) | Discovers account IDs from Redshift, maps to client codes, upserts, reports unmapped. |
| `scripts/profile-redshift-catalog.ts` (create) | Walks the Redshift system catalog, profiles every `account_id`-bearing table, upserts catalog + stats. |
| `package.json` (modify) | Two new script entries. |

---

## Task 1: Throwing Redshift client and numeric coercion

**Files:**
- Modify: `src/lib/redshift.ts:56-85`
- Create: `src/lib/archive/catalog.ts`
- Test: `src/lib/archive/catalog.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `queryRedshiftOrThrow<T>(query: string, params?: unknown[]): Promise<T[]>` from `@/lib/redshift`
  - `toNumber(value: unknown): number` from `@/lib/archive/catalog`

- [ ] **Step 1: Write the failing test**

Create `src/lib/archive/catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toNumber } from "@/lib/archive/catalog";

describe("toNumber", () => {
  it("coerces the string counts this Redshift driver returns", () => {
    expect(toNumber("500")).toBe(500);
    expect(toNumber("0")).toBe(0);
  });

  it("passes numbers through", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(0)).toBe(0);
  });

  it("treats null and undefined as zero", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  it("throws on values that are not numeric, rather than silently returning NaN", () => {
    expect(() => toNumber("not-a-number")).toThrow(/not numeric/i);
    expect(() => toNumber({})).toThrow(/not numeric/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/archive/catalog.test.ts`
Expected: FAIL — cannot resolve `@/lib/archive/catalog`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/archive/catalog.ts`:

```ts
/**
 * Pure catalog logic for Redshift → BigQuery archival.
 *
 * No I/O lives here — the scripts in scripts/ do the querying and call
 * into these functions. That keeps every classification decision unit
 * testable without a live cluster.
 */

/**
 * Coerce a Redshift driver value to a number.
 *
 * `SELECT COUNT(*) AS c` comes back as a STRING through this `pg` +
 * Redshift combination (see scripts/discover-monthly-redshift-schema.ts:12).
 * Truthiness checks give false positives and `"500" === 500` is false, so
 * every count crossing the wire goes through here. Throws rather than
 * returning NaN: a silently-NaN row count would make a parity check pass.
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Value is not numeric: ${value}`);
    return value;
  }
  if (typeof value === "string" || typeof value === "bigint") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`Value is not numeric: ${String(value)}`);
    return n;
  }
  throw new Error(`Value is not numeric: ${JSON.stringify(value)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/archive/catalog.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the throwing Redshift variant**

Append to `src/lib/redshift.ts` (leave `queryRedshift` exactly as it is — existing dashboard callers depend on its graceful degradation):

```ts
/**
 * Run a SQL query against Redshift, THROWING on failure.
 *
 * `queryRedshift` returns [] after two failed attempts. That is correct for
 * dashboards and catastrophic for archival: an empty array is
 * indistinguishable from "this client legitimately had no data", so a
 * Redshift outage would mark every work unit successful with zero rows and
 * the verification gate would pass on an empty archive (spec §3.2).
 *
 * Retries once on a stale pool, exactly like queryRedshift, then throws.
 */
export async function queryRedshiftOrThrow<T = Record<string, unknown>>(
  query: string,
  params?: unknown[]
): Promise<T[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let client: PoolClient | null = null;
    try {
      const p = getPool();
      client = await p.connect();
      const result = params
        ? await client.query(query, params)
        : await client.query(query);
      client.release();
      return result.rows as T[];
    } catch (error) {
      lastError = error;
      if (client) {
        try { client.release(true); } catch { /* ignore */ }
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Redshift] Query failed (attempt ${attempt + 1}):`, msg);
      if (attempt === 0) {
        pool = null;
        continue;
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`[Redshift] Query failed after 2 attempts: ${msg}`);
}
```

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `1` — and confirm the single error path is `.next/dev/types/app/api/hours/route.ts`. Anything else is yours.

- [ ] **Step 7: Lint the touched files only**

Run: `node_modules/.bin/eslint src/lib/redshift.ts src/lib/archive/catalog.ts src/lib/archive/catalog.test.ts`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/redshift.ts src/lib/archive/catalog.ts src/lib/archive/catalog.test.ts
git commit -m "feat(archive): add throwing Redshift variant and numeric coercion

queryRedshift swallows errors and returns [], which for archival is
indistinguishable from a client legitimately having no data. Add
queryRedshiftOrThrow for the archive path; existing callers untouched.

toNumber handles this driver returning COUNT(*) as a string.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/redshift.ts src/lib/archive/catalog.ts src/lib/archive/catalog.test.ts
```

---

## Task 2: Catalog classification logic

**Files:**
- Modify: `src/lib/archive/catalog.ts`
- Test: `src/lib/archive/catalog.test.ts`

**Interfaces:**
- Consumes: `toNumber` from Task 1.
- Produces, all from `@/lib/archive/catalog`:
  - `type TableKind = "timeseries" | "snapshot" | "period"`
  - `interface SourceColumn { name: string; type: string }`
  - `hasAccountIdColumn(columns: SourceColumn[]): boolean`
  - `detectDateColumn(columns: SourceColumn[]): string | null`
  - `classifyTableKind(dateColumn: string | null): TableKind`
  - `mapRedshiftTypeToBigQuery(redshiftType: string): { bqType: string; mapped: boolean }`
  - `assertSafeIdentifier(identifier: string): string`
  - `sourceRefreshWindowDays(tableName: string): number`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/archive/catalog.test.ts`:

```ts
import {
  hasAccountIdColumn,
  detectDateColumn,
  classifyTableKind,
  mapRedshiftTypeToBigQuery,
  assertSafeIdentifier,
  sourceRefreshWindowDays,
  type SourceColumn,
} from "@/lib/archive/catalog";

const cols = (...names: Array<[string, string]>): SourceColumn[] =>
  names.map(([name, type]) => ({ name, type }));

describe("hasAccountIdColumn", () => {
  it("finds account_id regardless of case", () => {
    expect(hasAccountIdColumn(cols(["ACCOUNT_ID", "bigint"]))).toBe(true);
    expect(hasAccountIdColumn(cols(["account_id", "bigint"]))).toBe(true);
  });

  it("rejects lookalikes that are not the filter key", () => {
    expect(hasAccountIdColumn(cols(["sub_account_id", "bigint"]))).toBe(false);
    expect(hasAccountIdColumn(cols(["account_name", "varchar"]))).toBe(false);
    expect(hasAccountIdColumn([])).toBe(false);
  });
});

describe("detectDateColumn", () => {
  it("prefers report_date, the name both live schemas actually use", () => {
    const c = cols(["report_date", "date"], ["start_date", "date"]);
    expect(detectDateColumn(c)).toBe("report_date");
  });

  it("falls back through the priority list before guessing by type", () => {
    expect(detectDateColumn(cols(["snapshot_date", "date"]))).toBe("snapshot_date");
    expect(detectDateColumn(cols(["some_other_day", "date"]))).toBe("some_other_day");
  });

  it("ignores date-typed columns that are structure attributes, not report grain", () => {
    // A campaign's own start_date is not the table's time grain.
    expect(detectDateColumn(cols(["campaign_id", "bigint"], ["start_date", "date"], ["end_date", "date"]))).toBeNull();
  });

  it("returns null when there is no date column at all", () => {
    expect(detectDateColumn(cols(["account_id", "bigint"], ["sku", "varchar"]))).toBeNull();
  });
});

describe("classifyTableKind", () => {
  it("treats a weekly or monthly grain as period", () => {
    expect(classifyTableKind("report_week")).toBe("period");
    expect(classifyTableKind("report_month")).toBe("period");
  });

  it("treats a daily date column as timeseries", () => {
    expect(classifyTableKind("report_date")).toBe("timeseries");
  });

  it("treats the absence of a date column as snapshot", () => {
    expect(classifyTableKind(null)).toBe("snapshot");
  });
});

describe("mapRedshiftTypeToBigQuery", () => {
  it("maps the Spectrum/Hive types the external schema reports", () => {
    expect(mapRedshiftTypeToBigQuery("string")).toEqual({ bqType: "STRING", mapped: true });
    expect(mapRedshiftTypeToBigQuery("bigint")).toEqual({ bqType: "INT64", mapped: true });
    expect(mapRedshiftTypeToBigQuery("double")).toEqual({ bqType: "FLOAT64", mapped: true });
    expect(mapRedshiftTypeToBigQuery("boolean")).toEqual({ bqType: "BOOL", mapped: true });
    expect(mapRedshiftTypeToBigQuery("date")).toEqual({ bqType: "DATE", mapped: true });
    expect(mapRedshiftTypeToBigQuery("timestamp")).toEqual({ bqType: "TIMESTAMP", mapped: true });
  });

  it("strips parameters and is case-insensitive", () => {
    expect(mapRedshiftTypeToBigQuery("VARCHAR(256)")).toEqual({ bqType: "STRING", mapped: true });
    expect(mapRedshiftTypeToBigQuery("decimal(18,2)")).toEqual({ bqType: "NUMERIC", mapped: true });
    expect(mapRedshiftTypeToBigQuery("character varying")).toEqual({ bqType: "STRING", mapped: true });
  });

  it("falls back to STRING and flags it, rather than dropping the column", () => {
    expect(mapRedshiftTypeToBigQuery("super")).toEqual({ bqType: "STRING", mapped: false });
    expect(mapRedshiftTypeToBigQuery("")).toEqual({ bqType: "STRING", mapped: false });
  });
});

describe("assertSafeIdentifier", () => {
  it("accepts ordinary schema and table names", () => {
    expect(assertSafeIdentifier("intentwise_ecommerce_graph")).toBe("intentwise_ecommerce_graph");
    expect(assertSafeIdentifier("sellercentral_fbamanageinventory_report")).toBe("sellercentral_fbamanageinventory_report");
  });

  it("rejects anything that could break out of an identifier position", () => {
    expect(() => assertSafeIdentifier('a"; DROP TABLE x; --')).toThrow(/unsafe identifier/i);
    expect(() => assertSafeIdentifier("has space")).toThrow(/unsafe identifier/i);
    expect(() => assertSafeIdentifier("has-dash")).toThrow(/unsafe identifier/i);
    expect(() => assertSafeIdentifier("")).toThrow(/unsafe identifier/i);
  });
});

describe("sourceRefreshWindowDays", () => {
  it("uses the documented per-report windows from spec section 3.3", () => {
    expect(sourceRefreshWindowDays("settlement_report")).toBe(2);
    expect(sourceRefreshWindowDays("sellercentral_businessreport")).toBe(10);
    expect(sourceRefreshWindowDays("sellercentral_allorders_report")).toBe(10);
  });

  it("defaults to the 14-day Sponsored Ads window", () => {
    expect(sourceRefreshWindowDays("keyword_summary")).toBe(14);
    expect(sourceRefreshWindowDays("anything_unrecognised")).toBe(14);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest run src/lib/archive/catalog.test.ts`
Expected: FAIL — the new symbols are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/archive/catalog.ts`:

```ts
export type TableKind = "timeseries" | "snapshot" | "period";

export interface SourceColumn {
  name: string;
  type: string;
}

/** The one filter key both Redshift schemas share (spec §3.1). */
export const ACCOUNT_ID_COLUMN = "account_id";

export function hasAccountIdColumn(columns: SourceColumn[]): boolean {
  return columns.some((c) => c.name.toLowerCase() === ACCOUNT_ID_COLUMN);
}

/**
 * Date columns that represent a table's REPORT GRAIN, most specific first.
 *
 * Deliberately excludes start_date/end_date: on campaign-shaped tables those
 * are structure attributes of the row, not the time axis of the table, and
 * partitioning on them would be wrong.
 */
export const DATE_COLUMN_PRIORITY = [
  "report_date",
  "report_week",
  "report_month",
  "snapshot_date",
  "date",
] as const;

const DATE_TYPES = new Set(["date", "timestamp", "timestamptz", "datetime"]);
const NON_GRAIN_DATE_COLUMNS = new Set(["start_date", "end_date", "created_at", "updated_at"]);

export function detectDateColumn(columns: SourceColumn[]): string | null {
  const byName = new Map(columns.map((c) => [c.name.toLowerCase(), c.name]));
  for (const candidate of DATE_COLUMN_PRIORITY) {
    const hit = byName.get(candidate);
    if (hit) return hit;
  }
  // Nothing named conventionally — accept a lone date-typed column, but never
  // a structure attribute.
  const typed = columns.filter(
    (c) =>
      DATE_TYPES.has(baseType(c.type)) &&
      !NON_GRAIN_DATE_COLUMNS.has(c.name.toLowerCase())
  );
  return typed.length === 1 ? typed[0].name : null;
}

export function classifyTableKind(dateColumn: string | null): TableKind {
  if (!dateColumn) return "snapshot";
  const lower = dateColumn.toLowerCase();
  if (lower.includes("week") || lower.includes("month")) return "period";
  return "timeseries";
}

/** Strip parameters and whitespace: "VARCHAR(256)" -> "varchar". */
function baseType(redshiftType: string): string {
  return redshiftType.toLowerCase().split("(")[0].trim();
}

const TYPE_MAP: Record<string, string> = {
  // Spectrum / Hive external types
  string: "STRING",
  int: "INT64",
  bigint: "INT64",
  smallint: "INT64",
  double: "FLOAT64",
  float: "FLOAT64",
  boolean: "BOOL",
  timestamp: "TIMESTAMP",
  date: "DATE",
  decimal: "NUMERIC",
  // Native Redshift types
  varchar: "STRING",
  "character varying": "STRING",
  char: "STRING",
  character: "STRING",
  text: "STRING",
  int2: "INT64",
  int4: "INT64",
  int8: "INT64",
  integer: "INT64",
  numeric: "NUMERIC",
  real: "FLOAT64",
  float4: "FLOAT64",
  float8: "FLOAT64",
  "double precision": "FLOAT64",
  bool: "BOOL",
  timestamptz: "TIMESTAMP",
  "timestamp without time zone": "TIMESTAMP",
  "timestamp with time zone": "TIMESTAMP",
};

/**
 * An unmapped type falls back to STRING and is flagged, never dropped.
 * The caller writes the flag into catalog.notes (spec §6).
 */
export function mapRedshiftTypeToBigQuery(redshiftType: string): {
  bqType: string;
  mapped: boolean;
} {
  const base = baseType(redshiftType);
  const bqType = TYPE_MAP[base];
  return bqType ? { bqType, mapped: true } : { bqType: "STRING", mapped: false };
}

/**
 * Last line of defence for identifiers that reach a SQL string.
 *
 * The real control is the catalog allowlist (spec §10) — a table not present
 * in redshift_archive_catalog is never queried. This is the belt to that
 * suspenders, because this codebase has shipped a SQL injection before
 * (reports-overview, fixed in PR #11) and forecast-redshift.ts:148 still
 * interpolates. account_id and date bounds are ALWAYS bound parameters and
 * must never come through here.
 */
export function assertSafeIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe identifier rejected: ${JSON.stringify(identifier)}`);
  }
  return identifier;
}

/**
 * Documented upstream restatement windows (spec §3.3). Informational — the
 * effective re-pull window is catalog.repull_window_days, which defaults to
 * 14 for every table because 14 covers all three of these with headroom.
 */
export function sourceRefreshWindowDays(tableName: string): number {
  const t = tableName.toLowerCase();
  if (t.includes("settlement")) return 2;
  if (t.includes("businessreport") || t.includes("allorders") || t.includes("orderreport")) return 10;
  return 14;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/archive/catalog.test.ts`
Expected: PASS, all suites.

- [ ] **Step 5: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"` → expect `1` (the known pre-existing one).
Run: `node_modules/.bin/eslint src/lib/archive/catalog.ts src/lib/archive/catalog.test.ts` → expect exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/archive/catalog.ts src/lib/archive/catalog.test.ts
git commit -m "feat(archive): add catalog classification and type mapping

Pure functions for date-column detection, table-kind classification,
Redshift-to-BigQuery type mapping with a flagged STRING fallback, and
identifier validation. No I/O, fully unit tested.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/archive/catalog.ts src/lib/archive/catalog.test.ts
```

---

## Task 3: `intentwise_accounts` table

**Files:**
- Create: `drizzle/migrations/0084_intentwise_accounts.sql`
- Create: `scripts/_apply-0084.ts`
- Modify: `src/lib/db/schema.ts` (append near the other registry tables, after `driveFolders` at line 1652)

**Interfaces:**
- Consumes: nothing.
- Produces: `intentwiseAccounts` Drizzle table plus `IntentwiseAccount` / `NewIntentwiseAccount` types from `@/lib/db/schema`.

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/migrations/0084_intentwise_accounts.sql`:

```sql
-- Intentwise account registry.
-- Today the Intentwise account IDs live only in a hardcoded array in
-- src/lib/report-clients.ts, keyed by display name and wrong for 8 of 23
-- accounts. This makes them real, queryable data.
--
-- client_id_code is NULLABLE on purpose: seeding discovers account IDs from
-- Redshift, and an account whose owner we cannot yet attribute must be
-- recordable and loud, not absent. No FK to aac(client_id_code) — matches
-- the existing drive_folders pattern.
--
-- is_active is the CAPTURE GATE, not a display flag (see "Lifecycle-gated
-- archival" in the plan). stopped_at records when capture stopped and is the
-- audit trail for it. "Stopped" means stopped CAPTURING — the BigQuery
-- archive is never deleted.
CREATE TABLE IF NOT EXISTS "intentwise_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" varchar(100),
  "account_id" varchar(50) NOT NULL,
  "label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "stopped_at" timestamptz,
  "added_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  -- "Active but stopped" is incoherent and would silently skip a live client.
  -- Re-onboarding a returning client therefore clears stopped_at in the same
  -- statement that sets is_active = true.
  CONSTRAINT "intentwise_accounts_stopped_check"
    CHECK ("stopped_at" IS NULL OR "is_active" = false)
);

-- An Intentwise account belongs to exactly one client, so account_id alone is
-- unique. One client may hold several accounts (Cloud23 holds 2348430 and
-- 2557190), which is why this is a table and not a column on aac.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_intentwise_accounts_account_id"
  ON "intentwise_accounts" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_intentwise_accounts_client"
  ON "intentwise_accounts" ("client_id_code");
CREATE INDEX IF NOT EXISTS "idx_intentwise_accounts_active"
  ON "intentwise_accounts" ("is_active");
```

- [ ] **Step 2: Write the Drizzle definition**

Insert into `src/lib/db/schema.ts` immediately after the `driveFolders` block (which ends at line 1652):

```ts
// ─── Intentwise Accounts ──────────────────────────────────────────────
// Registry of Intentwise (Redshift) account IDs per client.
// Replaces the hardcoded array in src/lib/report-clients.ts as the source of
// truth for archival. That array stays in place for its existing UI
// consumers — migrating them is a separate refactor (spec §4).
// clientIdCode is nullable: an account discovered in Redshift that we cannot
// attribute must be recordable and visible, not dropped.
// isActive is the capture gate (see "Lifecycle-gated archival"); stoppedAt is
// when capture stopped. Stopping capture never deletes the BigQuery archive.

export const intentwiseAccounts = pgTable(
  "intentwise_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    accountId: varchar("account_id", { length: 50 }).notNull(),
    label: text("label"),
    isActive: boolean("is_active").notNull().default(true),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_intentwise_accounts_account_id").on(table.accountId),
    index("idx_intentwise_accounts_client").on(table.clientIdCode),
    index("idx_intentwise_accounts_active").on(table.isActive),
  ]
);
```

And add the type exports alongside the other `$inferSelect` exports near line 2358:

```ts
export type IntentwiseAccount = typeof intentwiseAccounts.$inferSelect;
export type NewIntentwiseAccount = typeof intentwiseAccounts.$inferInsert;
```

- [ ] **Step 3: Write the apply script**

Create `scripts/_apply-0084.ts`, matching `scripts/_apply-0083.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0084_intentwise_accounts.sql",
    "utf8"
  );
  console.log("Applying 0084_intentwise_accounts.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'intentwise_accounts'
  `);
  console.log("intentwise_accounts table:", tbl);
  if ((tbl as unknown[]).length !== 1) throw new Error("intentwise_accounts table missing");

  // stopped_at is the whole point of the lifecycle gate — verify it landed.
  const col = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'intentwise_accounts'
      AND column_name = 'stopped_at'
  `);
  if ((col as unknown[]).length !== 1) throw new Error("intentwise_accounts.stopped_at missing");

  console.log("0084 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `1` (the known pre-existing one).

- [ ] **Step 5: STOP — get Manu's explicit OK before applying**

Do not run the apply script. Show Manu the migration SQL and ask for a per-action OK. DEV DB is PROD Supabase.

- [ ] **Step 6: Apply, once approved**

Run: `npx tsx scripts/_apply-0084.ts`
Expected: `0084 applied OK.`

- [ ] **Step 7: Commit**

```bash
git add drizzle/migrations/0084_intentwise_accounts.sql scripts/_apply-0084.ts src/lib/db/schema.ts
git commit -m "feat(archive): add intentwise_accounts registry table

Makes Intentwise account IDs real data instead of a hardcoded array.
client_id_code is nullable and account_id is uniquely constrained so that
accounts discovered in Redshift but not yet attributable are recorded
loudly rather than dropped.

is_active is the capture gate for lifecycle-gated archival and stopped_at
records when capture stopped, constrained so an account can never be both
active and stopped. Stopping capture never deletes the BigQuery archive.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- drizzle/migrations/0084_intentwise_accounts.sql scripts/_apply-0084.ts src/lib/db/schema.ts
```

---

## Task 4: Account seed script

**Files:**
- Create: `scripts/seed-intentwise-accounts.ts`
- Modify: `package.json` (scripts block, after `"backfill-activity"`)

**Interfaces:**
- Consumes: `queryRedshiftOrThrow`, `toNumber`, `assertSafeIdentifier` (Tasks 1–2); `intentwiseAccounts` (Task 3).
- Produces: populated `intentwise_accounts`; a printed reconciliation report.

**Reference data.** The live Intentwise account list for org 18580, pulled 2026-07-31, for sanity-checking the script's output. 21 ACTIVE accounts:

`1707700` BNutty_SC_US · `2348430` Cloud23_SC_US · `2557190` Cloud23_WF_US · `169670` Culture Czars US · `1145180` Dr._Wolff_SC_US · `1899670` Dr_Cuddles_SC_US · `2572940` Dreamiere_SC_US · `4121020` ELK_Wellness_SC_US · `1067740` Fresh_Vintage_Farms_SC_US · `154290` Gaffer_Sportfishing_SC_US · `3735620` GLO_SC_US · `4470600` Halfday_SC_US · `919800` Hot_Shot_SC_CA · `272970` Hot_Shot_SC_US · `4283010` Mission_SC_US · `3415610` Poochie_Butter_SC_US · `2706460` Pura_SC_US · `4353910` Sopreme_Soursop_SC_US · `1268300` Trejos_Spirits_SC_US · `910420` Trejos_Tacos_SC_US · `3388210` Whitney_Jordan_SC_US

Two IDs in `REPORT_CLIENTS` are absent upstream: `3629290` (Brad's) and `563510` (This PKN). **If the script finds Redshift rows for either, that is a significant finding for spec §13.4 — it means deactivating an Intentwise account does not purge its history. Report it prominently.**

- [ ] **Step 1: Write the script**

Create `scripts/seed-intentwise-accounts.ts`:

```ts
/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Seed intentwise_accounts by discovering account IDs from Redshift.
 *
 * NOT seeded from REPORT_CLIENTS (spec §4 says to; that is a deliberate
 * deviation). As of 2026-07-31 that array is wrong for 8 of 23 distinct
 * accounts: six live accounts are missing from it and two of its entries no
 * longer exist upstream. Seeding from it would silently omit six clients
 * from archival. Redshift itself is the authoritative answer to the only
 * question archival cares about — which account_id values have rows in the
 * cluster we are archiving.
 *
 * REPORT_CLIENTS is used only as a mapping hint to attribute an account_id
 * to a client_id_code. Unmapped accounts are inserted with a NULL client
 * code and reported loudly.
 *
 * Idempotent: re-running upserts and never deletes.
 *
 * Run: npm run seed-intentwise-accounts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { queryRedshiftOrThrow } from "../src/lib/redshift";
import { toNumber, assertSafeIdentifier } from "../src/lib/archive/catalog";
import { REPORT_CLIENTS } from "../src/lib/report-clients";

/**
 * Discovery source: the account-grain ads table present for every client.
 *
 * Validated at module load even though these are compile-time constants —
 * the Global Constraint is that NO identifier reaches a SQL string without
 * passing assertSafeIdentifier, with no "but this one is safe" exceptions.
 * An exception is how the next one gets written.
 */
const DISCOVERY_SCHEMA = assertSafeIdentifier("intentwise_ecommerce_graph");
const DISCOVERY_TABLE = assertSafeIdentifier("account_summary");

async function main() {
  const { db } = await import("../src/lib/db");
  const { intentwiseAccounts, aac } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  console.log(`=== Discovering account IDs from ${DISCOVERY_SCHEMA}.${DISCOVERY_TABLE} ===\n`);

  // Identifiers are compile-time constants here, not user input. Still no
  // interpolation of anything dynamic.
  const discovered = await queryRedshiftOrThrow<{ account_id: string; n: string; min_date: string; max_date: string }>(
    `SELECT account_id,
            COUNT(*)          AS n,
            MIN(report_date)  AS min_date,
            MAX(report_date)  AS max_date
       FROM ${DISCOVERY_SCHEMA}.${DISCOVERY_TABLE}
      GROUP BY account_id
      ORDER BY account_id`
  );

  if (discovered.length === 0) {
    throw new Error("Discovery returned zero accounts — refusing to seed. Check Redshift connectivity.");
  }
  console.log(`Found ${discovered.length} distinct account IDs in Redshift.\n`);

  // Build the mapping hint: account_id -> client display name, then resolve
  // that name to a client_id_code via aac.
  const nameByAccountId = new Map<string, string>();
  for (const rc of REPORT_CLIENTS) {
    for (const id of rc.accountIds) nameByAccountId.set(id, rc.name);
  }

  const aacRows = await db.select({ code: aac.clientIdCode, name: aac.clientName }).from(aac);
  const codeByName = new Map<string, string>();
  for (const r of aacRows) {
    if (r.name) codeByName.set(r.name.trim().toLowerCase(), r.code);
  }

  const unmapped: string[] = [];
  let inserted = 0;
  let updated = 0;

  for (const row of discovered) {
    const accountId = String(row.account_id);
    const hintName = nameByAccountId.get(accountId) ?? null;
    const clientIdCode = hintName ? codeByName.get(hintName.trim().toLowerCase()) ?? null : null;
    if (!clientIdCode) unmapped.push(accountId);

    const result = await db
      .insert(intentwiseAccounts)
      .values({
        accountId,
        clientIdCode,
        label: hintName,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: intentwiseAccounts.accountId,
        // Never clobber a client code a human has already set by hand.
        //
        // is_active and stopped_at are DELIBERATELY absent from this set list.
        // is_active is the capture gate for lifecycle-gated archival, so
        // re-running this script must never resurrect capture for an account
        // the offboarding gate has stopped. isActive: true above therefore
        // applies to brand-new rows only. Do not "complete" this set block.
        set: {
          clientIdCode: sql`COALESCE(${intentwiseAccounts.clientIdCode}, EXCLUDED.client_id_code)`,
          label: sql`COALESCE(${intentwiseAccounts.label}, EXCLUDED.label)`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: intentwiseAccounts.id, addedAt: intentwiseAccounts.addedAt });

    const isNew = result[0] && Date.now() - new Date(result[0].addedAt).getTime() < 5000;
    if (isNew) inserted++; else updated++;

    console.log(
      `  ${accountId.padEnd(10)} ${(clientIdCode ?? "UNMAPPED").padEnd(24)} ` +
      `rows=${toNumber(row.n).toLocaleString().padStart(12)} ` +
      `${row.min_date} → ${row.max_date}`
    );
  }

  console.log(`\nUpserted: ${inserted} new, ${updated} existing.`);

  // Reconciliation against REPORT_CLIENTS, in both directions.
  const discoveredIds = new Set(discovered.map((d) => String(d.account_id)));
  const staleInArray = [...nameByAccountId.keys()].filter((id) => !discoveredIds.has(id));

  if (unmapped.length) {
    console.log(`\n⚠️  ${unmapped.length} account(s) have Redshift data but NO client_id_code.`);
    console.log(`   These will be skipped by archival until a human attributes them:`);
    for (const id of unmapped) console.log(`     ${id}`);
    console.log(`   Fix: UPDATE intentwise_accounts SET client_id_code = '<code>' WHERE account_id = '<id>';`);
  }

  if (staleInArray.length) {
    console.log(`\n🔍 ${staleInArray.length} account(s) in REPORT_CLIENTS have NO rows in Redshift:`);
    for (const id of staleInArray) console.log(`     ${id} (${nameByAccountId.get(id)})`);
    console.log(`   Known former clients as of 2026-07-31: 3629290 (Brad's), 563510 (This PKN).`);
    console.log(`   If these are absent, deactivation likely PURGES history → spec §13.4 answered YES,`);
    console.log(`   and the nightly job is the only chance we ever get.`);
  } else {
    console.log(`\n🔍 Every REPORT_CLIENTS account still has rows in Redshift, including any`);
    console.log(`   deactivated ones. That is evidence deactivation does NOT purge → spec §13.4.`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Register the npm script**

In `package.json`, add after the `"backfill-activity"` line:

```json
    "seed-intentwise-accounts": "tsx scripts/seed-intentwise-accounts.ts",
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `1`.

- [ ] **Step 4: STOP — get Manu's explicit OK before running**

This writes rows to PROD Supabase. Show Manu the script and ask for a per-action OK.

- [ ] **Step 5: Run and review the output, once approved**

Run: `npm run seed-intentwise-accounts`

Check three things and report them to Manu:
1. Does the discovered account count match the 21 in the reference list above? A larger number means Redshift holds accounts Intentwise's API no longer lists — which is itself the §13.4 answer.
2. Which accounts came back `UNMAPPED`? Expect roughly the six named in the Deviations section.
3. Did `3629290` or `563510` appear? **This is the §13.4 finding.**

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-intentwise-accounts.ts package.json
git commit -m "feat(archive): seed intentwise_accounts from Redshift discovery

Discovers account IDs from the cluster rather than REPORT_CLIENTS, which is
wrong for 8 of 23 accounts. Reports unmapped accounts and any REPORT_CLIENTS
entry with no Redshift rows — the latter answers whether Intentwise purges
history on deactivation (spec §13.4).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- scripts/seed-intentwise-accounts.ts package.json
```

---

## Task 5: Catalog and per-account stats tables

**Files:**
- Create: `drizzle/migrations/0085_redshift_archive_catalog.sql`
- Create: `scripts/_apply-0085.ts`
- Modify: `src/lib/db/schema.ts` (append after `intentwiseAccounts` from Task 3; add `bigint` to the `drizzle-orm/pg-core` import list at line 2)

**Interfaces:**
- Consumes: nothing.
- Produces: `redshiftArchiveCatalog`, `redshiftArchiveAccountStats` Drizzle tables and their `$inferSelect` / `$inferInsert` types.

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/migrations/0085_redshift_archive_catalog.sql`:

```sql
-- Redshift archival catalog (spec §5).
-- One row per (schema, table) discovered to carry an account_id column.
-- Doubles as the identifier allowlist for dynamic SQL (spec §10): a table
-- absent from this catalog is never queried.
CREATE TABLE IF NOT EXISTS "redshift_archive_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schema_name" varchar(128) NOT NULL,
  "table_name" varchar(128) NOT NULL,
  "table_kind" varchar(20) NOT NULL,
  "date_column" varchar(128),
  "source_refresh_window_days" integer,
  "repull_window_days" integer NOT NULL DEFAULT 14,
  "retention_days" integer,
  "enabled" boolean NOT NULL DEFAULT false,
  "est_rows" bigint,
  "est_bytes" bigint,
  "columns" jsonb,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_profiled_at" timestamptz,
  "notes" text,
  CONSTRAINT "redshift_archive_catalog_kind_check"
    CHECK ("table_kind" IN ('timeseries', 'snapshot', 'period')),
  -- A snapshot table has no date column by definition; anything else must
  -- have one, or the load strategy has nothing to partition on.
  CONSTRAINT "redshift_archive_catalog_date_column_check"
    CHECK (("table_kind" = 'snapshot' AND "date_column" IS NULL)
        OR ("table_kind" <> 'snapshot' AND "date_column" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_redshift_archive_catalog_table"
  ON "redshift_archive_catalog" ("schema_name", "table_name");
CREATE INDEX IF NOT EXISTS "idx_redshift_archive_catalog_enabled"
  ON "redshift_archive_catalog" ("enabled");

-- Per (table × account) profiling stats. Spec §5 asks the profiler to record
-- per-account_id row counts with min/max dates but gives them nowhere to
-- live. They are load-bearing for retention measurement (§5.1), backfill
-- window sizing (§7.3), and the §8.1 "catalog says rows exist but the
-- archive holds none" hard failure.
CREATE TABLE IF NOT EXISTS "redshift_archive_account_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "catalog_id" uuid NOT NULL
    REFERENCES "redshift_archive_catalog"("id") ON DELETE CASCADE,
  "account_id" varchar(50) NOT NULL,
  "row_count" bigint NOT NULL,
  "min_date" date,
  "max_date" date,
  "distinct_dates" integer,
  "profiled_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_redshift_archive_account_stats"
  ON "redshift_archive_account_stats" ("catalog_id", "account_id");
CREATE INDEX IF NOT EXISTS "idx_redshift_archive_account_stats_account"
  ON "redshift_archive_account_stats" ("account_id");
```

- [ ] **Step 2: Write the Drizzle definitions**

First add `bigint` to the import list at the top of `src/lib/db/schema.ts` (it is not currently imported):

```ts
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
  serial,
  integer,
  bigint,
  numeric,
  smallint,
  unique,
  date,
  time,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
```

Then append after the `intentwiseAccounts` block:

```ts
// ─── Redshift Archive Catalog ─────────────────────────────────────────
// One row per (schema, table) discovered to carry an account_id column.
// Written by scripts/profile-redshift-catalog.ts, never by hand except for
// the `enabled` flag, which is deliberately human-gated: nothing is archived
// until a person turns it on (spec §5).

export const redshiftArchiveCatalog = pgTable(
  "redshift_archive_catalog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schemaName: varchar("schema_name", { length: 128 }).notNull(),
    tableName: varchar("table_name", { length: 128 }).notNull(),
    tableKind: varchar("table_kind", { length: 20 }).notNull()
      .$type<"timeseries" | "snapshot" | "period">(),
    dateColumn: varchar("date_column", { length: 128 }),
    sourceRefreshWindowDays: integer("source_refresh_window_days"),
    repullWindowDays: integer("repull_window_days").notNull().default(14),
    retentionDays: integer("retention_days"),
    enabled: boolean("enabled").notNull().default(false),
    estRows: bigint("est_rows", { mode: "number" }),
    estBytes: bigint("est_bytes", { mode: "number" }),
    columns: jsonb("columns").$type<Array<{ name: string; type: string; bqType: string; mapped: boolean }>>(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastProfiledAt: timestamp("last_profiled_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("uq_redshift_archive_catalog_table").on(table.schemaName, table.tableName),
    index("idx_redshift_archive_catalog_enabled").on(table.enabled),
  ]
);

// ─── Redshift Archive Account Stats ───────────────────────────────────
// Per (table × account) profiling output. Measures retention, sizes the
// backfill, and backs the §8.1 zero-row hard failure.

export const redshiftArchiveAccountStats = pgTable(
  "redshift_archive_account_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => redshiftArchiveCatalog.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 50 }).notNull(),
    rowCount: bigint("row_count", { mode: "number" }).notNull(),
    minDate: date("min_date"),
    maxDate: date("max_date"),
    distinctDates: integer("distinct_dates"),
    profiledAt: timestamp("profiled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_redshift_archive_account_stats").on(table.catalogId, table.accountId),
    index("idx_redshift_archive_account_stats_account").on(table.accountId),
  ]
);
```

And the type exports near line 2358:

```ts
export type RedshiftArchiveCatalogRow = typeof redshiftArchiveCatalog.$inferSelect;
export type NewRedshiftArchiveCatalogRow = typeof redshiftArchiveCatalog.$inferInsert;
export type RedshiftArchiveAccountStat = typeof redshiftArchiveAccountStats.$inferSelect;
export type NewRedshiftArchiveAccountStat = typeof redshiftArchiveAccountStats.$inferInsert;
```

- [ ] **Step 3: Write the apply script**

Create `scripts/_apply-0085.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0085_redshift_archive_catalog.sql",
    "utf8"
  );
  console.log("Applying 0085_redshift_archive_catalog.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('redshift_archive_catalog', 'redshift_archive_account_stats')
    ORDER BY table_name
  `);
  console.log("tables:", tbl);
  if ((tbl as unknown[]).length !== 2) throw new Error("expected 2 tables");
  console.log("0085 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `1`.

- [ ] **Step 5: STOP — get Manu's explicit OK before applying**

- [ ] **Step 6: Apply, once approved**

Run: `npx tsx scripts/_apply-0085.ts`
Expected: `0085 applied OK.`

- [ ] **Step 7: Commit**

```bash
git add drizzle/migrations/0085_redshift_archive_catalog.sql scripts/_apply-0085.ts src/lib/db/schema.ts
git commit -m "feat(archive): add redshift archive catalog and account stats tables

Catalog is one row per account_id-bearing table and doubles as the
identifier allowlist for dynamic SQL. Account stats hold the per-account
row counts and date ranges spec section 5 asks for but gives no home.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- drizzle/migrations/0085_redshift_archive_catalog.sql scripts/_apply-0085.ts src/lib/db/schema.ts
```

---

## Task 6: Catalog discovery — find every `account_id`-bearing table

**Files:**
- Create: `scripts/profile-redshift-catalog.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `queryRedshiftOrThrow`, `toNumber`, `hasAccountIdColumn`, `detectDateColumn`, `classifyTableKind`, `mapRedshiftTypeToBigQuery`, `assertSafeIdentifier`, `sourceRefreshWindowDays`; `redshiftArchiveCatalog`.
- Produces: populated `redshift_archive_catalog` with `enabled = false` on every new row.

This task builds discovery and column profiling only. Task 7 adds the per-account statistics pass, because that pass is far more expensive and deserves its own review gate.

**The catalog-view problem.** `intentwise_ecommerce_graph` tables are Spectrum EXTERNAL tables — absent from `pg_tables`, columns absent from `information_schema.columns` (`scripts/discover-monthly-redshift-schema.ts:8-13`). Whether `amazon_source_data` is external too is unknown. The script tries `SVV_COLUMNS` (which in Redshift covers local and external) and falls back to `SVV_EXTERNAL_COLUMNS` per schema when `SVV_COLUMNS` returns nothing, logging which path each schema used.

- [ ] **Step 1: Write the script**

Create `scripts/profile-redshift-catalog.ts`:

```ts
/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Phase 0 — Redshift catalog discovery and profiling (spec §5).
 *
 * Walks both Redshift schemas, selects every table carrying an account_id
 * column, records its columns and types, classifies its load strategy, and
 * upserts a row into redshift_archive_catalog with enabled = false.
 *
 * Nothing is archived until a human flips `enabled`. A discovered table left
 * disabled is reported as a loud alarm, never a silent skip (spec §5.2).
 *
 * Catalog view note: intentwise_ecommerce_graph holds Spectrum EXTERNAL
 * tables, which do not appear in pg_tables and whose columns are not in
 * information_schema.columns. SVV_COLUMNS covers local and external; if a
 * schema yields nothing there we fall back to SVV_EXTERNAL_COLUMNS.
 *
 * Run: npm run profile-redshift
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { queryRedshiftOrThrow } from "../src/lib/redshift";
import {
  toNumber,
  hasAccountIdColumn,
  detectDateColumn,
  classifyTableKind,
  mapRedshiftTypeToBigQuery,
  assertSafeIdentifier,
  sourceRefreshWindowDays,
  type SourceColumn,
} from "../src/lib/archive/catalog";

const SCHEMAS = ["intentwise_ecommerce_graph", "amazon_source_data"] as const;

interface RawColumn {
  table_name: string;
  column_name: string;
  data_type: string;
}

/** SVV_COLUMNS covers local and external tables. */
async function readViaSvvColumns(schema: string): Promise<RawColumn[]> {
  return queryRedshiftOrThrow<RawColumn>(
    `SELECT table_name, column_name, data_type
       FROM svv_columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position`,
    [schema]
  );
}

/** Fallback for Spectrum external schemas. */
async function readViaSvvExternalColumns(schema: string): Promise<RawColumn[]> {
  return queryRedshiftOrThrow<RawColumn>(
    `SELECT tablename AS table_name,
            columnname AS column_name,
            external_type AS data_type
       FROM svv_external_columns
      WHERE schemaname = $1
      ORDER BY tablename, columnnum`,
    [schema]
  );
}

async function readSchemaColumns(schema: string): Promise<{ rows: RawColumn[]; via: string }> {
  const primary = await readViaSvvColumns(schema);
  if (primary.length > 0) return { rows: primary, via: "svv_columns" };
  console.log(`  svv_columns returned nothing for ${schema} — falling back to svv_external_columns`);
  const fallback = await readViaSvvExternalColumns(schema);
  return { rows: fallback, via: "svv_external_columns" };
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { redshiftArchiveCatalog } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  let totalTables = 0;
  let withAccountId = 0;
  const skipped: string[] = [];

  for (const schema of SCHEMAS) {
    assertSafeIdentifier(schema);
    console.log(`\n=== ${schema} ===`);

    const { rows, via } = await readSchemaColumns(schema);
    if (rows.length === 0) {
      console.log(`  ⚠️  NO COLUMNS FOUND for ${schema} via either catalog view.`);
      console.log(`      This is a hard problem, not an empty schema — investigate before continuing.`);
      continue;
    }
    console.log(`  Read ${rows.length} column rows via ${via}`);

    // Group columns by table.
    const byTable = new Map<string, SourceColumn[]>();
    for (const r of rows) {
      const list = byTable.get(r.table_name) ?? [];
      list.push({ name: r.column_name, type: r.data_type });
      byTable.set(r.table_name, list);
    }
    totalTables += byTable.size;
    console.log(`  ${byTable.size} tables`);

    for (const [tableName, columns] of [...byTable.entries()].sort()) {
      if (!hasAccountIdColumn(columns)) {
        skipped.push(`${schema}.${tableName}`);
        continue;
      }
      assertSafeIdentifier(tableName);
      withAccountId++;

      const dateColumn = detectDateColumn(columns);
      const tableKind = classifyTableKind(dateColumn);

      const mappedColumns = columns.map((c) => {
        const { bqType, mapped } = mapRedshiftTypeToBigQuery(c.type);
        return { name: c.name, type: c.type, bqType, mapped };
      });
      const unmapped = mappedColumns.filter((c) => !c.mapped);
      const notes = unmapped.length
        ? `Unmapped source types fell back to STRING: ${unmapped.map((c) => `${c.name}:${c.type}`).join(", ")}`
        : null;

      await db
        .insert(redshiftArchiveCatalog)
        .values({
          schemaName: schema,
          tableName,
          tableKind,
          dateColumn,
          sourceRefreshWindowDays: sourceRefreshWindowDays(tableName),
          repullWindowDays: 14,
          enabled: false,
          columns: mappedColumns,
          lastProfiledAt: new Date(),
          notes,
        })
        .onConflictDoUpdate({
          target: [redshiftArchiveCatalog.schemaName, redshiftArchiveCatalog.tableName],
          // Never overwrite the human-set enabled flag or a hand-tuned
          // repull window. first_seen_at is preserved by omission.
          set: {
            tableKind,
            dateColumn,
            sourceRefreshWindowDays: sourceRefreshWindowDays(tableName),
            columns: mappedColumns,
            lastProfiledAt: new Date(),
            notes,
          },
        });

      console.log(
        `    ${tableName.padEnd(52)} ${tableKind.padEnd(11)} ` +
        `date=${(dateColumn ?? "—").padEnd(14)} cols=${String(columns.length).padStart(3)}` +
        (unmapped.length ? `  ⚠️ ${unmapped.length} unmapped type(s)` : "")
      );
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Tables scanned:            ${totalTables}`);
  console.log(`  Carrying account_id:       ${withAccountId}  → catalogued, enabled = false`);
  console.log(`  Without account_id:        ${skipped.length}  → not archivable per-client`);

  // Spec §5.2: a discovered-but-disabled table is a loud alarm.
  const disabled = await db.execute(sql`
    SELECT schema_name, table_name FROM redshift_archive_catalog
    WHERE enabled = false ORDER BY schema_name, table_name
  `);
  const disabledRows = disabled as unknown as Array<{ schema_name: string; table_name: string }>;
  if (disabledRows.length) {
    console.log(`\n⚠️  ${disabledRows.length} catalogued table(s) are DISABLED and will NOT be archived:`);
    for (const r of disabledRows) console.log(`     ${r.schema_name}.${r.table_name}`);
    console.log(`   Review each, then: UPDATE redshift_archive_catalog SET enabled = true WHERE ...;`);
  }

  console.log(`\nNext: run Task 7's stats pass to measure retention and size the backfill.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Register the npm script**

In `package.json`, after the `seed-intentwise-accounts` line:

```json
    "profile-redshift": "tsx scripts/profile-redshift-catalog.ts",
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `1`.

- [ ] **Step 4: STOP — get Manu's explicit OK before running**

Read-only against Redshift, but it writes to PROD Supabase.

- [ ] **Step 5: Run and review, once approved**

Run: `npm run profile-redshift`

Report to Manu:
1. Which catalog view worked for each schema. If `amazon_source_data` needed the external fallback, that is new information not in the spec.
2. The table count carrying `account_id`. Spec §3.1 lists 15 illustratively and says the list is not authoritative — a different number is expected, not a bug.
3. Every table classified `snapshot`. These are the ones where **the archive is the only history that will ever exist** and a missed night is unrecoverable (spec §5.2).
4. Every unmapped source type.

- [ ] **Step 6: Commit**

```bash
git add scripts/profile-redshift-catalog.ts package.json
git commit -m "feat(archive): add Phase 0 Redshift catalog discovery

Walks both schemas, catalogues every account_id-bearing table with its
columns, classified load strategy, and BigQuery type mapping. Everything
lands disabled; a discovered-but-disabled table is reported as an alarm.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- scripts/profile-redshift-catalog.ts package.json
```

---

## Task 7: Per-account statistics pass — measure retention and size the backfill

**Files:**
- Modify: `scripts/profile-redshift-catalog.ts`

**Interfaces:**
- Consumes: everything from Task 6, plus `intentwiseAccounts` (Task 3) and `redshiftArchiveAccountStats` (Task 5).
- Produces: populated `redshift_archive_account_stats`; `retention_days`, `est_rows` and `est_bytes` filled on each catalog row.

This is the pass that answers spec §5.1 and §13.2. It is expensive — one aggregate query per (table × account) — so it is opt-in behind a `--stats` flag and supports `--table=schema.table` to scope a rerun.

- [ ] **Step 1: Add the stats pass**

Insert this before `main()` in `scripts/profile-redshift-catalog.ts`:

```ts
/**
 * Per (table × account) profiling. This is what settles spec §5.1: if
 * MIN(date_col) is yesterday for every account, retention is rolling and we
 * are losing data daily. If it tracks each account's own start, the
 * warehouse accumulates.
 *
 * Gateway measurements on 2026-07-31 already indicate accumulation
 * (Gaffer 154290 reaches 2020-12-19 with 2050 distinct dates; Halfday
 * 4470600 only 2026-05-30). This pass confirms it against Redshift itself
 * and extends it to every table.
 *
 * Identifiers come from the catalog, which is the allowlist, and are
 * re-validated here. account_id is always a bound parameter (spec §10).
 */
async function profileAccountStats(opts: { onlyTable?: string }) {
  const { db } = await import("../src/lib/db");
  const { redshiftArchiveCatalog, redshiftArchiveAccountStats, intentwiseAccounts } =
    await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const accounts = await db
    .select({ accountId: intentwiseAccounts.accountId })
    .from(intentwiseAccounts)
    .where(eq(intentwiseAccounts.isActive, true));

  if (accounts.length === 0) {
    throw new Error("No active accounts in intentwise_accounts — run seed-intentwise-accounts first.");
  }

  const catalogRows = await db.select().from(redshiftArchiveCatalog);
  const targets = opts.onlyTable
    ? catalogRows.filter((r) => `${r.schemaName}.${r.tableName}` === opts.onlyTable)
    : catalogRows;

  if (targets.length === 0) {
    throw new Error(`No catalog rows matched${opts.onlyTable ? ` --table=${opts.onlyTable}` : ""}.`);
  }

  console.log(`\n=== Stats pass: ${targets.length} table(s) × ${accounts.length} account(s) ===`);

  for (const t of targets) {
    const schema = assertSafeIdentifier(t.schemaName);
    const table = assertSafeIdentifier(t.tableName);
    const dateCol = t.dateColumn ? assertSafeIdentifier(t.dateColumn) : null;

    console.log(`\n  ${schema}.${table}  (${t.tableKind})`);

    let tableRows = 0;
    let earliest: string | null = null;

    for (const a of accounts) {
      const select = dateCol
        ? `SELECT COUNT(*) AS n,
                  MIN(${dateCol}) AS min_date,
                  MAX(${dateCol}) AS max_date,
                  COUNT(DISTINCT ${dateCol}) AS distinct_dates
             FROM ${schema}.${table} WHERE account_id = $1`
        : `SELECT COUNT(*) AS n,
                  NULL AS min_date,
                  NULL AS max_date,
                  NULL AS distinct_dates
             FROM ${schema}.${table} WHERE account_id = $1`;

      let row: { n: unknown; min_date: string | null; max_date: string | null; distinct_dates: unknown };
      try {
        const result = await queryRedshiftOrThrow<typeof row>(select, [a.accountId]);
        row = result[0];
      } catch (e) {
        // Per-table failure must not abort the whole pass.
        console.log(`    ${a.accountId.padEnd(10)} ERROR: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const rowCount = toNumber(row?.n);
      if (rowCount === 0) continue;

      tableRows += rowCount;
      if (row.min_date && (!earliest || row.min_date < earliest)) earliest = row.min_date;

      const catalogId = t.id;
      await db
        .insert(redshiftArchiveAccountStats)
        .values({
          catalogId,
          accountId: a.accountId,
          rowCount,
          minDate: row.min_date,
          maxDate: row.max_date,
          distinctDates: row.distinct_dates === null ? null : toNumber(row.distinct_dates),
        })
        .onConflictDoUpdate({
          target: [redshiftArchiveAccountStats.catalogId, redshiftArchiveAccountStats.accountId],
          set: {
            rowCount,
            minDate: row.min_date,
            maxDate: row.max_date,
            distinctDates: row.distinct_dates === null ? null : toNumber(row.distinct_dates),
            profiledAt: new Date(),
          },
        });

      // A snapshot table whose distinct-date count trails its span has gaps
      // AT SOURCE — the §8.3 continuity audit will inherit them.
      let gapNote = "";
      if (row.min_date && row.max_date && row.distinct_dates !== null) {
        const spanDays =
          Math.round((new Date(row.max_date).getTime() - new Date(row.min_date).getTime()) / 86_400_000) + 1;
        const observed = toNumber(row.distinct_dates);
        if (spanDays - observed > 0) gapNote = `  ⚠️ ${spanDays - observed} missing day(s)`;
      }

      console.log(
        `    ${a.accountId.padEnd(10)} rows=${rowCount.toLocaleString().padStart(12)}  ` +
        `${row.min_date ?? "—"} → ${row.max_date ?? "—"}${gapNote}`
      );
    }

    // retention_days is MEASURED, never read from documentation (spec §5).
    const retentionDays = earliest
      ? Math.round((Date.now() - new Date(earliest).getTime()) / 86_400_000)
      : null;

    await db
      .update(redshiftArchiveCatalog)
      .set({ estRows: tableRows, retentionDays, lastProfiledAt: new Date() })
      .where(eq(redshiftArchiveCatalog.id, t.id));

    console.log(`    → total rows ${tableRows.toLocaleString()}, measured retention ${retentionDays ?? "unknown"} days`);
  }
}
```

- [ ] **Step 2: Wire up the flags**

Replace the final lines of `main()` (from `console.log(\`\nNext: ...\`)` onward) with:

```ts
  const args = process.argv.slice(2);
  const wantStats = args.includes("--stats");
  const tableArg = args.find((a) => a.startsWith("--table="));
  const onlyTable = tableArg ? tableArg.slice("--table=".length) : undefined;

  if (wantStats) {
    await profileAccountStats({ onlyTable });
  } else {
    console.log(`\nDiscovery only. Re-run with --stats to measure retention and size the backfill.`);
    console.log(`  npm run profile-redshift -- --stats`);
    console.log(`  npm run profile-redshift -- --stats --table=intentwise_ecommerce_graph.account_summary`);
  }

  process.exit(0);
}
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `1`.

- [ ] **Step 4: Smoke-test on ONE table before running the full pass**

Run: `npm run profile-redshift -- --stats --table=intentwise_ecommerce_graph.account_summary`

Cross-check against the gateway numbers in the Findings section. Account `154290` should report `min_date` near **2020-12-19** with about **2050** distinct dates; `4470600` near **2026-05-30** with about **62**.

**If Redshift disagrees with the gateway, stop and tell Manu.** It would mean the gateway is not a faithful view of the cluster and the retention conclusion needs re-establishing from Redshift alone.

- [ ] **Step 5: Run the full pass**

Run: `npm run profile-redshift -- --stats`

This is the expensive one — roughly (tables × active accounts) aggregate queries. Expect it to take a while.

- [ ] **Step 6: Commit**

```bash
git add scripts/profile-redshift-catalog.ts
git commit -m "feat(archive): measure per-account retention, row counts and gaps

Adds the --stats pass that fills redshift_archive_account_stats and the
measured retention_days. This is what settles spec section 5.1 against
Redshift rather than documentation, and flags snapshot tables whose
distinct-date count trails their span.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- scripts/profile-redshift-catalog.ts
```

---

## Task 8: CHECKPOINT — Phase 0 review with Manu

**This is a hard stop, not a formality. Do not begin Plan 2 until Manu has signed off.**

Spec §14 step 2 makes this a gate. Its original purpose — deciding whether retention is rolling, and therefore whether the whole build order changes — is *provisionally* answered by the gateway measurements in the Findings section. Tasks 6 and 7 confirm that against Redshift itself and extend it to every table. So this checkpoint is now a confirmation and a scoping exercise, not a fork in the road. It is still required.

- [ ] **Step 1: Produce the review summary**

Write a short summary for Manu covering:

1. **Retention verdict.** Does `redshift_archive_account_stats.min_date` track each account's own start (accumulation) or cluster at a fixed offset from today (rolling)? Quote Gaffer `154290` and Halfday `4470600` specifically. If it disagrees with the gateway finding, say so loudly and first.
2. **Table inventory.** How many tables carry `account_id`, split by `table_kind`. Name every `snapshot` table — those are the ones where a missed night is unrecoverable.
3. **Source gaps already present.** Which (table, account) pairs show missing days. `sellercentral_fbaamazonfulfilledinventory_report` for `1899670` was measured at 67 missing days across 345; confirm and find the rest.
4. **Cost (spec §13.2).** Total `est_rows` and `est_bytes`. At BigQuery's ~$0.02/GB/month active-storage rate, state the expected monthly figure.
5. **Attribution gaps.** Accounts with Redshift rows and no `client_id_code`, plus the `enabled = false` list. Both need a human decision.
6. **Spec §13.4 answer.** Did `3629290` (Brad's) or `563510` (This PKN) turn up? If they still hold rows, deactivation does not purge and the nightly job is a convenience. If they are gone, it is the only chance we get and Plan 2's priority rises sharply.
7. **Catalog-view reality.** Which system view worked per schema.

- [ ] **Step 2: Ask Manu the decisions only he can make**

- Which tables to flip `enabled = true`, and in what priority order.
- Whether any `repull_window_days` should deviate from 14.
- Resolution for each unattributed `account_id`.
- **Lifecycle gate, consequence 1:** does `is_active = false` fire on §8.2 gate PASS (as approved) or on confirmed disconnect (recommended)? Gate PASS leaves an uncaptured window between the verdict and the actual seat cancellation, and for `snapshot` tables that window is permanent.
- **Lifecycle gate, consequence 2:** do unattributed accounts get archived (fail open, recommended) or skipped by the `JOIN aac` (fail closed, as written)? Six accounts were unattributed on 2026-07-31.
- Spec §13.3: does the Intentwise agreement permit bulk extraction to our own warehouse? **This is a contractual question and it gates the backfill, not the code.**

- [ ] **Step 3: Write Plan 2**

Only after sign-off. Plan 2 covers spec §6, §7, §8, §9 — BigQuery archive layer, nightly enqueuer and drainer crons, backfill, monthly deep re-pull, verification, the offboarding gate, and Drive artifacts — written against the real catalog this plan produced.

Carry these forward into Plan 2:
- The nightly cron must run at or after **20:00 UTC**. Intentwise refreshes 07:30–10:30 AM PST; an early-morning UTC cron archives stale data.
- Every row count crossing the wire goes through `toNumber`. String-vs-number is a live way for §8.1 parity to silently misfire.
- `snapshot` tables append with an `_archived_at` stamp and partition on it; they cannot be re-pulled and their gaps are permanent.
- The offboarding gate does a **cold full re-pull** diffed against the incremental archive. A gate reusing the archive's own code path passes when both are wrong.
- **Lifecycle-gated archival** (see that section above). The §7.1 enqueuer filters on `intentwise_accounts.is_active` + `aac.client_status` + `aac.offboarding_date`; the §8.2 gate sets `is_active = false, stopped_at = now()` in one statement. Stopping capture **never** deletes the BigQuery archive. Both open consequences resolve at this checkpoint.
- An account stopped by the gate drops out of Task 7's `--stats` pass, which filters `is_active = true`. That is intended: its final stats become the frozen pre-offboarding baseline that §8.1 parity and §8.2's cold re-pull diff against. Nothing in Plan 2 may assume those numbers still refresh.

---

## Self-Review

**Spec coverage for this plan's scope (§3.2, §4, §5, §14 steps 1–2):**

| Spec requirement | Task |
|---|---|
| §3.2 throwing Redshift variant | Task 1 |
| §4 `intentwise_accounts` table, 1:N, independent active flag | Task 3 |
| §4 seeded and reconciled against Intentwise's own list | Task 4 (source inverted — see Deviations) |
| §4 `REPORT_CLIENTS` array stays in place | Task 4 (read-only import; never modified) |
| §5 runtime discovery across both schemas | Task 6 |
| §5 catalog columns: kind, date column, windows, retention, enabled, est_rows/bytes, columns jsonb, timestamps, notes | Tasks 5–7 |
| §5 `retention_days` measured, never documented | Task 7 |
| §5.1 retention decision point | Findings + Task 7 + Task 8 |
| §5.2 table-kind classification from data | Task 2 (logic), Task 6 (applied) |
| §5.2 disabled table is a loud alarm | Task 6 Step 1 |
| §6 Redshift→BigQuery type map with flagged STRING fallback | Task 2 |
| §10 identifier allowlist + bound `account_id` | Task 2 (`assertSafeIdentifier`), Task 7 (bound `$1`) |
| §12 unit tests for classification and type mapping | Tasks 1–2 |
| §13.2 cost known before committing | Task 7 (`est_bytes`), Task 8 |
| §13.4 post-deactivation retention | Task 4 (Brad's / This PKN natural experiment) |
| §14 step 2 hard stop | Task 8 |
| Lifecycle-gated archival — `stopped_at` column, `is_active` promoted to capture gate (approved 2026-08-01; not in the spec) | Task 3 schema + apply-script assertion; Task 4 upsert must not resurrect capture; enqueuer predicate and both open consequences carried to Plan 2 via Task 8 |

**Deliberately deferred to Plan 2:** §6 BigQuery archive layer, §7 jobs and queue, §8 verification and offboarding gate, §9 Drive artifacts, §11 per-unit error handling.

**Not covered by any task, and not in scope:** §13.3 bulk-extraction permission — contractual, surfaced for Manu at Task 8 Step 2.

**Placeholder scan:** clean. Every step carries runnable code or an exact command with expected output.

**Type consistency:** `toNumber`, `assertSafeIdentifier`, `SourceColumn`, `TableKind`, `detectDateColumn`, `classifyTableKind`, `mapRedshiftTypeToBigQuery`, `sourceRefreshWindowDays`, `hasAccountIdColumn` are defined in Tasks 1–2 and used with those exact names in Tasks 6–7. `redshiftArchiveCatalog.id` (uuid) is the FK target for `redshiftArchiveAccountStats.catalogId` (uuid). `intentwiseAccounts.accountId` is `varchar(50)` and is compared against Redshift's `account_id` as a string throughout — the seed script coerces with `String(row.account_id)` because the driver's typing of that column is not guaranteed. `intentwiseAccounts.stoppedAt` is a nullable `timestamptz` guarded by `intentwise_accounts_stopped_check`; it is written only by Plan 2's §8.2 gate and is never in Task 4's upsert `set` list.
