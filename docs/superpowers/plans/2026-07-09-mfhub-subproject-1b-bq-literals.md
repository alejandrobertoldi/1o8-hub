# MFHub Sub-project #1b — Env-Drive the Hardcoded BigQuery Literals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded BigQuery project/dataset/table literals in the 7 non-core files with env-driven references so the MFHub deploy can re-point them (BibleApp, MAAC, MSEO) to `mfhub-501815` via Vercel env — exactly like the core `bigquery.ts` path — without a code change at cutover.

**Architecture:** Introduce one pure helper module (`src/lib/bq-datasets.ts`) that resolves each non-core dataset reference from `process.env` at call time, defaulting to the **current 1o8 values**. Defaults preserve today's behavior verbatim (1o8Hub prod unchanged; MFHub deploy keeps reading the old project during parallel run). The cutover to `mfhub-501815` is then a pure Vercel-env change, gated on confirming the real MF dataset/table names + regions once BigQuery creds exist.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@google-cloud/bigquery`, Vitest (globals, jsdom, `@`→`src` alias).

## Global Constraints

- **Never push/deploy without explicit per-action OK.** This plan is LOCAL only.
- **DEV DB = PROD Supabase; additive only; never `drizzle-migrate`.** (This plan touches no DB schema.)
- **Stage explicit files, never `git add .`.**
- **`rm -rf` is hook-blocked** — use `find … -delete`.
- **Commit trailer (exact):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **PORT=3000**, one dev server.
- **No hardcoded MF names in code.** New literals are forbidden; every dataset reference resolves from env with a 1o8 default.
- Test files: `import { describe, it, expect, vi, afterEach } from "vitest"`. Use `vi.stubEnv(...)` + `afterEach(() => vi.unstubAllEnvs())`.

---

## Env Var Scheme (introduced by this plan)

All default to current behavior. Set the right column in the **mfhub** Vercel project at cutover (values marked `CONFIRM` require BigQuery access to `mfhub-501815`, currently blocked).

| Env var | Default (1o8, unchanged) | MFHub cutover value |
|---|---|---|
| `BQ_BIBLEAPP_PROJECT_ID` | `amazon-data-461918` | `mfhub-501815` |
| `BQ_BIBLEAPP_DATASET` | `1o8BibleApp` | `MFBibleApp` |
| `BQ_BIBLEAPP_LOCATION` | `us-west1` | `CONFIRM` (region of MF copy) |
| `BQ_SEO_PROJECT_ID` | `amazon-data-461918` | `mfhub-501815` |
| `BQ_SEO_DATASET` | `1o8MSEO` | `MFMSEO` |
| `BQ_SEO_OUTPAPLUS_TABLE` | `OUT_PA+` | `CONFIRM` (`OUT_PA+` or renamed) |
| `BQ_MAAC_PROJECT_ID` | `amazon-data-461918` | `mfhub-501815` |
| `BQ_MAAC_DATASET` | `1o8MAAC` | `MFMAAC` |
| `BQ_MAAC_TABLE` | `1o8MAAC_AAC` | `CONFIRM` (`1o8MAAC_AAC` or `MFMAAC_AAC`) |

**Why defaults pin to `amazon-data-461918` (not `GCP_PROJECT_ID`):** the spec accepts MAAC/MSEO "keep reading OLD project until 1o8 dies." BibleApp currently follows `GCP_PROJECT_ID`, which is *why* it breaks on the MFHub deploy (`mfhub-501815.1o8BibleApp` doesn't exist). Pinning BibleApp's default to `amazon-data-461918` — like MAAC/MSEO — fixes that breakage: the MFHub deploy keeps reading the live old project until you set the cutover env vars.

---

### Task 1: Env-driven dataset helper module (`bq-datasets.ts`)

**Files:**
- Create: `src/lib/bq-datasets.ts`
- Test: `src/lib/bq-datasets.test.ts`

**Interfaces:**
- Consumes: `process.env` only.
- Produces (all read env at call time; all return a **raw FQN without backticks** unless noted):
  - `bibleAppProjectId(): string`
  - `bibleAppDataset(): string`
  - `bibleAppLocation(): string`
  - `bibleAppTable(table: string): string` → `` `${proj}.${dataset}.${table}` `` **raw**, e.g. `amazon-data-461918.1o8BibleApp.AAC`
  - `seoProjectId(): string`
  - `seoDataset(): string`
  - `seoOutPaPlusTableName(): string` → the bare table name (default `OUT_PA+`)
  - `seoOutPaPlusTable(): string` → raw FQN `${proj}.${dataset}.${tableName}`, e.g. `amazon-data-461918.1o8MSEO.OUT_PA+`
  - `maacProjectId(): string`
  - `maacDataset(): string`
  - `maacTableName(): string` (default `1o8MAAC_AAC`)
  - `maacAacTable(): string` → raw FQN `${proj}.${dataset}.${tableName}`, e.g. `amazon-data-461918.1o8MAAC.1o8MAAC_AAC`

> **Backtick convention:** helpers return **raw** FQNs (no backticks). Callers wrap once in SQL: `` FROM \`${maacAacTable()}\` ``. This intentionally replaces the current double/nested-backtick form for `OUT_PA+` (`` `…1o8MSEO.`OUT_PA+`` ``) with the canonical single-pair form `` `…1o8MSEO.OUT_PA+` ``, which is valid BigQuery for identifiers containing `+`. See Task 3 risk note.

- [ ] **Step 1: Write the failing test**

Create `src/lib/bq-datasets.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  bibleAppProjectId,
  bibleAppDataset,
  bibleAppLocation,
  bibleAppTable,
  seoProjectId,
  seoDataset,
  seoOutPaPlusTableName,
  seoOutPaPlusTable,
  maacProjectId,
  maacDataset,
  maacTableName,
  maacAacTable,
} from "./bq-datasets";

afterEach(() => vi.unstubAllEnvs());

describe("bq-datasets defaults (1o8, behavior unchanged)", () => {
  it("BibleApp defaults", () => {
    expect(bibleAppProjectId()).toBe("amazon-data-461918");
    expect(bibleAppDataset()).toBe("1o8BibleApp");
    expect(bibleAppLocation()).toBe("us-west1");
    expect(bibleAppTable("AAC")).toBe("amazon-data-461918.1o8BibleApp.AAC");
    expect(bibleAppTable("Attributes")).toBe(
      "amazon-data-461918.1o8BibleApp.Attributes"
    );
  });

  it("SEO / OUT_PA+ defaults (single-pair canonical FQN, no inner backticks)", () => {
    expect(seoProjectId()).toBe("amazon-data-461918");
    expect(seoDataset()).toBe("1o8MSEO");
    expect(seoOutPaPlusTableName()).toBe("OUT_PA+");
    expect(seoOutPaPlusTable()).toBe("amazon-data-461918.1o8MSEO.OUT_PA+");
    // raw FQN must NOT contain a backtick — caller wraps once
    expect(seoOutPaPlusTable()).not.toContain("`");
  });

  it("MAAC defaults", () => {
    expect(maacProjectId()).toBe("amazon-data-461918");
    expect(maacDataset()).toBe("1o8MAAC");
    expect(maacTableName()).toBe("1o8MAAC_AAC");
    expect(maacAacTable()).toBe("amazon-data-461918.1o8MAAC.1o8MAAC_AAC");
  });
});

describe("bq-datasets env overrides (MFHub cutover)", () => {
  it("BibleApp override → mfhub-501815.MFBibleApp", () => {
    vi.stubEnv("BQ_BIBLEAPP_PROJECT_ID", "mfhub-501815");
    vi.stubEnv("BQ_BIBLEAPP_DATASET", "MFBibleApp");
    vi.stubEnv("BQ_BIBLEAPP_LOCATION", "US");
    expect(bibleAppTable("AAC")).toBe("mfhub-501815.MFBibleApp.AAC");
    expect(bibleAppLocation()).toBe("US");
  });

  it("SEO override → mfhub-501815.MFMSEO with renamed table", () => {
    vi.stubEnv("BQ_SEO_PROJECT_ID", "mfhub-501815");
    vi.stubEnv("BQ_SEO_DATASET", "MFMSEO");
    vi.stubEnv("BQ_SEO_OUTPAPLUS_TABLE", "OUT_PA+");
    expect(seoOutPaPlusTable()).toBe("mfhub-501815.MFMSEO.OUT_PA+");
  });

  it("MAAC override → mfhub-501815.MFMAAC.MFMAAC_AAC", () => {
    vi.stubEnv("BQ_MAAC_PROJECT_ID", "mfhub-501815");
    vi.stubEnv("BQ_MAAC_DATASET", "MFMAAC");
    vi.stubEnv("BQ_MAAC_TABLE", "MFMAAC_AAC");
    expect(maacAacTable()).toBe("mfhub-501815.MFMAAC.MFMAAC_AAC");
    expect(maacDataset()).toBe("MFMAAC");
  });

  it("empty-string env falls back to default (not empty)", () => {
    vi.stubEnv("BQ_MAAC_DATASET", "");
    expect(maacDataset()).toBe("1o8MAAC");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/bq-datasets.test.ts`
Expected: FAIL — `Failed to resolve import "./bq-datasets"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bq-datasets.ts`:

```ts
/**
 * Env-driven BigQuery dataset/table references for the NON-core datasets
 * (BibleApp, MAAC, MSEO).
 *
 * The core publish/AAC/SEO path lives in `bigquery.ts` and is already env-driven
 * via GCP_PROJECT_ID / BQ_DATASET / BQ_TABLE. These three datasets were the
 * leftover hardcoded literals (sub-project #1b of the MFHub migration).
 *
 * Every reference resolves from `process.env` at CALL TIME and defaults to the
 * pre-migration 1o8 values, so behavior is unchanged until the corresponding
 * env vars are set (e.g. on the MFHub deploy pointing at mfhub-501815).
 *
 * Helpers return RAW fully-qualified names WITHOUT backticks. Callers wrap the
 * reference once in SQL, e.g. `` FROM \`${maacAacTable()}\` ``.
 */

const OLD_PROJECT = "amazon-data-461918";

/** Read an env var, treating "" / undefined as "use the default". */
function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v : fallback;
}

// ── BibleApp (BQ → Supabase sync in sync-tables.ts) ──────────────────────
export function bibleAppProjectId(): string {
  return env("BQ_BIBLEAPP_PROJECT_ID", OLD_PROJECT);
}
export function bibleAppDataset(): string {
  return env("BQ_BIBLEAPP_DATASET", "1o8BibleApp");
}
export function bibleAppLocation(): string {
  return env("BQ_BIBLEAPP_LOCATION", "us-west1");
}
export function bibleAppTable(table: string): string {
  return `${bibleAppProjectId()}.${bibleAppDataset()}.${table}`;
}

// ── MSEO OUT_PA+ (A+ import/asins routes) ────────────────────────────────
export function seoProjectId(): string {
  return env("BQ_SEO_PROJECT_ID", OLD_PROJECT);
}
export function seoDataset(): string {
  return env("BQ_SEO_DATASET", "1o8MSEO");
}
export function seoOutPaPlusTableName(): string {
  return env("BQ_SEO_OUTPAPLUS_TABLE", "OUT_PA+");
}
export function seoOutPaPlusTable(): string {
  return `${seoProjectId()}.${seoDataset()}.${seoOutPaPlusTableName()}`;
}

// ── MAAC AAC (reports overview / advertising-audit / debug columns) ──────
export function maacProjectId(): string {
  return env("BQ_MAAC_PROJECT_ID", OLD_PROJECT);
}
export function maacDataset(): string {
  return env("BQ_MAAC_DATASET", "1o8MAAC");
}
export function maacTableName(): string {
  return env("BQ_MAAC_TABLE", "1o8MAAC_AAC");
}
export function maacAacTable(): string {
  return `${maacProjectId()}.${maacDataset()}.${maacTableName()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/bq-datasets.test.ts`
Expected: PASS (4 tests in "defaults", 4 in "overrides" — 8 assertions groups green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bq-datasets.ts src/lib/bq-datasets.test.ts
git commit -m "feat(bq): env-driven dataset helpers for BibleApp/MAAC/MSEO (sub-project #1b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Re-point BibleApp sync (`sync-tables.ts`)

**Files:**
- Modify: `src/lib/sync-tables.ts:71,72,166,167`
- Regression guard: `src/lib/bq-datasets.test.ts` (already green)

**Interfaces:**
- Consumes: `bibleAppTable`, `bibleAppLocation` from Task 1.
- Produces: no new exports; behavior identical under defaults.

> No BQ mock exists in this repo, so runtime is verified at cutover (creds-gated). This task's guard is: helper tests green + `npm run build` + `npm run lint` clean + grep shows the literals gone.

- [ ] **Step 1: Add the import**

In `src/lib/sync-tables.ts`, after the existing imports (the block ending at `import { eq } from "drizzle-orm";`), add:

```ts
import { bibleAppTable, bibleAppLocation } from "@/lib/bq-datasets";
```

- [ ] **Step 2: Replace the AAC query (line ~70-73)**

Replace:

```ts
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${PROJECT_ID}.1o8BibleApp.AAC\``,
      location: "us-west1",
    });
```

with:

```ts
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${bibleAppTable("AAC")}\``,
      location: bibleAppLocation(),
    });
```

- [ ] **Step 3: Replace the Attributes query (line ~165-168)**

Replace:

```ts
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${PROJECT_ID}.1o8BibleApp.Attributes\` ORDER BY CAST(MasterAttributeRow AS INT64)`,
      location: "us-west1",
    });
```

with:

```ts
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${bibleAppTable("Attributes")}\` ORDER BY CAST(MasterAttributeRow AS INT64)`,
      location: bibleAppLocation(),
    });
```

- [ ] **Step 4: Leave `PROJECT_ID` in place**

`const PROJECT_ID = process.env.GCP_PROJECT_ID || "amazon-data-461918";` (line 18) is still used by `getBigQueryClient()` for the client `projectId`. Do **not** remove it. Only the two query strings + locations change.

- [ ] **Step 5: Verify no BibleApp literals remain in this file**

Run: `grep -n "1o8BibleApp\|us-west1" src/lib/sync-tables.ts`
Expected: no matches.

- [ ] **Step 6: Type-check + lint the file**

Run: `npm run lint && npm run test -- src/lib/bq-datasets.test.ts`
Expected: lint clean; helper tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sync-tables.ts
git commit -m "refactor(sync): env-drive BibleApp dataset ref (fixes MFHub sync breakage)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Re-point A+ OUT_PA+ reads (`aplus/asins`, `aplus/import`)

**Files:**
- Modify: `src/app/api/aplus/asins/route.ts:8-12,34`
- Modify: `src/app/api/aplus/import/route.ts:17-21,135`

**Interfaces:**
- Consumes: `seoOutPaPlusTable` from Task 1.

> **RISK (document at cutover):** the current code builds `` `amazon-data-461918.1o8MSEO.`OUT_PA+`` `` (nested backticks) and the source NOTE says the dataset/columns are *inferred, unverified*. This task switches to the canonical single-pair form `` `amazon-data-461918.1o8MSEO.OUT_PA+` ``. That is valid BigQuery for a `+`-containing identifier, but since these routes were never verified against real BQ, **the first real run after cutover must be smoke-tested** (query one clientIdCode, expect ASIN rows). Flagged, not silently assumed.

**`aplus/asins/route.ts`:**

- [ ] **Step 1: Replace the header constant block (lines 8-12)**

Replace:

```ts
// NOTE: Dataset name `1o8MSEO` is inferred from naming convention (1o8MAAC, MarketFoundryHub, 1o8MSEO).
// Confirm against actual BigQuery before using in production.
// The table name OUT_PA+ contains a `+` character — it MUST be backtick-escaped in BQ SQL.
const SEO_BQ_DATASET = "1o8MSEO";
const OUT_PA_PLUS_TABLE = `amazon-data-461918.${SEO_BQ_DATASET}.\`OUT_PA+\``;
```

with:

```ts
// OUT_PA+ table name contains a `+`; the whole FQN is wrapped in a single
// backtick pair at the call site below (valid BigQuery for special-char ids).
// Dataset/project/table are env-driven — see src/lib/bq-datasets.ts. Values
// were inferred (unverified) pre-migration; smoke-test after any re-point.
import { seoOutPaPlusTable } from "@/lib/bq-datasets";
```

> Move the `import` to the top with the other imports if lint's `import/first` rule complains; otherwise a mid-file import of a pure module is acceptable. Prefer top-of-file: place `import { seoOutPaPlusTable } from "@/lib/bq-datasets";` beside the existing `import { queryBigQuery } from "@/lib/bigquery";` and delete the constant block entirely.

- [ ] **Step 2: Update the query (line ~34)**

Replace `` FROM \`${OUT_PA_PLUS_TABLE}\` `` with `` FROM \`${seoOutPaPlusTable()}\` ``:

```ts
    const rows = await queryBigQuery<OutPaPlusAsinRow>(
      `SELECT DISTINCT ASIN FROM \`${seoOutPaPlusTable()}\` WHERE ClientIDCode = @clientIdCode ORDER BY ASIN`,
      { clientIdCode }
    );
```

**`aplus/import/route.ts`:**

- [ ] **Step 3: Replace the header constant block (lines 17-21)** — same edit as Step 1: delete the NOTE + `SEO_BQ_DATASET` + `OUT_PA_PLUS_TABLE` constants, add `import { seoOutPaPlusTable } from "@/lib/bq-datasets";` beside the existing bigquery import.

- [ ] **Step 4: Update the query (line ~135)**

Replace `` FROM \`${OUT_PA_PLUS_TABLE}\` `` with `` FROM \`${seoOutPaPlusTable()}\` `` inside the `queryBigQuery<OutPaPlusRow>(...)` template:

```ts
       FROM \`${seoOutPaPlusTable()}\`
```

- [ ] **Step 5: Verify no OUT_PA+ literals remain**

Run: `grep -rn "1o8MSEO\|OUT_PA_PLUS_TABLE\|SEO_BQ_DATASET" src/app/api/aplus/`
Expected: no matches.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: clean (watch for `import/first`; fix ordering if flagged).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/aplus/asins/route.ts src/app/api/aplus/import/route.ts
git commit -m "refactor(aplus): env-drive MSEO OUT_PA+ ref, canonicalize backtick FQN

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Re-point MAAC AAC reads (reports + debug)

**Files:**
- Modify: `src/app/api/reports/advertising-audit/route.ts:8,70`
- Modify: `src/app/api/reports/overview/route.ts:142` (+ import)
- Modify: `src/app/api/debug/bigquery-aac-columns/route.ts:2,8-9`

**Interfaces:**
- Consumes: `maacAacTable`, `maacProjectId`, `maacDataset`, `maacTableName` from Task 1.

**`reports/advertising-audit/route.ts`:**

- [ ] **Step 1: Add import (near line 8)**

Beside `import { queryBigQuery } from "@/lib/bigquery";` add:

```ts
import { maacAacTable } from "@/lib/bq-datasets";
```

- [ ] **Step 2: Update the goal query (line ~70)**

Replace:

```ts
  FROM \`amazon-data-461918.1o8MAAC.1o8MAAC_AAC\`
```

with:

```ts
  FROM \`${maacAacTable()}\`
```

**`reports/overview/route.ts`:**

- [ ] **Step 3: Add import**

Add beside the existing `import { queryBigQuery } from "@/lib/bigquery";`:

```ts
import { maacAacTable } from "@/lib/bq-datasets";
```

- [ ] **Step 4: Update the goals query (line ~142)**

Replace:

```ts
  FROM \`amazon-data-461918.1o8MAAC.1o8MAAC_AAC\`
```

with:

```ts
  FROM \`${maacAacTable()}\`
```

**`debug/bigquery-aac-columns/route.ts`:**

- [ ] **Step 5: Add import (line ~2)**

Beside `import { queryBigQuery } from "@/lib/bigquery";` add:

```ts
import { maacProjectId, maacDataset, maacTableName } from "@/lib/bq-datasets";
```

- [ ] **Step 6: Update the INFORMATION_SCHEMA query (lines 6-11)**

Replace:

```ts
    const rows = await queryBigQuery(`
      SELECT column_name, data_type
      FROM \`amazon-data-461918.1o8MAAC.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = '1o8MAAC_AAC'
      ORDER BY ordinal_position
    `);
```

with:

```ts
    const rows = await queryBigQuery(
      `
      SELECT column_name, data_type
      FROM \`${maacProjectId()}.${maacDataset()}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @tableName
      ORDER BY ordinal_position
    `,
      { tableName: maacTableName() }
    );
```

> Parameterizing `table_name` (was a string literal) avoids re-introducing a hardcoded table name and matches the `queryBigQuery(sql, params)` signature in `bigquery.ts`.

- [ ] **Step 7: Verify no MAAC literals remain**

Run: `grep -rn "1o8MAAC\|amazon-data-461918" src/app/api/reports/advertising-audit/route.ts src/app/api/reports/overview/route.ts src/app/api/debug/bigquery-aac-columns/route.ts`
Expected: no matches.

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/reports/advertising-audit/route.ts src/app/api/reports/overview/route.ts src/app/api/debug/bigquery-aac-columns/route.ts
git commit -m "refactor(reports): env-drive MAAC AAC dataset ref

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cosmetic labels + stale comments

**Files:**
- Modify: `src/app/admin/sync/page.tsx:52,59`
- Modify: `src/lib/bigquery.ts:8` (comment)
- Modify: `src/lib/db/schema.ts:320` (comment)

**Interfaces:** none (display/comment only).

> `admin/sync/page.tsx` is a `"use client"` component and cannot read server env. These `bqSource` strings are display-only sub-labels. Making them env-aware would require a `NEXT_PUBLIC_*` var or an API round-trip — over-engineering for a cosmetic label. Decision: drop the stale `1o8` brand prefix (the app is now MarketFoundryHub) and keep them brand-neutral. Confirm this label choice with the user during review.

- [ ] **Step 1: Update the two `bqSource` labels**

In `src/app/admin/sync/page.tsx`, replace:

```ts
    bqSource: "1o8BibleApp.AAC",
```
with
```ts
    bqSource: "BibleApp · AAC",
```

and replace:

```ts
    bqSource: "1o8BibleApp.Attributes",
```
with
```ts
    bqSource: "BibleApp · Attributes",
```

- [ ] **Step 2: Update stale header comment in `bigquery.ts` (line 8)**

Replace:

```ts
 * - Target: amazon-data-461918.1o8Hub.Master
```
with
```ts
 * - Target: ${GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE} (env-driven; default amazon-data-461918.MarketFoundryHub.Master)
```

- [ ] **Step 3: Update stale comment in `schema.ts` (line 320)**

Replace:

```ts
// amazon-data-461918.1o8Hub.AAC
```
with
```ts
// BQ AAC source (env-driven project/dataset — see bigquery.ts)
```

- [ ] **Step 4: Verify remaining `1o8`/old-project literals are only intentional env defaults**

Run: `grep -rn "1o8BibleApp\|1o8MAAC\|1o8MSEO\|1o8Hub" src/ | grep -v "bq-datasets"`
Expected: no matches (all moved into `bq-datasets.ts` defaults or removed).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sync/page.tsx src/lib/bigquery.ts src/lib/db/schema.ts
git commit -m "chore: drop stale 1o8 brand refs in sync label + BQ comments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Document env vars + full verification

**Files:**
- Modify: `.env.example`
- Verify: whole build + test + lint

- [ ] **Step 1: Append the new env vars to `.env.example`**

Add a block (match the file's existing comment style):

```bash
# ── Non-core BigQuery datasets (sub-project #1b) ──
# Default to the legacy 1o8 project so behavior is unchanged until set.
# On the MFHub deploy (mfhub-501815) set the right-hand values; the CONFIRM
# ones require probing mfhub-501815 first (dataset/table names + region).
BQ_BIBLEAPP_PROJECT_ID=amazon-data-461918   # MFHub: mfhub-501815
BQ_BIBLEAPP_DATASET=1o8BibleApp             # MFHub: MFBibleApp
BQ_BIBLEAPP_LOCATION=us-west1               # MFHub: CONFIRM region of copy
BQ_SEO_PROJECT_ID=amazon-data-461918        # MFHub: mfhub-501815
BQ_SEO_DATASET=1o8MSEO                      # MFHub: MFMSEO
BQ_SEO_OUTPAPLUS_TABLE=OUT_PA+              # MFHub: CONFIRM (OUT_PA+ or renamed)
BQ_MAAC_PROJECT_ID=amazon-data-461918       # MFHub: mfhub-501815
BQ_MAAC_DATASET=1o8MAAC                     # MFHub: MFMAAC
BQ_MAAC_TABLE=1o8MAAC_AAC                   # MFHub: CONFIRM (1o8MAAC_AAC or MFMAAC_AAC)
```

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: all pass, including `src/lib/bq-datasets.test.ts`. (If a pre-existing unrelated test is already failing on `main`, note it and do not fix it here.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds (Next.js compiles all 7 touched routes/modules).

- [ ] **Step 5: Final literal sweep**

Run: `grep -rn "1o8BibleApp\|1o8MAAC\|1o8MSEO" src/ | grep -v "bq-datasets\|\.test\."`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "docs(env): document non-core BQ dataset vars (sub-project #1b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Blocked-on-user (do NOT attempt in this plan)

These require BigQuery access to `mfhub-501815` (billing + MF service-account creds), which is not available locally:

1. **Confirm the real MF names** before setting cutover env: does `MFBibleApp` keep inner tables `AAC`/`Attributes`? Is the MAAC inner table `1o8MAAC_AAC` or `MFMAAC_AAC`? Is the MSEO table still `OUT_PA+`? What region are the MF copies in (for `BQ_BIBLEAPP_LOCATION`)?
2. **Smoke-test after cutover:** the A+ OUT_PA+ routes were never verified against real BQ (inferred schema) — run one query per group after setting env.
3. Set the cutover env vars in the **mfhub** Vercel project (right-hand column of the scheme table), then redeploy.

## Self-Review

- **Spec coverage:** Every "fix later" file from the spec §"Consequences accepted" is covered — sync-tables (T2), aplus asins/import (T3), reports advertising-audit/overview + debug columns (T4), admin/sync labels (T5). The spec's "MUST first confirm inner table names" is honored by *not* baking names into code and routing them through env + a documented CONFIRM list.
- **Placeholder scan:** no TBD/"handle appropriately" — every code step shows exact code.
- **Type consistency:** helper names are identical across Task 1 (definitions) and Tasks 2–4 (call sites): `bibleAppTable`, `bibleAppLocation`, `seoOutPaPlusTable`, `maacAacTable`, `maacProjectId`, `maacDataset`, `maacTableName`. `queryBigQuery(sql, params)` signature matches `bigquery.ts`.
