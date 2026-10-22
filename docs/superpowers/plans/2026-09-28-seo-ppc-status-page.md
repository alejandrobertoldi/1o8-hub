# SEO ↔ PPC Status Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "PPC Status" tab on the per-client SEO view showing (A) before/after PPC performance of the keywords placed in a listing, split on a manually-set go-live date, and (B) SEO↔PPC keyword gaps.

**Architecture:** One new nullable column `seo_projects.live_date`. All maths (windows, matching, aggregation, gap lists) is pure code in `src/lib/seo/ppc-status.ts`. A thin loader (`ppc-status-data.ts`) reads keyword sets from Postgres and PPC search terms from Redshift via the existing `fetchSearchTermSummary`, cached 24h in `reports_cache`. One GET route serves the tab; the existing project PATCH route gains `live_date`.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres.js, Redshift (`queryRedshift`), Vitest, shadcn/ui, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-28-seo-ppc-status-page-design.md`

## Global Constraints

- Dates cross module boundaries as `YYYY-MM-DD` strings, never `Date`.
- Redshift is SELECT-only. No writes.
- Window lengths allowed: exactly `30 | 60 | 90`; default `30`.
- Matching: `normalize(s)` = lowercase, trim, collapse internal whitespace to one space; exact equality only. Search terms with `is_asin = true` are excluded everywhere.
- Keyword set: S6 `seo_passage_map.passages[].keywords_used`; if empty, fall back to `seo_keywords` with `priority_tier IN ('T1','T2') AND is_negative = false`.
- Cache: `reports_cache`, `cache_type = 'seo-ppc-status'`, `cache_key = accountId|start|end`, TTL 24h.
- Auth: `getAuthSession()` + `isEditorOrAbove(session.user.role)` (`src/lib/roles.ts:115`); else 403.
- Migration: bespoke `scripts/_apply-00NN.ts` (copy `scripts/_apply-0113.ts`), NEVER `drizzle-kit migrate` / `db:generate`. Running it against prod needs Manu's explicit per-action OK.
- NEVER `git add .`; explicit pathspec on add AND commit; `-m` before `--`. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in a worktree under `/Users/manu/MFHub/.worktrees/` (main checkout is contended by other sessions). No push, no merge to main without explicit OK.
- Read `DESIGN.md` before Task 6. `--color-white` is `#FEFEFE`.
- vitest does not typecheck: every task ends with `node_modules/.bin/tsc --noEmit`, judged by filename.

## Review Focus

1. **Redshift returns numerics as strings** — `"12.50"` must sum as 12.5, not concatenate. Pinned in Task 2 (`toMetrics coerces strings`).
2. **Go-live date is yesterday or today** — after-window has 0–1 days; must not divide by zero or show NaN. Pinned in Task 2 (`after window clamps, zero days → null perDay`).
3. **Same keyword in several ASINs / projects / with odd casing** — must appear once, with all ASINs listed. Pinned in Task 2 (`buildKeywordSet dedupes`).
4. **Client with no Intentwise account** — page must render an explanatory state, not 500. Pinned in Task 4 (`null account → 200`).
5. **Go-live date in the future** — Section A must say "Goes live on …", not show an empty/negative window. Pinned in Task 2 (`future live date → before/after null`).

---

### Task 1: `live_date` column (schema + migration + apply script)

**Files:**
- Modify: `src/lib/db/schema.ts` (inside `export const seoProjects = pgTable("seo_projects", …)`, next to `clientBibleUrl`)
- Create: `drizzle/migrations/00NN_seo_project_live_date.sql` (NN = next free; at plan time the newest was `0118_team_multi_dept.sql` → expect `0119`; re-check with `ls drizzle/migrations | sort | tail -3` and also grep `scripts/_apply-0*.ts`)
- Create: `scripts/_apply-00NN.ts`

**Interfaces:**
- Produces: `seoProjects.liveDate` — drizzle `date("live_date", { mode: "string" })`, type `string | null`.

- [ ] **Step 1: Add the column to the schema**

In `seoProjects`, after `clientBibleUrl: text("client_bible_url"),` add:

```ts
    // Manually-set go-live date of the optimised listing (YYYY-MM-DD). Splits
    // before/after on the SEO↔PPC status page. Null = not set.
    liveDate: date("live_date", { mode: "string" }),
```

Ensure `date` is in the `drizzle-orm/pg-core` import at the top of `schema.ts` (add it to the existing import list if missing).

- [ ] **Step 2: Write the migration SQL**

`drizzle/migrations/00NN_seo_project_live_date.sql`:

```sql
ALTER TABLE seo_projects ADD COLUMN IF NOT EXISTS live_date date;
```

- [ ] **Step 3: Write the apply script**

Copy `scripts/_apply-0113.ts` to `scripts/_apply-00NN.ts`, change only `const MIGRATION = "00NN_seo_project_live_date.sql";`, and replace its post-apply verification query (if any) with:

```ts
const rows = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'seo_projects' AND column_name = 'live_date'`;
console.log(rows.length === 1 ? `OK: live_date ${rows[0].data_type}` : "FAIL: column missing");
```

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` (background, ~2 min). Expected: no errors in `schema.ts` or `scripts/_apply-00NN.ts`.

- [ ] **Step 5: Commit (do NOT run the script)**

```bash
git add -- src/lib/db/schema.ts drizzle/migrations/00NN_seo_project_live_date.sql scripts/_apply-00NN.ts
git commit -m "feat(seo): add seo_projects.live_date column + apply script" -- src/lib/db/schema.ts drizzle/migrations/00NN_seo_project_live_date.sql scripts/_apply-00NN.ts
```

- [ ] **Step 6: STOP — ask Manu for OK to run `npx tsx scripts/_apply-00NN.ts` against prod.** Additive, `IF NOT EXISTS`, nullable → safe to run before the code ships. Tasks 2–4 can proceed while waiting; Task 5's route test is mocked, but the browser pass (Task 7) needs the column.

---

### Task 2: Pure logic — `src/lib/seo/ppc-status.ts`

**Files:**
- Create: `src/lib/seo/ppc-status.ts`
- Test: `src/lib/seo/ppc-status.test.ts`

**Interfaces:**
- Consumes: `SearchTermRow` from `@/lib/ppc-queries` (fields used: `search_term, is_asin, ad_impressions, ad_clicks, ad_spend, ad_revenue, ad_orders`).
- Produces (exact):

```ts
export type WindowDays = 30 | 60 | 90;
export interface DateWindow { start: string; end: string; days: number }
export interface Metrics { impressions: number; clicks: number; spend: number; sales: number; orders: number; roas: number | null }
export interface PerDay { impressions: number; clicks: number; spend: number; sales: number; orders: number }
export interface KeywordEntry { keyword: string; tier: string | null; asins: string[]; searchVolume: number | null; suggestedBid: number | null }
export interface SectionARow { keyword: string; tier: string | null; asins: string[]; before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics }
export interface SectionB { noTraffic: KeywordEntry[]; missing: Array<{ searchTerm: string } & Metrics>; bothCount: number }
export function normalizeTerm(s: string): string;
export function computeWindows(liveDate: string | null, n: WindowDays, today: string): { before: DateWindow | null; after: DateWindow | null; gapWindow: DateWindow; status: "no-date" | "future" | "live" };
export function toMetrics(rows: SearchTermRow[]): Metrics;
export function aggregateByTerm(rows: SearchTermRow[]): Map<string, Metrics>;
export function buildKeywordSet(input: { s6: Array<{ asin: string; keywords: string[] }>; s2: Array<{ text: string; tier: string | null; searchVolume: number | null; suggestedBid: number | null }> }): { source: "listing" | "research"; entries: KeywordEntry[] };
export function buildSectionA(entries: KeywordEntry[], beforeRows: SearchTermRow[], afterRows: SearchTermRow[], before: DateWindow, after: DateWindow): SectionARow[];
export function buildSectionB(entries: KeywordEntry[], rows: SearchTermRow[]): SectionB;
```

- [ ] **Step 1: Write the failing tests**

`src/lib/seo/ppc-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { SearchTermRow } from "@/lib/ppc-queries";
import {
  normalizeTerm, computeWindows, toMetrics, aggregateByTerm,
  buildKeywordSet, buildSectionA, buildSectionB,
} from "./ppc-status";

const row = (term: string, o: Partial<SearchTermRow> = {}): SearchTermRow => ({
  account_id: 1, search_term: term, target: "", match_type: "EXACT", is_asin: false,
  is_brand_term: false, campaign_name: "c", campaign_type: "SP", report_date: "2026-09-01",
  ad_impressions: 100, ad_clicks: 10, ad_spend: 5, ad_revenue: 20, ad_conversions: 1, ad_orders: 1,
  ...o,
});

describe("normalizeTerm", () => {
  it("lowercases, trims, collapses whitespace", () => {
    expect(normalizeTerm("  Dog   Bed\tLarge ")).toBe("dog bed large");
  });
});

describe("computeWindows", () => {
  it("no date → only gap window of last N days ending yesterday", () => {
    const w = computeWindows(null, 30, "2026-09-28");
    expect(w.status).toBe("no-date");
    expect(w.before).toBeNull();
    expect(w.after).toBeNull();
    expect(w.gapWindow).toEqual({ start: "2026-08-29", end: "2026-09-27", days: 30 });
  });
  it("live 2026-08-01, N=30 → symmetric windows", () => {
    const w = computeWindows("2026-08-01", 30, "2026-09-28");
    expect(w.status).toBe("live");
    expect(w.before).toEqual({ start: "2026-07-02", end: "2026-07-31", days: 30 });
    expect(w.after).toEqual({ start: "2026-08-01", end: "2026-08-30", days: 30 });
    expect(w.gapWindow).toEqual(w.after);
  });
  it("after window clamps to yesterday", () => {
    const w = computeWindows("2026-09-20", 30, "2026-09-28");
    expect(w.after).toEqual({ start: "2026-09-20", end: "2026-09-27", days: 8 });
  });
  it("live date = today → after window has 0 days", () => {
    const w = computeWindows("2026-09-28", 30, "2026-09-28");
    expect(w.status).toBe("live");
    expect(w.after!.days).toBe(0);
  });
  it("future live date → before/after null", () => {
    const w = computeWindows("2026-10-15", 30, "2026-09-28");
    expect(w.status).toBe("future");
    expect(w.before).toBeNull();
    expect(w.after).toBeNull();
  });
});

describe("toMetrics", () => {
  it("coerces strings (Redshift numerics) and computes roas", () => {
    const m = toMetrics([
      row("a", { ad_spend: "12.50" as unknown as number, ad_revenue: "50" as unknown as number }),
      row("b", { ad_spend: 2.5, ad_revenue: 10 }),
    ]);
    expect(m.spend).toBe(15);
    expect(m.sales).toBe(60);
    expect(m.roas).toBe(4);
  });
  it("zero spend → roas null", () => {
    expect(toMetrics([row("a", { ad_spend: 0 })]).roas).toBeNull();
  });
});

describe("aggregateByTerm", () => {
  it("groups by normalized term and drops ASIN targets", () => {
    const m = aggregateByTerm([row("Dog Bed"), row("dog  bed"), row("b0abc12345", { is_asin: true })]);
    expect([...m.keys()]).toEqual(["dog bed"]);
    expect(m.get("dog bed")!.clicks).toBe(20);
  });
});

describe("buildKeywordSet", () => {
  it("uses S6 when present, dedupes across ASINs and casing", () => {
    const r = buildKeywordSet({
      s6: [{ asin: "A1", keywords: ["Dog Bed", "orthopedic"] }, { asin: "A2", keywords: ["dog bed"] }],
      s2: [{ text: "dog bed", tier: "T1", searchVolume: 5000, suggestedBid: 1.2 }],
    });
    expect(r.source).toBe("listing");
    const dog = r.entries.find((e) => e.keyword === "dog bed")!;
    expect(dog.asins).toEqual(["A1", "A2"]);
    expect(dog.tier).toBe("T1");
    expect(dog.searchVolume).toBe(5000);
    expect(r.entries).toHaveLength(2);
  });
  it("falls back to S2 when S6 has no keywords", () => {
    const r = buildKeywordSet({ s6: [{ asin: "A1", keywords: [] }], s2: [{ text: "Cat Tree", tier: "T2", searchVolume: 10, suggestedBid: null }] });
    expect(r.source).toBe("research");
    expect(r.entries.map((e) => e.keyword)).toEqual(["cat tree"]);
  });
});

describe("buildSectionA", () => {
  const before = { start: "2026-07-02", end: "2026-07-31", days: 30 };
  const after = { start: "2026-08-01", end: "2026-08-10", days: 10 };
  const entries = [{ keyword: "dog bed", tier: "T1", asins: ["A1"], searchVolume: null, suggestedBid: null }];
  it("per-day averages use each window's own day count", () => {
    const [r] = buildSectionA(entries, [row("dog bed", { ad_clicks: 30 })], [row("Dog Bed", { ad_clicks: 30 })], before, after);
    expect(r.before!.clicks).toBe(1);
    expect(r.after!.clicks).toBe(3);
  });
  it("zero-day window → perDay null, no NaN", () => {
    const [r] = buildSectionA(entries, [], [], before, { start: "2026-08-01", end: "2026-07-31", days: 0 });
    expect(r.after).toBeNull();
    expect(r.afterTotals.clicks).toBe(0);
  });
});

describe("buildSectionB", () => {
  it("splits into noTraffic / missing (orders ≥ 1) / both", () => {
    const entries = [
      { keyword: "dog bed", tier: "T1", asins: [], searchVolume: 1, suggestedBid: null },
      { keyword: "pet mat", tier: "T2", asins: [], searchVolume: 1, suggestedBid: null },
    ];
    const b = buildSectionB(entries, [
      row("dog bed"),
      row("large dog bed", { ad_orders: 3 }),
      row("dog pillow", { ad_orders: 0 }),
    ]);
    expect(b.noTraffic.map((e) => e.keyword)).toEqual(["pet mat"]);
    expect(b.missing.map((m) => m.searchTerm)).toEqual(["large dog bed"]);
    expect(b.bothCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/seo/ppc-status.test.ts`
Expected: FAIL — cannot resolve `./ppc-status`.

- [ ] **Step 3: Implement**

`src/lib/seo/ppc-status.ts`:

```ts
/**
 * Pure logic for the SEO ↔ PPC status page: date windows, term matching,
 * aggregation and gap lists. No DB / Redshift imports — fully unit-testable.
 * Dates are YYYY-MM-DD strings at every boundary.
 */
import type { SearchTermRow } from "@/lib/ppc-queries";

export type WindowDays = 30 | 60 | 90;
export interface DateWindow { start: string; end: string; days: number }
export interface Metrics { impressions: number; clicks: number; spend: number; sales: number; orders: number; roas: number | null }
export interface PerDay { impressions: number; clicks: number; spend: number; sales: number; orders: number }
export interface KeywordEntry { keyword: string; tier: string | null; asins: string[]; searchVolume: number | null; suggestedBid: number | null }
export interface SectionARow { keyword: string; tier: string | null; asins: string[]; before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics }
export interface SectionB { noTraffic: KeywordEntry[]; missing: Array<{ searchTerm: string } & Metrics>; bothCount: number }

const MISSING_LIMIT = 50;

export function normalizeTerm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

export function computeWindows(liveDate: string | null, n: WindowDays, today: string) {
  const yesterday = addDays(today, -1);
  const lastN: DateWindow = { start: addDays(yesterday, -(n - 1)), end: yesterday, days: n };
  if (!liveDate) return { before: null, after: null, gapWindow: lastN, status: "no-date" as const };
  if (liveDate > today) return { before: null, after: null, gapWindow: lastN, status: "future" as const };
  const before: DateWindow = { start: addDays(liveDate, -n), end: addDays(liveDate, -1), days: n };
  const naturalEnd = addDays(liveDate, n - 1);
  const end = naturalEnd < yesterday ? naturalEnd : yesterday;
  const after: DateWindow = { start: liveDate, end, days: daysBetweenInclusive(liveDate, end) };
  return { before, after, gapWindow: after.days > 0 ? after : lastN, status: "live" as const };
}

const num = (v: unknown) => Number(v) || 0;

export function toMetrics(rows: SearchTermRow[]): Metrics {
  const m = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
  for (const r of rows) {
    m.impressions += num(r.ad_impressions);
    m.clicks += num(r.ad_clicks);
    m.spend += num(r.ad_spend);
    m.sales += num(r.ad_revenue);
    m.orders += num(r.ad_orders);
  }
  return { ...m, roas: m.spend > 0 ? m.sales / m.spend : null };
}

function groupRows(rows: SearchTermRow[]): Map<string, SearchTermRow[]> {
  const out = new Map<string, SearchTermRow[]>();
  for (const r of rows) {
    if (r.is_asin) continue;
    const k = normalizeTerm(r.search_term);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export function aggregateByTerm(rows: SearchTermRow[]): Map<string, Metrics> {
  const out = new Map<string, Metrics>();
  for (const [k, rs] of groupRows(rows)) out.set(k, toMetrics(rs));
  return out;
}

export function buildKeywordSet(input: {
  s6: Array<{ asin: string; keywords: string[] }>;
  s2: Array<{ text: string; tier: string | null; searchVolume: number | null; suggestedBid: number | null }>;
}): { source: "listing" | "research"; entries: KeywordEntry[] } {
  const s2ByKey = new Map(input.s2.map((k) => [normalizeTerm(k.text), k]));
  const map = new Map<string, KeywordEntry>();
  for (const { asin, keywords } of input.s6) {
    for (const raw of keywords) {
      const key = normalizeTerm(raw);
      if (!key) continue;
      const e = map.get(key);
      if (e) { if (!e.asins.includes(asin)) e.asins.push(asin); continue; }
      const meta = s2ByKey.get(key);
      map.set(key, { keyword: key, tier: meta?.tier ?? null, asins: [asin], searchVolume: meta?.searchVolume ?? null, suggestedBid: meta?.suggestedBid ?? null });
    }
  }
  if (map.size > 0) return { source: "listing", entries: [...map.values()] };
  const entries: KeywordEntry[] = [];
  for (const [key, k] of s2ByKey) {
    if (!key) continue;
    entries.push({ keyword: key, tier: k.tier, asins: [], searchVolume: k.searchVolume, suggestedBid: k.suggestedBid });
  }
  return { source: "research", entries };
}

const EMPTY: Metrics = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, roas: null };

function perDay(m: Metrics, days: number): PerDay | null {
  if (days <= 0) return null;
  return { impressions: m.impressions / days, clicks: m.clicks / days, spend: m.spend / days, sales: m.sales / days, orders: m.orders / days };
}

export function buildSectionA(entries: KeywordEntry[], beforeRows: SearchTermRow[], afterRows: SearchTermRow[], before: DateWindow, after: DateWindow): SectionARow[] {
  const b = aggregateByTerm(beforeRows);
  const a = aggregateByTerm(afterRows);
  return entries
    .map((e) => {
      const beforeTotals = b.get(e.keyword) ?? EMPTY;
      const afterTotals = a.get(e.keyword) ?? EMPTY;
      return { keyword: e.keyword, tier: e.tier, asins: e.asins, before: perDay(beforeTotals, before.days), after: perDay(afterTotals, after.days), beforeTotals, afterTotals };
    })
    .sort((x, y) => y.afterTotals.sales - x.afterTotals.sales);
}

export function buildSectionB(entries: KeywordEntry[], rows: SearchTermRow[]): SectionB {
  const byTerm = aggregateByTerm(rows);
  const keys = new Set(entries.map((e) => e.keyword));
  const noTraffic = entries.filter((e) => (byTerm.get(e.keyword)?.impressions ?? 0) === 0);
  const bothCount = entries.length - noTraffic.length;
  const missing = [...byTerm]
    .filter(([term, m]) => !keys.has(term) && m.orders >= 1)
    .sort(([, x], [, y]) => y.orders - x.orders)
    .slice(0, MISSING_LIMIT)
    .map(([searchTerm, m]) => ({ searchTerm, ...m }));
  return { noTraffic, missing, bothCount };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/seo/ppc-status.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck + commit**

Run `node_modules/.bin/tsc --noEmit`; expect no errors in `ppc-status*.ts`.

```bash
git add -- src/lib/seo/ppc-status.ts src/lib/seo/ppc-status.test.ts
git commit -m "feat(seo): pure SEO↔PPC status logic (windows, matching, sections A/B)" -- src/lib/seo/ppc-status.ts src/lib/seo/ppc-status.test.ts
```

---

### Task 3: Data loader — `src/lib/seo/ppc-status-data.ts`

**Files:**
- Create: `src/lib/seo/ppc-status-data.ts`
- Test: `src/lib/seo/ppc-status-data.test.ts`

**Interfaces:**
- Consumes: `fetchSearchTermSummary(accountId: number, start: string, end: string): Promise<SearchTermRow[]>` (`@/lib/ppc-queries`); `db`, `reportsCache`, `seoPassageMap`, `seoAsins`, `seoKeywords` (verify the exported const names in `schema.ts` with `grep -n "pgTable(\"seo_passage_map\"\|pgTable(\"seo_asins\"" src/lib/db/schema.ts`; the ASIN column on `seo_asins` must be checked too — adjust the select below to the real field name).
- Produces:

```ts
export const CACHE_TYPE = "seo-ppc-status";
export const CACHE_TTL_MS = 86_400_000;
export function isFresh(updatedAt: Date, now: number): boolean;
export async function loadSearchTerms(accountId: number, w: DateWindow): Promise<SearchTermRow[]>;
export async function loadKeywordInputs(projectIds: string[]): Promise<Parameters<typeof buildKeywordSet>[0]>;
```

- [ ] **Step 1: Failing test (cache behaviour only; DB + Redshift mocked)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above plain consts → create mocks with vi.hoisted.
const { fetchSearchTermSummary, selectResult, insertSpy } = vi.hoisted(() => ({
  fetchSearchTermSummary: vi.fn(),
  selectResult: [] as { data: unknown; updatedAt: Date }[],
  insertSpy: vi.fn(),
}));

vi.mock("@/lib/ppc-queries", () => ({ fetchSearchTermSummary }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    insert: () => ({ values: (v: unknown) => ({ onConflictDoUpdate: async () => insertSpy(v) }) }),
  },
}));

import { isFresh, loadSearchTerms, CACHE_TTL_MS } from "./ppc-status-data";

const w = { start: "2026-08-01", end: "2026-08-30", days: 30 };

beforeEach(() => { fetchSearchTermSummary.mockReset(); insertSpy.mockReset(); selectResult.length = 0; });

describe("isFresh", () => {
  it("true inside TTL, false after", () => {
    const now = Date.now();
    expect(isFresh(new Date(now - 1000), now)).toBe(true);
    expect(isFresh(new Date(now - CACHE_TTL_MS - 1), now)).toBe(false);
  });
});

describe("loadSearchTerms", () => {
  it("cache hit → no Redshift call", async () => {
    selectResult.push({ data: [{ search_term: "x" }], updatedAt: new Date() });
    const rows = await loadSearchTerms(7, w);
    expect(rows).toEqual([{ search_term: "x" }]);
    expect(fetchSearchTermSummary).not.toHaveBeenCalled();
  });
  it("miss → Redshift, then cache write keyed accountId|start|end", async () => {
    fetchSearchTermSummary.mockResolvedValue([{ search_term: "y" }]);
    await loadSearchTerms(7, w);
    expect(fetchSearchTermSummary).toHaveBeenCalledWith(7, "2026-08-01", "2026-08-30");
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ cacheType: "seo-ppc-status", cacheKey: "7|2026-08-01|2026-08-30" }));
  });
  it("Redshift error → throws, no cache write", async () => {
    fetchSearchTermSummary.mockRejectedValue(new Error("timeout"));
    await expect(loadSearchTerms(7, w)).rejects.toThrow("timeout");
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/seo/ppc-status-data.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
/**
 * I/O for the SEO ↔ PPC status page: keyword sets from Postgres, PPC search
 * terms from Redshift (24h cache in reports_cache). Maths lives in ppc-status.ts.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportsCache, seoPassageMap, seoAsins, seoKeywords } from "@/lib/db/schema";
import { fetchSearchTermSummary, type SearchTermRow } from "@/lib/ppc-queries";
import type { DateWindow, buildKeywordSet } from "./ppc-status";

export const CACHE_TYPE = "seo-ppc-status";
export const CACHE_TTL_MS = 86_400_000;

export function isFresh(updatedAt: Date, now: number): boolean {
  return now - updatedAt.getTime() <= CACHE_TTL_MS;
}

export async function loadSearchTerms(accountId: number, w: DateWindow): Promise<SearchTermRow[]> {
  const cacheKey = `${accountId}|${w.start}|${w.end}`;
  const [hit] = await db
    .select({ data: reportsCache.data, updatedAt: reportsCache.updatedAt })
    .from(reportsCache)
    .where(and(eq(reportsCache.cacheType, CACHE_TYPE), eq(reportsCache.cacheKey, cacheKey)))
    .limit(1);
  if (hit && isFresh(hit.updatedAt, Date.now())) return hit.data as SearchTermRow[];

  const rows = await fetchSearchTermSummary(accountId, w.start, w.end);
  const now = new Date();
  await db
    .insert(reportsCache)
    .values({ cacheType: CACHE_TYPE, cacheKey, data: rows, updatedAt: now })
    .onConflictDoUpdate({ target: [reportsCache.cacheType, reportsCache.cacheKey], set: { data: rows, updatedAt: now } });
  return rows;
}

export async function loadKeywordInputs(projectIds: string[]): Promise<Parameters<typeof buildKeywordSet>[0]> {
  if (projectIds.length === 0) return { s6: [], s2: [] };
  const [maps, kws] = await Promise.all([
    db
      .select({ asin: seoAsins.asin, passages: seoPassageMap.passages })
      .from(seoPassageMap)
      .innerJoin(seoAsins, eq(seoAsins.id, seoPassageMap.asinId))
      .where(inArray(seoPassageMap.projectId, projectIds)),
    db
      .select({ text: seoKeywords.text, tier: seoKeywords.priorityTier, searchVolume: seoKeywords.searchVolume, suggestedBid: seoKeywords.ppcSuggestedBid })
      .from(seoKeywords)
      .where(and(inArray(seoKeywords.projectId, projectIds), inArray(seoKeywords.priorityTier, ["T1", "T2"]), eq(seoKeywords.isNegative, false))),
  ]);
  return {
    s6: maps.map((m) => ({ asin: m.asin, keywords: (m.passages ?? []).flatMap((p) => p.keywords_used ?? []) })),
    s2: kws.map((k) => ({ text: k.text, tier: k.tier, searchVolume: k.searchVolume, suggestedBid: k.suggestedBid == null ? null : Number(k.suggestedBid) })),
  };
}
```

Note: if a project has several `seo_passage_map` versions per ASIN, keywords are unioned (dedupe happens in `buildKeywordSet`). Acceptable for v1.

- [ ] **Step 4: Run** → PASS, 4 tests. **Step 5:** tsc (judge `ppc-status-data.ts` only), then commit both files with explicit pathspec, message `feat(seo): SEO↔PPC status data loader with 24h reports_cache`.

---

### Task 4: API route — `GET /api/seo/clients/[clientId]/ppc-status`

**Files:**
- Create: `src/app/api/seo/clients/[clientId]/ppc-status/route.ts`
- Test: `src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts`

**Interfaces:**
- Consumes: Task 2 exports; Task 3 `loadSearchTerms`, `loadKeywordInputs`; `getIntentwiseAccountId(clientIdCode: string): Promise<number | null>` (`@/lib/forecast-redshift`); `seoProjects.liveDate` (Task 1).
- Produces: JSON

```ts
{
  projects: Array<{ id: string; name: string; liveDate: string | null }>,
  selectedProjectId: string | "all",
  status: "no-date" | "future" | "live",
  windows: { before: DateWindow | null; after: DateWindow | null; gap: DateWindow },
  accountId: number | null,
  keywordSource: "listing" | "research",
  sectionA: SectionARow[] | null,   // null when "all", no-date, future, or accountId null
  sectionB: SectionB | null,        // null when accountId null
  generatedAt: string
}
```

Query params: `projectId` (uuid or `all`, default `all`), `window` (`30|60|90`, anything else → 30).

- [ ] **Step 1: Failing route tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock is hoisted above plain consts → create mocks with vi.hoisted.
const { getAuthSession, getIntentwiseAccountId, loadSearchTerms, loadKeywordInputs, projects } = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  getIntentwiseAccountId: vi.fn(),
  loadSearchTerms: vi.fn(),
  loadKeywordInputs: vi.fn(),
  projects: [] as Array<{ id: string; name: string; liveDate: string | null }>,
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession }));
vi.mock("@/lib/forecast-redshift", () => ({ getIntentwiseAccountId }));
vi.mock("@/lib/seo/ppc-status-data", () => ({ loadSearchTerms, loadKeywordInputs }));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => projects }) }) }) },
}));

import { GET } from "./route";

const call = (qs = "") =>
  GET(new NextRequest(`http://x/api/seo/clients/ABC_SC_US/ppc-status${qs}`), { params: Promise.resolve({ clientId: "ABC_SC_US" }) });

beforeEach(() => {
  vi.clearAllMocks();
  projects.length = 0;
  getAuthSession.mockResolvedValue({ user: { role: "editor" } });
  loadKeywordInputs.mockResolvedValue({ s6: [{ asin: "A1", keywords: ["dog bed"] }], s2: [] });
  loadSearchTerms.mockResolvedValue([]);
});

describe("GET ppc-status", () => {
  it("viewer → 403", async () => {
    getAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    expect((await call()).status).toBe(403);
  });
  it("null account → 200 with accountId null, no Redshift", async () => {
    getIntentwiseAccountId.mockResolvedValue(null);
    projects.push({ id: "p1", name: "P1", liveDate: "2026-08-01" });
    const res = await call("?projectId=p1");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.accountId).toBeNull();
    expect(body.sectionB).toBeNull();
    expect(loadSearchTerms).not.toHaveBeenCalled();
  });
  it("single live project → sectionA built from before+after fetches", async () => {
    getIntentwiseAccountId.mockResolvedValue(7);
    projects.push({ id: "p1", name: "P1", liveDate: "2026-08-01" });
    const body = await (await call("?projectId=p1&window=30")).json();
    expect(body.status).toBe("live");
    expect(body.sectionA).toHaveLength(1);
    expect(loadSearchTerms).toHaveBeenCalledTimes(2);
  });
  it("'all' → sectionA null, sectionB present", async () => {
    getIntentwiseAccountId.mockResolvedValue(7);
    projects.push({ id: "p1", name: "P1", liveDate: null });
    const body = await (await call()).json();
    expect(body.sectionA).toBeNull();
    expect(body.sectionB).not.toBeNull();
  });
  it("Redshift failure → 502", async () => {
    getIntentwiseAccountId.mockResolvedValue(7);
    projects.push({ id: "p1", name: "P1", liveDate: null });
    loadSearchTerms.mockRejectedValue(new Error("timeout"));
    expect((await call()).status).toBe(502);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run "src/app/api/seo/clients/[clientId]/ppc-status/route.test.ts"` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { getIntentwiseAccountId } from "@/lib/forecast-redshift";
import { loadSearchTerms, loadKeywordInputs } from "@/lib/seo/ppc-status-data";
import { buildKeywordSet, buildSectionA, buildSectionB, computeWindows, type WindowDays } from "@/lib/seo/ppc-status";

const WINDOWS: WindowDays[] = [30, 60, 90];

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clientId } = await params;
  const sp = req.nextUrl.searchParams;
  const n = (WINDOWS.find((w) => String(w) === sp.get("window")) ?? 30) as WindowDays;
  const requested = sp.get("projectId") ?? "all";

  const projects = await db
    .select({ id: seoProjects.id, name: seoProjects.name, liveDate: seoProjects.liveDate })
    .from(seoProjects)
    .where(eq(seoProjects.clientIdCode, clientId))
    .orderBy(asc(seoProjects.name));

  const selected = requested === "all" ? null : projects.find((p) => p.id === requested) ?? null;
  const selectedProjectId = selected ? selected.id : "all";
  const today = new Date().toISOString().slice(0, 10);
  const win = computeWindows(selected?.liveDate ?? null, n, today);
  const windows = { before: win.before, after: win.after, gap: win.gapWindow };

  const kwInputs = await loadKeywordInputs(selected ? [selected.id] : projects.map((p) => p.id));
  const { source, entries } = buildKeywordSet(kwInputs);
  const base = { projects, selectedProjectId, status: win.status, windows, keywordSource: source, generatedAt: new Date().toISOString() };

  const accountId = await getIntentwiseAccountId(clientId);
  if (accountId == null) return NextResponse.json({ ...base, accountId: null, sectionA: null, sectionB: null });

  try {
    const wantA = selected && win.status === "live" && win.before && win.after;
    const [gapRows, beforeRows, afterRows] = await Promise.all([
      loadSearchTerms(accountId, win.gapWindow),
      wantA ? loadSearchTerms(accountId, win.before!) : Promise.resolve(null),
      wantA && win.after!.days > 0 && win.after !== win.gapWindow ? loadSearchTerms(accountId, win.after!) : Promise.resolve(null),
    ]);
    const sectionA = wantA ? buildSectionA(entries, beforeRows ?? [], afterRows ?? gapRows, win.before!, win.after!) : null;
    return NextResponse.json({ ...base, accountId, sectionA, sectionB: buildSectionB(entries, gapRows) });
  } catch (e) {
    return NextResponse.json({ error: `PPC data unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
```

(When the after-window is non-empty, `gapWindow === after`, so the after rows are the gap rows — two Redshift fetches, not three. That's why the "single live project" test expects exactly 2 calls.)

- [ ] **Step 4: Run** → PASS, 5 tests. **Step 5:** tsc (judge route files), commit both files, message `feat(seo): GET /api/seo/clients/[clientId]/ppc-status`.

---

### Task 5: Read + write `live_date` on the project API

**Files:**
- Modify: `src/app/api/seo/projects/[id]/route.ts` — `toSnakeCase` (add after `client_bible_url: p.clientBibleUrl,`) and `PATCH` (after `if (body.client_id_code !== undefined) …`). Note: the spec said PUT; the real handler is **PATCH**.
- Test: `src/lib/seo/ppc-status.test.ts` (validator tests appended)

**Interfaces:**
- Produces: GET response field `live_date: string | null`; PATCH accepts `live_date: "YYYY-MM-DD" | null | ""` (empty → null), anything else → 400.
- Export a pure validator from the route module is NOT allowed (Next route files may only export handlers) — put it in `src/lib/seo/ppc-status.ts`:

```ts
export function parseLiveDate(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false };
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? { ok: true, value: v } : { ok: false };
}
```

- [ ] **Step 1: Failing test** — add to `src/lib/seo/ppc-status.test.ts`:

(add `parseLiveDate` to the existing `import { … } from "./ppc-status";` at the top, then append:)

```ts
describe("parseLiveDate", () => {
  it("accepts YYYY-MM-DD, null, empty", () => {
    expect(parseLiveDate("2026-08-01")).toEqual({ ok: true, value: "2026-08-01" });
    expect(parseLiveDate(null)).toEqual({ ok: true, value: null });
    expect(parseLiveDate("")).toEqual({ ok: true, value: null });
  });
  it("rejects impossible or malformed dates", () => {
    expect(parseLiveDate("2026-02-30").ok).toBe(false);
    expect(parseLiveDate("08/01/2026").ok).toBe(false);
    expect(parseLiveDate(20260801).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** add `parseLiveDate` to `ppc-status.ts`, then in the route:

```ts
// toSnakeCase:
    live_date: p.liveDate,
// PATCH, after client_id_code:
    if (body.live_date !== undefined) {
      const parsed = parseLiveDate(body.live_date);
      if (!parsed.ok) return NextResponse.json({ error: "live_date must be YYYY-MM-DD" }, { status: 400 });
      update.liveDate = parsed.value;
    }
```

with `import { parseLiveDate } from "@/lib/seo/ppc-status";`.

- [ ] **Step 4: Run** `npx vitest run src/lib/seo/ppc-status.test.ts` → PASS, 16 tests. **Step 5:** tsc, commit `src/lib/seo/ppc-status.ts src/lib/seo/ppc-status.test.ts "src/app/api/seo/projects/[id]/route.ts"`, message `feat(seo): read/write live_date on project API`.

⚠️ At plan time `src/app/api/seo/projects/[id]/route.ts` had **uncommitted Thread W edits in the main checkout**. In the worktree (based on `origin/main`) they are absent — keep this edit minimal (two hunks) so the later merge is trivial.

---

### Task 6: "PPC Status" tab UI

**Files:**
- Create: `src/components/seo/ppc-status/ppc-status-tab.tsx`
- Create: `src/components/seo/ppc-status/format.ts` + `format.test.ts`
- Modify: the client view — `src/app/seo/clients/[clientId]/seo-client-view.tsx` (default export `SEOClientDetailPage`). **First** find how it's mounted: `grep -rn "seo-client-view" src/app` — at plan time no `page.tsx` was tracked beside it; if the route file is missing on `origin/main`, raise it with Manu before editing.

**Interfaces:**
- Consumes: the Task 4 JSON; `PATCH /api/seo/projects/[id]` with `{ live_date }` (Task 5).
- Produces: `export function PpcStatusTab({ clientId }: { clientId: string })`; `format.ts` exports `fmtDelta(before: number | null, after: number | null): string` and `fmtMoney(n: number): string`.

- [ ] **Step 1: Read `DESIGN.md`** and one existing table in `src/components/seo/` for classes/tokens to copy.

- [ ] **Step 2: Failing test for formatters**

```ts
import { describe, it, expect } from "vitest";
import { fmtDelta, fmtMoney } from "./format";
describe("fmtDelta", () => {
  it("percent change with sign", () => { expect(fmtDelta(10, 15)).toBe("+50%"); expect(fmtDelta(10, 5)).toBe("−50%"); });
  it("from zero → 'new'", () => { expect(fmtDelta(0, 3)).toBe("new"); });
  it("missing side → em dash", () => { expect(fmtDelta(null, 3)).toBe("—"); expect(fmtDelta(0, 0)).toBe("—"); });
});
describe("fmtMoney", () => { it("USD 2dp", () => { expect(fmtMoney(1234.5)).toBe("$1,234.50"); }); });
```

- [ ] **Step 3: Implement `format.ts`**

```ts
export function fmtDelta(before: number | null, after: number | null): string {
  if (before == null || after == null) return "—";
  if (before === 0) return after === 0 ? "—" : "new";
  const pct = Math.round(((after - before) / before) * 100);
  return pct >= 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}
export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

Run `npx vitest run src/components/seo/ppc-status/format.test.ts` → PASS, 4 tests.

- [ ] **Step 4: Implement `ppc-status-tab.tsx`** (client component). Required behaviour:
  - `"use client"`; state: `projectId` (default `"all"`), `window` (30), `data`, `loading`, `error`.
  - Fetch `/api/seo/clients/${clientId}/ppc-status?projectId=…&window=…` on mount and whenever `projectId`/`window` change.
  - Header: `<Select>` of projects (+ "All projects"), segmented 30/60/90 control, go-live `<Input type="date">` (disabled on "All"); on change → `PATCH /api/seo/projects/${projectId}` with `{ live_date: value || null }`, then refetch. Show the window dates as text (e.g. "Before 2026-07-02 → 07-31 · After 08-01 → 08-30 (30 days)").
  - `accountId === null` → single notice "No PPC account linked for this client"; no tables.
  - Section A card "Did it pay off?":
    - `projectId === "all"` → "Pick a project to see before/after."
    - `status === "no-date"` → "Set the go-live date to see impact."
    - `status === "future"` → `Goes live on ${liveDate}.`
    - else table: Keyword · Tier · ASINs · for Impr / Clicks / Spend / Orders / Sales: per-day before, per-day after, `fmtDelta`; ROAS before→after from totals. Label "per-day averages". If `keywordSource === "research"`, subtitle "Research keywords (listing not generated yet)".
  - Section B card "Gaps": three sub-tables — "In listing, no PPC traffic" (keyword, tier, search volume, suggested bid) · "Converting in PPC, not in listing" (search term, orders, sales, spend, ROAS; top 50) · "In both: N keywords".
  - Loading skeleton; error → message + Retry button.
  - Use existing shadcn `Card`, `Table`, `Select`, `Input`, `Button` from `@/components/ui/*`; colours only via DESIGN.md tokens.

- [ ] **Step 5: Mount the tab** in `seo-client-view.tsx`: add a tab/section toggle "Projects | PPC Status" at the top of the existing page body, rendering `<PpcStatusTab clientId={clientId} />` for the second. Keep the diff to the toggle + import.

- [ ] **Step 6:** tsc (judge `ppc-status/*` and `seo-client-view.tsx`), eslint on the new files, commit with explicit paths, message `feat(seo): PPC Status tab on client SEO view`.

---

### Task 7: Verification

- [ ] **Step 1:** Full scoped suite: `npx vitest run src/lib/seo/ppc-status src/components/seo/ppc-status "src/app/api/seo/clients/[clientId]/ppc-status"` → expected 16 + 4 + 5 + 4 = **29 pass**.
- [ ] **Step 2:** `node_modules/.bin/tsc --noEmit` unfiltered; zero errors in files this plan touched (worktree baseline recorded before Task 1).
- [ ] **Step 3:** Requires Task 1's migration applied (Manu's OK). Env file must be copied into the worktree by Manu (Bash commands naming it are hook-blocked). Start dev on **PORT=3100** (never 3000). Pick one client with an Intentwise account and an SEO project that has S6 output; set a go-live date ≥ 30 days ago in the tab; confirm Section A shows rows with non-NaN numbers, Section B's three lists render, changing 30/60/90 refetches, a client with no account shows the notice.
- [ ] **Step 4:** `graphify update .`
- [ ] **Step 5:** Report to Manu; no push / merge / PR without his explicit OK.
