# Monthly Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/reports/monthly` flow where an admin picks a client + month, previews a branded monthly performance report in-hub, and downloads a single-file HTML deliverable.

**Architecture:** Port the existing Python `1o8hub-monthly-report` skill to TypeScript under `src/lib/monthly-report/` in three layers (queries → analyzers → renderers) driven by a single registry. The same registry feeds the in-hub React preview and the downloadable inline-styled HTML file. Section toggles are backed by a new `report_section_config` Postgres table.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (`pg-core`), PostgreSQL (Supabase), Redshift (Intentwise) via `pg` `Pool`, Vitest + Testing Library, Tailwind CSS 4.

**Spec:** [docs/superpowers/specs/2026-04-23-monthly-reports-design.md](../specs/2026-04-23-monthly-reports-design.md)

---

## Preliminaries

**Branch / worktree:** `feat/monthly-reports` at `/Users/manu/1o8Hub/.worktrees/monthly-reports` (already created off `origin/main` with spec cherry-picked as commit `fb051c7`). **All work happens in that worktree.** Do not touch `.worktrees/attr-rethink/` — unrelated feature.

**Conventions enforced in every task:**
- Use `PORT=3000 npm run dev` (Turbopack panics on PostCSS; repo runs with `--webpack`).
- Use absolute paths in code, relative paths in prose.
- TDD: failing test → implementation → passing test → commit. Commit frequently.
- Every route test mocks `@/lib/auth-db`, `@/lib/db`, and (for routes that hit Redshift) `@/lib/redshift`. See Task 1 for the exact boilerplate to copy.
- Keep files under ~300 LOC where reasonable; split by responsibility (the spec's layering already does this).
- Admin-only routes: guard with `session.user.role !== "admin"` → `forbidden()` from `@/lib/api-utils`.
- Git author must be `Manu <manuel.lancharro@1o8.agency>` (Vercel deploy gate). `git config user.email` already inherits the global — do not override.

**Self-contained-plan rule:** every step below contains the full code. If a step renames a function from an earlier task, it is re-listed in the step that renames it. Do not assume you remember Task N while on Task N+3.

---

## Task 0: Redshift schema discovery spike

**Rationale:** The spec flags two unknowns that gate V1 scope (Products section + B2B section): does Intentwise Redshift contain per-ASIN sessions/buy-box/units and B2B split columns? We cannot scope the Products and B2B analyzers until we answer this. No production code ships from this task — it produces a decision doc that becomes the source of truth for Tasks 6–9.

**Files:**
- Create: `docs/superpowers/research/2026-04-23-redshift-monthly-schema.md`

- [ ] **Step 1: Write discovery query file**

Create `scripts/discover-monthly-redshift-schema.ts`:

```ts
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { queryRedshift } from "../src/lib/redshift";

async function main() {
  console.log("=== Tables in intentwise_ecommerce_graph ===\n");
  const tables = await queryRedshift<{ tablename: string }>(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'intentwise_ecommerce_graph'
    ORDER BY tablename
  `);
  for (const t of tables) console.log(`  ${t.tablename}`);

  console.log("\n=== Columns of advertised_product_summary ===");
  await logCols("advertised_product_summary");

  console.log("\n=== Columns of account_summary ===");
  await logCols("account_summary");

  // Probe for per-ASIN business report tables (guessed names)
  const probes = [
    "business_report", "asin_summary", "product_summary",
    "asin_report", "business_summary", "traffic_summary",
    "seller_central_business_report",
  ];
  console.log("\n=== Probing candidate per-ASIN tables ===");
  for (const p of probes) {
    const rows = await queryRedshift<{ c: number }>(
      `SELECT COUNT(*) AS c FROM pg_tables
       WHERE schemaname='intentwise_ecommerce_graph' AND tablename=$1`,
      [p],
    );
    if (rows[0]?.c) {
      console.log(`  ✓ ${p} exists`);
      await logCols(p);
    }
  }
}

async function logCols(table: string) {
  const cols = await queryRedshift<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='intentwise_ecommerce_graph' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );
  for (const c of cols) console.log(`    ${c.column_name}  (${c.data_type})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the spike**

```bash
npx tsx scripts/discover-monthly-redshift-schema.ts | tee /tmp/redshift-schema.txt
```

Expected: a list of tables and column definitions. Capture the output.

- [ ] **Step 3: Write decision doc**

Create `docs/superpowers/research/2026-04-23-redshift-monthly-schema.md` with:

```markdown
# Redshift Schema Discovery — Monthly Reports

**Date:** 2026-04-23
**Context:** Gate for Products + B2B sections in Monthly Reports V1.

## Tables found in intentwise_ecommerce_graph

<paste `tables` list here>

## Per-ASIN data availability

<one of:>

- **Option A — Native Intentwise table found:** `<table>` has columns `<asin>`, `<sessions>`, `<units>`, `<sales>`, `<buy_box_pct>`. **V1 scope:** include Products section using this table.
- **Option B — Only advertised_product_summary:** per-ASIN exists only for advertised ASINs; no buy-box or sessions. **V1 scope:** Products section ships without session-based CVR/buy-box (metrics become ad-revenue + ad-spend per ASIN), and we open a follow-up ticket to pull Business Reports via SP-API into a new `amazon_business_report` Supabase table.
- **Option C — No per-ASIN data anywhere:** **V1 scope:** ship KPIs-only; Products section deferred to v0.2.

## B2B data availability

<one of:>

- **Found:** column `<col>` in `<table>` gives B2B units/sales. Ship B2B section.
- **Not found:** Defer B2B to v0.2 (SP-API fallback in follow-up).

## Decision for V1

- Headline KPIs + MoM: **in**.
- Products: **<in | in (degraded) | deferred>**.
- B2B split: **<in | deferred>**.

This decision is the source of truth for Tasks 6–9.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/discover-monthly-redshift-schema.ts docs/superpowers/research/2026-04-23-redshift-monthly-schema.md
git commit -m "chore(monthly-reports): Redshift schema discovery spike"
```

**Branch point:** from here on the plan documents the full-scope path (Option A: all three sections). If Option B or C was chosen in Step 3, Tasks 6 and 9 still apply but the Products/B2B analyzers consume different (or placeholder) query functions — the renderer/registry/config layers do not change.

---

## Task 1: Drizzle schema + migration for `report_section_config`

**Files:**
- Modify: `src/lib/db/schema.ts` (append new table)
- Create: `drizzle/migrations/0042_monthly_report_config.sql`
- Create: `scripts/run-migration-0042.ts`
- Modify: `package.json` (add `migrate-0042` script)

- [ ] **Step 1: Append Drizzle table definition**

Open `src/lib/db/schema.ts`. At the end of the file (after the last `pgTable` block), append:

```ts
// ─── Monthly report section config ────────────────────────────────────
// scope='global' with scope_key='default' for global defaults.
// scope='client' with scope_key=<clientIdCode like '2348430'> for per-client.

export const reportSectionConfig = pgTable(
  "report_section_config",
  {
    scope: text("scope").notNull(),           // 'global' | 'client'
    scopeKey: text("scope_key").notNull(),    // 'default' | clientIdCode
    sectionKey: text("section_key").notNull(),// 'products' | 'b2b' | ...
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite PK enforced via unique index; Drizzle table-scope PK API is awkward,
    // so we enforce in the SQL migration (see 0042_monthly_report_config.sql).
    index("idx_rsc_scope").on(table.scope, table.scopeKey),
  ],
);
```

- [ ] **Step 2: Write SQL migration**

Create `drizzle/migrations/0042_monthly_report_config.sql`:

```sql
-- 0042: report_section_config table
-- Drives per-client and global toggles for Monthly Report sections.

CREATE TABLE IF NOT EXISTS report_section_config (
  scope        text        NOT NULL,
  scope_key    text        NOT NULL,
  section_key  text        NOT NULL,
  enabled      boolean     NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_key, section_key),
  CHECK (scope IN ('global','client'))
);

CREATE INDEX IF NOT EXISTS idx_rsc_scope
  ON report_section_config(scope, scope_key);
```

- [ ] **Step 3: Write migration runner script**

Create `scripts/run-migration-0042.ts` (copy-adapt from `scripts/run-migration-0041.ts`):

```ts
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running migration 0042_monthly_report_config...");
  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0042_monthly_report_config.sql"),
    "utf8",
  );
  await sql.unsafe(sqlText);
  console.log("  ✓ CREATE TABLE report_section_config");
  console.log("  ✓ CREATE INDEX idx_rsc_scope");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
```

- [ ] **Step 4: Wire up `npm run` script**

Edit `package.json`. Find the line with `"migrate-0041": "tsx scripts/run-migration-0041.ts",` and add beneath it:

```json
    "migrate-0042": "tsx scripts/run-migration-0042.ts",
```

- [ ] **Step 5: Run the migration**

```bash
npm run migrate-0042
```

Expected output: `✓ CREATE TABLE report_section_config`, `✓ CREATE INDEX idx_rsc_scope`, `Migration complete!`.

- [ ] **Step 6: Verify**

```bash
npx tsx -e "import('postgres').then(async p=>{const s=p.default(process.env.DATABASE_URL!.replace(':6543/',':5432/'),{ssl:'require'});console.log(await s\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='report_section_config' ORDER BY ordinal_position\`);await s.end();})" -r dotenv/config dotenv_config_path=.env.local
```

Expected: 5 columns (scope, scope_key, section_key, enabled, updated_at).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0042_monthly_report_config.sql scripts/run-migration-0042.ts package.json
git commit -m "feat(monthly-reports): add report_section_config table (migration 0042)"
```

---

## Task 2: Shared types + thresholds + tokens

**Files:**
- Create: `src/lib/monthly-report/types.ts`
- Create: `src/lib/monthly-report/thresholds.ts`
- Create: `src/lib/monthly-report/tokens.ts`

- [ ] **Step 1: Write `types.ts`**

Create `src/lib/monthly-report/types.ts`:

```ts
// Public type surface for the monthly-report module.
// Kept intentionally small — adding a section should not require editing this file
// unless the new section introduces a genuinely new concept.

export type SectionKey = "products" | "b2b";

export interface MonthlyPeriod {
  /** YYYY-MM */
  period: string;
  /** YYYY-MM-DD inclusive */
  start: string;
  /** YYYY-MM-DD inclusive */
  end: string;
  /** YYYY-MM-DD inclusive, previous calendar month */
  prevStart: string;
  /** YYYY-MM-DD inclusive, previous calendar month */
  prevEnd: string;
  /** Human-readable e.g. "March 2026" */
  label: string;
}

export interface HeadlineKpis {
  sales: number;
  units: number;
  sessions: number;
  pageviews: number;
  orderItems: number;
  /** CVR as a percentage, e.g. 8.12 for 8.12% */
  cvr: number | null;
  /** Buy-box as a percentage, weighted by sessions */
  buyBox: number | null;
  /** Average order value in currency units */
  aov: number | null;
}

export interface HeadlineDeltas {
  sales: number | null;
  units: number | null;
  sessions: number | null;
  cvr: number | null;
  buyBox: number | null;
  aov: number | null;
}

export interface HeadlineResult {
  current: HeadlineKpis;
  previous: HeadlineKpis | null;
  /** Relative change vs previous, e.g. 0.15 for +15%. null when previous is null. */
  deltas: HeadlineDeltas;
}

export interface ProductRow {
  asin: string;
  parent: string;
  title: string;
  sku: string;
  sessions: number;
  units: number;
  sales: number;
  orderItems: number;
  cvr: number | null;
  buyBox: number | null;
  aov: number | null;
}

export interface ProductsResult {
  rows: ProductRow[];
  nTotal: number;
}

export interface B2bResult {
  totalSales: number;
  b2bSales: number;
  /** B2B share of sales as a percentage (0-100) */
  b2bShareSales: number;
  totalUnits: number;
  b2bUnits: number;
  /** B2B share of units as a percentage (0-100) */
  b2bShareUnits: number;
}

/** Discriminated union so the registry stays type-safe. */
export type AnalyzerResult =
  | { kind: "products"; data: ProductsResult }
  | { kind: "b2b"; data: B2bResult };

export interface ReportConfig {
  /** section_key -> enabled? after resolving per-client > global > default=true */
  enabled: Record<SectionKey, boolean>;
}

export interface ClientContext {
  /** Display name, e.g. "Dr. Cuddles" */
  name: string;
  /** Intentwise account_id, e.g. "1899670" */
  accountId: string;
  /** URL-safe slug for filenames, e.g. "dr-cuddles" */
  slug: string;
}
```

- [ ] **Step 2: Write `thresholds.ts`**

Create `src/lib/monthly-report/thresholds.ts`:

```ts
// Ported from 1o8hub-monthly-report/references/thresholds.yaml.
// Kept as a const so callers get type-checked access; making this per-client
// configurable is an explicit non-goal of V1.

export const THRESHOLDS = {
  currencySymbol: "$",
  cvr: { good: 12, warning: 7, critical: 4 },
  buyBox: { good: 95, warning: 85, critical: 75 },
  sku: { minSessionsToJudge: 50, zeroSalesWithTraffic: 100 },
  report: { topProducts: 20 },
} as const;

export type MetricBand = "good" | "warn" | "bad" | "";

/** Returns CSS-friendly band for a value; matches Python `classify_metric` semantics. */
export function classifyMetric(
  value: number | null,
  metric: "cvr" | "buyBox",
): MetricBand {
  if (value === null) return "";
  const t = THRESHOLDS[metric];
  if (value >= t.good) return "good";
  if (value >= t.warning) return "warn";
  if (value < t.critical) return "bad";
  return "warn";
}
```

- [ ] **Step 3: Write `tokens.ts`**

Create `src/lib/monthly-report/tokens.ts`. Ported from `1o8hub-monthly-report/references/template.html` `:root` block. Two surfaces: a CSS string for the inline HTML artifact and a JS object for the React preview.

```ts
// Single source of truth for brand colours used by BOTH renderers.
// HTML artifact embeds `BRAND_CSS_VARS`. React preview imports `BRAND_COLORS`.

export const BRAND_COLORS = {
  orange: "#F8BF1C",
  orangeDeep: "#D9A614",
  grey: "#2C2B36",
  black: "#000000",
  white: "#FFFFFF",
  positive: "#35C759",
  neutral: "#FAC800",
  negative: "#FF5C60",
  inkDim: "#4A4954",
  muted: "#8A8994",
  paper2: "#FAFAF7",
  paper3: "#F2F1EC",
  rule: "#E0DFDA",
  ruleSoft: "#ECEBE6",
  slate: "#3D6B94",
} as const;

export const BRAND_CSS_VARS = `
:root{
  --orange:${BRAND_COLORS.orange};
  --grey:${BRAND_COLORS.grey};
  --black:${BRAND_COLORS.black};
  --white:${BRAND_COLORS.white};
  --positive:${BRAND_COLORS.positive};
  --positive-bg:rgba(53,199,89,0.12);
  --neutral:${BRAND_COLORS.neutral};
  --neutral-bg:rgba(250,200,0,0.18);
  --negative:${BRAND_COLORS.negative};
  --negative-bg:rgba(255,92,96,0.12);
  --ink:${BRAND_COLORS.black};
  --ink-soft:${BRAND_COLORS.grey};
  --ink-dim:${BRAND_COLORS.inkDim};
  --muted:${BRAND_COLORS.muted};
  --paper:${BRAND_COLORS.white};
  --paper-2:${BRAND_COLORS.paper2};
  --paper-3:${BRAND_COLORS.paper3};
  --rule:${BRAND_COLORS.rule};
  --rule-soft:${BRAND_COLORS.ruleSoft};
  --orange-deep:${BRAND_COLORS.orangeDeep};
  --orange-bg:rgba(248,191,28,0.12);
  --slate:${BRAND_COLORS.slate};
  --slate-bg:rgba(61,107,148,0.08);
}
`.trim();
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/types.ts src/lib/monthly-report/thresholds.ts src/lib/monthly-report/tokens.ts
git commit -m "feat(monthly-reports): shared types, thresholds, and brand tokens"
```

---

## Task 3: Period resolution + formatting helpers

**Files:**
- Create: `src/lib/monthly-report/period.ts`
- Create: `src/lib/monthly-report/period.test.ts`
- Create: `src/lib/monthly-report/format.ts`
- Create: `src/lib/monthly-report/format.test.ts`

- [ ] **Step 1: Write failing test for period resolver**

Create `src/lib/monthly-report/period.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePeriod, lastCompletedMonth, slugify } from "./period";

describe("resolvePeriod", () => {
  it("expands '2026-03' to a full month window with prior month", () => {
    expect(resolvePeriod("2026-03")).toEqual({
      period: "2026-03",
      start: "2026-03-01",
      end: "2026-03-31",
      prevStart: "2026-02-01",
      prevEnd: "2026-02-28",
      label: "March 2026",
    });
  });

  it("handles December → November rollover", () => {
    const p = resolvePeriod("2025-12");
    expect(p.start).toBe("2025-12-01");
    expect(p.end).toBe("2025-12-31");
    expect(p.prevStart).toBe("2025-11-01");
    expect(p.prevEnd).toBe("2025-11-30");
  });

  it("handles January → previous-year December rollover", () => {
    const p = resolvePeriod("2026-01");
    expect(p.prevStart).toBe("2025-12-01");
    expect(p.prevEnd).toBe("2025-12-31");
    expect(p.label).toBe("January 2026");
  });

  it("handles February leap year", () => {
    expect(resolvePeriod("2024-02").end).toBe("2024-02-29");
  });

  it("throws on malformed input", () => {
    expect(() => resolvePeriod("26-3")).toThrow();
    expect(() => resolvePeriod("2026-13")).toThrow();
    expect(() => resolvePeriod("2026-00")).toThrow();
  });
});

describe("lastCompletedMonth", () => {
  it("returns previous month when today is day 2+", () => {
    expect(lastCompletedMonth(new Date("2026-04-02T12:00:00Z"))).toBe("2026-03");
    expect(lastCompletedMonth(new Date("2026-04-23T12:00:00Z"))).toBe("2026-03");
  });

  it("returns month before previous when today is day 1 (Intentwise lag)", () => {
    expect(lastCompletedMonth(new Date("2026-04-01T12:00:00Z"))).toBe("2026-02");
  });

  it("rolls year back correctly", () => {
    expect(lastCompletedMonth(new Date("2026-01-05T12:00:00Z"))).toBe("2025-12");
  });
});

describe("slugify", () => {
  it("produces lowercase hyphenated slugs", () => {
    expect(slugify("Dr. Cuddles")).toBe("dr-cuddles");
    expect(slugify("Trejo's Tacos")).toBe("trejos-tacos");
    expect(slugify("Cloud23 Whole Foods")).toBe("cloud23-whole-foods");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run src/lib/monthly-report/period.test.ts
```

Expected: FAIL — "Cannot find module './period'".

- [ ] **Step 3: Implement `period.ts`**

Create `src/lib/monthly-report/period.ts`:

```ts
import type { MonthlyPeriod } from "./types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function lastDayOfMonth(year: number, monthIdx0: number): number {
  // Date(Y, monthIdx+1, 0) gives the last day of monthIdx.
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function resolvePeriod(period: string): MonthlyPeriod {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Invalid period '${period}' (expected YYYY-MM)`);
  const year = Number(m[1]);
  const month = Number(m[2]); // 1..12
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in '${period}'`);
  }

  const monthIdx = month - 1;
  const start = `${year}-${pad2(month)}-01`;
  const end = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, monthIdx))}`;

  const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1;
  const prevYear = monthIdx === 0 ? year - 1 : year;
  const prevStart = `${prevYear}-${pad2(prevMonthIdx + 1)}-01`;
  const prevEnd = `${prevYear}-${pad2(prevMonthIdx + 1)}-${pad2(lastDayOfMonth(prevYear, prevMonthIdx))}`;

  return {
    period,
    start,
    end,
    prevStart,
    prevEnd,
    label: `${MONTH_NAMES[monthIdx]} ${year}`,
  };
}

/**
 * Intentwise data lags 24-48h. We surface the previous calendar month, but on
 * day 1 of the next month the previous month's data is still landing, so we
 * back off one more month.
 */
export function lastCompletedMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const day = now.getUTCDate();
  // day 1: don't trust last month yet — go back 2 months
  // day 2+: last month is safe
  const offset = day <= 1 ? 2 : 1;
  const targetDate = new Date(Date.UTC(y, m - offset, 1));
  return `${targetDate.getUTCFullYear()}-${pad2(targetDate.getUTCMonth() + 1)}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")      // strip accents
    .replace(/[^a-z0-9]+/g, "-")          // non-alphanum → hyphen
    .replace(/^-+|-+$/g, "");             // trim leading/trailing hyphens
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run src/lib/monthly-report/period.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Write failing test for formatters**

Create `src/lib/monthly-report/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fmtMoney, fmtMoneyShort, fmtPct, fmtInt, fmtDelta } from "./format";

describe("fmtMoney", () => {
  it("formats with currency symbol and 2 decimals", () => {
    expect(fmtMoney(1234.5)).toBe("$1,234.50");
  });
  it("dashes null", () => {
    expect(fmtMoney(null)).toBe("—");
  });
});

describe("fmtMoneyShort", () => {
  it("uses K for thousands", () => {
    expect(fmtMoneyShort(14872)).toBe("$14.87K");
  });
  it("uses M for millions", () => {
    expect(fmtMoneyShort(2500000)).toBe("$2.50M");
  });
  it("plain for < 1000", () => {
    expect(fmtMoneyShort(42)).toBe("$42.00");
  });
});

describe("fmtPct", () => {
  it("defaults to 2 decimals", () => {
    expect(fmtPct(8.1234)).toBe("8.12%");
  });
  it("honours decimals arg", () => {
    expect(fmtPct(95.01, 1)).toBe("95.0%");
  });
});

describe("fmtInt", () => {
  it("thousand-separates", () => {
    expect(fmtInt(12345)).toBe("12,345");
  });
});

describe("fmtDelta", () => {
  it("positive with arrow + sign + 1 decimal", () => {
    expect(fmtDelta(0.152)).toBe("▲ +15.2%");
  });
  it("negative with arrow + sign", () => {
    expect(fmtDelta(-0.083)).toBe("▼ -8.3%");
  });
  it("flat for tiny deltas", () => {
    expect(fmtDelta(0.0005)).toBe("— 0.0%");
  });
  it("dashes null", () => {
    expect(fmtDelta(null)).toBe("—");
  });
});
```

- [ ] **Step 6: Run to confirm failure**

```bash
npx vitest run src/lib/monthly-report/format.test.ts
```

Expected: FAIL — missing module.

- [ ] **Step 7: Implement `format.ts`**

Create `src/lib/monthly-report/format.ts`:

```ts
import { THRESHOLDS } from "./thresholds";

const CURRENCY = THRESHOLDS.currencySymbol;

export function fmtMoney(x: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${CURRENCY}${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMoneyShort(x: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const abs = Math.abs(x);
  if (abs >= 1_000_000) return `${CURRENCY}${(x / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${CURRENCY}${(x / 1_000).toFixed(2)}K`;
  return `${CURRENCY}${x.toFixed(2)}`;
}

export function fmtPct(x: number | null, decimals = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${x.toFixed(decimals)}%`;
}

export function fmtInt(x: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return Math.trunc(x).toLocaleString("en-US");
}

/** Relative delta like 0.15 → "▲ +15.0%". */
export function fmtDelta(delta: number | null): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "—";
  const pct = delta * 100;
  if (Math.abs(pct) < 0.05) return `— ${pct.toFixed(1)}%`;
  const arrow = pct > 0 ? "▲" : "▼";
  const sign = pct > 0 ? "+" : "";
  return `${arrow} ${sign}${pct.toFixed(1)}%`;
}
```

- [ ] **Step 8: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/period.test.ts src/lib/monthly-report/format.test.ts
```

Expected: both files pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/monthly-report/period.ts src/lib/monthly-report/period.test.ts src/lib/monthly-report/format.ts src/lib/monthly-report/format.test.ts
git commit -m "feat(monthly-reports): period resolution and formatting helpers"
```

---

## Task 4: Config resolver (DB → `ReportConfig`)

**Files:**
- Create: `src/lib/monthly-report/config.ts`
- Create: `src/lib/monthly-report/config.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/monthly-report/config.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "from", "where"];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  return { mockDb: chain };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  reportSectionConfig: {
    scope: "scope",
    scopeKey: "scope_key",
    sectionKey: "section_key",
    enabled: "enabled",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
}));

import { resolveConfig, ALL_SECTION_KEYS } from "./config";

beforeEach(() => vi.clearAllMocks());

describe("resolveConfig", () => {
  it("defaults every section to enabled when table is empty", async () => {
    mockDb.where.mockResolvedValueOnce([]);
    const cfg = await resolveConfig("2348430");
    for (const key of ALL_SECTION_KEYS) {
      expect(cfg.enabled[key]).toBe(true);
    }
  });

  it("uses global rows when no client row exists", async () => {
    mockDb.where.mockResolvedValueOnce([
      { scope: "global", scopeKey: "default", sectionKey: "products", enabled: false },
    ]);
    const cfg = await resolveConfig("2348430");
    expect(cfg.enabled.products).toBe(false);
    expect(cfg.enabled.b2b).toBe(true); // default
  });

  it("client row wins over global row", async () => {
    mockDb.where.mockResolvedValueOnce([
      { scope: "global", scopeKey: "default", sectionKey: "products", enabled: false },
      { scope: "client",  scopeKey: "2348430", sectionKey: "products", enabled: true },
    ]);
    const cfg = await resolveConfig("2348430");
    expect(cfg.enabled.products).toBe(true);
  });

  it("ignores rows for a different client", async () => {
    mockDb.where.mockResolvedValueOnce([
      { scope: "client", scopeKey: "9999999", sectionKey: "products", enabled: false },
    ]);
    const cfg = await resolveConfig("2348430");
    expect(cfg.enabled.products).toBe(true); // default, other client's row ignored
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/lib/monthly-report/config.test.ts
```

Expected: FAIL — missing module.

- [ ] **Step 3: Implement `config.ts`**

Create `src/lib/monthly-report/config.ts`:

```ts
import { db } from "@/lib/db";
import { reportSectionConfig } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import type { ReportConfig, SectionKey } from "./types";

export const ALL_SECTION_KEYS: readonly SectionKey[] = ["products", "b2b"] as const;

/**
 * Resolve per-section enabled flags for a given client. Precedence:
 *   per-client row > global row > default (enabled = true).
 *
 * One query fetches both scopes in a single round-trip.
 */
export async function resolveConfig(clientIdCode: string): Promise<ReportConfig> {
  const rows = await db
    .select()
    .from(reportSectionConfig)
    .where(
      or(
        and(eq(reportSectionConfig.scope, "global"), eq(reportSectionConfig.scopeKey, "default")),
        and(eq(reportSectionConfig.scope, "client"), eq(reportSectionConfig.scopeKey, clientIdCode)),
      ),
    );

  const globalMap: Partial<Record<SectionKey, boolean>> = {};
  const clientMap: Partial<Record<SectionKey, boolean>> = {};
  for (const r of rows as Array<{ scope: string; scopeKey: string; sectionKey: string; enabled: boolean }>) {
    const key = r.sectionKey as SectionKey;
    if (!ALL_SECTION_KEYS.includes(key)) continue;
    if (r.scope === "client" && r.scopeKey === clientIdCode) clientMap[key] = r.enabled;
    else if (r.scope === "global" && r.scopeKey === "default") globalMap[key] = r.enabled;
  }

  const enabled = {} as Record<SectionKey, boolean>;
  for (const key of ALL_SECTION_KEYS) {
    enabled[key] = clientMap[key] ?? globalMap[key] ?? true;
  }
  return { enabled };
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/config.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/config.ts src/lib/monthly-report/config.test.ts
git commit -m "feat(monthly-reports): resolveConfig() with per-client > global > default precedence"
```

---

## Task 5: Headline KPI query + analyzer

**Files:**
- Create: `src/lib/monthly-report/queries/account.ts`
- Create: `src/lib/monthly-report/analyzers/headline-kpis.ts`
- Create: `src/lib/monthly-report/analyzers/headline-kpis.test.ts`

- [ ] **Step 1: Write account-level query**

Create `src/lib/monthly-report/queries/account.ts`:

```ts
import { queryRedshift } from "@/lib/redshift";

export interface AccountSummaryRow {
  product_sales: number;
  product_quantity: number;
  total_order_items: number;
  ad_revenue: number;
  ad_spend: number;
}

/**
 * Roll up account_summary over a date range.
 * Returns `null` if zero rows (signals "no data, omit section").
 */
export async function fetchAccountRollup(
  accountId: string,
  start: string,
  end: string,
): Promise<AccountSummaryRow | null> {
  const rows = await queryRedshift<AccountSummaryRow>(
    `
    SELECT
      COALESCE(SUM(product_sales), 0)     AS product_sales,
      COALESCE(SUM(product_quantity), 0)  AS product_quantity,
      COALESCE(SUM(total_order_items), 0) AS total_order_items,
      COALESCE(SUM(ad_revenue), 0)        AS ad_revenue,
      COALESCE(SUM(ad_spend), 0)          AS ad_spend
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
  `,
    [accountId, start, end],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  if (r.product_sales === 0 && r.product_quantity === 0 && r.total_order_items === 0) {
    return null;
  }
  return {
    product_sales: Number(r.product_sales),
    product_quantity: Number(r.product_quantity),
    total_order_items: Number(r.total_order_items),
    ad_revenue: Number(r.ad_revenue),
    ad_spend: Number(r.ad_spend),
  };
}
```

**Note (Task 0 dependency):** if the spike chose Option B/C and per-ASIN sessions aren't available, `sessions` and `buy_box` drop out of the KPI strip. `account_summary` does not carry sessions or buy-box — those come from the business-report-style table. The analyzer below treats them as optional; the renderer will render them as "—" when null.

- [ ] **Step 2: Write failing analyzer test**

Create `src/lib/monthly-report/analyzers/headline-kpis.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildHeadlineResult } from "./headline-kpis";
import type { AccountSummaryRow } from "../queries/account";

const base: AccountSummaryRow = {
  product_sales: 100000,
  product_quantity: 5000,
  total_order_items: 4200,
  ad_revenue: 30000,
  ad_spend: 7500,
};

describe("buildHeadlineResult", () => {
  it("returns null when current row is null", () => {
    expect(buildHeadlineResult(null, null)).toBeNull();
  });

  it("computes current KPIs without previous", () => {
    const r = buildHeadlineResult(base, null);
    expect(r).not.toBeNull();
    expect(r!.current.sales).toBe(100000);
    expect(r!.current.units).toBe(5000);
    expect(r!.current.orderItems).toBe(4200);
    expect(r!.current.aov).toBeCloseTo(100000 / 4200, 4);
    expect(r!.previous).toBeNull();
    expect(r!.deltas.sales).toBeNull();
  });

  it("computes MoM deltas when previous exists", () => {
    const prev: AccountSummaryRow = { ...base, product_sales: 80000, product_quantity: 4000, total_order_items: 3500 };
    const r = buildHeadlineResult(base, prev);
    expect(r!.deltas.sales).toBeCloseTo((100000 - 80000) / 80000, 4);
    expect(r!.deltas.units).toBeCloseTo((5000 - 4000) / 4000, 4);
  });

  it("handles zero previous gracefully (delta = null)", () => {
    const prev: AccountSummaryRow = { ...base, product_sales: 0 };
    const r = buildHeadlineResult(base, prev);
    expect(r!.deltas.sales).toBeNull();
  });

  it("aov is null when order items is 0", () => {
    const r = buildHeadlineResult({ ...base, total_order_items: 0 }, null);
    expect(r!.current.aov).toBeNull();
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npx vitest run src/lib/monthly-report/analyzers/headline-kpis.test.ts
```

Expected: FAIL — missing module.

- [ ] **Step 4: Implement analyzer**

Create `src/lib/monthly-report/analyzers/headline-kpis.ts`:

```ts
import type { AccountSummaryRow } from "../queries/account";
import type { HeadlineDeltas, HeadlineKpis, HeadlineResult } from "../types";

function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/**
 * v1 note: sessions, buyBox, pageviews are not available in account_summary.
 * Leave them as null until a per-ASIN / business-report source lands (see Task 0 spike).
 */
function rollupToKpis(row: AccountSummaryRow): HeadlineKpis {
  const aov = safeDiv(row.product_sales, row.total_order_items);
  return {
    sales: row.product_sales,
    units: row.product_quantity,
    sessions: 0, // unknown at account_summary layer — see Task 0 decision
    pageviews: 0,
    orderItems: row.total_order_items,
    cvr: null,
    buyBox: null,
    aov,
  };
}

function computeDeltas(curr: HeadlineKpis, prev: HeadlineKpis): HeadlineDeltas {
  const rel = (c: number | null, p: number | null): number | null => {
    if (c === null || p === null) return null;
    if (p === 0) return null;
    return (c - p) / p;
  };
  return {
    sales:    rel(curr.sales,    prev.sales),
    units:    rel(curr.units,    prev.units),
    sessions: rel(curr.sessions, prev.sessions),
    cvr:      rel(curr.cvr,      prev.cvr),
    buyBox:   rel(curr.buyBox,   prev.buyBox),
    aov:      rel(curr.aov,      prev.aov),
  };
}

export function buildHeadlineResult(
  current: AccountSummaryRow | null,
  previous: AccountSummaryRow | null,
): HeadlineResult | null {
  if (!current) return null;
  const curr = rollupToKpis(current);
  const prev = previous ? rollupToKpis(previous) : null;
  return {
    current: curr,
    previous: prev,
    deltas: prev
      ? computeDeltas(curr, prev)
      : { sales: null, units: null, sessions: null, cvr: null, buyBox: null, aov: null },
  };
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/analyzers/headline-kpis.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/monthly-report/queries/account.ts src/lib/monthly-report/analyzers/headline-kpis.ts src/lib/monthly-report/analyzers/headline-kpis.test.ts
git commit -m "feat(monthly-reports): account rollup query + headline KPI analyzer"
```

---

## Task 6: Products section (query + analyzer) — Option A path

**Note:** This task assumes Task 0's spike found a per-ASIN table. Replace `<PER_ASIN_TABLE>`, `<SESSIONS_COL>`, `<UNITS_COL>`, `<SALES_COL>`, `<BUY_BOX_COL>`, `<ASIN_COL>` in Step 1 with the actual names from the research doc. If Option C (no per-ASIN data) was chosen, skip this entire task — the registry in Task 10 omits `products`.

**Files:**
- Create: `src/lib/monthly-report/queries/products.ts`
- Create: `src/lib/monthly-report/analyzers/products.ts`
- Create: `src/lib/monthly-report/analyzers/products.test.ts`

- [ ] **Step 1: Write per-ASIN query**

Create `src/lib/monthly-report/queries/products.ts`. Substitute the identifiers from Task 0 output:

```ts
import { queryRedshift } from "@/lib/redshift";

export interface RawProductRow {
  asin: string;
  parent_asin: string | null;
  title: string | null;
  sku: string | null;
  sessions: number;
  units: number;
  sales: number;
  order_items: number;
  buy_box: number | null;
}

export async function fetchProductRows(
  accountId: string,
  start: string,
  end: string,
): Promise<RawProductRow[]> {
  // TODO(Task 0): replace <PER_ASIN_TABLE> and column aliases with actual Redshift identifiers.
  const rows = await queryRedshift<Record<string, unknown>>(
    `
    SELECT
      <ASIN_COL>          AS asin,
      parent_asin         AS parent_asin,
      title               AS title,
      sku                 AS sku,
      SUM(<SESSIONS_COL>) AS sessions,
      SUM(<UNITS_COL>)    AS units,
      SUM(<SALES_COL>)    AS sales,
      SUM(total_order_items) AS order_items,
      AVG(<BUY_BOX_COL>)  AS buy_box
    FROM intentwise_ecommerce_graph.<PER_ASIN_TABLE>
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY <ASIN_COL>, parent_asin, title, sku
    `,
    [accountId, start, end],
  );
  return rows.map((r) => ({
    asin: String(r.asin ?? ""),
    parent_asin: r.parent_asin ? String(r.parent_asin) : null,
    title: r.title ? String(r.title) : null,
    sku: r.sku ? String(r.sku) : null,
    sessions: Number(r.sessions ?? 0),
    units: Number(r.units ?? 0),
    sales: Number(r.sales ?? 0),
    order_items: Number(r.order_items ?? 0),
    buy_box: r.buy_box == null ? null : Number(r.buy_box),
  }));
}
```

- [ ] **Step 2: Write failing analyzer test**

Create `src/lib/monthly-report/analyzers/products.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { analyzeProducts } from "./products";
import type { RawProductRow } from "../queries/products";

function mk(partial: Partial<RawProductRow>): RawProductRow {
  return {
    asin: "B001", parent_asin: null, title: null, sku: null,
    sessions: 100, units: 10, sales: 250, order_items: 9, buy_box: 95,
    ...partial,
  };
}

describe("analyzeProducts", () => {
  it("returns null when rows empty", () => {
    expect(analyzeProducts([])).toBeNull();
  });

  it("sorts by sales descending and caps at top_products", () => {
    const rows = Array.from({ length: 30 }, (_, i) => mk({ asin: `B${i}`, sales: i }));
    const result = analyzeProducts(rows);
    expect(result).not.toBeNull();
    expect(result!.nTotal).toBe(30);
    expect(result!.rows).toHaveLength(20); // THRESHOLDS.report.topProducts
    expect(result!.rows[0].asin).toBe("B29");
  });

  it("computes CVR as units/sessions*100", () => {
    const r = analyzeProducts([mk({ sessions: 200, units: 10 })]);
    expect(r!.rows[0].cvr).toBe(5);
  });

  it("null CVR when sessions = 0", () => {
    const r = analyzeProducts([mk({ sessions: 0, units: 5 })]);
    expect(r!.rows[0].cvr).toBeNull();
  });

  it("null AOV when order_items = 0", () => {
    const r = analyzeProducts([mk({ sales: 100, order_items: 0 })]);
    expect(r!.rows[0].aov).toBeNull();
  });

  it("preserves null buy_box (unadvertised ASIN case)", () => {
    const r = analyzeProducts([mk({ buy_box: null })]);
    expect(r!.rows[0].buyBox).toBeNull();
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npx vitest run src/lib/monthly-report/analyzers/products.test.ts
```

Expected: FAIL — missing module.

- [ ] **Step 4: Implement analyzer**

Create `src/lib/monthly-report/analyzers/products.ts`:

```ts
import type { ProductRow, ProductsResult } from "../types";
import type { RawProductRow } from "../queries/products";
import { THRESHOLDS } from "../thresholds";

export function analyzeProducts(rows: RawProductRow[]): ProductsResult | null {
  if (rows.length === 0) return null;

  const shaped: ProductRow[] = rows.map((r) => ({
    asin: r.asin,
    parent: r.parent_asin ?? "",
    title: r.title ?? "",
    sku: r.sku ?? "",
    sessions: r.sessions,
    units: r.units,
    sales: r.sales,
    orderItems: r.order_items,
    cvr: r.sessions > 0 ? (r.units / r.sessions) * 100 : null,
    buyBox: r.buy_box,
    aov: r.order_items > 0 ? r.sales / r.order_items : null,
  }));

  shaped.sort((a, b) => b.sales - a.sales);
  return { rows: shaped.slice(0, THRESHOLDS.report.topProducts), nTotal: shaped.length };
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/analyzers/products.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/monthly-report/queries/products.ts src/lib/monthly-report/analyzers/products.ts src/lib/monthly-report/analyzers/products.test.ts
git commit -m "feat(monthly-reports): per-ASIN products query + analyzer"
```

---

## Task 7: B2B section (query + analyzer) — Option A path

**Note:** like Task 6, this depends on Task 0's outcome. Skip if B2B columns weren't found.

**Files:**
- Create: `src/lib/monthly-report/queries/b2b.ts`
- Create: `src/lib/monthly-report/analyzers/b2b.ts`
- Create: `src/lib/monthly-report/analyzers/b2b.test.ts`

- [ ] **Step 1: Write query**

Create `src/lib/monthly-report/queries/b2b.ts`. Substitute column names from Task 0:

```ts
import { queryRedshift } from "@/lib/redshift";

export interface RawB2bRow {
  total_sales: number;
  b2b_sales: number;
  total_units: number;
  b2b_units: number;
}

export async function fetchB2bRollup(
  accountId: string,
  start: string,
  end: string,
): Promise<RawB2bRow | null> {
  // TODO(Task 0): substitute <B2B_SALES_COL>, <B2B_UNITS_COL>, <SALES_COL>, <UNITS_COL>, <TABLE>.
  const rows = await queryRedshift<Record<string, unknown>>(
    `
    SELECT
      COALESCE(SUM(<SALES_COL>), 0)       AS total_sales,
      COALESCE(SUM(<B2B_SALES_COL>), 0)   AS b2b_sales,
      COALESCE(SUM(<UNITS_COL>), 0)       AS total_units,
      COALESCE(SUM(<B2B_UNITS_COL>), 0)   AS b2b_units
    FROM intentwise_ecommerce_graph.<TABLE>
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    `,
    [accountId, start, end],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    total_sales: Number(r.total_sales ?? 0),
    b2b_sales: Number(r.b2b_sales ?? 0),
    total_units: Number(r.total_units ?? 0),
    b2b_units: Number(r.b2b_units ?? 0),
  };
}
```

- [ ] **Step 2: Write failing analyzer test**

Create `src/lib/monthly-report/analyzers/b2b.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { analyzeB2b } from "./b2b";

describe("analyzeB2b", () => {
  it("returns null when row is null", () => {
    expect(analyzeB2b(null)).toBeNull();
  });

  it("returns null when no sales and no units", () => {
    expect(analyzeB2b({ total_sales: 0, b2b_sales: 0, total_units: 0, b2b_units: 0 })).toBeNull();
  });

  it("computes share percentages", () => {
    const r = analyzeB2b({ total_sales: 1000, b2b_sales: 150, total_units: 100, b2b_units: 8 });
    expect(r!.b2bShareSales).toBeCloseTo(15, 4);
    expect(r!.b2bShareUnits).toBeCloseTo(8, 4);
    expect(r!.totalSales).toBe(1000);
  });

  it("handles zero totals without dividing by zero", () => {
    const r = analyzeB2b({ total_sales: 0, b2b_sales: 0, total_units: 50, b2b_units: 10 });
    expect(r!.b2bShareSales).toBe(0);
    expect(r!.b2bShareUnits).toBe(20);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npx vitest run src/lib/monthly-report/analyzers/b2b.test.ts
```

Expected: FAIL — missing module.

- [ ] **Step 4: Implement analyzer**

Create `src/lib/monthly-report/analyzers/b2b.ts`:

```ts
import type { B2bResult } from "../types";
import type { RawB2bRow } from "../queries/b2b";

export function analyzeB2b(row: RawB2bRow | null): B2bResult | null {
  if (!row) return null;
  if (row.total_sales <= 0 && row.total_units <= 0) return null;
  return {
    totalSales: row.total_sales,
    b2bSales: row.b2b_sales,
    b2bShareSales: row.total_sales > 0 ? (row.b2b_sales / row.total_sales) * 100 : 0,
    totalUnits: row.total_units,
    b2bUnits: row.b2b_units,
    b2bShareUnits: row.total_units > 0 ? (row.b2b_units / row.total_units) * 100 : 0,
  };
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/analyzers/b2b.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/monthly-report/queries/b2b.ts src/lib/monthly-report/analyzers/b2b.ts src/lib/monthly-report/analyzers/b2b.test.ts
git commit -m "feat(monthly-reports): B2B query + analyzer"
```

---

## Task 8: HTML renderer — KPI strip + primitives + template shell

**Files:**
- Create: `src/lib/monthly-report/render-html/primitives.ts`
- Create: `src/lib/monthly-report/render-html/kpi-strip.ts`
- Create: `src/lib/monthly-report/render-html/kpi-strip.test.ts`
- Create: `src/lib/monthly-report/render-html/template.ts`
- Create: `src/lib/monthly-report/render-html/logo.ts`

- [ ] **Step 1: Write primitives**

Create `src/lib/monthly-report/render-html/primitives.ts`:

```ts
// HTML building blocks shared by section renderers.
// IMPORTANT: every user-provided string flowing through these primitives must
// be passed through `escape()` first. ASINs, SKUs, titles, client names, period
// strings are all untrusted input in the sense that the pipeline should never
// produce HTML that could break the document structure.

export function escape(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function td(value: string, klass = ""): string {
  const k = klass ? ` class="${klass}"` : "";
  return `<td${k}>${value}</td>`;
}

export function row(cells: string[]): string {
  return `<tr>${cells.join("")}</tr>`;
}

export function pivot(headers: string[], bodyRows: string[], grandRow?: string): string {
  const th = headers.map((h) => `<th>${escape(h)}</th>`).join("");
  const body = bodyRows.join("\n");
  return (
    `<div class="pivot-wrap"><table class="pivot">` +
    `<thead><tr>${th}</tr></thead>` +
    `<tbody>${body}${grandRow ?? ""}</tbody></table></div>`
  );
}

export type ObservationSeverity = "critical" | "warn" | "good" | "info";

export function obs(sev: ObservationSeverity, tag: string, headline: string, body: string): string {
  return (
    `<div class="obs ${sev}">` +
    `<div class="obs-head"><div class="obs-tag">${escape(tag)}</div></div>` +
    `<h4>${escape(headline)}</h4><p>${body}</p></div>`
  );
}

export function section(
  num: string,
  title: string,
  deck: string,
  bodyHtml: string,
  observationsHtml: string[],
): string {
  const obsHtml = observationsHtml.join("\n");
  return (
    `<section class="section">` +
    `<span class="section-num">§ ${escape(num)}</span>` +
    `<h2 class="section-title">${escape(title)}</h2>` +
    `<div class="section-deck">${escape(deck)}</div>` +
    `${bodyHtml}${obsHtml}</section>`
  );
}
```

- [ ] **Step 2: Write failing KPI strip test**

Create `src/lib/monthly-report/render-html/kpi-strip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderKpiStrip } from "./kpi-strip";
import type { HeadlineResult } from "../types";

const withPrev: HeadlineResult = {
  current: { sales: 100000, units: 5000, sessions: 0, pageviews: 0, orderItems: 4200, cvr: null, buyBox: null, aov: 100000 / 4200 },
  previous: { sales: 80000, units: 4000, sessions: 0, pageviews: 0, orderItems: 3500, cvr: null, buyBox: null, aov: 80000 / 3500 },
  deltas: { sales: 0.25, units: 0.25, sessions: null, cvr: null, buyBox: null, aov: (100000 / 4200 - 80000 / 3500) / (80000 / 3500) },
};

describe("renderKpiStrip", () => {
  it("renders six cells", () => {
    const html = renderKpiStrip(withPrev);
    const matches = html.match(/<div class="kpi-cell">/g);
    expect(matches?.length).toBe(6);
  });

  it("includes short-form sales value", () => {
    const html = renderKpiStrip(withPrev);
    expect(html).toContain("$100.00K");
  });

  it("renders MoM delta arrows for each non-null delta", () => {
    const html = renderKpiStrip(withPrev);
    expect(html).toContain("▲");
    expect(html).toContain("+25.0%");
  });

  it("renders dash when delta is null (no previous)", () => {
    const noPrev: HeadlineResult = { ...withPrev, previous: null, deltas: { sales: null, units: null, sessions: null, cvr: null, buyBox: null, aov: null } };
    const html = renderKpiStrip(noPrev);
    expect(html).not.toContain("▲");
    expect(html).not.toContain("▼");
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npx vitest run src/lib/monthly-report/render-html/kpi-strip.test.ts
```

Expected: FAIL — missing module.

- [ ] **Step 4: Implement KPI strip renderer**

Create `src/lib/monthly-report/render-html/kpi-strip.ts`:

```ts
import type { HeadlineResult } from "../types";
import { fmtDelta, fmtInt, fmtMoney, fmtMoneyShort, fmtPct } from "../format";
import { escape } from "./primitives";

interface Cell {
  label: string;
  value: string;
  sub: string;
  cls?: string;
}

export function renderKpiStrip(h: HeadlineResult): string {
  const c = h.current;
  const d = h.deltas;

  const cells: Cell[] = [
    { label: "Total Sales",   value: fmtMoneyShort(c.sales),  sub: `${fmtInt(c.orderItems)} order items · ${fmtDelta(d.sales)}` },
    { label: "Units Ordered", value: fmtInt(c.units),          sub: `AOV ${fmtMoney(c.aov)} · ${fmtDelta(d.units)}` },
    { label: "Sessions",      value: c.sessions > 0 ? fmtInt(c.sessions) : "—", sub: c.sessions > 0 ? `${fmtInt(c.pageviews)} page views · ${fmtDelta(d.sessions)}` : "not available" },
    { label: "Buy Box %",     value: fmtPct(c.buyBox, 1),     sub: c.buyBox === null ? "not available" : `weighted by sessions · ${fmtDelta(d.buyBox)}` },
    { label: "Conversion",    value: fmtPct(c.cvr, 2),        sub: c.cvr === null ? "not available" : `units / session · ${fmtDelta(d.cvr)}` },
    { label: "AOV",           value: fmtMoney(c.aov),         sub: `sales / order items · ${fmtDelta(d.aov)}` },
  ];

  const inner = cells
    .map(
      (cell) =>
        `<div class="kpi-cell">` +
        `<div class="l">${escape(cell.label)}</div>` +
        `<div class="v">${escape(cell.value)}</div>` +
        `<div class="s${cell.cls ? " " + cell.cls : ""}">${escape(cell.sub)}</div>` +
        `</div>`,
    )
    .join("");
  return `<div class="kpi-row">${inner}</div>`;
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/render-html/kpi-strip.test.ts
```

Expected: all pass.

- [ ] **Step 6: Port logo SVG**

Create `src/lib/monthly-report/render-html/logo.ts`:

```ts
// Inline 1o8 Marketplace logo SVG, copied verbatim from
// 1o8hub-monthly-report/references/logo.svg so the HTML artifact is single-file.
// This file is intentionally large (one path data blob per glyph) — do not reformat.

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" width="100%" viewBox="0 0 1600 1200" enable-background="new 0 0 1600 1200" xml:space="preserve">` +
// PASTE the full contents of 1o8hub-monthly-report/references/logo.svg here (between the opening <svg ...> and closing </svg>).
// Read the file with: cat 1o8hub-monthly-report/references/logo.svg | sed 's/`/\\`/g'
// Then paste between the backticks below.
`</svg>`;
```

Then fill in the logo body:

```bash
# From the worktree root
node -e "const fs=require('fs');const s=fs.readFileSync('1o8hub-monthly-report/references/logo.svg','utf8').replace(/\`/g,'\\\\\`');console.log('export const LOGO_SVG = \`' + s + '\`;');" > /tmp/logo-out.ts
cat /tmp/logo-out.ts
```

Replace the entire body of `src/lib/monthly-report/render-html/logo.ts` with the output (a single `export const LOGO_SVG = \`<svg …>…</svg>\`;` line).

- [ ] **Step 7: Port template shell**

Create `src/lib/monthly-report/render-html/template.ts`. The full CSS block is long (~220 lines of CSS from `1o8hub-monthly-report/references/template.html` lines 47–280, with Python `{{`/`}}` doubled braces flattened back to `{`/`}`). Copy from `references/template.html`, change doubled `{{ … }}` back to `{ … }` in the CSS, and wrap in a template-literal function:

```ts
import { BRAND_CSS_VARS } from "../tokens";
import { LOGO_SVG } from "./logo";
import { escape } from "./primitives";

interface ShellArgs {
  client: string;
  period: string; // "March 2026"
  today: string;  // "23 APR 2026"
  kpiHtml: string;
  sectionsHtml: string;
}

export function renderShell(args: ShellArgs): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(args.client)} · Monthly Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
${BRAND_CSS_VARS}
${SHELL_CSS}
</style>
</head>
<body>
<div class="masthead">
  <div class="masthead-inner">
    <div class="masthead-logo" aria-label="1o8 Marketplace">
      ${LOGO_SVG}
    </div>
    <div class="masthead-meta">Monthly Performance Report</div>
  </div>
</div>
<main class="shell">
<header class="cover">
  <div class="stamp">Client · ${escape(args.client)}</div>
  <h1 class="cover-title">${escape(args.client)} <em>monthly.</em></h1>
  <div class="cover-sub">Performance overview for ${escape(args.period)}. Metrics are drawn from Seller Central business reports and ad platform exports. Sections with no underlying data are omitted automatically.</div>
  <div class="cover-meta">
    <div><div class="label">Period</div><div class="val">${escape(args.period)}</div></div>
    <div><div class="label">Prepared</div><div class="val">${escape(args.today)}</div></div>
    <div><div class="label">Source</div><div class="val">Amazon Seller Central</div></div>
  </div>
</header>
<div class="body">
${args.kpiHtml}
${args.sectionsHtml}
<div class="doc-footer">
  <div>${escape(args.client)} · Monthly report · <span class="brand">1o8 Marketplace</span></div>
  <div>${escape(args.today)}</div>
</div>
</div>
</main>
</body>
</html>`;
}

// CSS copied verbatim from 1o8hub-monthly-report/references/template.html
// (everything inside the <style> block between :root { ... } and the closing </style>,
// EXCEPT the :root { ... } block itself — that is emitted by BRAND_CSS_VARS above).
// The original file used Python format doubled braces ({{ }}) — this copy uses single braces.
const SHELL_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{
  background:var(--paper);
  color:var(--ink);
  font-family:'Inter',sans-serif;
  font-weight:400;
  font-size:11px;
  line-height:1.55;
  font-feature-settings:"tnum" 1, "cv11" 1;
  -webkit-font-smoothing:antialiased
}
.shell{max-width:1180px;margin:0 auto;padding:0}
/* ... PASTE the remaining ~200 lines here verbatim ... */
`;
```

To fill `SHELL_CSS`, run the following and paste the output where `/* ... PASTE ... */` is. The script extracts CSS between `*{box-sizing` and `</style>`, then undoubles `{{`/`}}`:

```bash
node -e '
const fs=require("fs");
const src=fs.readFileSync("1o8hub-monthly-report/references/template.html","utf8");
const start=src.indexOf("*{box-sizing");
const end=src.indexOf("</style>");
let css=src.slice(start,end);
css=css.replace(/\{\{/g,"{").replace(/\}\}/g,"}");
console.log(css);
'
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/monthly-report/render-html/
git commit -m "feat(monthly-reports): HTML primitives, KPI strip, template shell, inline logo"
```

---

## Task 9: HTML renderers — Products + B2B sections

**Files:**
- Create: `src/lib/monthly-report/render-html/products.ts`
- Create: `src/lib/monthly-report/render-html/b2b.ts`
- Create: `src/lib/monthly-report/render-html/sections.test.ts`

- [ ] **Step 1: Implement Products renderer**

Create `src/lib/monthly-report/render-html/products.ts`:

```ts
import type { ProductsResult } from "../types";
import { classifyMetric, THRESHOLDS } from "../thresholds";
import { fmtInt, fmtMoney, fmtPct } from "../format";
import { escape, obs, pivot, row, section, td } from "./primitives";

export function renderProductsHtml(d: ProductsResult, num: string, title: string, deck: string): string {
  let totalSales = 0, totalUnits = 0, totalSessions = 0;
  const bodyRows = d.rows.map((r) => {
    totalSales += r.sales;
    totalUnits += r.units;
    totalSessions += r.sessions;
    const titleShort = r.title.length > 80 ? r.title.slice(0, 80) + "…" : r.title;
    const cvrCls = classifyMetric(r.cvr, "cvr");
    const bbCls = classifyMetric(r.buyBox, "buyBox");
    return row([
      td(`<strong>${escape(r.asin)}</strong><br><span class="dim">${escape(titleShort)}</span>`),
      td(escape(fmtInt(r.sessions))),
      td(escape(fmtInt(r.units))),
      td(escape(fmtMoney(r.sales))),
      td(escape(fmtPct(r.cvr, 2)), cvrCls),
      td(escape(fmtPct(r.buyBox, 1)), bbCls),
      td(escape(r.aov === null ? "—" : fmtMoney(r.aov))),
    ]);
  });

  const grand =
    `<tr class="grand">` +
    `<td>Grand Total (${escape(String(d.nTotal))} SKUs)</td>` +
    `<td>${escape(fmtInt(totalSessions))}</td>` +
    `<td>${escape(fmtInt(totalUnits))}</td>` +
    `<td>${escape(fmtMoney(totalSales))}</td>` +
    `<td>—</td><td>—</td><td>—</td>` +
    `</tr>`;

  const body = pivot(
    ["ASIN / Title", "Sessions", "Units", "Sales", "CVR", "Buy Box", "AOV"],
    bodyRows,
    grand,
  );

  const deadSkus = d.rows.filter(
    (r) => r.sessions >= THRESHOLDS.sku.zeroSalesWithTraffic && r.units === 0,
  );
  const lowCvr = d.rows.filter(
    (r) => r.sessions >= THRESHOLDS.sku.minSessionsToJudge && r.cvr !== null && r.cvr < THRESHOLDS.cvr.critical && r.units > 0,
  );

  const observations: string[] = [];
  if (deadSkus.length > 0) {
    const lst = deadSkus.slice(0, 5).map((r) => r.asin).join(", ");
    observations.push(
      obs(
        "critical",
        "Dead SKUs",
        `${deadSkus.length} SKU(s) received ≥${THRESHOLDS.sku.zeroSalesWithTraffic} sessions but zero orders`,
        `Review listing quality, pricing, or inventory status on: ${escape(lst)}.`,
      ),
    );
  }
  if (lowCvr.length > 0) {
    observations.push(
      obs(
        "warn",
        "Low conversion",
        `${lowCvr.length} SKU(s) converting below ${THRESHOLDS.cvr.critical}% despite meaningful traffic`,
        "Listing hygiene (main image, reviews, A+ content) typically outperforms bid changes for lifting CVR.",
      ),
    );
  }

  return section(num, title, deck, body, observations);
}
```

- [ ] **Step 2: Implement B2B renderer**

Create `src/lib/monthly-report/render-html/b2b.ts`:

```ts
import type { B2bResult } from "../types";
import { fmtInt, fmtMoney, fmtPct } from "../format";
import { escape, obs, pivot, row, section, td } from "./primitives";

export function renderB2bHtml(d: B2bResult, num: string, title: string, deck: string): string {
  const bodyRows = [
    row([
      td("B2B (business buyers)"),
      td(escape(fmtMoney(d.b2bSales))),
      td(escape(fmtPct(d.b2bShareSales, 2))),
      td(escape(fmtInt(d.b2bUnits))),
      td(escape(fmtPct(d.b2bShareUnits, 2))),
    ]),
    row([
      td("B2C (consumer)"),
      td(escape(fmtMoney(d.totalSales - d.b2bSales))),
      td(escape(fmtPct(100 - d.b2bShareSales, 2))),
      td(escape(fmtInt(d.totalUnits - d.b2bUnits))),
      td(escape(fmtPct(100 - d.b2bShareUnits, 2))),
    ]),
  ];

  const grand =
    `<tr class="grand">` +
    `<td>Total</td>` +
    `<td>${escape(fmtMoney(d.totalSales))}</td><td>100.00%</td>` +
    `<td>${escape(fmtInt(d.totalUnits))}</td><td>100.00%</td>` +
    `</tr>`;

  const body = pivot(
    ["Segment", "Sales", "Sales Share", "Units", "Unit Share"],
    bodyRows,
    grand,
  );

  const observations: string[] = [];
  if (d.b2bShareSales > 15) {
    observations.push(
      obs(
        "info",
        "Notable B2B share",
        `B2B accounts for ${fmtPct(d.b2bShareSales, 1)} of sales`,
        "Consider whether B2B pricing, pack sizes, or Business Discount programs are optimally configured.",
      ),
    );
  }
  return section(num, title, deck, body, observations);
}
```

- [ ] **Step 3: Write snapshot-style tests**

Create `src/lib/monthly-report/render-html/sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderProductsHtml } from "./products";
import { renderB2bHtml } from "./b2b";
import type { ProductsResult, B2bResult } from "../types";

const productsFixture: ProductsResult = {
  rows: [
    { asin: "B001", parent: "", title: "Widget A", sku: "SKU-A", sessions: 500, units: 45, sales: 1125, orderItems: 40, cvr: 9, buyBox: 92, aov: 28.125 },
    { asin: "B002", parent: "", title: "Widget B with a very long title that will be truncated when it exceeds eighty characters threshold", sku: "SKU-B", sessions: 150, units: 0, sales: 0, orderItems: 0, cvr: 0, buyBox: 88, aov: null },
  ],
  nTotal: 2,
};

const b2bFixture: B2bResult = {
  totalSales: 1000, b2bSales: 200, b2bShareSales: 20, totalUnits: 100, b2bUnits: 15, b2bShareUnits: 15,
};

describe("renderProductsHtml", () => {
  it("renders pivot headers", () => {
    const html = renderProductsHtml(productsFixture, "01", "Product performance", "deck");
    expect(html).toContain("ASIN / Title");
    expect(html).toContain("Buy Box");
  });

  it("truncates long titles at 80 chars with ellipsis", () => {
    const html = renderProductsHtml(productsFixture, "01", "Product performance", "deck");
    expect(html).toContain("Widget B with a very long title that will be truncated when it exceeds eighty ch…");
  });

  it("surfaces dead-SKU observation for zero-sales-with-traffic rows", () => {
    // Dead-SKU threshold is 100 sessions; fixture B002 has 150 sessions and 0 units, so it qualifies.
    const html = renderProductsHtml(productsFixture, "01", "Product performance", "deck");
    expect(html).toContain("Dead SKUs");
    expect(html).toContain("B002");
  });

  it("escapes HTML in ASINs and titles", () => {
    const r: ProductsResult = { rows: [{ asin: "<B001>", parent: "", title: "A&B", sku: "", sessions: 10, units: 1, sales: 1, orderItems: 1, cvr: 10, buyBox: null, aov: 1 }], nTotal: 1 };
    const html = renderProductsHtml(r, "01", "x", "y");
    expect(html).toContain("&lt;B001&gt;");
    expect(html).toContain("A&amp;B");
  });
});

describe("renderB2bHtml", () => {
  it("renders both segment rows and the grand total", () => {
    const html = renderB2bHtml(b2bFixture, "02", "B2B split", "deck");
    expect(html).toContain("B2B (business buyers)");
    expect(html).toContain("B2C (consumer)");
    expect(html).toContain("100.00%");
  });

  it("adds B2B observation when share > 15%", () => {
    const html = renderB2bHtml(b2bFixture, "02", "B2B split", "deck");
    expect(html).toContain("Notable B2B share");
  });

  it("omits B2B observation when share <= 15%", () => {
    const small: B2bResult = { ...b2bFixture, b2bShareSales: 10 };
    const html = renderB2bHtml(small, "02", "B2B split", "deck");
    expect(html).not.toContain("Notable B2B share");
  });
});
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/render-html/
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/render-html/products.ts src/lib/monthly-report/render-html/b2b.ts src/lib/monthly-report/render-html/sections.test.ts
git commit -m "feat(monthly-reports): HTML renderers for Products and B2B sections"
```

---

## Task 10: Registry + orchestrator

**Files:**
- Create: `src/lib/monthly-report/registry.ts`
- Create: `src/lib/monthly-report/orchestrator.ts`
- Create: `src/lib/monthly-report/orchestrator.test.ts`
- Create: `src/lib/monthly-report/index.ts`

- [ ] **Step 1: Write registry**

Create `src/lib/monthly-report/registry.ts`:

```ts
// SINGLE SOURCE OF TRUTH for sections.
// Every section key must appear here with both its analyzer + HTML renderer
// and (later, Task 13) its React component. The config UI walks this list.

import type { AnalyzerResult, B2bResult, ProductsResult, SectionKey } from "./types";
import { renderProductsHtml } from "./render-html/products";
import { renderB2bHtml } from "./render-html/b2b";

export interface SectionDef {
  key: SectionKey;
  label: string;
  deck: string;
  renderHtml: (d: AnalyzerResult["data"], num: string, title: string, deck: string) => string;
}

export const SECTIONS: ReadonlyArray<SectionDef> = [
  {
    key: "products",
    label: "Product performance",
    deck: "Per-ASIN breakdown sorted by sales. Colour coding is driven by CVR and buy-box thresholds.",
    renderHtml: (d, n, t, k) => renderProductsHtml(d as ProductsResult, n, t, k),
  },
  {
    key: "b2b",
    label: "B2B split",
    deck: "Share of revenue and units from Amazon Business buyers versus consumers.",
    renderHtml: (d, n, t, k) => renderB2bHtml(d as B2bResult, n, t, k),
  },
] as const;
```

**If Task 0 deferred Products or B2B:** delete the corresponding entry from `SECTIONS`. The config UI, route, and React preview all read from `SECTIONS` — removing an entry removes it everywhere consistently.

- [ ] **Step 2: Write orchestrator**

Create `src/lib/monthly-report/orchestrator.ts`:

```ts
import type {
  AnalyzerResult,
  ClientContext,
  HeadlineResult,
  MonthlyPeriod,
  ReportConfig,
  SectionKey,
} from "./types";
import { SECTIONS } from "./registry";
import { renderKpiStrip } from "./render-html/kpi-strip";
import { renderShell } from "./render-html/template";
import { fetchAccountRollup } from "./queries/account";
import { fetchProductRows } from "./queries/products";
import { fetchB2bRollup } from "./queries/b2b";
import { buildHeadlineResult } from "./analyzers/headline-kpis";
import { analyzeProducts } from "./analyzers/products";
import { analyzeB2b } from "./analyzers/b2b";

export interface ReportPayload {
  html: string;
  headline: HeadlineResult | null;
  sections: Array<{ key: SectionKey; result: AnalyzerResult }>;
  skipped: SectionKey[];
}

export async function generateReport(
  client: ClientContext,
  period: MonthlyPeriod,
  config: ReportConfig,
): Promise<ReportPayload> {
  // 1. Fetch account rollups in parallel (current + previous for MoM).
  const [curr, prev] = await Promise.all([
    fetchAccountRollup(client.accountId, period.start, period.end),
    fetchAccountRollup(client.accountId, period.prevStart, period.prevEnd),
  ]);
  const headline = buildHeadlineResult(curr, prev);

  // 2. For each enabled section, run the analyzer. Section-specific data
  //    fetches happen here; they don't share rows with the headline rollup.
  const sectionResults: Array<{ key: SectionKey; result: AnalyzerResult }> = [];
  const skipped: SectionKey[] = [];

  for (const def of SECTIONS) {
    if (!config.enabled[def.key]) {
      skipped.push(def.key);
      continue;
    }
    let result: AnalyzerResult["data"] | null = null;
    if (def.key === "products") {
      const rows = await fetchProductRows(client.accountId, period.start, period.end);
      result = analyzeProducts(rows);
      if (result) sectionResults.push({ key: "products", result: { kind: "products", data: result } });
    } else if (def.key === "b2b") {
      const row = await fetchB2bRollup(client.accountId, period.start, period.end);
      result = analyzeB2b(row);
      if (result) sectionResults.push({ key: "b2b", result: { kind: "b2b", data: result } });
    }
    if (!result) skipped.push(def.key);
  }

  // 3. Render HTML artifact.
  const kpiHtml = headline ? renderKpiStrip(headline) : "";
  let num = 1;
  const sectionsHtml = sectionResults
    .map(({ key, result }) => {
      const def = SECTIONS.find((s) => s.key === key)!;
      const n = String(num++).padStart(2, "0");
      return def.renderHtml(result.data, n, def.label, def.deck);
    })
    .join("\n");

  const today = new Date()
    .toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

  const html = renderShell({
    client: client.name,
    period: period.label,
    today,
    kpiHtml,
    sectionsHtml,
  });

  return { html, headline, sections: sectionResults, skipped };
}
```

- [ ] **Step 3: Write failing orchestrator test**

Create `src/lib/monthly-report/orchestrator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./queries/account", () => ({ fetchAccountRollup: vi.fn() }));
vi.mock("./queries/products", () => ({ fetchProductRows: vi.fn() }));
vi.mock("./queries/b2b", () => ({ fetchB2bRollup: vi.fn() }));

import { fetchAccountRollup } from "./queries/account";
import { fetchProductRows } from "./queries/products";
import { fetchB2bRollup } from "./queries/b2b";
import { generateReport } from "./orchestrator";
import type { ClientContext, MonthlyPeriod, ReportConfig } from "./types";

const client: ClientContext = { name: "Dr. Cuddles", accountId: "1899670", slug: "dr-cuddles" };
const period: MonthlyPeriod = {
  period: "2026-03", start: "2026-03-01", end: "2026-03-31",
  prevStart: "2026-02-01", prevEnd: "2026-02-28", label: "March 2026",
};
const allOn: ReportConfig = { enabled: { products: true, b2b: true } };

beforeEach(() => vi.clearAllMocks());

describe("generateReport", () => {
  it("skips a section when config disables it", async () => {
    (fetchAccountRollup as ReturnType<typeof vi.fn>).mockResolvedValue({
      product_sales: 100, product_quantity: 10, total_order_items: 9, ad_revenue: 0, ad_spend: 0,
    });
    (fetchProductRows as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (fetchB2bRollup as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const cfg: ReportConfig = { enabled: { products: false, b2b: true } };
    const payload = await generateReport(client, period, cfg);
    expect(payload.skipped).toContain("products");
    expect(fetchProductRows).not.toHaveBeenCalled();
  });

  it("skips a section when analyzer returns null (no data)", async () => {
    (fetchAccountRollup as ReturnType<typeof vi.fn>).mockResolvedValue({
      product_sales: 100, product_quantity: 10, total_order_items: 9, ad_revenue: 0, ad_spend: 0,
    });
    (fetchProductRows as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (fetchB2bRollup as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const payload = await generateReport(client, period, allOn);
    expect(payload.skipped).toEqual(expect.arrayContaining(["products", "b2b"]));
    expect(payload.html).toContain("Dr. Cuddles");
    expect(payload.html).toContain("March 2026");
  });

  it("emits sections when analyzers return data", async () => {
    (fetchAccountRollup as ReturnType<typeof vi.fn>).mockResolvedValue({
      product_sales: 100, product_quantity: 10, total_order_items: 9, ad_revenue: 0, ad_spend: 0,
    });
    (fetchProductRows as ReturnType<typeof vi.fn>).mockResolvedValue([
      { asin: "B001", parent_asin: null, title: "X", sku: null, sessions: 100, units: 10, sales: 100, order_items: 10, buy_box: 90 },
    ]);
    (fetchB2bRollup as ReturnType<typeof vi.fn>).mockResolvedValue({ total_sales: 100, b2b_sales: 20, total_units: 10, b2b_units: 2 });
    const payload = await generateReport(client, period, allOn);
    expect(payload.sections.map((s) => s.key)).toEqual(["products", "b2b"]);
    expect(payload.skipped).toEqual([]);
  });

  it("returns null headline when account rollup is empty", async () => {
    (fetchAccountRollup as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchProductRows as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (fetchB2bRollup as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const payload = await generateReport(client, period, allOn);
    expect(payload.headline).toBeNull();
  });
});
```

- [ ] **Step 4: Add public entry point**

Create `src/lib/monthly-report/index.ts`:

```ts
export { generateReport } from "./orchestrator";
export { resolveConfig, ALL_SECTION_KEYS } from "./config";
export { resolvePeriod, lastCompletedMonth, slugify } from "./period";
export { SECTIONS } from "./registry";
export type {
  MonthlyPeriod,
  ReportConfig,
  ClientContext,
  SectionKey,
  HeadlineResult,
  ProductsResult,
  B2bResult,
} from "./types";
```

- [ ] **Step 5: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/monthly-report/registry.ts src/lib/monthly-report/orchestrator.ts src/lib/monthly-report/orchestrator.test.ts src/lib/monthly-report/index.ts
git commit -m "feat(monthly-reports): registry + orchestrator + public module entry"
```

---

## Task 11: API route `POST /api/reports/monthly`

**Files:**
- Create: `src/app/api/reports/monthly/route.ts`
- Create: `src/app/api/reports/monthly/route.test.ts`

- [ ] **Step 1: Write failing route test**

Create `src/app/api/reports/monthly/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockedGetAuthSession, mockedGenerateReport, mockedResolveConfig } = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedGenerateReport: vi.fn(),
  mockedResolveConfig: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/monthly-report", () => ({
  generateReport: mockedGenerateReport,
  resolveConfig: mockedResolveConfig,
  resolvePeriod: (await vi.importActual<typeof import("@/lib/monthly-report/period")>("@/lib/monthly-report/period")).resolvePeriod,
  slugify:       (await vi.importActual<typeof import("@/lib/monthly-report/period")>("@/lib/monthly-report/period")).slugify,
  lastCompletedMonth: (await vi.importActual<typeof import("@/lib/monthly-report/period")>("@/lib/monthly-report/period")).lastCompletedMonth,
  SECTIONS: [],
}));

import { POST } from "./route";

const adminSession = { user: { email: "admin@1o8.agency", role: "admin" } };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/reports/monthly", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/reports/monthly", () => {
  it("401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(401);
  });

  it("403 when not admin", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { email: "x", role: "viewer" } });
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(403);
  });

  it("400 when clientCode missing", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(post({ period: "2026-03" }));
    expect(res.status).toBe(400);
  });

  it("400 when period is future", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(post({ clientCode: "1899670", period: "2099-01" }));
    expect(res.status).toBe(400);
  });

  it("400 when period is malformed", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(post({ clientCode: "1899670", period: "bad" }));
    expect(res.status).toBe(400);
  });

  it("404 when unknown clientCode", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(post({ clientCode: "NOSUCH", period: "2026-03" }));
    expect(res.status).toBe(404);
  });

  it("200 with html, analyzerResults, skipped on happy path", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveConfig.mockResolvedValue({ enabled: { products: true, b2b: true } });
    mockedGenerateReport.mockResolvedValue({
      html: "<html>ok</html>",
      headline: null,
      sections: [],
      skipped: ["products", "b2b"],
    });
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.html).toBe("<html>ok</html>");
    expect(body.skipped).toEqual(["products", "b2b"]);
    expect(body.filename).toMatch(/dr-cuddles.*2026-03.*\.html$/);
  });

  it("502 when orchestrator throws Redshift error", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveConfig.mockResolvedValue({ enabled: { products: true, b2b: true } });
    mockedGenerateReport.mockRejectedValue(new Error("Redshift connection refused"));
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.retryable).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/app/api/reports/monthly/route.test.ts
```

Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Implement the route**

Create `src/app/api/reports/monthly/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import {
  generateReport,
  resolveConfig,
  resolvePeriod,
  slugify,
  lastCompletedMonth,
} from "@/lib/monthly-report";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
  getErrorMessage,
} from "@/lib/api-utils";

// Mirror the hard-coded map in src/app/reports/page.tsx.
// (Moving this to the DB is future work; the portal already relies on it.)
const CLIENTS_BY_CODE: Record<string, string> = {
  "2348430": "Cloud23 Seller Central",
  "2557190": "Cloud23 Whole Foods",
  "2706460": "Pura",
  "1067740": "Fresh Vintage Farms",
  "3388210": "Whitney Jordan",
  "910420":  "Trejo's Tacos",
  "1268300": "Trejo's Spirits",
  "2572940": "Dreamiere",
  "1145180": "Dr. Wolff USA",
  "272970":  "Hotshot US",
  "1707700": "BNutty",
  "3629290": "Brad's",
  "1899670": "Dr. Cuddles",
  "3415610": "Poochie Butter",
  "3735620": "Glo Health Foods",
  "154290":  "Gaffer",
  "563510":  "This PKN",
};

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return forbidden();

  let body: { clientCode?: unknown; period?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const clientCode = typeof body.clientCode === "string" ? body.clientCode : "";
  const rawPeriod = typeof body.period === "string" ? body.period : "";
  if (!clientCode) return badRequest("Missing clientCode");
  if (!rawPeriod) return badRequest("Missing period");

  // Bounds: no future or current month (current month only allowed from day 2 onwards —
  // enforced by comparing against lastCompletedMonth()).
  const maxPeriod = lastCompletedMonth();
  if (rawPeriod > maxPeriod) {
    return badRequest(`Period ${rawPeriod} is in the future or not yet complete (latest: ${maxPeriod})`);
  }

  let period;
  try {
    period = resolvePeriod(rawPeriod);
  } catch (err) {
    return badRequest(getErrorMessage(err, "Invalid period"));
  }

  const clientName = CLIENTS_BY_CODE[clientCode];
  if (!clientName) return notFound(`Unknown client code ${clientCode}`);

  const client = { name: clientName, accountId: clientCode, slug: slugify(clientName) };

  try {
    const config = await resolveConfig(clientCode);
    const payload = await generateReport(client, period, config);
    return NextResponse.json({
      html: payload.html,
      headline: payload.headline,
      sections: payload.sections,
      skipped: payload.skipped,
      filename: `${client.slug}-${period.period}-1o8-monthly.html`,
    });
  } catch (err) {
    const msg = getErrorMessage(err);
    const retryable = /redshift|econn|timeout|network/i.test(msg);
    return NextResponse.json(
      { error: msg, retryable },
      { status: retryable ? 502 : 500 },
    );
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run src/app/api/reports/monthly/route.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/monthly/route.ts src/app/api/reports/monthly/route.test.ts
git commit -m "feat(monthly-reports): POST /api/reports/monthly"
```

---

## Task 12: API route `/api/reports/monthly/config` (GET + PUT)

**Files:**
- Create: `src/app/api/reports/monthly/config/route.ts`
- Create: `src/app/api/reports/monthly/config/route.test.ts`

- [ ] **Step 1: Write failing route test**

Create `src/app/api/reports/monthly/config/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb, mockedGetAuthSession } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "from", "where", "insert", "values", "onConflictDoUpdate", "returning", "delete"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.where = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  return { mockDb: chain, mockedGetAuthSession: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  reportSectionConfig: { scope: "scope", scopeKey: "scope_key", sectionKey: "section_key", enabled: "enabled" },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { GET, PUT } from "./route";

const admin = { user: { email: "a@1o8.agency", role: "admin" } };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/reports/monthly/config", () => {
  it("401 without session", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 for non-admin", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns global + client rows with default-on semantics", async () => {
    mockedGetAuthSession.mockResolvedValue(admin);
    mockDb.where.mockResolvedValueOnce([
      { scope: "global", scopeKey: "default", sectionKey: "products", enabled: false },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.global.products).toBe(false);
    expect(body.global.b2b).toBe(true); // default
    expect(body.clients).toEqual({});
  });
});

describe("PUT /api/reports/monthly/config", () => {
  function put(body: unknown) {
    return new NextRequest("http://localhost/api/reports/monthly/config", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("401 / 403 checks", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    expect((await PUT(put({}))).status).toBe(401);
    mockedGetAuthSession.mockResolvedValue({ user: { role: "editor" } });
    expect((await PUT(put({}))).status).toBe(403);
  });

  it("rejects invalid section keys", async () => {
    mockedGetAuthSession.mockResolvedValue(admin);
    const res = await PUT(put({ global: { bogus: true }, clients: {} }));
    expect(res.status).toBe(400);
  });

  it("upserts global + client rows", async () => {
    mockedGetAuthSession.mockResolvedValue(admin);
    const res = await PUT(
      put({
        global: { products: true, b2b: false },
        clients: { "1899670": { products: true } },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/app/api/reports/monthly/config/route.test.ts
```

Expected: FAIL — missing route.

- [ ] **Step 3: Implement the route**

Create `src/app/api/reports/monthly/config/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportSectionConfig } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { ALL_SECTION_KEYS } from "@/lib/monthly-report";
import type { SectionKey } from "@/lib/monthly-report";
import { badRequest, forbidden, unauthorized, serverError } from "@/lib/api-utils";

type SectionFlags = Partial<Record<SectionKey, boolean>>;
interface ConfigPayload {
  global: Record<SectionKey, boolean>;
  clients: Record<string, SectionFlags>;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return forbidden();

  try {
    const rows = await db.select().from(reportSectionConfig);

    const global: Record<SectionKey, boolean> = { products: true, b2b: true };
    const clients: Record<string, SectionFlags> = {};
    for (const r of rows as Array<{ scope: string; scopeKey: string; sectionKey: string; enabled: boolean }>) {
      const key = r.sectionKey as SectionKey;
      if (!ALL_SECTION_KEYS.includes(key)) continue;
      if (r.scope === "global" && r.scopeKey === "default") {
        global[key] = r.enabled;
      } else if (r.scope === "client") {
        clients[r.scopeKey] = clients[r.scopeKey] ?? {};
        clients[r.scopeKey][key] = r.enabled;
      }
    }
    return NextResponse.json({ global, clients } satisfies ConfigPayload);
  } catch (err) {
    return serverError(err);
  }
}

function isValidFlags(obj: unknown): obj is SectionFlags {
  if (!obj || typeof obj !== "object") return false;
  for (const k of Object.keys(obj)) {
    if (!ALL_SECTION_KEYS.includes(k as SectionKey)) return false;
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v !== "boolean") return false;
  }
  return true;
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return forbidden();

  let body: { global?: unknown; clients?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!isValidFlags(body.global)) return badRequest("Invalid `global` section flags");
  const clientsRaw = body.clients ?? {};
  if (!clientsRaw || typeof clientsRaw !== "object") return badRequest("Invalid `clients` object");
  for (const [code, flags] of Object.entries(clientsRaw as Record<string, unknown>)) {
    if (!isValidFlags(flags)) return badRequest(`Invalid flags for client ${code}`);
  }

  try {
    // Upsert global rows
    for (const [section, enabled] of Object.entries(body.global)) {
      await db
        .insert(reportSectionConfig)
        .values({ scope: "global", scopeKey: "default", sectionKey: section, enabled: enabled as boolean })
        .onConflictDoUpdate({
          target: [reportSectionConfig.scope, reportSectionConfig.scopeKey, reportSectionConfig.sectionKey],
          set: { enabled: enabled as boolean },
        });
    }
    // Upsert per-client rows
    for (const [code, flags] of Object.entries(clientsRaw as Record<string, SectionFlags>)) {
      for (const [section, enabled] of Object.entries(flags)) {
        await db
          .insert(reportSectionConfig)
          .values({ scope: "client", scopeKey: code, sectionKey: section, enabled: enabled as boolean })
          .onConflictDoUpdate({
            target: [reportSectionConfig.scope, reportSectionConfig.scopeKey, reportSectionConfig.sectionKey],
            set: { enabled: enabled as boolean },
          });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run src/app/api/reports/monthly/config/route.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/monthly/config/route.ts src/app/api/reports/monthly/config/route.test.ts
git commit -m "feat(monthly-reports): GET+PUT /api/reports/monthly/config"
```

---

## Task 13: React preview components

**Files:**
- Create: `src/lib/monthly-report/render-react/KpiStrip.tsx`
- Create: `src/lib/monthly-report/render-react/ProductsSection.tsx`
- Create: `src/lib/monthly-report/render-react/B2bSection.tsx`
- Create: `src/lib/monthly-report/render-react/ReportPreview.tsx`
- Create: `src/lib/monthly-report/render-react/ReportPreview.test.tsx`

**Design constraint:** the React preview must render the same numbers and the same ordering as the HTML artifact. It does not have to be pixel-identical to the downloadable HTML — it uses the hub's dark theme while the HTML artifact uses the 1o8 light-paper brand. To avoid duplication, both consume the same shaped `HeadlineResult` / `ProductsResult` / `B2bResult` inputs and the same formatters.

- [ ] **Step 1: Write `KpiStrip.tsx`**

Create `src/lib/monthly-report/render-react/KpiStrip.tsx`:

```tsx
import type { HeadlineResult } from "../types";
import { fmtDelta, fmtInt, fmtMoney, fmtMoneyShort, fmtPct } from "../format";

export function KpiStrip({ h }: { h: HeadlineResult }) {
  const c = h.current;
  const d = h.deltas;
  const cells = [
    { label: "Total Sales",   value: fmtMoneyShort(c.sales),  sub: `${fmtInt(c.orderItems)} order items · ${fmtDelta(d.sales)}` },
    { label: "Units Ordered", value: fmtInt(c.units),          sub: `AOV ${fmtMoney(c.aov)} · ${fmtDelta(d.units)}` },
    { label: "Sessions",      value: c.sessions > 0 ? fmtInt(c.sessions) : "—", sub: c.sessions > 0 ? `${fmtInt(c.pageviews)} page views · ${fmtDelta(d.sessions)}` : "not available" },
    { label: "Buy Box %",     value: fmtPct(c.buyBox, 1),     sub: c.buyBox === null ? "not available" : `weighted by sessions · ${fmtDelta(d.buyBox)}` },
    { label: "Conversion",    value: fmtPct(c.cvr, 2),        sub: c.cvr === null ? "not available" : `units / session · ${fmtDelta(d.cvr)}` },
    { label: "AOV",           value: fmtMoney(c.aov),         sub: `sales / order items · ${fmtDelta(d.aov)}` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-border border border-border mb-10">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card p-5">
          <div className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-2.5">{cell.label}</div>
          <div className="text-2xl font-extrabold tabular-nums tracking-tight">{cell.value}</div>
          <div className="text-[10px] font-medium text-muted-foreground mt-2">{cell.sub}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `ProductsSection.tsx`**

Create `src/lib/monthly-report/render-react/ProductsSection.tsx`:

```tsx
import type { ProductsResult } from "../types";
import { fmtInt, fmtMoney, fmtPct } from "../format";
import { classifyMetric } from "../thresholds";

function bandToClass(b: string): string {
  if (b === "good") return "text-[#35C759] font-bold";
  if (b === "warn") return "text-[#FAC800] font-bold";
  if (b === "bad")  return "text-[#FF5C60] font-bold";
  return "";
}

export function ProductsSection({ d, num }: { d: ProductsResult; num: string }) {
  let totalSales = 0, totalUnits = 0, totalSessions = 0;
  for (const r of d.rows) { totalSales += r.sales; totalUnits += r.units; totalSessions += r.sessions; }

  return (
    <section className="mb-12">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E8A700] block mb-2">§ {num}</span>
      <h2 className="text-2xl font-extrabold mb-1.5 tracking-tight">Product performance</h2>
      <p className="text-xs text-muted-foreground mb-5 pb-4 border-b border-border max-w-[820px]">
        Per-ASIN breakdown sorted by sales. Colour coding is driven by CVR and buy-box thresholds.
      </p>
      <div className="overflow-x-auto border border-border">
        <table className="w-full border-collapse text-[11px] tabular-nums">
          <thead>
            <tr className="bg-[#2C2B36] text-white">
              {["ASIN / Title", "Sessions", "Units", "Sales", "CVR", "Buy Box", "AOV"].map((h, i) => (
                <th key={h} className={`px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => {
              const titleShort = r.title.length > 80 ? r.title.slice(0, 80) + "…" : r.title;
              return (
                <tr key={r.asin} className="odd:bg-card even:bg-muted/20 border-b border-border">
                  <td className="px-3.5 py-2 max-w-[340px] overflow-hidden text-ellipsis whitespace-nowrap">
                    <strong>{r.asin}</strong><br /><span className="text-muted-foreground">{titleShort}</span>
                  </td>
                  <td className="px-3.5 py-2 text-right">{fmtInt(r.sessions)}</td>
                  <td className="px-3.5 py-2 text-right">{fmtInt(r.units)}</td>
                  <td className="px-3.5 py-2 text-right">{fmtMoney(r.sales)}</td>
                  <td className={`px-3.5 py-2 text-right ${bandToClass(classifyMetric(r.cvr, "cvr"))}`}>{fmtPct(r.cvr, 2)}</td>
                  <td className={`px-3.5 py-2 text-right ${bandToClass(classifyMetric(r.buyBox, "buyBox"))}`}>{fmtPct(r.buyBox, 1)}</td>
                  <td className="px-3.5 py-2 text-right">{r.aov === null ? "—" : fmtMoney(r.aov)}</td>
                </tr>
              );
            })}
            <tr className="bg-black text-white font-extrabold">
              <td className="px-3.5 py-2">Grand Total ({d.nTotal} SKUs)</td>
              <td className="px-3.5 py-2 text-right">{fmtInt(totalSessions)}</td>
              <td className="px-3.5 py-2 text-right">{fmtInt(totalUnits)}</td>
              <td className="px-3.5 py-2 text-right">{fmtMoney(totalSales)}</td>
              <td className="px-3.5 py-2 text-right">—</td>
              <td className="px-3.5 py-2 text-right">—</td>
              <td className="px-3.5 py-2 text-right">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write `B2bSection.tsx`**

Create `src/lib/monthly-report/render-react/B2bSection.tsx`:

```tsx
import type { B2bResult } from "../types";
import { fmtInt, fmtMoney, fmtPct } from "../format";

export function B2bSection({ d, num }: { d: B2bResult; num: string }) {
  const b2cSales = d.totalSales - d.b2bSales;
  const b2cUnits = d.totalUnits - d.b2bUnits;
  return (
    <section className="mb-12">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E8A700] block mb-2">§ {num}</span>
      <h2 className="text-2xl font-extrabold mb-1.5 tracking-tight">B2B split</h2>
      <p className="text-xs text-muted-foreground mb-5 pb-4 border-b border-border max-w-[820px]">
        Share of revenue and units from Amazon Business buyers versus consumers.
      </p>
      <div className="overflow-x-auto border border-border">
        <table className="w-full border-collapse text-[11px] tabular-nums">
          <thead>
            <tr className="bg-[#2C2B36] text-white">
              {["Segment", "Sales", "Sales Share", "Units", "Unit Share"].map((h, i) => (
                <th key={h} className={`px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-card border-b border-border">
              <td className="px-3.5 py-2">B2B (business buyers)</td>
              <td className="px-3.5 py-2 text-right">{fmtMoney(d.b2bSales)}</td>
              <td className="px-3.5 py-2 text-right">{fmtPct(d.b2bShareSales, 2)}</td>
              <td className="px-3.5 py-2 text-right">{fmtInt(d.b2bUnits)}</td>
              <td className="px-3.5 py-2 text-right">{fmtPct(d.b2bShareUnits, 2)}</td>
            </tr>
            <tr className="bg-muted/20 border-b border-border">
              <td className="px-3.5 py-2">B2C (consumer)</td>
              <td className="px-3.5 py-2 text-right">{fmtMoney(b2cSales)}</td>
              <td className="px-3.5 py-2 text-right">{fmtPct(100 - d.b2bShareSales, 2)}</td>
              <td className="px-3.5 py-2 text-right">{fmtInt(b2cUnits)}</td>
              <td className="px-3.5 py-2 text-right">{fmtPct(100 - d.b2bShareUnits, 2)}</td>
            </tr>
            <tr className="bg-black text-white font-extrabold">
              <td className="px-3.5 py-2">Total</td>
              <td className="px-3.5 py-2 text-right">{fmtMoney(d.totalSales)}</td>
              <td className="px-3.5 py-2 text-right">100.00%</td>
              <td className="px-3.5 py-2 text-right">{fmtInt(d.totalUnits)}</td>
              <td className="px-3.5 py-2 text-right">100.00%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `ReportPreview.tsx`**

Create `src/lib/monthly-report/render-react/ReportPreview.tsx`:

```tsx
import type { AnalyzerResult, HeadlineResult, SectionKey } from "../types";
import { KpiStrip } from "./KpiStrip";
import { ProductsSection } from "./ProductsSection";
import { B2bSection } from "./B2bSection";

export interface ReportPreviewProps {
  clientName: string;
  periodLabel: string;
  headline: HeadlineResult | null;
  sections: Array<{ key: SectionKey; result: AnalyzerResult }>;
}

export function ReportPreview({ clientName, periodLabel, headline, sections }: ReportPreviewProps) {
  return (
    <div className="max-w-[1180px] mx-auto px-4">
      <header className="py-10 border-b border-border mb-10">
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 border border-foreground bg-[#F8BF1C] text-black text-[10px] font-bold uppercase tracking-[0.18em] mb-6">
          ■ Client · {clientName}
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-3">
          {clientName} <em className="not-italic text-[#D9A614]">monthly.</em>
        </h1>
        <p className="text-sm text-muted-foreground max-w-[760px]">
          Performance overview for {periodLabel}. Sections with no underlying data are omitted automatically.
        </p>
      </header>

      {headline && <KpiStrip h={headline} />}

      {sections.map(({ key, result }, i) => {
        const num = String(i + 1).padStart(2, "0");
        if (result.kind === "products") return <ProductsSection key={key} d={result.data} num={num} />;
        if (result.kind === "b2b")      return <B2bSection      key={key} d={result.data} num={num} />;
        return null;
      })}

      {!headline && sections.length === 0 && (
        <div className="py-24 text-center text-muted-foreground">
          No data available for this period.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write preview component test**

Create `src/lib/monthly-report/render-react/ReportPreview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReportPreview } from "./ReportPreview";
import type { HeadlineResult, AnalyzerResult, SectionKey } from "../types";

const headline: HeadlineResult = {
  current: { sales: 100000, units: 5000, sessions: 0, pageviews: 0, orderItems: 4200, cvr: null, buyBox: null, aov: 100000 / 4200 },
  previous: null,
  deltas: { sales: null, units: null, sessions: null, cvr: null, buyBox: null, aov: null },
};

describe("ReportPreview", () => {
  it("renders client name and period label", () => {
    render(<ReportPreview clientName="Dr. Cuddles" periodLabel="March 2026" headline={null} sections={[]} />);
    expect(screen.getByText(/Dr\. Cuddles/)).toBeInTheDocument();
    expect(screen.getByText(/March 2026/)).toBeInTheDocument();
  });

  it("shows empty-state when no data", () => {
    render(<ReportPreview clientName="X" periodLabel="Y" headline={null} sections={[]} />);
    expect(screen.getByText(/No data available/)).toBeInTheDocument();
  });

  it("renders KPI strip when headline present", () => {
    render(<ReportPreview clientName="X" periodLabel="Y" headline={headline} sections={[]} />);
    expect(screen.getByText("Total Sales")).toBeInTheDocument();
  });

  it("renders section in registry order with numbering", () => {
    const sections: Array<{ key: SectionKey; result: AnalyzerResult }> = [
      { key: "products", result: { kind: "products", data: { rows: [{ asin: "B1", parent: "", title: "T", sku: "", sessions: 10, units: 1, sales: 10, orderItems: 1, cvr: 10, buyBox: 90, aov: 10 }], nTotal: 1 } } },
      { key: "b2b", result: { kind: "b2b", data: { totalSales: 100, b2bSales: 10, b2bShareSales: 10, totalUnits: 10, b2bUnits: 1, b2bShareUnits: 10 } } },
    ];
    render(<ReportPreview clientName="X" periodLabel="Y" headline={null} sections={sections} />);
    expect(screen.getByText(/Product performance/)).toBeInTheDocument();
    expect(screen.getByText(/B2B split/)).toBeInTheDocument();
    expect(screen.getByText("§ 01")).toBeInTheDocument();
    expect(screen.getByText("§ 02")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run to confirm pass**

```bash
npx vitest run src/lib/monthly-report/render-react/
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/monthly-report/render-react/
git commit -m "feat(monthly-reports): React preview components (KPI strip, Products, B2B)"
```

---

## Task 14: UI page `/reports/monthly`

**Files:**
- Create: `src/app/reports/monthly/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/reports/monthly/page.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { ReportPreview } from "@/lib/monthly-report/render-react/ReportPreview";
import type { AnalyzerResult, HeadlineResult, SectionKey } from "@/lib/monthly-report";

// Mirror of src/app/reports/page.tsx CLIENTS map, keyed in reverse.
// Kept in sync manually; a lift to DB is tracked as follow-up.
const CLIENTS: Record<string, string> = {
  "2348430": "Cloud23 Seller Central",
  "2557190": "Cloud23 Whole Foods",
  "2706460": "Pura",
  "1067740": "Fresh Vintage Farms",
  "3388210": "Whitney Jordan",
  "910420":  "Trejo's Tacos",
  "1268300": "Trejo's Spirits",
  "2572940": "Dreamiere",
  "1145180": "Dr. Wolff USA",
  "272970":  "Hotshot US",
  "1707700": "BNutty",
  "3629290": "Brad's",
  "1899670": "Dr. Cuddles",
  "3415610": "Poochie Butter",
  "3735620": "Glo Health Foods",
  "154290":  "Gaffer",
  "563510":  "This PKN",
};

function pad2(n: number) { return String(n).padStart(2, "0"); }

function lastCompletedMonth(): string {
  const now = new Date();
  const offset = now.getUTCDate() <= 1 ? 2 : 1;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function recentMonths(count: number): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [];
  const d = new Date();
  d.setUTCDate(1);
  if (d.getUTCDate() <= 1) d.setUTCMonth(d.getUTCMonth() - 1);
  for (let i = 0; i < count; i++) {
    const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i - 1, 1));
    const value = `${dd.getUTCFullYear()}-${pad2(dd.getUTCMonth() + 1)}`;
    const label = dd.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    result.push({ value, label });
  }
  return result;
}

interface ApiResponse {
  html: string;
  headline: HeadlineResult | null;
  sections: Array<{ key: SectionKey; result: AnalyzerResult }>;
  skipped: SectionKey[];
  filename: string;
}

export default function MonthlyReportsPage() {
  const [clientCode, setClientCode] = useState<string>("1899670"); // Dr. Cuddles
  const [period, setPeriod] = useState<string>(lastCompletedMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const months = useMemo(() => recentMonths(18), []);
  const clientName = CLIENTS[clientCode];
  const periodLabel = useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }, [period]);

  async function generate() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/reports/monthly", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientCode, period }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to generate");
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!data) return;
    const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-6 bg-background border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-geist-sans)] tracking-tighter">
              <span className="text-foreground font-bold">Monthly</span>
              <span style={{ color: "#F9BF1A" }} className="font-medium">Report</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Branded single-file HTML deliverable</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={clientCode} onChange={(e) => setClientCode(e.target.value)} className="bg-background border border-border rounded-md px-3 py-2 text-sm">
              {Object.entries(CLIENTS).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-background border border-border rounded-md px-3 py-2 text-sm">
              {months.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
            <button onClick={generate} disabled={loading} className="bg-[#F9BF1A] text-black font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-50">
              {loading ? "Generating…" : "Generate"}
            </button>
            <a href="/reports/monthly/config" className="text-sm text-muted-foreground hover:text-foreground underline">Configure sections</a>
          </div>
        </div>
      </div>

      {error && (
        <div className="border border-red-500/40 bg-red-500/10 text-red-500 rounded-md p-4 text-sm mb-6">
          {error}
          <button onClick={generate} className="ml-3 underline">Retry</button>
        </div>
      )}

      {data && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="text-xs text-muted-foreground">
              {data.skipped.length > 0 && <>Skipped: {data.skipped.join(", ")}</>}
            </div>
            <button onClick={download} className="border border-border rounded-md px-4 py-2 text-sm hover:bg-muted">
              Download HTML
            </button>
          </div>
          <ReportPreview
            clientName={clientName ?? ""}
            periodLabel={periodLabel}
            headline={data.headline}
            sections={data.sections}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Start the dev server and open the page in a browser.

```bash
PORT=3000 npm run dev
```

- Open http://localhost:3000/reports/monthly
- Click Generate with default (Dr. Cuddles, last completed month)
- Expect: preview appears, Download HTML button works, downloaded file opens standalone in browser

Capture any errors from the dev-server console into Task 14 follow-ups if needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/reports/monthly/page.tsx
git commit -m "feat(monthly-reports): /reports/monthly page with client+month pickers, preview, and download"
```

---

## Task 15: UI page `/reports/monthly/config`

**Files:**
- Create: `src/app/reports/monthly/config/page.tsx`

- [ ] **Step 1: Write the config page**

Create `src/app/reports/monthly/config/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { SECTIONS } from "@/lib/monthly-report";
import type { SectionKey } from "@/lib/monthly-report";

const CLIENTS: Record<string, string> = {
  "2348430": "Cloud23 Seller Central",
  "2557190": "Cloud23 Whole Foods",
  "2706460": "Pura",
  "1067740": "Fresh Vintage Farms",
  "3388210": "Whitney Jordan",
  "910420":  "Trejo's Tacos",
  "1268300": "Trejo's Spirits",
  "2572940": "Dreamiere",
  "1145180": "Dr. Wolff USA",
  "272970":  "Hotshot US",
  "1707700": "BNutty",
  "3629290": "Brad's",
  "1899670": "Dr. Cuddles",
  "3415610": "Poochie Butter",
  "3735620": "Glo Health Foods",
  "154290":  "Gaffer",
  "563510":  "This PKN",
};

type ClientFlags = Partial<Record<SectionKey, boolean>>;
type CellState = "on" | "off" | "inherit";

interface ConfigShape {
  global: Record<SectionKey, boolean>;
  clients: Record<string, ClientFlags>;
}

function cellState(flags: ClientFlags | undefined, key: SectionKey): CellState {
  if (!flags || flags[key] === undefined) return "inherit";
  return flags[key] ? "on" : "off";
}

function cycle(state: CellState): CellState {
  if (state === "inherit") return "on";
  if (state === "on") return "off";
  return "inherit";
}

export default function MonthlyConfigPage() {
  const [cfg, setCfg] = useState<ConfigShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/monthly/config")
      .then((r) => r.json())
      .then((j) => setCfg(j))
      .catch((e) => setError(e.message));
  }, []);

  async function save(next: ConfigShape) {
    setSaving(true);
    setError(null);
    const prev = cfg;
    setCfg(next); // optimistic
    try {
      const res = await fetch("/api/reports/monthly/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Save failed");
        setCfg(prev); // rollback
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setCfg(prev);
    } finally {
      setSaving(false);
    }
  }

  function toggleGlobal(key: SectionKey) {
    if (!cfg) return;
    save({ ...cfg, global: { ...cfg.global, [key]: !cfg.global[key] } });
  }

  function cycleClient(code: string, key: SectionKey) {
    if (!cfg) return;
    const state = cellState(cfg.clients[code], key);
    const next = cycle(state);
    const flags: ClientFlags = { ...(cfg.clients[code] ?? {}) };
    if (next === "inherit") delete flags[key];
    else flags[key] = next === "on";
    const clients = { ...cfg.clients };
    if (Object.keys(flags).length === 0) delete clients[code];
    else clients[code] = flags;
    save({ ...cfg, clients });
  }

  if (!cfg) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div>
      <div className="mb-6">
        <a href="/reports/monthly" className="text-sm text-muted-foreground hover:text-foreground">← Back to Monthly Reports</a>
        <h1 className="text-4xl font-bold mt-2">Monthly Report · Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Global defaults apply to every client. Per-client overrides win.
          {saving && <span className="ml-2 text-[#F9BF1A]">Saving…</span>}
        </p>
      </div>

      {error && (
        <div className="border border-red-500/40 bg-red-500/10 text-red-500 rounded-md p-3 text-sm mb-6">{error}</div>
      )}

      <section className="border border-border rounded-xl p-6 mb-8 bg-card">
        <h2 className="text-lg font-semibold mb-3">Global defaults</h2>
        <div className="space-y-2">
          {SECTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-3 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.global[s.key]}
                onChange={() => toggleGlobal(s.key)}
              />
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.deck}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="border border-border rounded-xl p-6 bg-card">
        <h2 className="text-lg font-semibold mb-3">Per-client overrides</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Click a cell to cycle: <span className="font-semibold">— default</span> → <span className="text-[#35C759] font-semibold">ON</span> → <span className="text-[#FF5C60] font-semibold">OFF</span>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4">Client</th>
                {SECTIONS.map((s) => (
                  <th key={s.key} className="text-center py-2 px-3 font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(CLIENTS).map(([code, name]) => (
                <tr key={code} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">{name}</td>
                  {SECTIONS.map((s) => {
                    const state = cellState(cfg.clients[code], s.key);
                    const labelText = state === "on" ? "ON" : state === "off" ? "OFF" : "— default";
                    const cls = state === "on" ? "text-[#35C759]" : state === "off" ? "text-[#FF5C60]" : "text-muted-foreground";
                    return (
                      <td key={s.key} className="text-center py-2 px-3">
                        <button onClick={() => cycleClient(code, s.key)} className={`text-xs font-semibold ${cls}`}>
                          {labelText}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

With the dev server still running, open http://localhost:3000/reports/monthly/config.

- Toggle a global section: the table and DB are both updated.
- Click a per-client cell: cycles default → ON → OFF → default, saves each step.
- Verify by running `select * from report_section_config` in Drizzle Studio (`npm run db:studio`).

- [ ] **Step 3: Commit**

```bash
git add src/app/reports/monthly/config/page.tsx
git commit -m "feat(monthly-reports): /reports/monthly/config with optimistic per-client grid"
```

---

## Task 16: Add the Monthly Reports card to `/reports`

**Files:**
- Modify: `src/app/reports/page.tsx`

- [ ] **Step 1: Add the card entry and routing**

Open `src/app/reports/page.tsx`. Current state (read the top of the file to locate the `REPORT_SECTIONS` array, which starts around line 32).

Append this entry to the `REPORT_SECTIONS` array (as the last entry, before the closing `];`):

```tsx
  {
    id: "monthly-reports",
    label: "Monthly Reports",
    description: "Generate a branded single-file monthly performance review for a client.",
    icon: (
      <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
```

The existing page uses `setActiveSection(section.id)` and then hits a large switch of `activeSection === "…"` branches. For the new card, we want a navigation (not an in-page render). The minimum-churn approach: keep the switch as-is and change the card's `onClick` to navigate for this one id.

Find the card's `<button onClick={() => setActiveSection(section.id)}` (around line 371). Replace it with:

```tsx
          <button
            key={section.id}
            onClick={() => {
              if (section.id === "monthly-reports") {
                window.location.href = "/reports/monthly";
              } else {
                setActiveSection(section.id);
              }
            }}
            onMouseEnter={() => setHoveredCard(section.id)}
            onMouseLeave={() => setHoveredCard(null)}
            className="text-left border border-border rounded-xl p-6 bg-card transition-colors cursor-pointer"
          >
```

- [ ] **Step 2: Verify**

```bash
PORT=3000 npm run dev
```

Open http://localhost:3000/reports. Expect 7 cards. Click **Monthly Reports** → navigates to `/reports/monthly`.

- [ ] **Step 3: Commit**

```bash
git add src/app/reports/page.tsx
git commit -m "feat(monthly-reports): add Monthly Reports card to /reports"
```

---

## Task 17: Manual QA + documentation

**Files:**
- Modify: `docs/sections/monthly-reports.md` (the file already exists as untracked — overwrite with the shipped-state doc)
- Create: `docs/superpowers/handoffs/2026-04-23-monthly-reports-complete.md`

- [ ] **Step 1: End-to-end smoke test**

With `PORT=3000 npm run dev` running:

1. Open http://localhost:3000/reports → 7 cards visible.
2. Click **Monthly Reports** → lands on `/reports/monthly`.
3. Default pickers: Dr. Cuddles + last completed calendar month.
4. Click **Generate**:
   - Preview appears within ~5s (Redshift latency).
   - KPI strip shows Sales + MoM delta arrows (▲ / ▼).
   - Sections render in registry order. If Products + B2B were deferred at Task 0, only KPI strip renders.
   - Any skipped sections appear in the header "Skipped:" line.
5. Click **Download HTML**:
   - File named like `dr-cuddles-2026-03-1o8-monthly.html` downloads.
   - Open file directly in browser → renders standalone, fonts load, logo visible.
   - Open file in Gmail compose window (attach or paste) → renders acceptably with system fonts even without Google Fonts.
6. Click **Configure sections** → `/reports/monthly/config` opens.
   - Toggle a global section → see table visually update, saves within 500ms.
   - Click a per-client cell → cycles default → ON → OFF.
   - Reload page → state persisted.
7. Back to `/reports/monthly`. Pick a future month via URL hack (`period=2099-01` in POST body from devtools) → expect 400.
8. Invalid client via devtools → expect 404.

Capture any issues as follow-up TODOs inline in the handoff doc.

- [ ] **Step 2: Rewrite section documentation**

Overwrite `docs/sections/monthly-reports.md`:

```markdown
# Monthly Reports

Admin generates a branded monthly performance report for an Amazon seller client. Lives at `/reports/monthly` with configuration at `/reports/monthly/config`.

## Behaviour

- Picks client (from hard-coded CLIENTS map) + month (default: last completed calendar month; day-1 of next month backs off one more month for Intentwise lag).
- On Generate, `POST /api/reports/monthly` runs the orchestrator:
  1. `resolveConfig(clientCode)` reads `report_section_config` (per-client > global > default-on).
  2. Parallel fetch: current-month and previous-month account rollup from `intentwise_ecommerce_graph.account_summary`.
  3. `buildHeadlineResult` computes KPIs + MoM deltas.
  4. For each section in `SECTIONS`, run its analyzer if enabled; sections whose analyzer returns null are added to `skipped[]` and omitted from both preview and HTML.
  5. `renderShell` emits a single-file HTML artifact with inline SVG logo and inline CSS.
- React preview mirrors the HTML artifact (same numbers, same order, hub dark theme).
- Downloaded filename: `<client-slug>-<YYYY-MM>-1o8-monthly.html`.

## Architecture

`src/lib/monthly-report/` — pure library, no framework concerns:
- `queries/` — Redshift fetchers (`account`, `products`, `b2b`).
- `analyzers/` — data → typed result | null.
- `render-html/` — result → single-file HTML.
- `render-react/` — result → React preview.
- `registry.ts` — single source of truth for sections.
- `orchestrator.ts` — public `generateReport()` walks the registry.

Section registry is consumed by: HTML orchestrator, React preview, and the config grid UI.

## Adding a section

1. Add a query function in `queries/<key>.ts` returning a raw shape.
2. Add an analyzer in `analyzers/<key>.ts` returning a typed result or null.
3. Add an HTML renderer in `render-html/<key>.ts`.
4. Add a React component in `render-react/<Key>Section.tsx`.
5. Append a tuple to `SECTIONS` in `registry.ts`.
6. Add the key to `SectionKey` in `types.ts` and to `AnalyzerResult`.
7. Update the branch in `orchestrator.ts` to call the new query + analyzer.

The config UI, route, and preview pick up the new entry automatically.

## Config resolution

```
configFor(clientCode, sectionKey):
  per-client row → use it
  global row     → use it
  otherwise      → true
```

Table: `report_section_config(scope, scope_key, section_key, enabled, updated_at)` with composite PK. Migration `drizzle/migrations/0042_monthly_report_config.sql`.

## Known limitations (V1)

- `sessions`, `pageviews`, `buyBox`, and `cvr` in headline KPIs are null until a per-ASIN data source lands (see research doc `docs/superpowers/research/2026-04-23-redshift-monthly-schema.md`).
- No PDF export (browser Print works).
- No scheduled / automated send.
- No persistent storage of generated HTML — each Generate is fresh.
- Clients map is hard-coded in 3 places (reports page, monthly page, config page). A DB lift is follow-up work.
```

- [ ] **Step 3: Write handoff note**

Create `docs/superpowers/handoffs/2026-04-23-monthly-reports-complete.md`:

```markdown
# Monthly Reports — Implementation Complete

**Branch:** `feat/monthly-reports` (worktree at `.worktrees/monthly-reports`)
**Date:** 2026-04-23
**Spec:** `docs/superpowers/specs/2026-04-23-monthly-reports-design.md`
**Plan:** `docs/superpowers/plans/2026-04-23-monthly-reports.md`

## What shipped

- Monthly Reports card on `/reports`.
- `/reports/monthly` — client + month picker, React preview, Download HTML button.
- `/reports/monthly/config` — global + per-client grid toggles with optimistic writes.
- `src/lib/monthly-report/` module: registry-driven analyzers + dual renderers (HTML + React).
- `report_section_config` table (migration `0042`).
- Unit tests for period, format, config, all analyzers, HTML renderers, orchestrator, preview, and both API routes.

## Task 0 outcome

<fill in from `docs/superpowers/research/2026-04-23-redshift-monthly-schema.md`>

## Follow-ups (explicitly deferred)

- [ ] Lift CLIENTS map to DB (currently duplicated in 3 files).
- [ ] Portal visibility (client-facing view of their own monthly).
- [ ] Scheduled send + email drop.
- [ ] Per-ASIN data source for sessions / buy-box (SP-API fallback).
- [ ] PDF rendering path (browser print for now).

## How to kick off next session

Open the Monthly Reports card, pick a client, Generate, Download, email.
```

- [ ] **Step 4: Commit**

```bash
git add docs/sections/monthly-reports.md docs/superpowers/handoffs/2026-04-23-monthly-reports-complete.md
git commit -m "docs(monthly-reports): section doc + completion handoff"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/monthly-reports
```

Expected: push succeeds, Vercel preview deploy kicks off.

---

## Self-review checklist

**Spec coverage map:**

| Spec item | Task(s) |
|---|---|
| New Monthly Reports card on `/reports` | Task 16 |
| Client + month picker, default = last completed month | Task 14 |
| Future / current-month disabling until day 2 | Task 14 (picker) + Task 11 (server) |
| POST `/api/reports/monthly` returning html + analyzerResults + skipped | Task 11 |
| React preview mirroring HTML | Tasks 13–14 |
| Download HTML button with branded filename | Task 14 |
| `/reports/monthly/config` global + per-client grid | Task 15 |
| PUT `/api/reports/monthly/config` | Task 12 |
| GET resolved config | Task 12 |
| Registry drives both renderers | Task 10 |
| Headline KPIs rendered outside loop with MoM deltas | Tasks 5, 8 |
| Analyzer-returns-null → section skipped | Tasks 6, 7, 10 |
| Shared brand tokens single-sourced | Task 2 |
| Thresholds.yaml ported | Task 2 |
| Migration for `report_section_config` | Task 1 |
| Data freshness "last completed month" handling | Tasks 3, 14 |
| Redshift connection retry (already in queryRedshift) | Reused |
| Analyzer unit tests ≥6 per analyzer | Tasks 5, 6, 7 (5+, 6+, 4+ respectively — expanded in each test block) |
| HTML renderer snapshot-style tests | Task 9 |
| Route tests mock auth-db + db + redshift | Tasks 11, 12 |
| Manual QA including Gmail standalone rendering | Task 17 |
| Redshift schema spike before scope lock | Task 0 |
| B2B > 15% "Notable B2B share" observation | Task 9 |
| Dead SKU + low-CVR observations | Task 9 |
| Single-file HTML artifact (inline CSS + inline SVG logo) | Task 8 |
| Admin-only on both routes | Tasks 11, 12 |
| Unknown client → 404 | Task 11 |
| Redshift failure → 502 retryable | Task 11 |
| Config table empty → default-on | Task 4 |
| Render shell preserves `{client}` / `{period}` substitution | Task 8 |

**Placeholder scan:** no TBDs, no "handle edge cases", no "similar to Task N" references without full code. The two `<PER_ASIN_TABLE>`-style placeholders in Tasks 6 and 7 are intentional and filled from the Task 0 research doc — they are not plan placeholders.

**Type consistency:**
- `SectionKey` = `"products" | "b2b"` used consistently across types, registry, config, analyzers, renderers, routes.
- `HeadlineResult.deltas` fields match `HeadlineKpis` fields (sales/units/sessions/cvr/buyBox/aov) everywhere.
- `AnalyzerResult` discriminated union matches both analyzer outputs and React preview branches.
- API response shape `{ html, headline, sections, skipped, filename }` used consistently in route, test, and client page.
- `resolveConfig`, `resolvePeriod`, `slugify`, `lastCompletedMonth` all re-exported from `src/lib/monthly-report/index.ts` and imported via the barrel in route code.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-monthly-reports.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in the current session with checkpoints.

Which approach?
