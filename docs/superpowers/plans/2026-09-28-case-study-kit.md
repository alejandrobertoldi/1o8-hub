# Case Study Kit — Tracker + In-Hub Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Hub's legacy 13-section case-study builder with a cross-client tracker (`/case-studies`) and an in-Hub builder that renders Market Foundry's 5-slide High-Level and 14-slide Detailed decks, numbers pulled from Redshift, images pulled from the Design section, exported to PDF.

**Architecture:** One `case_studies` row per (client, format) holds a frozen metrics snapshot (`auto` from Redshift + staff `overrides`) and a stage; `case_study_sections` rows hold per-slide copy + resolved Design images + emergency manual images. A single declarative slide catalog (`kit/slides.ts`) drives defaults, the generic editor, blockers and rendering; banding/derivation/chart geometry are pure tested functions; slide components port the committed template markup 1:1.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres (Supabase), Redshift via `queryRedshift`, Vitest + Testing Library (jsdom), puppeteer-core for PDF.

**Spec:** `docs/superpowers/specs/2026-09-28-case-study-kit-design.md` (read it first). Look & fields source of truth: `docs/case-study-kit/High Level Case Study Template.html`, `docs/case-study-kit/Detailed Case Study Template.html`, `docs/case-study-kit/Template Instructions.html`.

## Global Constraints

- Work ONLY in `/Users/manu/MFHub/.worktrees/thread-ab-case-study`, branch `thread-ab/case-study-kit`. Run `git rev-parse --abbrev-ref HEAD` before every commit; it must print `thread-ab/case-study-kit`.
- Commit with explicit pathspecs, `-m` before `--`, never `git add .`; keep `graphify-out/*`, `.claude/*`, `.superpowers/*` out. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- NEVER push, deploy, merge to main, write prod data, or apply a schema change without Manu's explicit per-action OK in chat.
- `.env.local` = PRODUCTION DB. Bash commands containing the literal `.env` are hook-blocked; scripts load it themselves via `config({ path: ".env.local" })` and are run with cwd `/Users/manu/MFHub` (the worktree has no env file): `cd /Users/manu/MFHub && npx tsx .worktrees/thread-ab-case-study/scripts/<file>.ts`.
- `rm -r`/`rm -f` and `git checkout -- <path>` are hook-blocked: delete files with `git rm <path>`; revert with Edit.
- Migration number is **0120** (0119 is claimed by `thread-aa/seo-ppc-status`). Applied only via `scripts/run-migration-0120.ts`, never `drizzle-kit migrate` / `db:push` / `db:generate`.
- Every metric comes from Redshift `intentwise_ecommerce_graph` (spec §5). The ONE exception is fulfilment, from Hub Postgres `master.fulfillment->>'FulfillmentChannelCodeUS'` (ruled 2026-09-28).
- Images come from the Design section; per-slot manual URL is emergency-only and must be visibly tagged.
- Numbers are never invented. A missing metric is `undefined` in the snapshot, never `0`.
- Private absolute `$` figures on High-Level slides are ALWAYS banded (`bandFigure`); percentages, ratios, counts never are. Detailed shows exact rounded values.
- Deck styling = the templates' `<style>` block verbatim (both templates' CSS is byte-identical), scoped under `.cs-deck`. Fonts: Outfit only. Tokens: `#2A5059` bg, `#2F2C2C` card, `#4A4646` line, `#FF751F` accent, `#5FA6B5` spend, `#6CE0A3` positive. Do not restyle per client. Hub chrome around the deck (tracker, builder header, drawer) follows `DESIGN.md` — read it before touching that UI.
- Where the template markup and the playbook §5 chart numbers disagree, **the template markup wins** (e.g. sales-bars viewBox is `880×380`, paid-media viewBox is `880×250` with `preserveAspectRatio="none"`).
- Dates cross module boundaries as `YYYY-MM-DD` strings (months as `YYYY-MM`), never `Date`.
- Tests: `npx vitest run <paths>` then `node_modules/.bin/tsc --noEmit` (vitest does not typecheck). Judge tsc by filename: zero errors in files this plan touches; pre-existing errors elsewhere are baseline — record the baseline count in Task 1 Step 0.
- Dev server for browser checks: `PORT=3100`, never 3000.

## Deviations from the spec (deliberate — surface at review)

1. **`status` column is kept, not dropped**, in migration 0120. Reason: dev and prod share one DB and the migration must be applied before the new code can be browser-tested, while prod still runs the old builder which reads `status`. Additive-only keeps prod working. A follow-up migration drops it after deploy.
2. **`format` gets `DEFAULT 'detailed'`** for the same reason (old code inserts without it).
3. **Overrides are scalar-only.** Monthly series, top-product tables and channel blocks are not hand-editable (they come from Redshift as-is). The spec's "per-field override" applies to every scalar metric.
4. **Subscribe & Save slide swap is not built** — Detailed always uses Demand Curve. (Spec §3 says "may"; deferred.)
5. **Fulfilment is non-blocking.** Measured 2026-09-28: `FulfillmentChannelCodeUS` exists on 31 of 1,987 `master` rows and for only 1 of 18 active clients (REA_SC_US, value `AMAZON_NA`). A blocking tile would stall 17 of 18 Detailed decks, so when missing the Fulfilment row is omitted from the Snapshot card instead of blocking Approved.
6. **Creative counts come from Design, not Redshift:** "N Premium modules · N ASINs live" (A+) are counts of Design-section A+ data — they describe delivered creative, not performance.
7. **PDF export is the browser's own "Save as PDF", not a server Puppeteer route** (Manu's ruling 2026-09-29, spec §10 updated). The server PDF measured 43–91 MB (~39 full-resolution images) against Vercel's 4.5 MB response cap. Export opens `/case-studies/[id]/print?autoprint=1`; print-mode images are ~1600px JPEGs via `/api/case-studies/print-image`; `/api/case-studies/[id]/pdf` removed.

## Review Focus

1. **A client with no Intentwise account id** (`aac.raw_data->>'IntentwiseID'` empty) — Create must still succeed with every metric missing and a banner, not a 500. Pinned in Task 7.
2. **A period shorter than 12 months / months with no rows** — charts must render the months that exist, H1/H2 and growth multiple must return `null` (not NaN/Infinity) below 6 months, and nothing divides by zero. Pinned in Tasks 2 and 3.
3. **Refresh after staff overrides** — overrides and manual images must survive; a manual image must not be replaced by a Design image. Pinned in Tasks 8 and 9.
4. **Editing an Approved or Sent deck** — any copy/image/override write must drop the stage to Drafting server-side. Pinned in Task 9.
5. **A raw dollar figure leaking into a High-Level deck** through copy tokens or a label default (e.g. `{total}` token in HL copy) — the render guard must fail. Pinned in Task 12.

---

## File Structure

New pure library `src/lib/case-study/kit/` (no DB, no React unless noted):

| File | Responsibility |
|---|---|
| `kit/banding.ts` | `bandFigure()` |
| `kit/metrics.ts` | metric types, `effective()`, `deriveMetrics()`, `PRIVATE_USD_KEYS` |
| `kit/display.ts` | display formatting per format (`usd`, `mult`, `pct`, `count`, `splitMetric`, `fillTokens`) |
| `kit/chart-geometry.ts` | chart coordinate math |
| `kit/stages.ts` | stage union, transitions, `stageAfterEdit` |
| `kit/slides.ts` | slide catalog (both formats), `slidesFor`, `defaultSectionContent`, `deckBlockers`, `resolveSlotImages` |
| `kit/pull-redshift.ts` | Redshift queries → `PulledMetrics` (DB-free except Redshift) |
| `kit/pull-fulfilment.ts` | `master.fulfillment` → `"FBA" | "FBM" | "FBA + FBM" | undefined` |
| `kit/design-images.ts` | Design section → `DesignImages` |
| `kit/pull.ts` | orchestrator: account id → metrics + fulfilment + images, failure list |

Rendering `src/components/case-study/kit/`:

| File | Responsibility |
|---|---|
| `deck.css` | the templates' CSS, scoped under `.cs-deck` |
| `primitives.tsx` | `SlideFrame`, `Topbar`, `Bottombar`, `Metric`, `SlotImage`, `MissingChip`, `DeckContext` |
| `charts.tsx` | `SalesBars`, `CumulativeCurve`, `SpendSalesLines` |
| `slides-hl.tsx` | 5 High-Level slide components |
| `slides-detailed-a.tsx` | Detailed 1–5 + 14 |
| `slides-detailed-b.tsx` | Detailed 6–9 (data/charts) |
| `slides-detailed-c.tsx` | Detailed 10–13 (creative) |
| `deck-view.tsx` | renders a whole deck, scaling, print mode, `data-case-study-ready` |
| `slide-editor.tsx` | generic catalog-driven drawer editor |

Pages/API: `src/app/case-studies/page.tsx` (tracker), `src/app/clients/[clientIdCode]/case-study/page.tsx` (builder, rewritten), `src/app/api/case-studies/route.ts` (tracker GET + create POST), `[id]/route.ts` (GET/PATCH/DELETE), `[id]/metrics/route.ts` (override PATCH, new), `[id]/refresh/route.ts`, `[id]/sections/[sectionId]/route.ts`, `[id]/pdf/route.ts`.

Removed in Task 19: legacy renderers/editors/tokens/charts/view/modal, `narrative.ts`, `evidence.ts`, `work-signals.ts`, legacy `generate.ts`, `queries/ppc.ts`, `queries/ppc-intentwise.ts`, `queries/sales.ts`, `queries/sns.ts`, `drive-screenviews.ts`, `redraft` route, `/portal/case-study`, the `"case-study"` entry in `admin-preview-toggle.tsx`, legacy types in `types.ts`.

---

### Task 1: Banding

**Files:**
- Create: `src/lib/case-study/kit/banding.ts`
- Test: `src/lib/case-study/kit/banding.test.ts`

**Interfaces:**
- Produces: `bandFigure(usd: number | null | undefined): string`

- [ ] **Step 0: Record the tsc baseline** (once, for the whole plan)

Run: `cd /Users/manu/MFHub/.worktrees/thread-ab-case-study && node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"; node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | cut -d'(' -f1 | sort -u`
Write the count and the file list into the task report. Every later tsc run is judged against this list.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { bandFigure } from "./banding";

describe("bandFigure", () => {
  it.each([
    [450_000, "Mid 6-Fig"],
    [2_100_000, "Low 7-Fig"],
    [780_000, "High 6-Fig"],
    [3_000_000, "Mid 7-Fig"],
    [2_999_999, "Low 7-Fig"],
    [6_999_999, "Mid 7-Fig"],
    [7_000_000, "High 7-Fig"],
    [999_999.9, "High 6-Fig"],
    [1_000, "Low 4-Fig"],
    [64_600, "High 5-Fig"],
    [12_000_000, "Low 8-Fig"],
    [150_000_000, "Low 9-Fig"],
  ])("%d → %s", (usd, expected) => {
    expect(bandFigure(usd)).toBe(expected);
  });

  it("small values are <4-Fig", () => {
    expect(bandFigure(999)).toBe("<4-Fig");
    expect(bandFigure(1)).toBe("<4-Fig");
  });

  it("zero, negative, null, undefined, NaN, Infinity → n/a", () => {
    for (const v of [0, -5, null, undefined, NaN, Infinity]) expect(bandFigure(v as number)).toBe("n/a");
  });

  it("never contains a digit-bearing dollar sign", () => {
    for (const v of [1_234, 56_789, 987_654, 4_321_000]) expect(bandFigure(v)).not.toMatch(/\$\d/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/case-study/kit/banding.test.ts`
Expected: FAIL — cannot find module `./banding`.

- [ ] **Step 3: Implement**

```ts
/**
 * High-Level decks never show private absolute $ figures (Template Instructions §1).
 * N = digit count of floor(usd); L = usd / 10^(N-1). Low < 3 ≤ Mid < 7 ≤ High.
 */
export function bandFigure(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "n/a";
  if (usd < 1000) return "<4-Fig";
  const n = Math.floor(usd).toString().length;
  const lead = usd / 10 ** (n - 1);
  const tier = lead < 3 ? "Low" : lead < 7 ? "Mid" : "High";
  return `${tier} ${n}-Fig`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/case-study/kit/banding.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/case-study/kit/banding.ts src/lib/case-study/kit/banding.test.ts
git commit -m "feat(case-study): bandFigure for High-Level \$ banding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/case-study/kit/banding.ts src/lib/case-study/kit/banding.test.ts
```

---

### Task 2: Metrics model, derivation and display formatting

**Files:**
- Create: `src/lib/case-study/kit/metrics.ts`, `src/lib/case-study/kit/display.ts`
- Test: `src/lib/case-study/kit/metrics.test.ts`, `src/lib/case-study/kit/display.test.ts`

**Interfaces:**
- Consumes: `bandFigure` (Task 1).
- Produces (exact):

```ts
// metrics.ts
export type Month = string; // "YYYY-MM"
export type Series = { month: Month; value: number }[];
export interface ProductRow { asin: string; title: string; value: number }
export interface ChannelBlock {
  spend: number; sales: number; orders: number;
  monthly: { month: Month; spend: number; sales: number }[];
}
export interface PulledMetrics {
  salesTotal: number; salesMonthly: Series; unitsTotal: number;
  adSales: number; adSpend: number; adImpressions: number; adClicks: number; adOrders: number;
  sessions: number; pageViews: number; buyBoxPct: number; skuCount: number;
  topByRevenue: ProductRow[]; topByUnits: ProductRow[];
  paidSp: ChannelBlock; paidSbSd: ChannelBlock;
  fulfilment: string;
}
export type MetricKey = keyof PulledMetrics;
export const SCALAR_KEYS: readonly ScalarKey[];
export type ScalarKey = "salesTotal" | "unitsTotal" | "adSales" | "adSpend" | "adImpressions"
  | "adClicks" | "adOrders" | "sessions" | "pageViews" | "buyBoxPct" | "skuCount" | "fulfilment";
export interface CaseStudyMetrics {
  pulledAt: string | null;
  period: { start: string; end: string };
  auto: Partial<PulledMetrics>;
  overrides: Partial<Pick<PulledMetrics, ScalarKey>>;
  failed: string[]; // metric groups whose pull threw, e.g. ["account","products"]
}
export function emptyMetrics(start: string, end: string): CaseStudyMetrics;
export function effective(m: CaseStudyMetrics): Partial<PulledMetrics>;
export interface Derived {
  organicSales: number | null; organicPct: number | null; adPct: number | null;
  roas: number | null; acos: number | null; cvrPct: number | null; asp: number | null;
  growthMultiple: number | null; startSales: number | null;
  peakMonth: Month | null; peakSales: number | null;
  h1AvgSales: number | null; h2AvgSales: number | null; h2VsH1Pct: number | null;
  top3RevenueSharePct: number | null; cumulative: Series;
  spAcos: number | null; sbSdAcos: number | null;
}
export function deriveMetrics(e: Partial<PulledMetrics>): Derived;
export type AnyMetricKey = MetricKey | keyof Derived;
export const PRIVATE_USD_KEYS: ReadonlySet<AnyMetricKey>;
export function isMissing(e: Partial<PulledMetrics>, d: Derived, key: AnyMetricKey): boolean;

// display.ts
export type DeckFormat = "high_level" | "detailed";
export function usd(value: number | null | undefined, format: DeckFormat): string; // HL → band, Detailed → $64.6K/$1.2M/$950
export function usdExact(value: number | null | undefined): string;               // "$1,234,567" (Detailed only)
export function mult(v: number | null | undefined): string;                        // "5.2×" | "—"
export function pct(v: number | null | undefined, digits?: number): string;        // "98.9%" | "—"
export function count(v: number | null | undefined): string;                       // 1.2M / 845K / 9,999 | "—"
export function splitMetric(s: string): { num: string; unit: string };
export function fillTokens(text: string, tokens: Record<string, string>): string;  // "{total}" → value; unknown tokens left as-is
export function monthLetter(m: Month): string;                                     // "2026-01" → "J"
export function monthShort(m: Month): string;                                      // "2026-01" → "Jan"
```

- [ ] **Step 1: Write the failing tests**

`metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { effective, deriveMetrics, emptyMetrics, isMissing, PRIVATE_USD_KEYS } from "./metrics";

const months = (vals: number[]) => vals.map((value, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value }));

describe("effective", () => {
  it("override beats auto; auto survives where no override", () => {
    const m = emptyMetrics("2025-01-01", "2025-12-31");
    m.auto = { salesTotal: 100, sessions: 50 };
    m.overrides = { salesTotal: 120 };
    expect(effective(m)).toMatchObject({ salesTotal: 120, sessions: 50 });
  });
  it("missing stays undefined, never 0", () => {
    expect(effective(emptyMetrics("2025-01-01", "2025-12-31")).salesTotal).toBeUndefined();
  });
});

describe("deriveMetrics", () => {
  it("computes ratios", () => {
    const d = deriveMetrics({ salesTotal: 1000, adSales: 250, adSpend: 100, unitsTotal: 50, sessions: 500 });
    expect(d.organicSales).toBe(750);
    expect(d.organicPct).toBe(75);
    expect(d.adPct).toBe(25);
    expect(d.roas).toBe(2.5);
    expect(d.acos).toBe(40);
    expect(d.cvrPct).toBe(10);
    expect(d.asp).toBe(20);
  });
  it("12 months: growth multiple = last3 avg / first3 avg, H1/H2 split, peak, cumulative", () => {
    const d = deriveMetrics({ salesMonthly: months([10, 10, 10, 20, 20, 20, 30, 30, 30, 40, 40, 40]) });
    expect(d.growthMultiple).toBe(4);
    expect(d.startSales).toBe(10);
    expect(d.h1AvgSales).toBe(15);
    expect(d.h2AvgSales).toBe(35);
    expect(d.h2VsH1Pct).toBeCloseTo(133.33, 1);
    expect(d.peakMonth).toBe("2025-10");
    expect(d.peakSales).toBe(40);
    expect(d.cumulative.at(-1)).toEqual({ month: "2025-12", value: 300 });
  });
  it("fewer than 6 months → growth multiple and H1/H2 are null, peak still works", () => {
    const d = deriveMetrics({ salesMonthly: months([5, 8, 3]) });
    expect(d.growthMultiple).toBeNull();
    expect(d.h1AvgSales).toBeNull();
    expect(d.h2VsH1Pct).toBeNull();
    expect(d.peakSales).toBe(8);
  });
  it("zero denominators → null, never NaN/Infinity", () => {
    const d = deriveMetrics({ salesTotal: 0, adSales: 0, adSpend: 0, unitsTotal: 0, sessions: 0,
      salesMonthly: months([0, 0, 0, 0, 0, 0]) });
    for (const v of [d.organicPct, d.adPct, d.roas, d.acos, d.cvrPct, d.asp, d.growthMultiple, d.h2VsH1Pct])
      expect(v).toBeNull();
  });
  it("top-3 share of revenue", () => {
    const d = deriveMetrics({ salesTotal: 200, topByRevenue: [
      { asin: "A", title: "a", value: 80 }, { asin: "B", title: "b", value: 40 },
      { asin: "C", title: "c", value: 30 }, { asin: "D", title: "d", value: 10 } ] });
    expect(d.top3RevenueSharePct).toBe(75);
  });
  it("channel ACOS", () => {
    const blk = (spend: number, sales: number) => ({ spend, sales, orders: 1, monthly: [] });
    const d = deriveMetrics({ paidSp: blk(30, 100), paidSbSd: blk(10, 0) });
    expect(d.spAcos).toBe(30);
    expect(d.sbSdAcos).toBeNull();
  });
});

describe("isMissing / PRIVATE_USD_KEYS", () => {
  it("derived missing when its inputs are missing", () => {
    const e = { salesTotal: 100 };
    const d = deriveMetrics(e);
    expect(isMissing(e, d, "salesTotal")).toBe(false);
    expect(isMissing(e, d, "roas")).toBe(true);
    expect(isMissing(e, d, "sessions")).toBe(true);
  });
  it("empty arrays count as missing", () => {
    const e = { topByRevenue: [] };
    expect(isMissing(e, deriveMetrics(e), "topByRevenue")).toBe(true);
  });
  it("private $ keys are exactly the absolute-dollar ones", () => {
    expect([...PRIVATE_USD_KEYS].sort()).toEqual(
      ["adSales", "adSpend", "asp", "h1AvgSales", "h2AvgSales", "organicSales", "peakSales", "salesTotal", "startSales"].sort());
  });
});
```

`display.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { usd, usdExact, mult, pct, count, splitMetric, fillTokens, monthLetter, monthShort } from "./display";

describe("display", () => {
  it("usd bands on High-Level, rounds on Detailed", () => {
    expect(usd(2_345_678, "high_level")).toBe("Low 7-Fig");
    expect(usd(2_345_678, "detailed")).toBe("$2.3M");
    expect(usd(64_600, "detailed")).toBe("$64.6K");
    expect(usd(950, "detailed")).toBe("$950");
    expect(usd(undefined, "detailed")).toBe("—");
  });
  it("usdExact", () => expect(usdExact(1234567.4)).toBe("$1,234,567"));
  it("mult/pct/count", () => {
    expect(mult(5.23)).toBe("5.2×");
    expect(mult(null)).toBe("—");
    expect(pct(98.94)).toBe("98.9%");
    expect(pct(12.345, 0)).toBe("12%");
    expect(count(1_234_567)).toBe("1.2M");
    expect(count(845_210)).toBe("845.2K");
    expect(count(9_999)).toBe("9,999");
  });
  it("splitMetric", () => {
    expect(splitMetric("$64.6K")).toEqual({ num: "$64.6", unit: "K" });
    expect(splitMetric("Mid 7-Fig")).toEqual({ num: "Mid 7", unit: "-Fig" });
    expect(splitMetric("5.2×")).toEqual({ num: "5.2", unit: "×" });
    expect(splitMetric("98.9%")).toEqual({ num: "98.9", unit: "%" });
    expect(splitMetric("9,999")).toEqual({ num: "9,999", unit: "" });
    expect(splitMetric("—")).toEqual({ num: "—", unit: "" });
  });
  it("fillTokens leaves unknown tokens", () => {
    expect(fillTokens("Hit {total} in {period}. {x}", { total: "$1", period: "2025" })).toBe("Hit $1 in 2025. {x}");
  });
  it("month labels", () => {
    expect(monthLetter("2026-01")).toBe("J");
    expect(monthShort("2026-09")).toBe("Sep");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/case-study/kit/metrics.test.ts src/lib/case-study/kit/display.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `metrics.ts`**

```ts
export type Month = string;
export type Series = { month: Month; value: number }[];
export interface ProductRow { asin: string; title: string; value: number }
export interface ChannelBlock {
  spend: number; sales: number; orders: number;
  monthly: { month: Month; spend: number; sales: number }[];
}
export interface PulledMetrics {
  salesTotal: number; salesMonthly: Series; unitsTotal: number;
  adSales: number; adSpend: number; adImpressions: number; adClicks: number; adOrders: number;
  sessions: number; pageViews: number; buyBoxPct: number; skuCount: number;
  topByRevenue: ProductRow[]; topByUnits: ProductRow[];
  paidSp: ChannelBlock; paidSbSd: ChannelBlock;
  fulfilment: string;
}
export type MetricKey = keyof PulledMetrics;
export type ScalarKey = "salesTotal" | "unitsTotal" | "adSales" | "adSpend" | "adImpressions"
  | "adClicks" | "adOrders" | "sessions" | "pageViews" | "buyBoxPct" | "skuCount" | "fulfilment";
export const SCALAR_KEYS: readonly ScalarKey[] = [
  "salesTotal", "unitsTotal", "adSales", "adSpend", "adImpressions", "adClicks",
  "adOrders", "sessions", "pageViews", "buyBoxPct", "skuCount", "fulfilment",
];

export interface CaseStudyMetrics {
  pulledAt: string | null;
  period: { start: string; end: string };
  auto: Partial<PulledMetrics>;
  overrides: Partial<Pick<PulledMetrics, ScalarKey>>;
  failed: string[];
}

export function emptyMetrics(start: string, end: string): CaseStudyMetrics {
  return { pulledAt: null, period: { start, end }, auto: {}, overrides: {}, failed: [] };
}

export function effective(m: CaseStudyMetrics): Partial<PulledMetrics> {
  const out: Partial<PulledMetrics> = { ...m.auto };
  for (const [k, v] of Object.entries(m.overrides ?? {})) {
    if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface Derived {
  organicSales: number | null; organicPct: number | null; adPct: number | null;
  roas: number | null; acos: number | null; cvrPct: number | null; asp: number | null;
  growthMultiple: number | null; startSales: number | null;
  peakMonth: Month | null; peakSales: number | null;
  h1AvgSales: number | null; h2AvgSales: number | null; h2VsH1Pct: number | null;
  top3RevenueSharePct: number | null; cumulative: Series;
  spAcos: number | null; sbSdAcos: number | null;
}
export type AnyMetricKey = MetricKey | keyof Derived;

const div = (a: number | undefined, b: number | undefined): number | null =>
  a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || b === 0 ? null : a / b;
const avg = (xs: number[]): number | undefined => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);
const times100 = (x: number | null) => (x === null ? null : x * 100);

export function deriveMetrics(e: Partial<PulledMetrics>): Derived {
  const series = e.salesMonthly ?? [];
  const vals = series.map((s) => s.value);
  const organicSales = e.salesTotal !== undefined && e.adSales !== undefined ? e.salesTotal - e.adSales : null;

  let growthMultiple: number | null = null;
  let h1AvgSales: number | null = null;
  let h2AvgSales: number | null = null;
  if (vals.length >= 6) {
    growthMultiple = div(avg(vals.slice(-3)), avg(vals.slice(0, 3)));
    const half = Math.floor(vals.length / 2);
    h1AvgSales = avg(vals.slice(0, half)) ?? null;
    h2AvgSales = avg(vals.slice(half)) ?? null;
  }
  const h2VsH1Pct = h1AvgSales !== null && h2AvgSales !== null
    ? times100(div(h2AvgSales - h1AvgSales, h1AvgSales)) : null;

  let peakIdx = -1;
  vals.forEach((v, i) => { if (peakIdx < 0 || v > vals[peakIdx]) peakIdx = i; });

  let run = 0;
  const cumulative = series.map((s) => ({ month: s.month, value: (run += s.value) }));

  const top3 = (e.topByRevenue ?? []).slice(0, 3).reduce((s, r) => s + r.value, 0);

  return {
    organicSales,
    organicPct: times100(div(organicSales ?? undefined, e.salesTotal)),
    adPct: times100(div(e.adSales, e.salesTotal)),
    roas: div(e.adSales, e.adSpend),
    acos: times100(div(e.adSpend, e.adSales)),
    cvrPct: times100(div(e.unitsTotal, e.sessions)),
    asp: div(e.salesTotal, e.unitsTotal),
    growthMultiple,
    startSales: vals.length ? vals[0] : null,
    peakMonth: peakIdx >= 0 ? series[peakIdx].month : null,
    peakSales: peakIdx >= 0 ? vals[peakIdx] : null,
    h1AvgSales, h2AvgSales, h2VsH1Pct,
    top3RevenueSharePct: e.topByRevenue?.length ? times100(div(top3, e.salesTotal)) : null,
    cumulative,
    spAcos: e.paidSp ? times100(div(e.paidSp.spend, e.paidSp.sales)) : null,
    sbSdAcos: e.paidSbSd ? times100(div(e.paidSbSd.spend, e.paidSbSd.sales)) : null,
  };
}

export const PRIVATE_USD_KEYS: ReadonlySet<AnyMetricKey> = new Set<AnyMetricKey>([
  "salesTotal", "adSales", "adSpend", "organicSales", "asp",
  "startSales", "peakSales", "h1AvgSales", "h2AvgSales",
]);

export function isMissing(e: Partial<PulledMetrics>, d: Derived, key: AnyMetricKey): boolean {
  const v = key in d ? (d as unknown as Record<string, unknown>)[key] : (e as Record<string, unknown>)[key];
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "number") return !Number.isFinite(v);
  return false;
}
```

Note `isMissing` checks `key in d` first: derived keys are always present on `Derived` (possibly `null`), pulled keys fall through to `e`.

- [ ] **Step 4: Implement `display.ts`**

```ts
import { bandFigure } from "./banding";
import type { Month } from "./metrics";

export type DeckFormat = "high_level" | "detailed";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function usd(value: number | null | undefined, format: DeckFormat): string {
  if (format === "high_level") return ok(value) ? bandFigure(value) : "—";
  if (!ok(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}
export function usdExact(value: number | null | undefined): string {
  return ok(value) ? `$${Math.round(value).toLocaleString("en-US")}` : "—";
}
export function mult(v: number | null | undefined): string { return ok(v) ? `${v.toFixed(1)}×` : "—"; }
export function pct(v: number | null | undefined, digits = 1): string { return ok(v) ? `${v.toFixed(digits)}%` : "—"; }
export function count(v: number | null | undefined): string {
  if (!ok(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 100_000) return `${(v / 1_000).toFixed(1)}K`;
  return Math.round(v).toLocaleString("en-US");
}
export function splitMetric(s: string): { num: string; unit: string } {
  const fig = s.match(/^(.*?)(-Fig)$/);
  if (fig) return { num: fig[1], unit: fig[2] };
  const u = s.match(/^(.*\d)([KMB×%])$/);
  if (u) return { num: u[1], unit: u[2] };
  return { num: s, unit: "" };
}
export function fillTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in tokens ? tokens[k] : m));
}
export function monthShort(m: Month): string { return MONTHS[Number(m.slice(5, 7)) - 1] ?? m; }
export function monthLetter(m: Month): string { return monthShort(m).charAt(0); }
```

Note: `count(845_210)` → `845.2K` because ≥100K uses K; below 100K prints the full integer (template shows `[0,000]` units).

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/case-study/kit/metrics.test.ts src/lib/case-study/kit/display.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add src/lib/case-study/kit/metrics.ts src/lib/case-study/kit/metrics.test.ts src/lib/case-study/kit/display.ts src/lib/case-study/kit/display.test.ts
git commit -m "feat(case-study): metrics snapshot model, derivations, display formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/case-study/kit/metrics.ts src/lib/case-study/kit/metrics.test.ts src/lib/case-study/kit/display.ts src/lib/case-study/kit/display.test.ts
```

---

### Task 3: Chart geometry

**Files:**
- Create: `src/lib/case-study/kit/chart-geometry.ts`
- Test: `src/lib/case-study/kit/chart-geometry.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export function niceAxisMax(max: number): number;          // ≥ max, divisible into 3 clean ticks
export function axisTicks(axisMax: number): number[];       // [max, 2/3·max, 1/3·max, 0]
export const BARS: { viewW: 880; viewH: 380; baseline: 280; top: 40; plotH: 240; firstX: 74; pitch: 65.85; width: 44; gridX1: 70; gridX2: 860; labelX: 60; monthY: 306 };
export function barRects(values: number[], axisMax: number): Rect[];
export const CUMULATIVE: { viewW: 880; viewH: 340; yTop: 40; yBottom: 250; x0: 60; x1: 860; labelX: 52; monthY: 284 };
export const SPEND_SALES: { viewW: 880; viewH: 250; yTop: 40; yBottom: 240; x0: 50; x1: 860 };
export function linePoints(values: number[], axisMax: number, box: { x0: number; x1: number; yTop: number; yBottom: number }): Pt[];
export function pathD(points: Pt[]): string;               // "M60 245.9 L132.7 237.2 …" (1-dp)
export function areaD(points: Pt[], yBottom: number): string;
export function peakIndex(values: number[]): number;       // -1 when empty
export function labelIndexes(n: number, want: number): number[]; // evenly spaced incl. first & last
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { niceAxisMax, axisTicks, barRects, BARS, linePoints, pathD, areaD, peakIndex, labelIndexes, CUMULATIVE } from "./chart-geometry";

describe("axis", () => {
  it.each([[8_700, 9_000], [9_000, 9_000], [62_000, 75_000], [1, 3], [0, 3], [1_234_567, 1_500_000]])(
    "niceAxisMax(%d) = %d", (max, expected) => expect(niceAxisMax(max)).toBe(expected));
  it("ticks", () => expect(axisTicks(9000)).toEqual([9000, 6000, 3000, 0]));
});

describe("bars", () => {
  it("maps like the template (value/axisMax × 240, baseline 280, pitch 65.85)", () => {
    const r = barRects([4500, 9000], 9000);
    expect(r[0]).toEqual({ x: 74, y: 160, width: 44, height: 120 });
    expect(r[1].x).toBeCloseTo(139.85, 2);
    expect(r[1].y).toBe(BARS.top);
  });
  it("zero values → zero height at baseline", () => {
    expect(barRects([0], 9000)[0]).toMatchObject({ y: 280, height: 0 });
  });
});

describe("lines", () => {
  it("spreads n points across x0→x1 and maps y", () => {
    const p = linePoints([0, 50, 100], 100, CUMULATIVE);
    expect(p).toEqual([{ x: 60, y: 250 }, { x: 460, y: 145 }, { x: 860, y: 40 }]);
  });
  it("single point sits at x0", () => {
    expect(linePoints([10], 10, CUMULATIVE)).toEqual([{ x: 60, y: 40 }]);
  });
  it("empty → empty path strings", () => {
    expect(pathD([])).toBe("");
    expect(areaD([], 250)).toBe("");
  });
  it("path formats 1 dp", () => {
    expect(pathD([{ x: 60, y: 245.94 }, { x: 132.73, y: 237.2 }])).toBe("M60 245.9 L132.7 237.2");
    expect(areaD([{ x: 60, y: 200 }, { x: 860, y: 50 }], 250)).toBe("M60 200 L860 50 L860 250 L60 250 Z");
  });
  it("peak + labels", () => {
    expect(peakIndex([1, 9, 3])).toBe(1);
    expect(peakIndex([])).toBe(-1);
    expect(labelIndexes(12, 5)).toEqual([0, 3, 6, 8, 11]);
    expect(labelIndexes(3, 5)).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/case-study/kit/chart-geometry.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
/** Round max up so it splits into 3 clean ticks (template shows max, ⅔, ⅓, 0). */
export function niceAxisMax(max: number): number {
  if (max <= 3) return 3;
  const third = max / 3;
  const mag = 10 ** Math.floor(Math.log10(third));
  const step = STEPS.find((s) => s * mag >= third - 1e-9)! * mag;
  return Math.round(step * 3 * 1e6) / 1e6;
}
export function axisTicks(axisMax: number): number[] {
  return [axisMax, (axisMax * 2) / 3, axisMax / 3, 0];
}

export const BARS = { viewW: 880, viewH: 380, baseline: 280, top: 40, plotH: 240, firstX: 74, pitch: 65.85,
  width: 44, gridX1: 70, gridX2: 860, labelX: 60, monthY: 306 } as const;
export function barRects(values: number[], axisMax: number): Rect[] {
  return values.map((v, i) => {
    const height = axisMax > 0 ? (Math.max(v, 0) / axisMax) * BARS.plotH : 0;
    return { x: Math.round((BARS.firstX + i * BARS.pitch) * 100) / 100, y: BARS.baseline - height, width: BARS.width, height };
  });
}

export const CUMULATIVE = { viewW: 880, viewH: 340, yTop: 40, yBottom: 250, x0: 60, x1: 860, labelX: 52, monthY: 284 } as const;
export const SPEND_SALES = { viewW: 880, viewH: 250, yTop: 40, yBottom: 240, x0: 50, x1: 860 } as const;

export function linePoints(values: number[], axisMax: number,
  box: { x0: number; x1: number; yTop: number; yBottom: number }): Pt[] {
  const n = values.length;
  const h = box.yBottom - box.yTop;
  return values.map((v, i) => ({
    x: n > 1 ? box.x0 + ((box.x1 - box.x0) * i) / (n - 1) : box.x0,
    y: axisMax > 0 ? box.yBottom - (Math.max(v, 0) / axisMax) * h : box.yBottom,
  }));
}
const f = (n: number) => String(Math.round(n * 10) / 10);
export function pathD(points: Pt[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ");
}
export function areaD(points: Pt[], yBottom: number): string {
  if (!points.length) return "";
  const last = points[points.length - 1];
  return `${pathD(points)} L${f(last.x)} ${f(yBottom)} L${f(points[0].x)} ${f(yBottom)} Z`;
}
export function peakIndex(values: number[]): number {
  let idx = -1;
  values.forEach((v, i) => { if (idx < 0 || v > values[idx]) idx = i; });
  return idx;
}
export function labelIndexes(n: number, want: number): number[] {
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: want }, (_, i) => Math.round((i * (n - 1)) / (want - 1)));
}
```

(Check: `labelIndexes(12,5)` → round(0, 2.75, 5.5, 8.25, 11) = [0,3,6,8,11]. `niceAxisMax(62000)`: third 20666 → mag 10000 → step 2.5 → 75000. `niceAxisMax(1234567)`: third 411522 → mag 100000 → 5 → 1.5M.)

- [ ] **Step 4: Run → PASS.** `npx vitest run src/lib/case-study/kit/chart-geometry.test.ts`

- [ ] **Step 5: Commit** (pathspecs: the two files; message `feat(case-study): chart geometry from template markup` + trailer).

---

### Task 4: Stages and the slide catalog

**Files:**
- Create: `src/lib/case-study/kit/stages.ts`, `src/lib/case-study/kit/slides.ts`
- Test: `src/lib/case-study/kit/stages.test.ts`, `src/lib/case-study/kit/slides.test.ts`

**Interfaces:**
- Consumes: `AnyMetricKey`, `PulledMetrics`, `Derived`, `isMissing` (Task 2); `DeckFormat` (Task 2).
- Produces:

```ts
// stages.ts
export type Stage = "drafting" | "in_review" | "approved" | "sent";
export const STAGES: readonly Stage[];
export const STAGE_LABELS: Record<Stage | "not_started", string>;
export function canTransition(from: Stage, to: Stage): boolean;
export function stageAfterEdit(s: Stage): Stage;

// slides.ts
export type HlSlideType = "hl_cover" | "hl_challenge" | "hl_results" | "hl_approach" | "hl_creative";
export type DetailedSlideType = "cover" | "brief" | "results" | "snapshot" | "approach" | "sales_growth"
  | "product_mix" | "demand_curve" | "paid_media" | "brand_story" | "listing_images" | "aplus" | "storefront" | "next_steps";
export type SlideType = HlSlideType | DetailedSlideType;
export interface DesignImages {
  heroListing: string[];       // hero ASIN images in slot order MAIN, PT01…PT08 (≤9)
  brandStory: string[];        // [screenview] or []
  aplusStacks: string[][];     // ≤3 stacks of module images, top→bottom
  storefrontPages: string[][]; // ≤3 pages, each a top→bottom stack of module images
  logo: string[];              // [aac.client_logo_url] or []
  aplusPremiumModules: number | null;
  aplusAsinsLive: number | null;
}
export const EMPTY_DESIGN_IMAGES: DesignImages;
export interface CopyField { key: string; label: string; kind: "text" | "textarea"; default: string; required: boolean }
export interface ImageSlotDef {
  id: string; label: string; fit: "cover" | "contain" | "width"; align?: "top";
  group: string;                 // blockers need ≥1 filled slot per group
  from: (d: DesignImages) => string[];
}
export interface SlideDef { type: SlideType; label: string; copy: CopyField[]; metrics: AnyMetricKey[]; images: ImageSlotDef[] }
export interface SectionContent {
  copy: Record<string, string>;
  designImages: Record<string, string[]>;   // slotId → urls resolved from Design at pull time
  manualImages: Record<string, string[]>;   // slotId → emergency manual urls (win over design)
}
export const HL_SLIDES: SlideDef[];
export const DETAILED_SLIDES: SlideDef[];
export function slidesFor(format: DeckFormat): SlideDef[];
export function slideDef(type: SlideType): SlideDef;
export function defaultSectionContent(def: SlideDef, design: DesignImages): SectionContent;
export function refreshSectionContent(def: SlideDef, prev: SectionContent, design: DesignImages): SectionContent; // keeps copy + manual
export function resolveSlotImages(content: SectionContent, slotId: string): { urls: string[]; source: "manual" | "design" | "empty" };
export interface Blocker { slide: SlideType; kind: "metric" | "image" | "copy"; key: string; message: string }
export function deckBlockers(format: DeckFormat, e: Partial<PulledMetrics>, d: Derived,
  sections: { sectionType: SlideType; content: SectionContent }[]): Blocker[];
export function manualImageCount(sections: { content: SectionContent }[]): number;
```

- [ ] **Step 1: Write the failing tests**

`stages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canTransition, stageAfterEdit } from "./stages";

describe("stages", () => {
  it.each([
    ["drafting", "in_review", true], ["drafting", "approved", false], ["drafting", "sent", false],
    ["in_review", "drafting", true], ["in_review", "approved", true], ["in_review", "sent", false],
    ["approved", "drafting", true], ["approved", "sent", true], ["approved", "in_review", false],
    ["sent", "drafting", true], ["sent", "approved", false],
  ] as const)("%s → %s = %s", (a, b, ok) => expect(canTransition(a, b)).toBe(ok));
  it("edits drop approved/sent to drafting only", () => {
    expect(stageAfterEdit("approved")).toBe("drafting");
    expect(stageAfterEdit("sent")).toBe("drafting");
    expect(stageAfterEdit("in_review")).toBe("in_review");
    expect(stageAfterEdit("drafting")).toBe("drafting");
  });
});
```

`slides.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { HL_SLIDES, DETAILED_SLIDES, slidesFor, defaultSectionContent, refreshSectionContent,
  resolveSlotImages, deckBlockers, EMPTY_DESIGN_IMAGES, manualImageCount } from "./slides";
import { deriveMetrics } from "./metrics";

const design = { ...EMPTY_DESIGN_IMAGES,
  heroListing: ["m", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
  brandStory: ["bs"], aplusStacks: [["a1", "a2"], ["b1"]], storefrontPages: [["s1", "s2"]], logo: ["logo"] };

describe("catalog", () => {
  it("has 5 High-Level and 14 Detailed slides in template order", () => {
    expect(HL_SLIDES.map((s) => s.type)).toEqual(["hl_cover", "hl_challenge", "hl_results", "hl_approach", "hl_creative"]);
    expect(DETAILED_SLIDES.map((s) => s.type)).toEqual(["cover", "brief", "results", "snapshot", "approach",
      "sales_growth", "product_mix", "demand_curve", "paid_media", "brand_story", "listing_images", "aplus", "storefront", "next_steps"]);
    expect(slidesFor("high_level")).toBe(HL_SLIDES);
  });
  it("slot ids are unique within a format and match the template ids minus the tpl-/tplhl- prefix", () => {
    for (const set of [HL_SLIDES, DETAILED_SLIDES]) {
      const ids = set.flatMap((s) => s.images.map((i) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(HL_SLIDES.flatMap((s) => s.images.map((i) => i.id))).toEqual(["cover-hero", "cover-logo", "bs",
      "li1", "li2", "li3", "li4", "li5", "li6", "li7", "li8", "li9", "ap1", "ap2", "ap3", "ap4", "sf"]);
    expect(DETAILED_SLIDES.flatMap((s) => s.images.map((i) => i.id))).toEqual(["cover-hero", "cover-logo", "bs-hero",
      "li-main", "li-2", "li-3", "li-4", "li-5", "li-6", "li-7", "li-8", "li-9",
      "ap-1", "ap-2", "ap-3", "ap-4", "ap-b1", "ap-b2", "ap-b3", "ap-b4", "ap-c1", "ap-c2", "ap-c3", "ap-c4",
      "sf-a1", "sf-b1", "sf-c1"]);
  });
  it("High-Level copy defaults never contain a {total} token or a raw $ figure", () => {
    for (const s of HL_SLIDES) for (const c of s.copy) {
      expect(c.default).not.toMatch(/\{total\}|\$\d/);
    }
  });
});

describe("section content", () => {
  it("defaults map design images per slot", () => {
    const creative = HL_SLIDES.find((s) => s.type === "hl_creative")!;
    const c = defaultSectionContent(creative, design);
    expect(c.designImages.li1).toEqual(["m"]);
    expect(c.designImages.li9).toEqual(["p8"]);
    expect(c.designImages.ap1).toEqual(["a1"]);
    expect(c.designImages.ap3).toEqual([]);
    expect(c.designImages.sf).toEqual(["s1", "s2"]);
    expect(c.manualImages).toEqual({});
  });
  it("manual wins over design; empty reports empty", () => {
    const c = { copy: {}, designImages: { x: ["d"], y: [] }, manualImages: { x: ["m"] } };
    expect(resolveSlotImages(c, "x")).toEqual({ urls: ["m"], source: "manual" });
    expect(resolveSlotImages({ ...c, manualImages: {} }, "x")).toEqual({ urls: ["d"], source: "design" });
    expect(resolveSlotImages(c, "y")).toEqual({ urls: [], source: "empty" });
  });
  it("refresh keeps copy and manual images, replaces design images", () => {
    const def = HL_SLIDES.find((s) => s.type === "hl_creative")!;
    const prev = { copy: { bsJob: "mine" }, designImages: { li1: ["old"] }, manualImages: { li2: ["man"] } };
    const next = refreshSectionContent(def, prev, design);
    expect(next.copy.bsJob).toBe("mine");
    expect(next.manualImages).toEqual({ li2: ["man"] });
    expect(next.designImages.li1).toEqual(["m"]);
  });
  it("counts manual images across sections", () => {
    expect(manualImageCount([{ content: { copy: {}, designImages: {}, manualImages: { a: ["1"], b: [] } } }])).toBe(1);
  });
});

describe("deckBlockers", () => {
  it("empty deck is blocked by metrics, images and required copy", () => {
    const sections = HL_SLIDES.map((d) => ({ sectionType: d.type, content: defaultSectionContent(d, EMPTY_DESIGN_IMAGES) }));
    const b = deckBlockers("high_level", {}, deriveMetrics({}), sections);
    expect(b.some((x) => x.kind === "metric" && x.key === "salesTotal")).toBe(true);
    expect(b.some((x) => x.kind === "image" && x.slide === "hl_creative")).toBe(true);
    expect(b.some((x) => x.kind === "copy" && x.slide === "hl_cover")).toBe(true);
  });
  it("fulfilment is never a blocker", () => {
    const sections = DETAILED_SLIDES.map((d) => ({ sectionType: d.type, content: defaultSectionContent(d, design) }));
    const b = deckBlockers("detailed", {}, deriveMetrics({}), sections);
    expect(b.some((x) => x.key === "fulfilment")).toBe(false);
  });
  it("one filled slot satisfies its group", () => {
    const def = HL_SLIDES.find((s) => s.type === "hl_creative")!;
    const content = defaultSectionContent(def, design);
    const b = deckBlockers("high_level", {}, deriveMetrics({}), [{ sectionType: "hl_creative", content }]);
    expect(b.filter((x) => x.kind === "image")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/lib/case-study/kit/stages.test.ts src/lib/case-study/kit/slides.test.ts` → FAIL.

- [ ] **Step 3: Implement `stages.ts`**

```ts
export type Stage = "drafting" | "in_review" | "approved" | "sent";
export const STAGES: readonly Stage[] = ["drafting", "in_review", "approved", "sent"];
export const STAGE_LABELS: Record<Stage | "not_started", string> = {
  not_started: "Not started", drafting: "Drafting", in_review: "In review", approved: "Approved", sent: "Sent",
};
const ALLOWED: Record<Stage, Stage[]> = {
  drafting: ["in_review"], in_review: ["drafting", "approved"], approved: ["drafting", "sent"], sent: ["drafting"],
};
export function canTransition(from: Stage, to: Stage): boolean { return ALLOWED[from].includes(to); }
export function stageAfterEdit(s: Stage): Stage { return s === "approved" || s === "sent" ? "drafting" : s; }
```

- [ ] **Step 4: Implement `slides.ts`**

The catalog below is the complete field list for every slide. Copy keys are referenced by name in Tasks 11–14. Copy defaults are the template's own wording where the template has fixed wording, otherwise `""` (required). `{client}`, `{period}`, `{total}` tokens are filled at render (Task 10); `{total}` is Detailed-only.

```ts
import type { AnyMetricKey, PulledMetrics, Derived } from "./metrics";
import { isMissing } from "./metrics";
import type { DeckFormat } from "./display";

export type HlSlideType = "hl_cover" | "hl_challenge" | "hl_results" | "hl_approach" | "hl_creative";
export type DetailedSlideType = "cover" | "brief" | "results" | "snapshot" | "approach" | "sales_growth"
  | "product_mix" | "demand_curve" | "paid_media" | "brand_story" | "listing_images" | "aplus" | "storefront" | "next_steps";
export type SlideType = HlSlideType | DetailedSlideType;

export interface DesignImages {
  heroListing: string[]; brandStory: string[]; aplusStacks: string[][]; storefrontPages: string[][]; logo: string[];
  aplusPremiumModules: number | null; aplusAsinsLive: number | null;
}
export const EMPTY_DESIGN_IMAGES: DesignImages = {
  heroListing: [], brandStory: [], aplusStacks: [], storefrontPages: [], logo: [],
  aplusPremiumModules: null, aplusAsinsLive: null,
};
export interface CopyField { key: string; label: string; kind: "text" | "textarea"; default: string; required: boolean }
export interface ImageSlotDef { id: string; label: string; fit: "cover" | "contain" | "width"; align?: "top"; group: string; from: (d: DesignImages) => string[] }
export interface SlideDef { type: SlideType; label: string; copy: CopyField[]; metrics: AnyMetricKey[]; images: ImageSlotDef[] }
export interface SectionContent {
  copy: Record<string, string>; designImages: Record<string, string[]>; manualImages: Record<string, string[]>;
}

const t = (key: string, label: string, def = "", required = true): CopyField => ({ key, label, kind: "text", default: def, required });
const ta = (key: string, label: string, def = "", required = true): CopyField => ({ key, label, kind: "textarea", default: def, required });
const one = (u: string | undefined) => (u ? [u] : []);
const pillars = (): CopyField[] => [1, 2, 3, 4, 5].flatMap((n) => [t(`pillar${n}`, `Pillar ${n} — name`), t(`pillar${n}Desc`, `Pillar ${n} — one line`)]);
const heroSlot = (id: string): ImageSlotDef => ({ id, label: "Hero product photo", fit: "contain", group: "hero", from: (d) => one(d.heroListing[0]) });
const logoSlot = (id: string): ImageSlotDef => ({ id, label: "Client logo", fit: "contain", group: "logo", from: (d) => d.logo });
const listingSlots = (ids: string[], fit: "cover" | "contain"): ImageSlotDef[] =>
  ids.map((id, i) => ({ id, label: i === 0 ? "Listing image — hero (MAIN)" : `Listing image ${i + 1}`, fit, group: "listing", from: (d) => one(d.heroListing[i]) }));
const aplusSlot = (id: string, stack: number, pos: number): ImageSlotDef =>
  ({ id, label: `A+ stack ${stack + 1} · module ${pos + 1}`, fit: "cover", group: "aplus", from: (d) => one(d.aplusStacks[stack]?.[pos]) });
const sfSlot = (id: string, page: number): ImageSlotDef =>
  ({ id, label: `Storefront page ${page + 1}`, fit: "width", align: "top", group: "storefront", from: (d) => d.storefrontPages[page] ?? [] });

const KPI6 = (prefix: string, withHints: boolean): CopyField[] => {
  const labels = ["Ordered sales", "Growth multiple", "Ad impressions", "Ad-attributed sales", "Buy Box", "Conversion rate"];
  return labels.flatMap((l, i) => [
    t(`${prefix}${i + 1}Label`, `KPI ${i + 1} — label`, l),
    ...(withHints ? [t(`${prefix}${i + 1}Hint`, `KPI ${i + 1} — context`, "", false)] : []),
  ]);
};
const KPI6_METRICS: AnyMetricKey[] = ["salesTotal", "growthMultiple", "adImpressions", "adSales", "roas", "buyBoxPct", "cvrPct"];

export const HL_SLIDES: SlideDef[] = [
  { type: "hl_cover", label: "Cover",
    copy: [t("claim", "Bold claim"), t("result", "Key result (orange)"), ta("summary", "One-paragraph summary (no $ figures — bands are added by the KPI chips)"),
      t("kpi1Label", "Chip 1 label (ordered sales)", "Ordered sales · {period}"), t("kpi2Label", "Chip 2 label (growth multiple)", "Growth multiple"),
      t("kpi3Label", "Chip 3 label (ad-attributed sales)", "Ad-attributed sales"), t("category", "Category"), t("engagement", "Engagement", "Full-account management")],
    metrics: ["salesTotal", "growthMultiple", "adSales"], images: [heroSlot("cover-hero"), logoSlot("cover-logo")] },
  { type: "hl_challenge", label: "The Challenge",
    copy: [t("headline", "Headline"), t("headlineAccent", "Headline accent (orange)"), ta("body", "2–3 sentences: situation, difficulty, mandate"),
      t("startLabel", "Starting point — label", "Monthly ordered sales when we started"), t("targetValue", "Target — value (e.g. 3×)"), t("targetLabel", "Target — what defined success")],
    metrics: ["startSales"], images: [] },
  { type: "hl_results", label: "The Results",
    copy: [t("headline", "Headline (before “six proof points.”)", "Year one,"), ...KPI6("kpi", false)],
    metrics: KPI6_METRICS, images: [] },
  { type: "hl_approach", label: "The Approach",
    copy: [t("headline", "Headline"), t("headlineAccent", "Headline accent (orange)"), t("body", "One line on the method"), ...pillars()],
    metrics: [], images: [] },
  { type: "hl_creative", label: "The Creative",
    copy: [t("bsJob", "Brand Story — its job in one line", "introduces the brand and cross-sells the range")],
    metrics: ["cvrPct", "buyBoxPct"],
    images: [{ id: "bs", label: "Brand story banner", fit: "contain", group: "brandStory", from: (d) => d.brandStory },
      ...listingSlots(["li1", "li2", "li3", "li4", "li5", "li6", "li7", "li8", "li9"], "cover"),
      aplusSlot("ap1", 0, 0), aplusSlot("ap2", 0, 1), aplusSlot("ap3", 0, 2), aplusSlot("ap4", 0, 3),
      sfSlot("sf", 0)] },
];

export const DETAILED_SLIDES: SlideDef[] = [
  { type: "cover", label: "Cover",
    copy: [t("positioning", "Positioning line · one phrase"), t("claim", "Bold claim"), t("didWhat", "“{client} …did what”"),
      ta("summary", "One-sentence summary of the engagement and the single headline result"), t("category", "Category"), t("quote", "Short client or positioning quote", "", false)],
    metrics: [], images: [heroSlot("cover-hero"), logoSlot("cover-logo")] },
  { type: "brief", label: "The Brief",
    copy: [t("line1", "Headline line 1"), t("line2", "Headline line 2 (white part)"), t("line2Accent", "Headline line 2 (orange part)"), t("line3", "Headline line 3"),
      ta("situation", "2–3 sentences: situation + mandate"), t("startingPoint", "Where the account was when we took over"),
      t("deliverables", "What we were asked to deliver"), t("targetValue", "Target — value (e.g. 3.0×)"), t("targetLabel", "Target — what defined success")],
    metrics: [], images: [] },
  { type: "results", label: "Results at a Glance",
    copy: [t("scope", "Topbar right", "Seller Central · {period}"), t("headline", "Headline (before “six proof points.”)", "Year one,"), ...KPI6("kpi", true)],
    metrics: KPI6_METRICS, images: [] },
  { type: "snapshot", label: "Seller Central Snapshot",
    copy: [ta("body", "One line on the shape of the account"), t("headlineLabel", "Headline tile — label", "Ordered sales"),
      t("headlineContext", "Headline tile — context", "", false), t("engineLine", "Why Seller Central is the growth engine")],
    metrics: ["salesTotal", "unitsTotal", "asp", "skuCount", "pageViews", "sessions", "cvrPct", "buyBoxPct", "roas"], images: [] },
  { type: "approach", label: "Our Approach",
    copy: [ta("body", "One line on the method — the levers and how they compound"), ...pillars()], metrics: [], images: [] },
  { type: "sales_growth", label: "Sales Performance",
    copy: [t("topRight", "Topbar right", "Ordered sales · {period}"), ta("body", "Two sentences on the year — cite the total with {total}", "")],
    metrics: ["salesTotal", "salesMonthly", "organicSales", "organicPct", "adSales", "adPct", "asp", "unitsTotal"], images: [] },
  { type: "product_mix", label: "Product Mix",
    copy: [t("headline", "Headline (white)", "A few ASINs"), t("headlineAccent", "Headline (orange)", "carry the catalogue."), t("body", "How the catalogue concentrates")],
    metrics: ["topByRevenue", "topByUnits", "top3RevenueSharePct", "unitsTotal", "skuCount"], images: [] },
  { type: "demand_curve", label: "Demand Curve",
    copy: [t("headline", "Headline (white)", "From zero to"), t("headlineTail", "Headline end (after the orange figure)", ", steadily."),
      ta("body", "Two lines on the cumulative curve")],
    metrics: ["salesMonthly", "peakMonth", "peakSales", "h2AvgSales", "h2VsH1Pct"], images: [] },
  { type: "paid_media", label: "Paid Media",
    copy: [ta("body", "The paid-media approach — funnel stages, ad types, efficiency vs growth")],
    metrics: ["adSales", "adSpend", "roas", "paidSp", "paidSbSd", "spAcos", "sbSdAcos"], images: [] },
  { type: "brand_story", label: "Brand Story", copy: [], metrics: [],
    images: [{ id: "bs-hero", label: "Brand story banner", fit: "contain", group: "brandStory", from: (d) => d.brandStory }] },
  { type: "listing_images", label: "Listing Images", copy: [], metrics: ["cvrPct"],
    images: listingSlots(["li-main", "li-2", "li-3", "li-4", "li-5", "li-6", "li-7", "li-8", "li-9"], "contain") },
  { type: "aplus", label: "Premium A+ Content", copy: [], metrics: [],
    images: [0, 1, 2].flatMap((s) => [0, 1, 2, 3].map((p) => aplusSlot(s === 0 ? `ap-${p + 1}` : `ap-${"bc"[s - 1]}${p + 1}`, s, p))) },
  { type: "storefront", label: "Storefront", copy: [], metrics: [],
    images: [sfSlot("sf-a1", 0), sfSlot("sf-b1", 1), sfSlot("sf-c1", 2)] },
  { type: "next_steps", label: "Next Steps", copy: [], metrics: [], images: [] },
];

export function slidesFor(format: DeckFormat): SlideDef[] { return format === "high_level" ? HL_SLIDES : DETAILED_SLIDES; }
export function slideDef(type: SlideType): SlideDef {
  const d = [...HL_SLIDES, ...DETAILED_SLIDES].find((s) => s.type === type);
  if (!d) throw new Error(`Unknown slide type: ${type}`);
  return d;
}

function designFor(def: SlideDef, design: DesignImages): Record<string, string[]> {
  return Object.fromEntries(def.images.map((s) => [s.id, s.from(design)]));
}
export function defaultSectionContent(def: SlideDef, design: DesignImages): SectionContent {
  return { copy: Object.fromEntries(def.copy.map((c) => [c.key, c.default])), designImages: designFor(def, design), manualImages: {} };
}
export function refreshSectionContent(def: SlideDef, prev: SectionContent, design: DesignImages): SectionContent {
  const copy = { ...Object.fromEntries(def.copy.map((c) => [c.key, c.default])), ...(prev.copy ?? {}) };
  return { copy, designImages: designFor(def, design), manualImages: prev.manualImages ?? {} };
}
export function resolveSlotImages(content: SectionContent, slotId: string): { urls: string[]; source: "manual" | "design" | "empty" } {
  const manual = content.manualImages?.[slotId] ?? [];
  if (manual.length) return { urls: manual, source: "manual" };
  const design = content.designImages?.[slotId] ?? [];
  if (design.length) return { urls: design, source: "design" };
  return { urls: [], source: "empty" };
}

export interface Blocker { slide: SlideType; kind: "metric" | "image" | "copy"; key: string; message: string }
const NON_BLOCKING: ReadonlySet<string> = new Set(["fulfilment"]);

export function deckBlockers(format: DeckFormat, e: Partial<PulledMetrics>, d: Derived,
  sections: { sectionType: SlideType; content: SectionContent }[]): Blocker[] {
  const out: Blocker[] = [];
  for (const def of slidesFor(format)) {
    const sec = sections.find((s) => s.sectionType === def.type);
    if (!sec) continue;
    for (const key of def.metrics) {
      if (!NON_BLOCKING.has(key) && isMissing(e, d, key))
        out.push({ slide: def.type, kind: "metric", key, message: `${def.label}: no Redshift data for ${key}` });
    }
    for (const c of def.copy) {
      if (c.required && !(sec.content.copy?.[c.key] ?? "").trim())
        out.push({ slide: def.type, kind: "copy", key: c.key, message: `${def.label}: “${c.label}” is empty` });
    }
    const groups = [...new Set(def.images.map((i) => i.group))];
    for (const g of groups) {
      if (g === "logo") continue; // logo is optional; cover shows the client name regardless
      const filled = def.images.filter((i) => i.group === g).some((i) => resolveSlotImages(sec.content, i.id).urls.length > 0);
      if (!filled) out.push({ slide: def.type, kind: "image", key: g, message: `${def.label}: no ${g} images in Design (add them there, or an emergency manual image)` });
    }
  }
  return out;
}
export function manualImageCount(sections: { content: SectionContent }[]): number {
  return sections.reduce((n, s) => n + Object.values(s.content.manualImages ?? {}).filter((u) => u.length > 0).length, 0);
}
```

Check against the test: `aplusSlot` ids for Detailed produce `ap-1..ap-4, ap-b1..ap-b4, ap-c1..ap-c4` ✓. HL `hl_cover` has 3 metrics and required copy ✓.

- [ ] **Step 5: Run → PASS.** `npx vitest run src/lib/case-study/kit/stages.test.ts src/lib/case-study/kit/slides.test.ts`

- [ ] **Step 6: Commit** — pathspecs the four files; message `feat(case-study): stages + declarative slide catalog for both formats` + trailer.

---

### Task 5: Migration 0120 + Drizzle schema + shared data types

**Files:**
- Create: `drizzle/migrations/0120_case_study_kit.sql`, `scripts/run-migration-0120.ts`, `scripts/_tmp-0120-constraint-name.ts`
- Modify: `src/lib/db/schema.ts` (the `// ─── Case Studies` block, ~lines 3442–3489)
- Create: `src/lib/case-study/kit/types.ts`

**Interfaces:**
- Produces: Drizzle `caseStudies` with `format`, `stage`, `ownerId`, `sentAt`, `metrics`; enums `caseStudyFormatEnum`, `caseStudyStageEnum`; and

```ts
// kit/types.ts
import type { CaseStudyMetrics } from "./metrics";
import type { Stage } from "./stages";
import type { SlideType, SectionContent } from "./slides";
import type { DeckFormat } from "./display";
export interface KitSection { id: string; sectionType: SlideType; sortOrder: number; content: SectionContent }
export interface KitCaseStudy {
  id: string; clientIdCode: string; clientName: string; title: string; format: DeckFormat; stage: Stage;
  ownerId: string | null; ownerName: string | null; sentAt: string | null;
  dateRangeStart: string; dateRangeEnd: string; clientSector: string; contactEmail: string;
  metrics: CaseStudyMetrics; updatedAt: string; sections: KitSection[];
}
export interface TrackerCell { id: string; stage: Stage; ownerName: string | null; dateRangeStart: string; dateRangeEnd: string;
  updatedAt: string; blockers: number; manualImages: number }
export interface TrackerRow { clientIdCode: string; clientName: string; highLevel: TrackerCell | null; detailed: TrackerCell | null }
```

- [ ] **Step 1: Read the real unique-constraint name (read-only)** — `schema.ts` is not trusted for constraint names.

`scripts/_tmp-0120-constraint-name.ts`:

```ts
/** READ-ONLY: constraints on case_studies before 0120. */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  console.log(JSON.stringify(await db.execute(sql`
    select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'case_studies'::regclass`), null, 1));
  console.log(JSON.stringify(await db.execute(sql`select indexname, indexdef from pg_indexes where tablename = 'case_studies'`), null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd /Users/manu/MFHub && npx tsx .worktrees/thread-ab-case-study/scripts/_tmp-0120-constraint-name.ts`
Expected: a `UNIQUE (client_id_code)` constraint (likely `case_studies_client_id_code_unique` or `case_studies_client_id_code_key`). Use the printed name in Step 2 in place of `<UNIQUE_NAME>`. Keep the `DROP ... IF EXISTS` for both common names regardless.

- [ ] **Step 2: Write the migration** `drizzle/migrations/0120_case_study_kit.sql` — additive only (see Deviations 1–2):

```sql
-- 0120: Case Study Kit — two formats per client, stage workflow, metrics snapshot.
-- Additive: legacy `status` column kept until the follow-up cleanup migration.
DO $$ BEGIN
  CREATE TYPE case_study_format AS ENUM ('high_level', 'detailed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE case_study_stage AS ENUM ('drafting', 'in_review', 'approved', 'sent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE case_studies
  ADD COLUMN IF NOT EXISTS format   case_study_format NOT NULL DEFAULT 'detailed',
  ADD COLUMN IF NOT EXISTS stage    case_study_stage  NOT NULL DEFAULT 'drafting',
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS metrics  jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE case_studies DROP CONSTRAINT IF EXISTS case_studies_client_id_code_unique;
ALTER TABLE case_studies DROP CONSTRAINT IF EXISTS case_studies_client_id_code_key;
ALTER TABLE case_studies DROP CONSTRAINT IF EXISTS "<UNIQUE_NAME>";
CREATE UNIQUE INDEX IF NOT EXISTS case_studies_client_format_key ON case_studies (client_id_code, format);
CREATE INDEX IF NOT EXISTS idx_cs_stage ON case_studies (stage);

ALTER TABLE case_studies
  ALTER COLUMN contact_email    SET DEFAULT 'hello@marketfoundry.com',
  ALTER COLUMN office_locations SET DEFAULT '';
```

(If Step 1 printed one of the two standard names, delete the `"<UNIQUE_NAME>"` line rather than leaving a placeholder.)

- [ ] **Step 3: Write the runner** `scripts/run-migration-0120.ts` (house pattern from `run-migration-0118.ts`):

```ts
/**
 * Migration 0120: Case Study Kit (format, stage, owner, sent_at, metrics; unique (client, format)).
 * Run with: cd /Users/manu/MFHub && npx tsx .worktrees/thread-ab-case-study/scripts/run-migration-0120.ts
 * DO NOT run without an explicit per-action OK — this changes the production schema.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true, override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = postgres(process.env.DATABASE_URL.replace(":6543/", ":5432/"), { ssl: "require", max: 1 });

async function main() {
  const ddl = readFileSync(resolve(__dirname, "../drizzle/migrations/0120_case_study_kit.sql"), "utf8");
  await sql.unsafe(ddl);
  const [v] = await sql<{ cols: number; uniq: boolean; old_uniq: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_name = 'case_studies'
         AND column_name IN ('format','stage','owner_id','sent_at','metrics')) AS cols,
      EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'case_studies_client_format_key') AS uniq,
      (SELECT COUNT(*)::int FROM pg_constraint WHERE conrelid = 'case_studies'::regclass AND contype = 'u'
         AND pg_get_constraintdef(oid) = 'UNIQUE (client_id_code)') AS old_uniq`;
  if (v.cols !== 5 || !v.uniq || v.old_uniq !== 0) throw new Error(`0120 verify failed: ${JSON.stringify(v)}`);
  console.log("Migration 0120 applied successfully.", v);
  await sql.end();
}
main().catch((err) => { console.error("Migration 0120 failed:", err); process.exit(1); });
```

Note `resolve(__dirname, …)` (not `process.cwd()`), because the script runs with cwd = main checkout while the SQL lives in the worktree.

- [ ] **Step 4: Update Drizzle schema** — replace the Case Studies block in `src/lib/db/schema.ts` with:

```ts
// ─── Case Studies ─────────────────────────────────────────────────────

export const caseStudyStatusEnum = pgEnum("case_study_status", ["draft", "published"]); // legacy, dropped after deploy
export const caseStudyFormatEnum = pgEnum("case_study_format", ["high_level", "detailed"]);
export const caseStudyStageEnum = pgEnum("case_study_stage", ["drafting", "in_review", "approved", "sent"]);

export const caseStudies = pgTable(
  "case_studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    format: caseStudyFormatEnum("format").notNull().default("detailed"),
    title: text("title").notNull(),
    dateRangeStart: date("date_range_start").notNull(),
    dateRangeEnd: date("date_range_end").notNull(),
    sectionsEnabled: text("sections_enabled").array().notNull(),
    status: caseStudyStatusEnum("status").notNull().default("draft"), // legacy
    stage: caseStudyStageEnum("stage").notNull().default("drafting"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    metrics: jsonb("metrics").notNull().default({}).$type<Record<string, unknown>>(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    clientSector: text("client_sector").notNull().default(""),
    contactEmail: text("contact_email").notNull().default("hello@marketfoundry.com"),
    officeLocations: text("office_locations").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_cs_client").on(t.clientIdCode),
    index("idx_cs_status").on(t.status),
    index("idx_cs_stage").on(t.stage),
    uniqueIndex("case_studies_client_format_key").on(t.clientIdCode, t.format),
  ]
);
```

Leave `caseStudySections` and the type exports unchanged. Ensure `uniqueIndex` is imported from `drizzle-orm/pg-core` at the top of `schema.ts` (add it to the existing import if absent: `grep -n "uniqueIndex" src/lib/db/schema.ts | head -2`).

- [ ] **Step 5: Create `src/lib/case-study/kit/types.ts`** with exactly the `Produces` block above.

- [ ] **Step 6: Typecheck** — `node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | grep -E "schema.ts|case-study/kit|case-studies"`. Expected: errors ONLY in legacy files that read `caseStudies.status`/unique semantics — none expected, since `status` is kept. If `src/app/api/case-studies/route.ts` errors on the insert (unique target), note it; that route is rewritten in Task 7.

- [ ] **Step 7: Commit (do NOT apply)** — pathspecs: the SQL, runner, `_tmp-0120-constraint-name.ts`, `schema.ts`, `kit/types.ts`; message `feat(case-study): migration 0120 (format/stage/metrics, unique client+format) — NOT APPLIED` + trailer.

- [ ] **Step 8: STOP — ask Manu for the OK to apply 0120 to production.** Say: additive only; prod keeps working on old code; legacy tables are empty. On an explicit yes, run `cd /Users/manu/MFHub && npx tsx .worktrees/thread-ab-case-study/scripts/run-migration-0120.ts`. Expected: `Migration 0120 applied successfully. { cols: 5, uniq: true, old_uniq: 0 }`. Without a yes, continue with Tasks 6–15 (unit-tested, no DB needed) and hold Task 16+ browser checks.

---

### Task 6: Redshift + fulfilment pulls

**Files:**
- Create: `src/lib/case-study/kit/pull-redshift.ts`, `src/lib/case-study/kit/pull-fulfilment.ts`, `scripts/_tmp-cs-pull-smoke.ts`
- Test: `src/lib/case-study/kit/pull-redshift.test.ts`, `src/lib/case-study/kit/pull-fulfilment.test.ts`

**Interfaces:**
- Consumes: `queryRedshift<T>(sql: string, params: unknown[]): Promise<T[]>` from `@/lib/redshift`; `PulledMetrics`, `ChannelBlock` (Task 2).
- Produces:

```ts
export type PullGroup = "account" | "products" | "campaigns";
export interface RedshiftPull { metrics: Partial<PulledMetrics>; failed: PullGroup[] }
export async function pullRedshiftMetrics(accountId: string, start: string, end: string): Promise<RedshiftPull>;
export function normaliseBuyBox(v: number): number;            // 0–1 → ×100
export function channelOf(campaignType: string | null): "sp" | "sbsd" | "other";
// pull-fulfilment.ts
export function fulfilmentLabel(codes: string[]): string | undefined;
export async function pullFulfilment(clientIdCode: string): Promise<string | undefined>;
```

- [ ] **Step 1: Write the failing tests**

`pull-redshift.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const q = vi.fn();
vi.mock("@/lib/redshift", () => ({ queryRedshift: (...a: unknown[]) => q(...a) }));
import { pullRedshiftMetrics, channelOf, normaliseBuyBox } from "./pull-redshift";

const account = [
  { month: "2025-01", sales: 1000, units: 50, ad_sales: 300, ad_spend: 100, impressions: 9000, clicks: 90, ad_orders: 12, sessions: 800 },
  { month: "2025-02", sales: 2000, units: 80, ad_sales: 500, ad_spend: 150, impressions: 11000, clicks: 110, ad_orders: 20, sessions: 1200 },
];
const products = [
  { asin: "B1", sku: "s1", title: "Alpha", sales: 1800, units: 70, page_views: 1500, bb_num: 1800 * 95, bb_den: 1800 },
  { asin: "B1", sku: "s1b", title: "Alpha", sales: 200, units: 10, page_views: 100, bb_num: 200 * 85, bb_den: 200 },
  { asin: "B2", sku: "s2", title: "Beta", sales: 1000, units: 50, page_views: 900, bb_num: 1000 * 90, bb_den: 1000 },
  { asin: "B3", sku: "s3", title: "Gamma", sales: 0, units: 0, page_views: 10, bb_num: 0, bb_den: 0 },
];
const campaigns = [
  { month: "2025-01", campaign_type: "SP M KT", spend: 60, sales: 200, orders: 8 },
  { month: "2025-01", campaign_type: "SB M V", spend: 30, sales: 80, orders: 3 },
  { month: "2025-01", campaign_type: "SD A", spend: 10, sales: 20, orders: 1 },
  { month: "2025-02", campaign_type: "SP A", spend: 150, sales: 500, orders: 20 },
];

beforeEach(() => {
  q.mockReset();
  q.mockImplementation((sql: string) => {
    if (sql.includes("account_summary")) return Promise.resolve(account);
    if (sql.includes("product_summary")) return Promise.resolve(products);
    if (sql.includes("campaign_summary")) return Promise.resolve(campaigns);
    return Promise.resolve([]);
  });
});

describe("pullRedshiftMetrics", () => {
  it("maps account, products and campaigns", async () => {
    const { metrics: m, failed } = await pullRedshiftMetrics("123", "2025-01-01", "2025-02-28");
    expect(failed).toEqual([]);
    expect(m.salesTotal).toBe(3000);
    expect(m.salesMonthly).toEqual([{ month: "2025-01", value: 1000 }, { month: "2025-02", value: 2000 }]);
    expect(m.unitsTotal).toBe(130);
    expect(m.adSales).toBe(800);
    expect(m.adSpend).toBe(250);
    expect(m.adImpressions).toBe(20000);
    expect(m.adOrders).toBe(32);
    expect(m.sessions).toBe(2000);
    expect(m.pageViews).toBe(2510);
    expect(m.skuCount).toBe(3); // sku with sales > 0
    expect(m.buyBoxPct).toBeCloseTo((1800 * 95 + 200 * 85 + 1000 * 90) / 3000, 5);
    expect(m.topByRevenue).toEqual([{ asin: "B1", title: "Alpha", value: 2000 }, { asin: "B2", title: "Beta", value: 1000 }]);
    expect(m.topByUnits![0]).toEqual({ asin: "B1", title: "Alpha", value: 80 });
    expect(m.paidSp).toEqual({ spend: 210, sales: 700, orders: 28,
      monthly: [{ month: "2025-01", spend: 60, sales: 200 }, { month: "2025-02", spend: 150, sales: 500 }] });
    expect(m.paidSbSd).toMatchObject({ spend: 40, sales: 100, orders: 4 });
  });
  it("passes account id and dates as bind params, never interpolated", async () => {
    await pullRedshiftMetrics("123", "2025-01-01", "2025-02-28");
    for (const call of q.mock.calls) {
      expect(call[0]).not.toContain("123");
      expect(call[1]).toEqual(["123", "2025-01-01", "2025-02-28"]);
    }
  });
  it("no rows → metrics undefined (not 0), no failure", async () => {
    q.mockResolvedValue([]);
    const { metrics: m, failed } = await pullRedshiftMetrics("1", "2025-01-01", "2025-02-28");
    expect(failed).toEqual([]);
    expect(m.salesTotal).toBeUndefined();
    expect(m.topByRevenue).toBeUndefined();
    expect(m.paidSp).toBeUndefined();
  });
  it("a throwing group is recorded; other groups still land", async () => {
    q.mockImplementation((sql: string) =>
      sql.includes("product_summary") ? Promise.reject(new Error("timeout")) : Promise.resolve(sql.includes("account_summary") ? account : []));
    const { metrics: m, failed } = await pullRedshiftMetrics("1", "2025-01-01", "2025-02-28");
    expect(failed).toEqual(["products"]);
    expect(m.salesTotal).toBe(3000);
    expect(m.buyBoxPct).toBeUndefined();
  });
});

describe("helpers", () => {
  it.each([["SP M KT", "sp"], ["SP A", "sp"], ["SB M V PT", "sbsd"], ["SD PT", "sbsd"], ["SB M KT,SB M PT", "sbsd"], [null, "other"], ["", "other"]] as const)(
    "channelOf(%s) = %s", (ct, ch) => expect(channelOf(ct)).toBe(ch));
  it("normaliseBuyBox", () => { expect(normaliseBuyBox(0.95)).toBe(95); expect(normaliseBuyBox(95)).toBe(95); });
});
```

`pull-fulfilment.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { fulfilmentLabel } from "./pull-fulfilment";

describe("fulfilmentLabel", () => {
  it.each([
    [["AMAZON_NA"], "FBA"], [["AMAZON_NA", "AMAZON_NA"], "FBA"], [["DEFAULT"], "FBM"],
    [["AMAZON_NA", "DEFAULT"], "FBA + FBM"], [[], undefined], [["", " "], undefined],
  ] as const)("%j → %s", (codes, out) => expect(fulfilmentLabel([...codes])).toBe(out));
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/case-study/kit/pull-redshift.test.ts src/lib/case-study/kit/pull-fulfilment.test.ts`).

- [ ] **Step 3: Implement `pull-redshift.ts`**

`account_summary` can hold duplicate rows per day (the legacy query dedupes with `MAX` per `report_date`); `product_summary` is deduped per `(report_date, sku)` the same way. `ordered_revenue`/`ordered_units` are primary with `product_sales`/`product_quantity` as fallback when zero.

```ts
import { queryRedshift } from "@/lib/redshift";
import type { PulledMetrics, ChannelBlock, ProductRow } from "./metrics";

export type PullGroup = "account" | "products" | "campaigns";
export interface RedshiftPull { metrics: Partial<PulledMetrics>; failed: PullGroup[] }

const ACCOUNT_SQL = `
  SELECT TO_CHAR(report_date::DATE, 'YYYY-MM') AS month,
    SUM(sales) AS sales, SUM(units) AS units, SUM(ad_sales) AS ad_sales, SUM(ad_spend) AS ad_spend,
    SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(ad_orders) AS ad_orders, SUM(sessions) AS sessions
  FROM (
    SELECT report_date,
      COALESCE(NULLIF(MAX(ordered_revenue), 0), MAX(product_sales), 0) AS sales,
      COALESCE(NULLIF(MAX(ordered_units), 0), MAX(product_quantity), 0) AS units,
      COALESCE(MAX(ad_revenue), 0) AS ad_sales, COALESCE(MAX(ad_spend), 0) AS ad_spend,
      COALESCE(MAX(ad_impressions), 0) AS impressions, COALESCE(MAX(ad_clicks), 0) AS clicks,
      COALESCE(MAX(ad_orders), 0) AS ad_orders,
      COALESCE(MAX(browser_session), 0) + COALESCE(MAX(mobile_app_sessions), 0) AS sessions
    FROM "intentwise_ecommerce_graph"."account_summary"
    WHERE account_id = $1::BIGINT AND report_date::DATE >= $2::DATE AND report_date::DATE <= $3::DATE
    GROUP BY report_date
  ) d
  GROUP BY 1 ORDER BY 1`;

const PRODUCT_SQL = `
  SELECT asin, sku, MAX(title) AS title, SUM(sales) AS sales, SUM(units) AS units, SUM(page_views) AS page_views,
    SUM(CASE WHEN buy_box IS NOT NULL THEN buy_box * sales ELSE 0 END) AS bb_num,
    SUM(CASE WHEN buy_box IS NOT NULL THEN sales ELSE 0 END) AS bb_den
  FROM (
    SELECT report_date, sku, MAX(product) AS asin, MAX(product_title) AS title,
      COALESCE(MAX(product_sales), 0) AS sales, COALESCE(MAX(product_quantity), 0) AS units,
      COALESCE(MAX(browser_page_views), 0) + COALESCE(MAX(mobile_app_page_views), 0) AS page_views,
      MAX(buy_box_prcntg) AS buy_box
    FROM "intentwise_ecommerce_graph"."product_summary"
    WHERE account_id = $1::BIGINT AND report_date::DATE >= $2::DATE AND report_date::DATE <= $3::DATE
    GROUP BY report_date, sku
  ) d
  GROUP BY asin, sku`;

const CAMPAIGN_SQL = `
  SELECT TO_CHAR(report_date::DATE, 'YYYY-MM') AS month, campaign_type,
    COALESCE(SUM(ad_spend), 0) AS spend, COALESCE(SUM(ad_revenue), 0) AS sales, COALESCE(SUM(ad_orders), 0) AS orders
  FROM "intentwise_ecommerce_graph"."campaign_summary"
  WHERE account_id = $1::BIGINT AND report_date::DATE >= $2::DATE AND report_date::DATE <= $3::DATE
  GROUP BY 1, 2 ORDER BY 1`;

const n = (v: unknown) => Number(v ?? 0) || 0;
export function normaliseBuyBox(v: number): number { return v <= 1 ? v * 100 : v; }
export function channelOf(campaignType: string | null): "sp" | "sbsd" | "other" {
  const t = (campaignType ?? "").trim().toUpperCase();
  if (t.startsWith("SP")) return "sp";
  if (t.startsWith("SB") || t.startsWith("SD")) return "sbsd";
  return "other";
}

function mapAccount(rows: Record<string, unknown>[]): Partial<PulledMetrics> {
  if (!rows.length) return {};
  const sum = (k: string) => rows.reduce((s, r) => s + n(r[k]), 0);
  return {
    salesMonthly: rows.map((r) => ({ month: String(r.month), value: n(r.sales) })),
    salesTotal: sum("sales"), unitsTotal: sum("units"), adSales: sum("ad_sales"), adSpend: sum("ad_spend"),
    adImpressions: sum("impressions"), adClicks: sum("clicks"), adOrders: sum("ad_orders"), sessions: sum("sessions"),
  };
}

function mapProducts(rows: Record<string, unknown>[]): Partial<PulledMetrics> {
  if (!rows.length) return {};
  const byAsin = new Map<string, { title: string; sales: number; units: number }>();
  let pageViews = 0, bbNum = 0, bbDen = 0;
  const skus = new Set<string>();
  for (const r of rows) {
    const asin = String(r.asin ?? "");
    const cur = byAsin.get(asin) ?? { title: String(r.title ?? asin), sales: 0, units: 0 };
    cur.sales += n(r.sales); cur.units += n(r.units);
    byAsin.set(asin, cur);
    pageViews += n(r.page_views); bbNum += n(r.bb_num); bbDen += n(r.bb_den);
    if (n(r.sales) > 0) skus.add(String(r.sku));
  }
  const list = [...byAsin.entries()].filter(([a]) => a);
  const top = (k: "sales" | "units"): ProductRow[] =>
    list.filter(([, v]) => v[k] > 0).sort((a, b) => b[1][k] - a[1][k]).slice(0, 3)
      .map(([asin, v]) => ({ asin, title: v.title, value: v[k] }));
  return {
    pageViews, skuCount: skus.size,
    ...(bbDen > 0 ? { buyBoxPct: normaliseBuyBox(bbNum / bbDen) } : {}),
    topByRevenue: top("sales"), topByUnits: top("units"),
  };
}

function mapCampaigns(rows: Record<string, unknown>[]): Partial<PulledMetrics> {
  if (!rows.length) return {};
  const block = (ch: "sp" | "sbsd"): ChannelBlock => {
    const mine = rows.filter((r) => channelOf(r.campaign_type as string | null) === ch);
    const months = new Map<string, { spend: number; sales: number }>();
    for (const r of mine) {
      const m = months.get(String(r.month)) ?? { spend: 0, sales: 0 };
      m.spend += n(r.spend); m.sales += n(r.sales);
      months.set(String(r.month), m);
    }
    return {
      spend: mine.reduce((s, r) => s + n(r.spend), 0), sales: mine.reduce((s, r) => s + n(r.sales), 0),
      orders: mine.reduce((s, r) => s + n(r.orders), 0),
      monthly: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
    };
  };
  return { paidSp: block("sp"), paidSbSd: block("sbsd") };
}

export async function pullRedshiftMetrics(accountId: string, start: string, end: string): Promise<RedshiftPull> {
  const params = [accountId, start, end];
  const groups: [PullGroup, string, (r: Record<string, unknown>[]) => Partial<PulledMetrics>][] = [
    ["account", ACCOUNT_SQL, mapAccount], ["products", PRODUCT_SQL, mapProducts], ["campaigns", CAMPAIGN_SQL, mapCampaigns],
  ];
  const settled = await Promise.allSettled(groups.map(([, sql]) => queryRedshift<Record<string, unknown>>(sql, params)));
  const metrics: Partial<PulledMetrics> = {};
  const failed: PullGroup[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") Object.assign(metrics, groups[i][2](s.value));
    else { failed.push(groups[i][0]); console.error(`[case-study pull] ${groups[i][0]} failed:`, s.reason); }
  });
  return { metrics, failed };
}
```

- [ ] **Step 4: Implement `pull-fulfilment.ts`**

```ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/** The ONLY non-Redshift metric (ruled 2026-09-28): master.fulfillment->>'FulfillmentChannelCodeUS'. */
export function fulfilmentLabel(codes: string[]): string | undefined {
  const clean = codes.map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!clean.length) return undefined;
  const fba = clean.some((c) => c.startsWith("AMAZON"));
  const fbm = clean.some((c) => !c.startsWith("AMAZON"));
  return fba && fbm ? "FBA + FBM" : fba ? "FBA" : "FBM";
}

export async function pullFulfilment(clientIdCode: string): Promise<string | undefined> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT fulfillment->>'FulfillmentChannelCodeUS' AS code
    FROM master
    WHERE client_id_code = ${clientIdCode} AND fulfillment ? 'FulfillmentChannelCodeUS'`)) as unknown as { code: string | null }[];
  return fulfilmentLabel(rows.map((r) => r.code ?? ""));
}
```

- [ ] **Step 5: Run → PASS.** `npx vitest run src/lib/case-study/kit/pull-redshift.test.ts src/lib/case-study/kit/pull-fulfilment.test.ts`

- [ ] **Step 6: Live read-only smoke against Redshift** — confirms the SQL runs, the buy-box scale, and timing.

`scripts/_tmp-cs-pull-smoke.ts`:

```ts
/** READ-ONLY: run the case-study Redshift pull for one active client and time it. */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const { pullRedshiftMetrics } = await import("../src/lib/case-study/kit/pull-redshift");
  const { resolveAccountId } = await import("../src/lib/case-study/generate");
  const client = process.argv[2] ?? "REA_SC_US";
  const accountId = await resolveAccountId(client);
  console.log("client", client, "accountId", accountId);
  if (!accountId) process.exit(0);
  const t0 = Date.now();
  const r = await pullRedshiftMetrics(accountId, "2025-10-01", "2026-09-27");
  console.log("ms", Date.now() - t0, "failed", r.failed);
  const { salesMonthly, paidSp, paidSbSd, ...scalars } = r.metrics;
  console.log(JSON.stringify({ scalars, months: salesMonthly?.length, sp: paidSp && { ...paidSp, monthly: paidSp.monthly.length },
    sbsd: paidSbSd && { ...paidSbSd, monthly: paidSbSd.monthly.length } }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd /Users/manu/MFHub && npx tsx .worktrees/thread-ab-case-study/scripts/_tmp-cs-pull-smoke.ts REA_SC_US` (and once with `GLO_SC_US`).
Expected: `failed []`, `ms` well under 240000, `buyBoxPct` between 0 and 100, `salesTotal` > 0, `months` ≈ 12. If `ms` > 120000, record it — Task 7 must then run the pull after responding (see Task 7 Step 3 note). If `buyBoxPct` > 100, the column is already ×100 AND sometimes >1 — stop and report the raw values.

- [ ] **Step 7: Commit** — pathspecs the 4 source/test files + smoke script; message `feat(case-study): Redshift metrics pull (account/products/campaign-type split) + fulfilment from master` + trailer.

---

### Task 7: Design-section image resolver + pull orchestrator

**Files:**
- Create: `src/lib/case-study/kit/design-images.ts`, `src/lib/case-study/kit/pull.ts`
- Test: `src/lib/case-study/kit/design-images.test.ts`, `src/lib/case-study/kit/pull.test.ts`

**Interfaces:**
- Consumes: `resolveAplusScreenviews(clientIdCode): Promise<AplusScreenviewResult>` (existing `src/lib/case-study/aplus-screenviews.ts`); `resolveAccountId`, `resolveClientLogoUrl` (existing, `src/lib/case-study/generate.ts` — **moved** into `pull.ts` here because Task 19 deletes `generate.ts`); `pullRedshiftMetrics`, `pullFulfilment` (Task 6); `DesignImages` (Task 4); `CaseStudyMetrics`, `emptyMetrics` (Task 2).
- Produces:

```ts
// design-images.ts
export function pickVersion<T extends { status: string; versionNumber: number }>(rows: T[]): T | undefined;
export async function resolveDesignImages(clientIdCode: string, heroAsin: string | null): Promise<DesignImages>;
// pull.ts
export async function resolveAccountId(clientIdCode: string): Promise<string | null>;
export async function resolveClientLogoUrl(clientIdCode: string): Promise<string>;
export interface FullPull { metrics: CaseStudyMetrics; design: DesignImages; noAccount: boolean }
export async function pullEverything(clientIdCode: string, start: string, end: string, prev?: CaseStudyMetrics): Promise<FullPull>;
```

Image proxy URLs (existing routes, all session-guarded, all take the **Google** Drive file id):
- listing: `/api/design/listing-images/image?driveFileId=<gid>`
- brand story: `/api/design-status/brand-story-image?driveFileId=<gid>`
- storefront: `/api/storefront/image?driveFileId=<gid>`
- A+: already built by `resolveAplusScreenviews` (`/api/aplus2/image?driveFileId=<gid>`)

Version rule (listing per slot, brand story, storefront): rank `live` 3 > `approved` 2 > `in_review` 1 > other 0; exclude `discontinued`; tie → highest `version_number`. Hero product = `topByRevenue[0].asin` from the Redshift pull; `listing_image_slot_versions.product_id` is `master.id::text` (verified 2026-09-28: 105/105 match).

- [ ] **Step 1: Write the failing tests**

`design-images.test.ts` — the DB is mocked at `db.execute`, returning rows by matching the SQL text:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => exec(...a) } }));
vi.mock("../aplus-screenviews", () => ({
  resolveAplusScreenviews: vi.fn().mockResolvedValue({
    screenviews: [{ asin: "B1", contentType: "PA+", images: ["/a1", "/a2"] }, { asin: "B2", contentType: "BA+", images: ["/b1"] }],
    hasBasic: true, hasPremium: true }),
}));
import { resolveDesignImages, pickVersion } from "./design-images";

const text = (q: unknown) => JSON.stringify(q);
beforeEach(() => {
  exec.mockReset();
  exec.mockImplementation((q: unknown) => {
    const s = text(q);
    if (s.includes("listing_image_slot_versions")) return Promise.resolve([
      { slot: "PT01", version_number: 2, status: "live", gid: "g-pt01-v2" },
      { slot: "PT01", version_number: 3, status: "in_review", gid: "g-pt01-v3" },
      { slot: "MAIN", version_number: 1, status: "approved", gid: "g-main" },
      { slot: "PT02", version_number: 1, status: "discontinued", gid: "g-pt02" },
    ]);
    if (s.includes("brand_story_versions")) return Promise.resolve([
      { version_id: "v1", version_number: 1, status: "live", gid: "g-bs1" },
      { version_id: "v2", version_number: 2, status: "in_progress", gid: "g-bs2" },
    ]);
    if (s.includes("storefront_versions")) return Promise.resolve([
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-home", is_homepage: true, page_pos: 1, mod_pos: 1, tile_pos: null, gid: "g-hero", mime: "image/jpeg" },
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-home", is_homepage: true, page_pos: 1, mod_pos: 2, tile_pos: 1, gid: "g-tile", mime: "image/png" },
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-home", is_homepage: true, page_pos: 1, mod_pos: 3, tile_pos: null, gid: "g-vid", mime: "video/mp4" },
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-2", is_homepage: false, page_pos: 2, mod_pos: 1, tile_pos: null, gid: "g-p2", mime: "image/jpeg" },
    ]);
    if (s.includes("client_logo_url")) return Promise.resolve([{ url: "https://logo" }]);
    if (s.includes("aplus2_modules")) return Promise.resolve([{ premium_modules: 7, asins_live: 4 }]);
    return Promise.resolve([]);
  });
});

describe("pickVersion", () => {
  it("live > approved > in_review > rest; discontinued excluded; tie → higher version", () => {
    expect(pickVersion([{ status: "in_review", versionNumber: 9 }, { status: "live", versionNumber: 1 }])?.versionNumber).toBe(1);
    expect(pickVersion([{ status: "discontinued", versionNumber: 5 }])).toBeUndefined();
    expect(pickVersion([{ status: "in_progress", versionNumber: 1 }, { status: "in_progress", versionNumber: 2 }])?.versionNumber).toBe(2);
  });
});

describe("resolveDesignImages", () => {
  it("builds every image group from Design", async () => {
    const d = await resolveDesignImages("REA_SC_US", "B1");
    expect(d.heroListing).toEqual([
      "/api/design/listing-images/image?driveFileId=g-main",
      "/api/design/listing-images/image?driveFileId=g-pt01-v2",
    ]);
    expect(d.brandStory).toEqual(["/api/design-status/brand-story-image?driveFileId=g-bs1"]);
    expect(d.aplusStacks).toEqual([["/a1", "/a2"], ["/b1"]]);
    expect(d.storefrontPages).toEqual([
      ["/api/storefront/image?driveFileId=g-hero", "/api/storefront/image?driveFileId=g-tile"],
      ["/api/storefront/image?driveFileId=g-p2"],
    ]);
    expect(d.logo).toEqual(["https://logo"]);
    expect(d.aplusPremiumModules).toBe(7);
    expect(d.aplusAsinsLive).toBe(4);
  });
  it("no hero ASIN → empty listing, other groups still resolve", async () => {
    const d = await resolveDesignImages("REA_SC_US", null);
    expect(d.heroListing).toEqual([]);
    expect(d.brandStory.length).toBe(1);
  });
  it("a failing group yields empty for that group only", async () => {
    exec.mockImplementation((q: unknown) => text(q).includes("brand_story_versions") ? Promise.reject(new Error("x")) : Promise.resolve([]));
    const d = await resolveDesignImages("REA_SC_US", "B1");
    expect(d.brandStory).toEqual([]);
    expect(d.aplusStacks.length).toBe(2);
  });
});
```

`pull.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => exec(...a) } }));
const pullRs = vi.fn();
vi.mock("./pull-redshift", () => ({ pullRedshiftMetrics: (...a: unknown[]) => pullRs(...a) }));
vi.mock("./pull-fulfilment", () => ({ pullFulfilment: vi.fn().mockResolvedValue("FBA") }));
const design = vi.fn();
vi.mock("./design-images", () => ({ resolveDesignImages: (...a: unknown[]) => design(...a) }));
import { pullEverything } from "./pull";
import { EMPTY_DESIGN_IMAGES } from "./slides";

beforeEach(() => {
  exec.mockReset(); pullRs.mockReset(); design.mockReset();
  design.mockResolvedValue(EMPTY_DESIGN_IMAGES);
});

describe("pullEverything", () => {
  it("no Intentwise id → all Redshift metrics missing, noAccount, no Redshift call", async () => {
    exec.mockResolvedValue([{ raw_data: { ClientName: "x" } }]);
    const r = await pullEverything("NOID_SC_US", "2025-01-01", "2025-12-31");
    expect(r.noAccount).toBe(true);
    expect(pullRs).not.toHaveBeenCalled();
    expect(r.metrics.auto.salesTotal).toBeUndefined();
    expect(r.metrics.auto.fulfilment).toBe("FBA");
    expect(design).toHaveBeenCalledWith("NOID_SC_US", null);
  });
  it("passes hero ASIN to design resolver and keeps prior overrides", async () => {
    exec.mockResolvedValue([{ raw_data: { IntentwiseID: "42" } }]);
    pullRs.mockResolvedValue({ metrics: { salesTotal: 5, topByRevenue: [{ asin: "B9", title: "t", value: 5 }] }, failed: ["campaigns"] });
    const prev = { pulledAt: "x", period: { start: "a", end: "b" }, auto: {}, overrides: { sessions: 77 }, failed: [] };
    const r = await pullEverything("C_SC_US", "2025-01-01", "2025-12-31", prev);
    expect(pullRs).toHaveBeenCalledWith("42", "2025-01-01", "2025-12-31");
    expect(design).toHaveBeenCalledWith("C_SC_US", "B9");
    expect(r.metrics.overrides).toEqual({ sessions: 77 });
    expect(r.metrics.failed).toEqual(["campaigns"]);
    expect(r.metrics.period).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(r.metrics.pulledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("raw_data stored as a JSON string is parsed", async () => {
    exec.mockResolvedValue([{ raw_data: JSON.stringify({ IntentwiseID: "7" }) }]);
    pullRs.mockResolvedValue({ metrics: {}, failed: [] });
    await pullEverything("C_SC_US", "2025-01-01", "2025-12-31");
    expect(pullRs).toHaveBeenCalledWith("7", "2025-01-01", "2025-12-31");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `design-images.ts`**

```ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { resolveAplusScreenviews } from "../aplus-screenviews";
import { IMAGE_SLOTS } from "@/lib/listing-image-slots";
import { EMPTY_DESIGN_IMAGES, type DesignImages } from "./slides";

const RANK: Record<string, number> = { live: 3, approved: 2, in_review: 1 };
export function pickVersion<T extends { status: string; versionNumber: number }>(rows: T[]): T | undefined {
  return rows.filter((r) => r.status !== "discontinued")
    .sort((a, b) => (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0) || b.versionNumber - a.versionNumber)[0];
}
const rowsOf = <T,>(r: unknown) => r as unknown as T[];
const safe = async <T,>(p: Promise<T>, fallback: T, label: string): Promise<T> => {
  try { return await p; } catch (e) { console.error(`[case-study design] ${label} failed:`, e); return fallback; }
};
const HERO_SLOTS = IMAGE_SLOTS.slice(0, 9); // MAIN, PT01…PT08 (PT09 is the swatch)

async function heroListing(clientIdCode: string, asin: string | null): Promise<string[]> {
  if (!asin) return [];
  const rows = rowsOf<{ slot: string; version_number: number; status: string; gid: string }>(await db.execute(sql`
    SELECT v.slot, v.version_number, v.status, df.drive_file_id AS gid
    FROM listing_image_slot_versions v
    JOIN drive_files df ON df.id = v.drive_file_id
    JOIN master m ON m.id::text = v.product_id
    WHERE v.client_id_code = ${clientIdCode} AND m.asin = ${asin}`));
  return HERO_SLOTS.flatMap((slot) => {
    const best = pickVersion(rows.filter((r) => r.slot === slot).map((r) => ({ ...r, versionNumber: r.version_number })));
    return best ? [`/api/design/listing-images/image?driveFileId=${encodeURIComponent(best.gid)}`] : [];
  });
}

async function brandStory(clientIdCode: string): Promise<string[]> {
  const rows = rowsOf<{ version_id: string; version_number: number; status: string; gid: string }>(await db.execute(sql`
    SELECT v.id AS version_id, v.version_number, v.status, df.drive_file_id AS gid
    FROM brand_story_versions v
    JOIN brand_story_assets a ON a.version_id = v.id AND a.kind = 'screenview'
    JOIN drive_files df ON df.id = a.drive_file_id
    WHERE v.client_id_code = ${clientIdCode}
    ORDER BY a.created_at DESC`));
  const best = pickVersion(rows.map((r) => ({ ...r, versionNumber: r.version_number })));
  return best ? [`/api/design-status/brand-story-image?driveFileId=${encodeURIComponent(best.gid)}`] : [];
}

async function storefront(clientIdCode: string): Promise<string[][]> {
  const rows = rowsOf<{ version_id: string; version_number: number; status: string; page_id: string; is_homepage: boolean;
    page_pos: number; mod_pos: number; tile_pos: number | null; gid: string; mime: string | null }>(await db.execute(sql`
    SELECT v.id AS version_id, v.version_number, v.status, p.id AS page_id, p.is_homepage, p.position AS page_pos,
      m.position AS mod_pos, NULL::int AS tile_pos, m.drive_file_id AS gid, m.asset_mime_type AS mime
    FROM storefront_versions v JOIN storefront_pages p ON p.version_id = v.id JOIN storefront_modules m ON m.page_id = p.id
    WHERE v.client_id_code = ${clientIdCode} AND m.drive_file_id IS NOT NULL
    UNION ALL
    SELECT v.id, v.version_number, v.status, p.id, p.is_homepage, p.position, m.position, t.position, t.drive_file_id, t.asset_mime_type
    FROM storefront_versions v JOIN storefront_pages p ON p.version_id = v.id JOIN storefront_modules m ON m.page_id = p.id
    JOIN storefront_module_tiles t ON t.module_id = m.id
    WHERE v.client_id_code = ${clientIdCode} AND t.drive_file_id IS NOT NULL`));
  const versions = [...new Map(rows.map((r) => [r.version_id, { id: r.version_id, status: r.status, versionNumber: r.version_number }])).values()];
  const best = pickVersion(versions);
  if (!best) return [];
  const mine = rows.filter((r) => r.version_id === best.id && (r.mime ?? "image/").startsWith("image/"));
  const pages = [...new Map(mine.map((r) => [r.page_id, r])).values()]
    .sort((a, b) => Number(b.is_homepage) - Number(a.is_homepage) || a.page_pos - b.page_pos).slice(0, 3);
  return pages.map((p) => mine.filter((r) => r.page_id === p.page_id)
    .sort((a, b) => a.mod_pos - b.mod_pos || (a.tile_pos ?? -1) - (b.tile_pos ?? -1))
    .map((r) => `/api/storefront/image?driveFileId=${encodeURIComponent(r.gid)}`));
}

async function aplusCounts(clientIdCode: string): Promise<{ premium_modules: number | null; asins_live: number | null }> {
  const rows = rowsOf<{ premium_modules: number | null; asins_live: number | null }>(await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM aplus2_modules mo JOIN aplus2_versions ve ON ve.id = mo.version_id
         JOIN aplus2_sets se ON se.id = ve.set_id
        WHERE se.client_id_code = ${clientIdCode} AND se.content_type = 'PA+' AND ve.status IN ('live','approved')) AS premium_modules,
      (SELECT COUNT(DISTINCT se.scope_identifier)::int FROM aplus2_sets se JOIN aplus2_versions ve ON ve.set_id = se.id
        WHERE se.client_id_code = ${clientIdCode} AND ve.status = 'live') AS asins_live`));
  return rows[0] ?? { premium_modules: null, asins_live: null };
}

export async function resolveDesignImages(clientIdCode: string, heroAsin: string | null): Promise<DesignImages> {
  const [listing, bs, sf, aplus, logoRows, counts] = await Promise.all([
    safe(heroListing(clientIdCode, heroAsin), [], "listing"),
    safe(brandStory(clientIdCode), [], "brand story"),
    safe(storefront(clientIdCode), [], "storefront"),
    safe(resolveAplusScreenviews(clientIdCode), { screenviews: [], hasBasic: false, hasPremium: false }, "a+"),
    safe(db.execute(sql`SELECT client_logo_url AS url FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)
      .then((r) => rowsOf<{ url: string | null }>(r)), [], "logo"),
    safe(aplusCounts(clientIdCode), { premium_modules: null, asins_live: null }, "a+ counts"),
  ]);
  return {
    ...EMPTY_DESIGN_IMAGES,
    heroListing: listing, brandStory: bs, storefrontPages: sf,
    aplusStacks: aplus.screenviews.map((s) => s.images),
    logo: logoRows[0]?.url ? [logoRows[0].url] : [],
    aplusPremiumModules: counts.premium_modules, aplusAsinsLive: counts.asins_live,
  };
}
```

Before running tests, verify the aplus2 column names used in `aplusCounts` against the schema: `grep -n "aplus2Sets = pgTable" -A25 src/lib/db/schema.ts` and `grep -n "aplus2Versions = pgTable" -A15 src/lib/db/schema.ts`, `grep -n "aplus2Modules = pgTable" -A12 src/lib/db/schema.ts`. Adjust `set_id`, `version_id`, `content_type`, `scope_identifier`, `client_id_code` to the real SQL column names if they differ (the A+ resolver in `aplus-screenviews.ts` queries the same tables — mirror its joins).

- [ ] **Step 4: Implement `pull.ts`**

```ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { pullRedshiftMetrics } from "./pull-redshift";
import { pullFulfilment } from "./pull-fulfilment";
import { resolveDesignImages } from "./design-images";
import { emptyMetrics, type CaseStudyMetrics } from "./metrics";
import type { DesignImages } from "./slides";

function parseRaw(raw: unknown): Record<string, string> {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}
export async function resolveAccountId(clientIdCode: string): Promise<string | null> {
  const rows = (await db.execute(sql`SELECT raw_data FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)) as unknown as { raw_data: unknown }[];
  const id = parseRaw(rows[0]?.raw_data).IntentwiseID;
  return id && String(id).trim() ? String(id).trim() : null;
}
export async function resolveClientLogoUrl(clientIdCode: string): Promise<string> {
  const rows = (await db.execute(sql`SELECT client_logo_url AS url FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)) as unknown as { url: string | null }[];
  return rows[0]?.url ?? "";
}

export interface FullPull { metrics: CaseStudyMetrics; design: DesignImages; noAccount: boolean }

export async function pullEverything(clientIdCode: string, start: string, end: string, prev?: CaseStudyMetrics): Promise<FullPull> {
  const accountId = await resolveAccountId(clientIdCode);
  const [rs, fulfilment] = await Promise.all([
    accountId ? pullRedshiftMetrics(accountId, start, end) : Promise.resolve({ metrics: {}, failed: [] as string[] }),
    pullFulfilment(clientIdCode).catch(() => undefined),
  ]);
  const metrics = emptyMetrics(start, end);
  metrics.auto = { ...rs.metrics, ...(fulfilment ? { fulfilment } : {}) };
  metrics.overrides = prev?.overrides ?? {};
  metrics.failed = rs.failed;
  metrics.pulledAt = new Date().toISOString();
  const heroAsin = rs.metrics.topByRevenue?.[0]?.asin ?? null;
  const design = await resolveDesignImages(clientIdCode, heroAsin);
  return { metrics, design, noAccount: !accountId };
}
```

Note: `resolveAccountId` reads `raw_data` via SQL (not Drizzle `select`) so the test's `db.execute` mock covers it. The existing `generate.ts` versions stay until Task 19 deletes that file; nothing new imports them.

- [ ] **Step 5: Run → PASS.** `npx vitest run src/lib/case-study/kit/design-images.test.ts src/lib/case-study/kit/pull.test.ts`

- [ ] **Step 6: Live read-only smoke** — append to `scripts/_tmp-cs-pull-smoke.ts` (after the Redshift pull) a call to `resolveDesignImages(client, r.metrics.topByRevenue?.[0]?.asin ?? null)` printing the length of each group. Run for `REA_SC_US` and one client with storefront work. Expected: non-empty groups where the Design pages show work; no thrown errors.

- [ ] **Step 7: Commit** — pathspecs the 4 files + smoke script; message `feat(case-study): Design-section image resolver + pull orchestrator` + trailer.

---

### Task 8: Tracker + create API (`/api/case-studies`)

**Files:**
- Rewrite: `src/app/api/case-studies/route.ts`
- Create: `src/lib/case-study/kit/load.ts`
- Test: `src/app/api/case-studies/route.test.ts`

**Interfaces:**
- Consumes: `pullEverything` (Task 7), `slidesFor`, `defaultSectionContent`, `deckBlockers`, `manualImageCount` (Task 4), `effective`, `deriveMetrics` (Task 2), `KitCaseStudy`, `TrackerRow` (Task 5), `isEditorOrAbove`, `isHubStaff` (`@/lib/roles`).
- Produces:
  - `GET /api/case-studies` → `TrackerRow[]` (active clients, sorted by name). Staff only (`isHubStaff`), else 403.
  - `GET /api/case-studies?clientIdCode=X&format=high_level|detailed` → `KitCaseStudy | null`.
  - `POST /api/case-studies` body `{ clientIdCode, format, dateRangeStart, dateRangeEnd }` → `201 { id, noAccount, failed }`; 409 if that (client, format) exists; 400 on bad input; 403 unless `isEditorOrAbove`.
  - `load.ts`: `export async function loadCaseStudy(id: string): Promise<KitCaseStudy | null>`; `export async function loadCaseStudyFor(clientIdCode: string, format: DeckFormat): Promise<KitCaseStudy | null>`; `export function blockersFor(cs: KitCaseStudy): Blocker[]`.

- [ ] **Step 1: Write the failing test** `src/app/api/case-studies/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
const exec = vi.fn();
const insertValues = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    execute: (...a: unknown[]) => exec(...a),
    transaction: async (fn: (tx: unknown) => unknown) => fn({
      insert: () => ({ values: (v: unknown) => { insertValues(v); return { returning: () => Promise.resolve([{ id: "new-id" }]) }; } }),
    }),
  },
}));
const pull = vi.fn();
vi.mock("@/lib/case-study/kit/pull", () => ({ pullEverything: (...a: unknown[]) => pull(...a) }));
const loadAll = vi.fn();
vi.mock("@/lib/case-study/kit/load", () => ({ loadCaseStudyFor: vi.fn().mockResolvedValue(null), blockersFor: () => [],
  loadAllCaseStudies: (...a: unknown[]) => loadAll(...a) }));

import { getAuthSession } from "@/lib/auth-db";
import { GET, POST } from "./route";
import { EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { emptyMetrics } from "@/lib/case-study/kit/metrics";
const session = getAuthSession as unknown as ReturnType<typeof vi.fn>;
const req = (url: string, body?: unknown) => new NextRequest(`http://x${url}`, body ? { method: "POST", body: JSON.stringify(body) } : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { role: "editor", id: "u1" } });
  pull.mockResolvedValue({ metrics: emptyMetrics("2025-10-01", "2026-09-30"), design: EMPTY_DESIGN_IMAGES, noAccount: true });
});

describe("GET tracker", () => {
  it("403 for client role", async () => {
    session.mockResolvedValue({ user: { role: "client" } });
    expect((await GET(req("/api/case-studies"))).status).toBe(403);
  });
  it("returns one row per active client with both cells", async () => {
    exec.mockResolvedValue([{ client_id_code: "A_SC_US", client_name: "Alpha" }, { client_id_code: "B_SC_US", client_name: "Beta" }]);
    loadAll.mockResolvedValue([{ id: "cs1", clientIdCode: "A_SC_US", format: "high_level", stage: "in_review", ownerName: "Sam",
      dateRangeStart: "2025-10-01", dateRangeEnd: "2026-09-30", updatedAt: "2026-09-28T00:00:00Z", sections: [] }]);
    const rows = await (await GET(req("/api/case-studies"))).json();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ clientIdCode: "A_SC_US", clientName: "Alpha", detailed: null,
      highLevel: { id: "cs1", stage: "in_review", ownerName: "Sam" } });
    expect(rows[1]).toMatchObject({ clientIdCode: "B_SC_US", highLevel: null, detailed: null });
  });
});

describe("POST create", () => {
  const good = { clientIdCode: "A_SC_US", format: "high_level", dateRangeStart: "2025-10-01", dateRangeEnd: "2026-09-30" };
  it("403 for viewer", async () => {
    session.mockResolvedValue({ user: { role: "viewer" } });
    expect((await POST(req("/api/case-studies", good))).status).toBe(403);
  });
  it.each([
    [{ ...good, format: "big" }], [{ ...good, dateRangeStart: "2025/10/01" }],
    [{ ...good, dateRangeEnd: "2025-01-01" }], [{ ...good, clientIdCode: "" }],
  ])("400 on bad input %#", async (body) => {
    expect((await POST(req("/api/case-studies", body))).status).toBe(400);
  });
  it("409 when that client+format exists", async () => {
    exec.mockResolvedValue([{ id: "exists" }]);
    expect((await POST(req("/api/case-studies", good))).status).toBe(409);
  });
  it("creates the deck with one section per High-Level slide, even with no Intentwise account", async () => {
    exec.mockImplementation((q: unknown) => Promise.resolve(JSON.stringify(q).includes("client_name") ? [{ client_name: "Alpha" }] : []));
    const res = await POST(req("/api/case-studies", good));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "new-id", noAccount: true });
    const [csRow, sectionRows] = insertValues.mock.calls.map((c) => c[0]);
    expect(csRow).toMatchObject({ clientIdCode: "A_SC_US", format: "high_level", stage: "drafting", ownerId: "u1", title: "Alpha — High-Level Case Study" });
    expect((sectionRows as { sectionType: string }[]).map((s) => s.sectionType)).toEqual(["hl_cover", "hl_challenge", "hl_results", "hl_approach", "hl_creative"]);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/app/api/case-studies/route.test.ts`

- [ ] **Step 3: Implement `kit/load.ts`**

```ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { KitCaseStudy, KitSection } from "./types";
import type { DeckFormat } from "./display";
import { emptyMetrics, effective, deriveMetrics, type CaseStudyMetrics } from "./metrics";
import { deckBlockers, type Blocker, type SectionContent, type SlideType } from "./slides";

type Row = Record<string, unknown>;
const SELECT = sql`
  SELECT cs.*, a.client_name, u.name AS owner_name,
    COALESCE((SELECT json_agg(json_build_object('id', s.id, 'sectionType', s.section_type, 'sortOrder', s.sort_order, 'content', s.content)
      ORDER BY s.sort_order) FROM case_study_sections s WHERE s.case_study_id = cs.id), '[]'::json) AS sections
  FROM case_studies cs
  LEFT JOIN aac a ON a.client_id_code = cs.client_id_code
  LEFT JOIN users u ON u.id = cs.owner_id`;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function toKit(r: Row): KitCaseStudy {
  const m = (r.metrics ?? {}) as Partial<CaseStudyMetrics>;
  const start = day(r.date_range_start), end = day(r.date_range_end);
  return {
    id: String(r.id), clientIdCode: String(r.client_id_code), clientName: String(r.client_name ?? r.client_id_code),
    title: String(r.title), format: r.format as DeckFormat, stage: r.stage as KitCaseStudy["stage"],
    ownerId: (r.owner_id as string | null) ?? null, ownerName: (r.owner_name as string | null) ?? null, sentAt: iso(r.sent_at),
    dateRangeStart: start, dateRangeEnd: end, clientSector: String(r.client_sector ?? ""), contactEmail: String(r.contact_email ?? ""),
    metrics: { ...emptyMetrics(start, end), ...m },
    updatedAt: iso(r.updated_at) ?? "",
    sections: ((r.sections as KitSection[]) ?? []).map((s) => ({ ...s, sectionType: s.sectionType as SlideType,
      content: { copy: {}, designImages: {}, manualImages: {}, ...(s.content as Partial<SectionContent>) } })),
  };
}
export async function loadCaseStudy(id: string): Promise<KitCaseStudy | null> {
  const rows = (await db.execute(sql`${SELECT} WHERE cs.id = ${id} LIMIT 1`)) as unknown as Row[];
  return rows[0] ? toKit(rows[0]) : null;
}
export async function loadCaseStudyFor(clientIdCode: string, format: DeckFormat): Promise<KitCaseStudy | null> {
  const rows = (await db.execute(sql`${SELECT} WHERE cs.client_id_code = ${clientIdCode} AND cs.format = ${format} LIMIT 1`)) as unknown as Row[];
  return rows[0] ? toKit(rows[0]) : null;
}
export async function loadAllCaseStudies(): Promise<KitCaseStudy[]> {
  const rows = (await db.execute(sql`${SELECT}`)) as unknown as Row[];
  return rows.map(toKit);
}
export function blockersFor(cs: KitCaseStudy): Blocker[] {
  const e = effective(cs.metrics);
  return deckBlockers(cs.format, e, deriveMetrics(e), cs.sections);
}
```

- [ ] **Step 4: Implement `src/app/api/case-studies/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { caseStudies, caseStudySections } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { pullEverything } from "@/lib/case-study/kit/pull";
import { slidesFor, defaultSectionContent, manualImageCount } from "@/lib/case-study/kit/slides";
import { loadCaseStudyFor, loadAllCaseStudies, blockersFor } from "@/lib/case-study/kit/load";
import type { TrackerCell, TrackerRow, KitCaseStudy } from "@/lib/case-study/kit/types";
import type { DeckFormat } from "@/lib/case-study/kit/display";

export const maxDuration = 300;
const FORMATS: DeckFormat[] = ["high_level", "detailed"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT_LABEL: Record<DeckFormat, string> = { high_level: "High-Level", detailed: "Detailed" };

function cell(cs: KitCaseStudy | undefined): TrackerCell | null {
  if (!cs) return null;
  return { id: cs.id, stage: cs.stage, ownerName: cs.ownerName, dateRangeStart: cs.dateRangeStart, dateRangeEnd: cs.dateRangeEnd,
    updatedAt: cs.updatedAt, blockers: blockersFor(cs).length, manualImages: manualImageCount(cs.sections) };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const format = req.nextUrl.searchParams.get("format") as DeckFormat | null;
  if (clientIdCode) {
    if (!format || !FORMATS.includes(format)) return NextResponse.json({ error: "format must be high_level or detailed" }, { status: 400 });
    return NextResponse.json(await loadCaseStudyFor(clientIdCode, format));
  }

  const [clients, all] = await Promise.all([
    db.execute(sql`SELECT client_id_code, client_name FROM aac WHERE client_status = 'Active' ORDER BY client_name NULLS LAST, client_id_code`)
      .then((r) => r as unknown as { client_id_code: string; client_name: string | null }[]),
    loadAllCaseStudies(),
  ]);
  const rows: TrackerRow[] = clients.map((c) => ({
    clientIdCode: c.client_id_code, clientName: c.client_name ?? c.client_id_code,
    highLevel: cell(all.find((x) => x.clientIdCode === c.client_id_code && x.format === "high_level")),
    detailed: cell(all.find((x) => x.clientIdCode === c.client_id_code && x.format === "detailed")),
  }));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientIdCode = String(body?.clientIdCode ?? "").trim();
  const format = body?.format as DeckFormat;
  const start = String(body?.dateRangeStart ?? ""), end = String(body?.dateRangeEnd ?? "");
  if (!clientIdCode || !FORMATS.includes(format) || !DATE.test(start) || !DATE.test(end) || start > end) {
    return NextResponse.json({ error: "clientIdCode, format (high_level|detailed) and YYYY-MM-DD dateRangeStart ≤ dateRangeEnd are required" }, { status: 400 });
  }
  const exists = (await db.execute(sql`SELECT id FROM case_studies WHERE client_id_code = ${clientIdCode} AND format = ${format} LIMIT 1`)) as unknown as { id: string }[];
  if (exists.length) return NextResponse.json({ error: "A case study in this format already exists for this client", id: exists[0].id }, { status: 409 });

  const nameRows = (await db.execute(sql`SELECT client_name FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)) as unknown as { client_name: string | null }[];
  const clientName = nameRows[0]?.client_name ?? clientIdCode;
  const { metrics, design, noAccount } = await pullEverything(clientIdCode, start, end);
  const defs = slidesFor(format);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(caseStudies).values({
      clientIdCode, format, title: `${clientName} — ${FORMAT_LABEL[format]} Case Study`,
      dateRangeStart: start, dateRangeEnd: end, sectionsEnabled: defs.map((d) => d.type),
      stage: "drafting", ownerId: session.user.id ?? null, metrics: metrics as unknown as Record<string, unknown>,
      generatedAt: new Date(),
    }).returning({ id: caseStudies.id });
    await tx.insert(caseStudySections).values(defs.map((d, i) => ({
      caseStudyId: row.id, sectionType: d.type, sortOrder: i,
      content: defaultSectionContent(d, design) as unknown as Record<string, unknown>,
    })));
    return row.id;
  });
  return NextResponse.json({ id, noAccount, failed: metrics.failed }, { status: 201 });
}
```

Check `session.user.id` exists on the session type: `grep -n "id" src/types/next-auth.d.ts 2>/dev/null | head`; if the session exposes the id under a different name, use that (the legacy PDF route and others show the idiom — `grep -rn "session.user.id" src/app/api | head -3`).

- [ ] **Step 5: Run → PASS.** Then `node_modules/.bin/tsc --noEmit 2>&1 | grep -E "api/case-studies/route|case-study/kit"` → no output.

- [ ] **Step 6: Commit** — pathspecs `src/app/api/case-studies/route.ts`, its test, `src/lib/case-study/kit/load.ts`; message `feat(case-study): tracker GET + two-format create POST` + trailer.

---

### Task 9: Edit APIs — stage/owner, metric overrides, sections, refresh

**Files:**
- Rewrite: `src/app/api/case-studies/[id]/route.ts`, `src/app/api/case-studies/[id]/sections/[sectionId]/route.ts`, `src/app/api/case-studies/[id]/refresh/route.ts`
- Create: `src/app/api/case-studies/[id]/metrics/route.ts`
- Test: `src/app/api/case-studies/[id]/route.test.ts`, `src/app/api/case-studies/[id]/metrics/route.test.ts`, `src/app/api/case-studies/[id]/sections/[sectionId]/route.test.ts`, `src/app/api/case-studies/[id]/refresh/route.test.ts`

**Interfaces:**
- Consumes: `loadCaseStudy`, `blockersFor` (Task 8); `canTransition`, `stageAfterEdit` (Task 4); `SCALAR_KEYS` (Task 2); `pullEverything` (Task 7); `refreshSectionContent`, `slideDef` (Task 4).
- Produces:
  - `GET /api/case-studies/[id]` → `KitCaseStudy & { blockers: Blocker[] }` (staff only).
  - `PATCH /api/case-studies/[id]` body any of `{ stage, ownerId, clientSector, contactEmail }` → 200; 409 `{ error, blockers }` when moving to `approved` with blockers; 400 on illegal transition.
  - `DELETE /api/case-studies/[id]` (editor+).
  - `PATCH /api/case-studies/[id]/metrics` body `{ key: ScalarKey, value: number | string | null }` → single-key jsonb write (`null` clears the override); drops stage via `stageAfterEdit`.
  - `PATCH /api/case-studies/[id]/sections/[sectionId]` body `{ copy?: Record<string,string>, manualImages?: Record<string,string[]> }` → merges into content (does NOT accept `designImages`); drops stage.
  - `POST /api/case-studies/[id]/refresh` → re-pull; replaces `metrics.auto`/`failed`/`pulledAt`, keeps `overrides`; every section `refreshSectionContent`; drops stage.

- [ ] **Step 1: Write the failing tests.** Shared mock header for all four files:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => exec(...a),
  transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: (...a: unknown[]) => exec(...a) }) } }));
const load = vi.fn();
const blockers = vi.fn();
vi.mock("@/lib/case-study/kit/load", () => ({ loadCaseStudy: (...a: unknown[]) => load(...a), blockersFor: (...a: unknown[]) => blockers(...a) }));
import { getAuthSession } from "@/lib/auth-db";
const session = getAuthSession as unknown as ReturnType<typeof vi.fn>;
const ctx = (id = "cs1", sectionId = "s1") => ({ params: Promise.resolve({ id, sectionId }) });
const patch = (body: unknown) => new NextRequest("http://x", { method: "PATCH", body: JSON.stringify(body) });
const deck = (stage: string) => ({ id: "cs1", stage, format: "high_level", metrics: { overrides: {} }, sections: [] });
const sqlText = () => exec.mock.calls.map((c) => JSON.stringify(c[0])).join("\n");
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ user: { role: "editor", id: "u1" } }); exec.mockResolvedValue([]); blockers.mockReturnValue([]); });
```

`[id]/route.test.ts` (imports `{ GET, PATCH, DELETE } from "./route"`):

```ts
describe("PATCH stage", () => {
  it("illegal transition → 400", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ stage: "approved" }), ctx())).status).toBe(400);
  });
  it("approve with blockers → 409 with the list", async () => {
    load.mockResolvedValue(deck("in_review"));
    blockers.mockReturnValue([{ slide: "hl_cover", kind: "metric", key: "salesTotal", message: "m" }]);
    const res = await PATCH(patch({ stage: "approved" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).blockers).toHaveLength(1);
  });
  it("approve without blockers → 200 and writes stage", async () => {
    load.mockResolvedValue(deck("in_review"));
    expect((await PATCH(patch({ stage: "approved" }), ctx())).status).toBe(200);
    expect(sqlText()).toContain("approved");
  });
  it("manual sent sets sent_at", async () => {
    load.mockResolvedValue(deck("approved"));
    await PATCH(patch({ stage: "sent" }), ctx());
    expect(sqlText()).toContain("sent_at");
  });
  it("viewer → 403; missing deck → 404", async () => {
    session.mockResolvedValue({ user: { role: "viewer" } });
    expect((await PATCH(patch({ stage: "in_review" }), ctx())).status).toBe(403);
    session.mockResolvedValue({ user: { role: "editor" } });
    load.mockResolvedValue(null);
    expect((await PATCH(patch({ stage: "in_review" }), ctx())).status).toBe(404);
  });
});
describe("GET", () => {
  it("client role → 403", async () => {
    session.mockResolvedValue({ user: { role: "client" } });
    expect((await GET(new NextRequest("http://x"), ctx())).status).toBe(403);
  });
  it("returns deck + blockers", async () => {
    load.mockResolvedValue(deck("drafting"));
    blockers.mockReturnValue([{ key: "x" }]);
    expect((await (await GET(new NextRequest("http://x"), ctx())).json()).blockers).toEqual([{ key: "x" }]);
  });
});
```

`[id]/metrics/route.test.ts` (imports `{ PATCH } from "./route"`):

```ts
describe("PATCH metric override", () => {
  it("rejects non-scalar keys", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ key: "salesMonthly", value: 1 }), ctx())).status).toBe(400);
  });
  it("rejects non-numeric values for numeric keys", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ key: "sessions", value: "lots" }), ctx())).status).toBe(400);
  });
  it("writes one key with jsonb_set, never replacing the whole metrics object", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ key: "sessions", value: 1234 }), ctx())).status).toBe(200);
    expect(sqlText()).toContain("jsonb_set");
    expect(sqlText()).not.toMatch(/SET metrics = \$/);
  });
  it("null clears the override (#- path)", async () => {
    load.mockResolvedValue(deck("drafting"));
    await PATCH(patch({ key: "sessions", value: null }), ctx());
    expect(sqlText()).toContain("#-");
  });
  it("editing an approved deck drops it to drafting", async () => {
    load.mockResolvedValue(deck("approved"));
    await PATCH(patch({ key: "sessions", value: 5 }), ctx());
    expect(sqlText()).toContain("drafting");
  });
});
```

`[id]/sections/[sectionId]/route.test.ts` (imports `{ PATCH } from "./route"`):

```ts
describe("PATCH section", () => {
  it("merges copy and manualImages, ignores designImages", async () => {
    load.mockResolvedValue({ ...deck("drafting"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0,
      content: { copy: { claim: "old", result: "keep" }, designImages: { "cover-hero": ["d"] }, manualImages: {} } }] });
    const res = await PATCH(patch({ copy: { claim: "new" }, manualImages: { "cover-hero": ["https://m"] }, designImages: { "cover-hero": ["evil"] } }), ctx());
    expect(res.status).toBe(200);
    const written = JSON.stringify(exec.mock.calls.at(-2)?.[0] ?? exec.mock.calls.at(-1)?.[0]);
    expect(written).toContain("new"); expect(written).toContain("keep"); expect(written).toContain("https://m");
    expect(written).not.toContain("evil");
  });
  it("rejects manual image values that are not http(s) or /api/ urls", async () => {
    load.mockResolvedValue({ ...deck("drafting"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0, content: { copy: {}, designImages: {}, manualImages: {} } }] });
    expect((await PATCH(patch({ manualImages: { "cover-hero": ["javascript:alert(1)"] } }), ctx())).status).toBe(400);
  });
  it("unknown section → 404; approved deck → drafting", async () => {
    load.mockResolvedValue({ ...deck("sent"), sections: [] });
    expect((await PATCH(patch({ copy: {} }), ctx())).status).toBe(404);
    load.mockResolvedValue({ ...deck("sent"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0, content: { copy: {}, designImages: {}, manualImages: {} } }] });
    await PATCH(patch({ copy: { claim: "x" } }), ctx());
    expect(sqlText()).toContain("drafting");
  });
});
```

`[id]/refresh/route.test.ts` (imports `{ POST } from "./route"`):

```ts
const pull = vi.fn();
vi.mock("@/lib/case-study/kit/pull", () => ({ pullEverything: (...a: unknown[]) => pull(...a) }));
import { EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
describe("POST refresh", () => {
  it("keeps overrides + manual images, replaces design images, passes prev metrics", async () => {
    const prevMetrics = { pulledAt: "x", period: { start: "2025-01-01", end: "2025-12-31" }, auto: {}, overrides: { sessions: 9 }, failed: [] };
    load.mockResolvedValue({ ...deck("approved"), clientIdCode: "C", dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", metrics: prevMetrics,
      sections: [{ id: "s1", sectionType: "hl_creative", sortOrder: 4, content: { copy: { bsJob: "mine" }, designImages: { li1: ["OLD_URL"] }, manualImages: { li2: ["man"] } } }] });
    pull.mockResolvedValue({ metrics: { ...prevMetrics, auto: { salesTotal: 1 } }, design: { ...EMPTY_DESIGN_IMAGES, heroListing: ["new"] }, noAccount: false });
    const res = await POST(new NextRequest("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(200);
    expect(pull).toHaveBeenCalledWith("C", "2025-01-01", "2025-12-31", prevMetrics);
    const all = sqlText();
    expect(all).toContain("mine"); expect(all).toContain("man"); expect(all).toContain("new"); expect(all).not.toContain("OLD_URL");
    expect(all).toContain("drafting");
  });
});
```


- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { loadCaseStudy, blockersFor } from "@/lib/case-study/kit/load";
import { canTransition, STAGES, type Stage } from "@/lib/case-study/kit/stages";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cs = await loadCaseStudy((await params).id);
  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...cs, blockers: blockersFor(cs) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const cs = await loadCaseStudy(id);
  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (body.stage !== undefined) {
    const to = body.stage as Stage;
    if (!STAGES.includes(to) || !canTransition(cs.stage, to))
      return NextResponse.json({ error: `Cannot move from ${cs.stage} to ${String(body.stage)}` }, { status: 400 });
    if (to === "approved") {
      const b = blockersFor(cs);
      if (b.length) return NextResponse.json({ error: "Resolve these before approving", blockers: b }, { status: 409 });
    }
    await db.execute(to === "sent"
      ? sql`UPDATE case_studies SET stage = 'sent', sent_at = now(), updated_at = now() WHERE id = ${id}`
      : sql`UPDATE case_studies SET stage = ${to}::case_study_stage, updated_at = now() WHERE id = ${id}`);
  }
  if (body.ownerId !== undefined) {
    const owner = body.ownerId === null ? null : String(body.ownerId);
    await db.execute(sql`UPDATE case_studies SET owner_id = ${owner}::uuid, updated_at = now() WHERE id = ${id}`);
  }
  if (body.clientSector !== undefined || body.contactEmail !== undefined) {
    await db.execute(sql`UPDATE case_studies SET
      client_sector = COALESCE(${body.clientSector === undefined ? null : String(body.clientSector)}, client_sector),
      contact_email = COALESCE(${body.contactEmail === undefined ? null : String(body.contactEmail)}, contact_email),
      stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END,
      updated_at = now() WHERE id = ${id}`);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.execute(sql`DELETE FROM case_studies WHERE id = ${(await params).id}`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implement `[id]/metrics/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { loadCaseStudy } from "@/lib/case-study/kit/load";
import { SCALAR_KEYS, type ScalarKey } from "@/lib/case-study/kit/metrics";

const DROP_STAGE = sql`stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END`;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await loadCaseStudy(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { key?: string; value?: unknown } | null;
  const key = body?.key as ScalarKey;
  if (!key || !SCALAR_KEYS.includes(key)) return NextResponse.json({ error: "key must be an overridable scalar metric" }, { status: 400 });

  const path = `{overrides,${key}}`;
  if (body!.value === null || body!.value === undefined || body!.value === "") {
    await db.execute(sql`UPDATE case_studies SET metrics = metrics #- ${path}::text[], ${DROP_STAGE}, updated_at = now() WHERE id = ${id}`);
    return NextResponse.json({ ok: true });
  }
  let value: number | string;
  if (key === "fulfilment") value = String(body!.value).slice(0, 40);
  else {
    value = Number(body!.value);
    if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
  }
  await db.execute(sql`UPDATE case_studies
    SET metrics = jsonb_set(jsonb_set(metrics, '{overrides}', COALESCE(metrics->'overrides', '{}'::jsonb), true),
                            ${path}::text[], ${JSON.stringify(value)}::jsonb, true),
        ${DROP_STAGE}, updated_at = now()
    WHERE id = ${id}`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Implement `[id]/sections/[sectionId]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { loadCaseStudy } from "@/lib/case-study/kit/load";

const URL_OK = /^(https:\/\/|http:\/\/|\/api\/)/i;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, sectionId } = await params;
  const cs = await loadCaseStudy(id);
  const sec = cs?.sections.find((s) => s.id === sectionId);
  if (!cs || !sec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { copy?: Record<string, unknown>; manualImages?: Record<string, unknown> } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const copy = { ...sec.content.copy };
  for (const [k, v] of Object.entries(body.copy ?? {})) copy[k] = String(v ?? "").slice(0, 2000);
  const manualImages = { ...sec.content.manualImages };
  for (const [slot, v] of Object.entries(body.manualImages ?? {})) {
    const urls = (Array.isArray(v) ? v : [v]).map((u) => String(u ?? "").trim()).filter(Boolean);
    if (urls.some((u) => !URL_OK.test(u))) return NextResponse.json({ error: "Image links must start with https://" }, { status: 400 });
    manualImages[slot] = urls;
  }
  const content = { ...sec.content, copy, manualImages };
  await db.execute(sql`UPDATE case_study_sections SET content = ${JSON.stringify(content)}::jsonb, updated_at = now() WHERE id = ${sectionId}`);
  await db.execute(sql`UPDATE case_studies SET stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END, updated_at = now() WHERE id = ${id}`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Implement `[id]/refresh/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { loadCaseStudy } from "@/lib/case-study/kit/load";
import { pullEverything } from "@/lib/case-study/kit/pull";
import { refreshSectionContent, slideDef } from "@/lib/case-study/kit/slides";

export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const cs = await loadCaseStudy(id);
  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { metrics, design, noAccount } = await pullEverything(cs.clientIdCode, cs.dateRangeStart, cs.dateRangeEnd, cs.metrics);
  await db.transaction(async (tx) => {
    for (const s of cs.sections) {
      const next = refreshSectionContent(slideDef(s.sectionType), s.content, design);
      await tx.execute(sql`UPDATE case_study_sections SET content = ${JSON.stringify(next)}::jsonb, updated_at = now() WHERE id = ${s.id}`);
    }
    await tx.execute(sql`UPDATE case_studies SET metrics = ${JSON.stringify(metrics)}::jsonb, generated_at = now(),
      stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END, updated_at = now() WHERE id = ${id}`);
  });
  return NextResponse.json({ ok: true, noAccount, failed: metrics.failed });
}
```

(Refresh writes the whole `metrics` object, which is correct here: `pullEverything` was handed `cs.metrics` and carried its `overrides` through.)

- [ ] **Step 7: Run → PASS**, then tsc filtered to `api/case-studies` → none.

- [ ] **Step 8: Commit** — all 8 files; message `feat(case-study): stage/owner, metric override, section and refresh APIs` + trailer.

---

### Task 10: Deck stylesheet, primitives, assets

**Files:**
- Create: `src/components/case-study/kit/deck.css`, `src/components/case-study/kit/primitives.tsx`
- Copy: `docs/case-study-kit/assets/mf-logo.png` → `public/case-study/mf-logo.png`; `docs/case-study-kit/assets/mf-mark.png` → `public/case-study/mf-mark.png`
- Test: `src/components/case-study/kit/primitives.test.tsx`

**Interfaces:**
- Consumes: `DeckFormat`, `splitMetric`, `fillTokens` (Task 2); `resolveSlotImages`, `SectionContent`, `ImageSlotDef` (Task 4); `KitCaseStudy` (Task 5).
- Produces:

```tsx
export interface DeckCtx {
  format: DeckFormat; clientName: string; period: string; periodShort: string; contactEmail: string;
  editing: boolean;           // true in builder (shows MissingChip + empty-slot placeholders)
  slideNo: number; slideTotal: number;
  tokens: Record<string, string>; // client, period, (Detailed only) total
}
export const DeckContext: React.Context<DeckCtx>;
export function useDeck(): DeckCtx;
export function SlideShell(props: { label: string; className?: string; children: ReactNode }): JSX.Element; // <section class="slide"> 1920×1080
export function Topbar(props: { left: ReactNode; right?: ReactNode }): JSX.Element;
export function Bottombar(): JSX.Element;       // mf-mark + "NN / TT"
export function PageNo(): JSX.Element;          // "NN / TT" text only
export function Metric(props: { value: string; unitClass?: "pct" | "unit"; style?: CSSProperties; unitStyle?: CSSProperties }): JSX.Element;
export function Copy(props: { content: SectionContent; k: string }): JSX.Element;  // token-filled copy or MissingChip when editing
export function MissingChip(props: { label?: string }): JSX.Element | null;       // renders only when editing
export function Val(props: { v: string; missing?: boolean }): JSX.Element;       // value or MissingChip ("—" in export)
export function SlotImage(props: { content: SectionContent; slot: ImageSlotDef; style?: CSSProperties; radius?: number }): JSX.Element;
export function formatPeriod(start: string, end: string): string;       // "Oct 2025 – Sep 2026"
```

- [ ] **Step 1: Create `deck.css`** — copy the `<style>` block of `docs/case-study-kit/High Level Case Study Template.html` (lines 16–141) and apply these mechanical edits (and nothing else):
  1. Replace `:root{` with `.cs-deck{` (tokens become scoped custom properties).
  2. Delete the `html,body{…}` rule and the `deck-stage{…}` rule.
  3. Prefix every other selector with `.cs-deck ` (e.g. `section.slide{` → `.cs-deck section.slide{`, `.light .card,.paper .card{` → `.cs-deck .light .card,.cs-deck .paper .card{`).
  4. Delete the whole `/* ===== Navigation UI ===== */` section (`#nav`, `#prog`, `#hint`, the `@media print{#nav…}` rule) and the `image-slot{…}` rule.
  5. Change `section.slide{ … position:absolute; inset:0; }` to `position:relative; width:1920px; height:1080px;` (the deck view stacks slides; Task 15 scales them).
  6. Append:

```css
.cs-deck{font-family:'Outfit',system-ui,sans-serif;}
.cs-deck .cs-missing{display:inline-flex;align-items:center;gap:8px;background:rgba(255,117,31,.16);color:#FF751F;border:1px dashed #FF751F;border-radius:8px;padding:2px 10px;font-size:.5em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle;}
.cs-deck .cs-slot{position:relative;overflow:hidden;background:var(--c-ink-80);}
.cs-deck .cs-slot.empty{border:1.5px dashed rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;color:var(--c-mute-2);font-size:18px;letter-spacing:.06em;text-transform:uppercase;}
.cs-deck .cs-slot img{display:block;width:100%;}
.cs-deck .cs-slot.fit-cover img,.cs-deck .cs-slot.fit-contain img{height:100%;}
.cs-deck .cs-slot.fit-cover img{object-fit:cover;}
.cs-deck .cs-slot.fit-contain img{object-fit:contain;}
.cs-deck .cs-slot.fit-width img{height:auto;}
.cs-deck .cs-slot .cs-manual-tag{position:absolute;top:6px;right:6px;z-index:3;background:#F5B301;color:#2B1508;font-size:12px;font-weight:700;padding:2px 8px;border-radius:5px;}
@media print{.cs-deck .cs-missing,.cs-deck .cs-manual-tag,.cs-deck .cs-slot.empty>span{display:none;}}
```

  Add the Outfit font: in `primitives.tsx` use `next/font/google` (`Outfit({ subsets: ["latin"], weight: ["400","500","600","700","800","900"] })`) and put its `className` on the `.cs-deck` root (Task 15). Verify: `grep -c "cs-deck" src/components/case-study/kit/deck.css` ≥ 60 and `grep -n "^[a-z#:]" src/components/case-study/kit/deck.css` prints nothing (every rule scoped).

- [ ] **Step 2: Copy the brand assets**

```bash
mkdir -p public/case-study
cp docs/case-study-kit/assets/mf-logo.png public/case-study/mf-logo.png
cp docs/case-study-kit/assets/mf-mark.png public/case-study/mf-mark.png
```

- [ ] **Step 3: Write the failing test** `primitives.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DeckContext, Copy, Val, SlotImage, Bottombar, Metric, formatPeriod, type DeckCtx } from "./primitives";

const ctx = (over: Partial<DeckCtx> = {}): DeckCtx => ({ format: "detailed", clientName: "Acme", period: "Oct 2025 – Sep 2026",
  periodShort: "FY26", contactEmail: "hello@marketfoundry.com", editing: false, slideNo: 3, slideTotal: 14,
  tokens: { client: "Acme", period: "Oct 2025 – Sep 2026", total: "$1,234" }, ...over });
const wrap = (el: React.ReactNode, c = ctx()) => render(<DeckContext.Provider value={c}>{el}</DeckContext.Provider>);
const content = { copy: { a: "Hi {client}, {total}", empty: "" }, designImages: { s: ["/d.png"], e: [] }, manualImages: { m: ["https://m.png"] } };
const slot = (id: string) => ({ id, label: "L", fit: "cover" as const, group: "g", from: () => [] });

describe("primitives", () => {
  it("Copy fills tokens; empty copy shows a chip only while editing", () => {
    expect(wrap(<Copy content={content} k="a" />).container.textContent).toBe("Hi Acme, $1,234");
    expect(wrap(<Copy content={content} k="empty" />).container.textContent).toBe("");
    expect(wrap(<Copy content={content} k="empty" />, ctx({ editing: true })).container.querySelector(".cs-missing")).toBeTruthy();
  });
  it("Val shows a chip when missing & editing, a dash in export", () => {
    expect(wrap(<Val v="—" missing />, ctx({ editing: true })).container.querySelector(".cs-missing")).toBeTruthy();
    expect(wrap(<Val v="—" missing />).container.textContent).toBe("—");
  });
  it("SlotImage: design image, manual tag, empty placeholder only while editing", () => {
    const d = wrap(<SlotImage content={content} slot={slot("s")} />).container;
    expect(d.querySelector("img")?.getAttribute("src")).toBe("/d.png");
    const m = wrap(<SlotImage content={content} slot={slot("m")} />, ctx({ editing: true })).container;
    expect(m.querySelector(".cs-manual-tag")?.textContent).toMatch(/manual/i);
    expect(wrap(<SlotImage content={content} slot={slot("e")} />, ctx({ editing: true })).container.querySelector(".cs-slot.empty")).toBeTruthy();
    expect(wrap(<SlotImage content={content} slot={slot("e")} />).container.querySelector("span")).toBeNull();
  });
  it("Bottombar numbers the slide", () => {
    expect(wrap(<Bottombar />).container.textContent).toContain("03 / 14");
  });
  it("Metric splits units", () => {
    const el = wrap(<Metric value="$64.6K" />).container;
    expect(el.querySelector(".unit")?.textContent).toBe("K");
    expect(el.textContent).toBe("$64.6K");
  });
  it("formatPeriod", () => {
    expect(formatPeriod("2025-10-01", "2026-09-30")).toBe("Oct 2025 – Sep 2026");
    expect(formatPeriod("2026-01-01", "2026-01-31")).toBe("Jan 2026");
  });
});
```

- [ ] **Step 4: Run → FAIL.**

- [ ] **Step 5: Implement `primitives.tsx`**

```tsx
/* eslint-disable react-doctor/nextjs-no-img-element */
"use client";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { DeckFormat } from "@/lib/case-study/kit/display";
import { splitMetric, fillTokens, monthShort } from "@/lib/case-study/kit/display";
import { resolveSlotImages, type SectionContent, type ImageSlotDef } from "@/lib/case-study/kit/slides";

export interface DeckCtx {
  format: DeckFormat; clientName: string; period: string; periodShort: string; contactEmail: string;
  editing: boolean; slideNo: number; slideTotal: number; tokens: Record<string, string>;
}
export const DeckContext = createContext<DeckCtx>({
  format: "detailed", clientName: "", period: "", periodShort: "", contactEmail: "", editing: false, slideNo: 1, slideTotal: 1, tokens: {},
});
export const useDeck = () => useContext(DeckContext);
const pad = (n: number) => String(n).padStart(2, "0");

export function formatPeriod(start: string, end: string): string {
  const a = `${monthShort(start.slice(0, 7))} ${start.slice(0, 4)}`, b = `${monthShort(end.slice(0, 7))} ${end.slice(0, 4)}`;
  return a === b ? a : `${a} – ${b}`;
}
export function SlideShell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <section className={`slide ${className ?? ""}`} data-label={label}>{children}</section>;
}
export function Topbar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return <div className="topbar"><span>{left}</span>{right !== undefined && <span className="right">{right}</span>}</div>;
}
export function PageNo() { const d = useDeck(); return <>{`${pad(d.slideNo)} / ${pad(d.slideTotal)}`}</>; }
export function Bottombar() {
  return <div className="bottombar"><img className="mf-mark" src="/case-study/mf-mark.png" alt="market foundry" /><span><PageNo /></span></div>;
}
export function MissingChip({ label = "needs data" }: { label?: string }) {
  return useDeck().editing ? <span className="cs-missing">{label}</span> : null;
}
export function Val({ v, missing }: { v: string; missing?: boolean }) {
  const d = useDeck();
  if (missing && d.editing) return <MissingChip />;
  return <>{v}</>;
}
export function Metric({ value, unitClass = "unit", style, unitStyle }: { value: string; unitClass?: "pct" | "unit"; style?: CSSProperties; unitStyle?: CSSProperties }) {
  const { num, unit } = splitMetric(value);
  return <div className="metric" style={style}>{num}{unit && <span className={unitClass} style={unitStyle}>{unit}</span>}</div>;
}
export function Copy({ content, k }: { content: SectionContent; k: string }) {
  const d = useDeck();
  const raw = content.copy?.[k] ?? "";
  if (!raw.trim()) return d.editing ? <MissingChip label="add copy" /> : null;
  return <>{fillTokens(raw, d.tokens)}</>;
}
export function SlotImage({ content, slot, style, radius = 10 }: { content: SectionContent; slot: ImageSlotDef; style?: CSSProperties; radius?: number }) {
  const d = useDeck();
  const { urls, source } = resolveSlotImages(content, slot.id);
  const s: CSSProperties = { borderRadius: radius, ...style };
  if (!urls.length) return <div className={`cs-slot empty`} style={s} data-slot={slot.id}>{d.editing && <span>{slot.label}</span>}</div>;
  return (
    <div className={`cs-slot fit-${slot.fit}`} style={s} data-slot={slot.id} data-source={source}>
      {source === "manual" && d.editing && <span className="cs-manual-tag">manual — not from Design</span>}
      {urls.map((u, i) => <img key={`${u}-${i}`} src={u} alt="" loading="eager" />)}
    </div>
  );
}
```

- [ ] **Step 6: Run → PASS.**

- [ ] **Step 7: Commit** — `deck.css`, `primitives.tsx`, its test, the two PNGs; message `feat(case-study): scoped deck stylesheet from the kit + render primitives` + trailer.

---

### Task 11: Charts

**Files:**
- Create: `src/components/case-study/kit/charts.tsx`
- Test: `src/components/case-study/kit/charts.test.tsx`

**Interfaces:**
- Consumes: Task 3 geometry; `Series`, `ChannelBlock` (Task 2); `usd`, `monthLetter`, `monthShort` (Task 2).
- Produces:

```tsx
export function SalesBars(props: { series: Series }): JSX.Element;           // Detailed slide 06
export function CumulativeCurve(props: { series: Series }): JSX.Element;     // Detailed slide 08 (series = cumulative)
export function SpendSalesLines(props: { block: ChannelBlock; gradientId: string }): JSX.Element; // Detailed slide 09
export function MonthTicks(props: { months: string[]; want: number }): JSX.Element; // html row under slide-09 charts
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SalesBars, CumulativeCurve, SpendSalesLines } from "./charts";
const series = (vals: number[]) => vals.map((value, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value }));

describe("charts", () => {
  it("SalesBars draws one rect per month with template geometry + nice axis labels", () => {
    const { container } = render(<svg><SalesBars series={series([4500, 9000, 3000])} /></svg>);
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(rects[0].getAttribute("x")).toBe("74");
    expect(rects[0].getAttribute("height")).toBe("120");
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(expect.arrayContaining(["$9.0K", "$6.0K", "$3.0K", "0", "J", "F", "M"]));
  });
  it("CumulativeCurve draws area, line and end dot", () => {
    const { container } = render(<svg><CumulativeCurve series={series([10, 30, 60])} /></svg>);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("d")).toMatch(/Z$/);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });
  it("SpendSalesLines: orange sales line, teal spend line, dot at sales peak", () => {
    const block = { spend: 3, sales: 9, orders: 1, monthly: [
      { month: "2025-01", spend: 1, sales: 2 }, { month: "2025-02", spend: 1, sales: 5 }, { month: "2025-03", spend: 1, sales: 2 }] };
    const { container } = render(<SpendSalesLines block={block} gradientId="g1" />);
    const strokes = [...container.querySelectorAll("path")].map((p) => p.getAttribute("stroke"));
    expect(strokes).toEqual(expect.arrayContaining(["#FF751F", "#5FA6B5"]));
    expect(container.querySelector("circle")?.getAttribute("cx")).toBe("455");
  });
  it("empty series renders an empty chart without throwing", () => {
    expect(() => render(<svg><SalesBars series={[]} /></svg>)).not.toThrow();
    expect(() => render(<SpendSalesLines block={{ spend: 0, sales: 0, orders: 0, monthly: [] }} gradientId="g" />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — markup mirrors the template's SVG exactly (colors, font sizes, gridline positions); only coordinates are computed.

```tsx
"use client";
import { BARS, CUMULATIVE, SPEND_SALES, niceAxisMax, axisTicks, barRects, linePoints, pathD, areaD, peakIndex, labelIndexes } from "@/lib/case-study/kit/chart-geometry";
import type { Series, ChannelBlock } from "@/lib/case-study/kit/metrics";
import { usd, monthLetter, monthShort } from "@/lib/case-study/kit/display";

const GRID = "#4A4646", AXIS = "#9FB3B6", TICK = "#CBD6D8", ORANGE = "#FF751F", TEAL = "#5FA6B5", INK = "#2A5059";
const tickLabel = (v: number) => (v === 0 ? "0" : usd(v, "detailed"));

export function SalesBars({ series }: { series: Series }) {
  const vals = series.map((s) => s.value);
  const max = niceAxisMax(Math.max(0, ...vals));
  const ticks = axisTicks(max);
  const rects = barRects(vals, max);
  const gridY = [40, 120, 200, 280];
  return (
    <svg viewBox={`0 0 ${BARS.viewW} ${BARS.viewH}`} style={{ width: "100%", flex: 1, minHeight: 0 }}>
      <g stroke={GRID} strokeWidth="1">{gridY.map((y) => <line key={y} x1={BARS.gridX1} y1={y} x2={BARS.gridX2} y2={y} />)}</g>
      <g fill={AXIS} fontFamily="Outfit" fontSize="20" textAnchor="end">
        {ticks.map((t, i) => <text key={i} x={BARS.labelX} y={gridY[i] + 6}>{tickLabel(t)}</text>)}
      </g>
      <g>{rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={ORANGE} rx="2" />)}</g>
      <g fill={TICK} fontFamily="Outfit" fontSize="19" textAnchor="middle">
        {series.map((s, i) => <text key={s.month} x={Math.round((rects[i].x + BARS.width / 2) * 10) / 10} y={BARS.monthY}>{monthLetter(s.month)}</text>)}
      </g>
    </svg>
  );
}

export function CumulativeCurve({ series }: { series: Series }) {
  const vals = series.map((s) => s.value);
  const max = niceAxisMax(Math.max(0, ...vals));
  const ticks = axisTicks(max);
  const pts = linePoints(vals, max, CUMULATIVE);
  const gridY = [40, 110, 180, 250];
  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${CUMULATIVE.viewW} ${CUMULATIVE.viewH}`} style={{ width: "100%", flex: 1, minHeight: 0 }}>
      <defs><linearGradient id="snsFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity=".30" /><stop offset="100%" stopColor={ORANGE} stopOpacity="0" /></linearGradient></defs>
      <g stroke={GRID} strokeWidth="1">{gridY.map((y) => <line key={y} x1={CUMULATIVE.x0} y1={y} x2={CUMULATIVE.x1} y2={y} />)}</g>
      <g fill={AXIS} fontFamily="Outfit" fontSize="20" textAnchor="end">
        {ticks.map((t, i) => <text key={i} x={CUMULATIVE.labelX} y={gridY[i] + 6}>{tickLabel(t)}</text>)}
      </g>
      {pts.length > 0 && <>
        <path d={areaD(pts, CUMULATIVE.yBottom)} fill="url(#snsFill)" />
        <path d={pathD(pts)} fill="none" stroke={ORANGE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={end.x} cy={end.y} r="9" fill={ORANGE} /><circle cx={end.x} cy={end.y} r="4.5" fill={INK} />
      </>}
      <g fill={AXIS} fontFamily="Outfit" fontSize="19" textAnchor="middle">
        {labelIndexes(series.length, 5).map((i) => <text key={i} x={Math.round(pts[i].x)} y={CUMULATIVE.monthY}>{monthShort(series[i].month)}</text>)}
      </g>
    </svg>
  );
}

export function SpendSalesLines({ block, gradientId }: { block: ChannelBlock; gradientId: string }) {
  const sales = block.monthly.map((m) => m.sales), spend = block.monthly.map((m) => m.spend);
  const max = Math.max(1, ...sales, ...spend) * 1.05;
  const sp = linePoints(sales, max, SPEND_SALES), pp = linePoints(spend, max, SPEND_SALES);
  const peak = peakIndex(sales);
  return (
    <svg viewBox={`0 0 ${SPEND_SALES.viewW} ${SPEND_SALES.viewH}`} preserveAspectRatio="none" style={{ width: "100%", flex: 1, minHeight: 0 }}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity=".30" /><stop offset="100%" stopColor={ORANGE} stopOpacity="0" /></linearGradient></defs>
      <g stroke={GRID} strokeWidth="1">{[40, 110, 180, 240].map((y) => <line key={y} x1={SPEND_SALES.x0} y1={y} x2={SPEND_SALES.x1} y2={y} />)}</g>
      {sp.length > 0 && <>
        <path d={areaD(sp, SPEND_SALES.yBottom)} fill={`url(#${gradientId})`} />
        <path d={pathD(pp)} fill="none" stroke={TEAL} strokeWidth="3" />
        <path d={pathD(sp)} fill="none" stroke={ORANGE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={sp[peak].x} cy={sp[peak].y} r="8" fill={ORANGE} /><circle cx={sp[peak].x} cy={sp[peak].y} r="4" fill={INK} />
      </>}
    </svg>
  );
}

export function MonthTicks({ months, want }: { months: string[]; want: number }) {
  return <>{labelIndexes(months.length, want).map((i) => <span key={i}>{monthShort(months[i])}</span>)}</>;
}
```

(Test check: 3 points across 50→860 → x = 50, 455, 860; peak index 1 → cx 455 ✓. `SalesBars` tick for axis 9000 → `usd(9000,"detailed")` = "$9.0K" ✓.)

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** — `charts.tsx` + test; message `feat(case-study): SVG charts from the Detailed template` + trailer.

---

### Tasks 12–14: Slide components — porting procedure (applies to all three)

The template HTML files are committed and are the markup source. Each slide component is a **mechanical port** of one `<section class="slide">` block. Rules:

1. Open the template, copy the slide's `<section …>…</section>` markup into the component's JSX return, converting HTML → JSX (`class`→`className`, `style="a:b; c:d"` → `style={{ a: "b", c: "d" }}` with camelCased keys and numeric px kept as strings e.g. `"96px"`, self-close `<img>`/`<br>`/`<line>` etc., `&nbsp;` → `{" "}`, SVG attrs camelCased: `stroke-width`→`strokeWidth`, `font-family`→`fontFamily`, `font-size`→`fontSize`, `text-anchor`→`textAnchor`, `stop-color`→`stopColor`, `stop-opacity`→`stopOpacity`, `stroke-linecap`→`strokeLinecap`, `stroke-linejoin`→`strokeLinejoin`).
2. Replace `<section class="slide …" data-label="X">` with `<SlideShell label="X" className="…">`.
3. Replace `<img class="mf-logo" src="assets/mf-logo.png" …>` with `<img className="mf-logo" src="/case-study/mf-logo.png" alt="market foundry" />`; mf-mark likewise `/case-study/mf-mark.png`. Replace the whole `<div class="bottombar">…</div>` with `<Bottombar />`, and any literal `NN / TT` page number text with `<PageNo />`.
4. Replace every `<image-slot id="tpl…-X" …>` with `<SlotImage content={content} slot={img("X")} style={…the slot's inline style…} radius={…radius attr, default 10; 0 for shape="rect"…} />`, where `const img = (id: string) => def.images.find((i) => i.id === id)!;` and `def = slideDef("<type>")`.
5. Replace every `[bracketed placeholder]` using the slide's **binding table** below. Nothing else changes — fixed template wording stays literal.
6. Every slide component has the signature `(props: { content: SectionContent; e: Partial<PulledMetrics>; d: Derived }) => JSX.Element` and reads format/client/period from `useDeck()`.
7. Metric values: `usd(x, fmt)` for `$`, `mult`, `pct`, `count` from `display.ts`; wrap each in `<Val v={…} missing={isMissing(e, d, "<key>")} />`. For `.metric` blocks use `<Metric value={…} unitClass="pct" | "unit" />` keeping the template's inline style. High-Level `$` values MUST go through `usd(…, "high_level")` (= band).
8. Where the template hard-codes a sample SVG chart, replace the whole `<svg>` with the Task 11 component, keeping the surrounding card markup.

After each task, the guard tests in Task 15 run over all slides.

---

### Task 12: High-Level slides (5)

**Files:**
- Create: `src/components/case-study/kit/slides-hl.tsx`
- Test: `src/components/case-study/kit/slides-hl.test.tsx`

**Interfaces:**
- Produces: `export const HL_RENDERERS: Record<HlSlideType, SlideComponent>;` and `export type SlideComponent = (p: { content: SectionContent; e: Partial<PulledMetrics>; d: Derived }) => JSX.Element;` (declare `SlideComponent` in `primitives.tsx` and import it — add the export there in this task).

**Binding tables** (template: `High Level Case Study Template.html`):

| Slide | Placeholder | Binding |
|---|---|---|
| hl_cover | `[Date range]` | `useDeck().period` |
| | `[Bold claim.]` / `[Key result.]` | `<Copy k="claim"/>` / `<Copy k="result"/>` |
| | summary paragraph | `<Copy k="summary"/>` |
| | chip 1 `[Band]` + `[KPI one · line 1]<br>[line 2]` | `usd(e.salesTotal,"high_level")` + `<Copy k="kpi1Label"/>` (single line; drop the `<br>`) |
| | chip 2 `[0.0]×` + `[KPI two]` | `mult(d.growthMultiple)` + `<Copy k="kpi2Label"/>` |
| | chip 3 `[Band]` + `[KPI three]` | `usd(e.adSales,"high_level")` + `<Copy k="kpi3Label"/>` |
| | `[CLIENT NAME]` / `[Category]` / `[Engagement]` | `useDeck().clientName` / `<Copy k="category"/>` / `<Copy k="engagement"/>` |
| | slots `tplhl-cover-hero`, `tplhl-cover-logo` | `cover-hero`, `cover-logo` |
| | `01 / 05` | `<PageNo/>` |
| hl_challenge | topbar `[CLIENT NAME]` | `clientName` |
| | headline + accent span | `<Copy k="headline"/>` + `<span style={{color:"var(--c-yellow)"}}><Copy k="headlineAccent"/></span>` |
| | body | `<Copy k="body"/>` |
| | starting-point `[Band]` + text | `usd(d.startSales,"high_level")` + `<Copy k="startLabel"/>` |
| | target `[0×]` + text | `<Copy k="targetValue"/>` + `<Copy k="targetLabel"/>` |
| hl_results | topbar `Seller Central · [Period]` | `Seller Central · {period}` |
| | `[Headline,]` | `<Copy k="headline"/>` (then the literal accent "six proof points.") |
| | KPI 1 (accent) `[Mid 7]-Fig` | `<Metric value={usd(e.salesTotal,"high_level")} unitClass="pct" unitStyle={{color:"var(--c-yellow-ink)"}} style={{fontSize:96}}/>` label `<Copy k="kpi1Label"/>` |
| | KPI 2 `[0.0]×` | `mult(d.growthMultiple)` · `kpi2Label` |
| | KPI 3 `[0.0]M` | `count(e.adImpressions)` · `kpi3Label` |
| | KPI 4 `[High 6]-Fig` | `usd(e.adSales,"high_level")` · label = `<Copy k="kpi4Label"/>` + ` · ${mult(d.roas)} ROAS` |
| | KPI 5 `[00]%` | `pct(e.buyBoxPct,0)` · `kpi5Label` |
| | KPI 6 `[0.0]%` | `pct(d.cvrPct)` · `kpi6Label` |
| hl_approach | headline + accent, body, 5 pillars | `headline`, `headlineAccent`, `body`, `pillar1..5` / `pillar1Desc..5Desc` |
| hl_creative | `[its job in one line]` | `<Copy k="bsJob"/>` |
| | `[N]-image sets … [0.0]% conversion rate` | `${heroCount}-image sets per hero ASIN — behind a ${pct(d.cvrPct)} conversion rate` where `heroCount` = number of `li1..li9` slots with images (`resolveSlotImages`) |
| | `[0] Premium modules · [00] ASINs live` | `content.creativeCounts.aplusPremiumModules` · `content.creativeCounts.aplusAsinsLive` (Design-section counts stored at pull time — Step 0) |
| | `[00]% Buy Box` | `pct(e.buyBoxPct,0)` |
| | slots `tplhl-bs`, `li1..li9`, `ap1..ap4`, `sf` | same ids minus `tplhl-` |
| | footer CTA `hello@marketfoundry.com · 05 / 05` | `{contactEmail} · <PageNo/>` |

- [ ] **Step 0: Carry A+ counts into section content.** In `src/lib/case-study/kit/slides.ts`, extend `designFor` so every section content also records creative counts: change `SectionContent` to add `creativeCounts?: { aplusPremiumModules: number | null; aplusAsinsLive: number | null }` and set it in `defaultSectionContent` and `refreshSectionContent` from `design.aplusPremiumModules/aplusAsinsLive`. Add to `slides.test.ts`: `expect(defaultSectionContent(creative, { ...design, aplusPremiumModules: 7, aplusAsinsLive: 4 }).creativeCounts).toEqual({ aplusPremiumModules: 7, aplusAsinsLive: 4 })` and in the refresh test assert counts are replaced. Run `npx vitest run src/lib/case-study/kit/slides.test.ts` → PASS. Render `[0]` / `[00]` as `content.creativeCounts?.aplusPremiumModules ?? "—"` / `…aplusAsinsLive ?? "—"` (editing: `<MissingChip/>` when null).

- [ ] **Step 1: Write the failing test** `slides-hl.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HL_RENDERERS } from "./slides-hl";
import { DeckContext, type DeckCtx } from "./primitives";
import { HL_SLIDES, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { deriveMetrics, type PulledMetrics } from "@/lib/case-study/kit/metrics";

const e: Partial<PulledMetrics> = { salesTotal: 2_345_678, adSales: 780_000, adSpend: 300_000, adImpressions: 12_400_000,
  unitsTotal: 90_000, sessions: 600_000, buyBoxPct: 97.4,
  salesMonthly: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value: 50_000 + i * 20_000 })) };
const d = deriveMetrics(e);
const ctx: DeckCtx = { format: "high_level", clientName: "Acme", period: "Jan 2025 – Dec 2025", periodShort: "2025",
  contactEmail: "hello@marketfoundry.com", editing: false, slideNo: 1, slideTotal: 5, tokens: { client: "Acme", period: "Jan 2025 – Dec 2025" } };
const design = { ...EMPTY_DESIGN_IMAGES, heroListing: ["/m", "/p1"], brandStory: ["/bs"], aplusStacks: [["/a"]], storefrontPages: [["/s"]] };
const filled = (type: string) => {
  const def = HL_SLIDES.find((s) => s.type === type)!;
  const c = defaultSectionContent(def, design);
  for (const f of def.copy) if (!c.copy[f.key]) c.copy[f.key] = `${f.key} text`;
  return c;
};
const renderSlide = (type: keyof typeof HL_RENDERERS) => {
  const S = HL_RENDERERS[type];
  return render(<DeckContext.Provider value={ctx}><div className="cs-deck"><S content={filled(type)} e={e} d={d} /></div></DeckContext.Provider>).container;
};

describe("High-Level slides", () => {
  it.each(HL_SLIDES.map((s) => s.type))("%s renders with a full fixture: no brackets, no raw $ figures", (type) => {
    const html = renderSlide(type as keyof typeof HL_RENDERERS).innerHTML;
    expect(html).not.toMatch(/\[[^\]]*\]/);
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\$\s?\d/);
  });
  it("banded values appear", () => {
    expect(renderSlide("hl_results").textContent).toContain("Low 7");
    expect(renderSlide("hl_cover").textContent).toContain("Low 7-Fig");
  });
  it("creative slide wires Design images and CVR", () => {
    const c = renderSlide("hl_creative");
    expect(c.querySelector('[data-slot="li1"] img')?.getAttribute("src")).toBe("/m");
    expect(c.querySelector('[data-slot="bs"] img')?.getAttribute("src")).toBe("/bs");
    expect(c.textContent).toContain("2-image sets");
    expect(c.textContent).toContain("15.0%");
  });
  it("renders with an all-missing fixture without throwing", () => {
    for (const s of HL_SLIDES) {
      const S = HL_RENDERERS[s.type as keyof typeof HL_RENDERERS];
      expect(() => render(<DeckContext.Provider value={{ ...ctx, editing: true }}>
        <S content={defaultSectionContent(s, EMPTY_DESIGN_IMAGES)} e={{}} d={deriveMetrics({})} /></DeckContext.Provider>)).not.toThrow();
    }
  });
  it("a {total} token typed into High-Level copy cannot leak an exact figure (tokens omit total)", () => {
    const c = filled("hl_cover"); c.copy.summary = "We hit {total}.";
    const S = HL_RENDERERS.hl_cover;
    const html = render(<DeckContext.Provider value={ctx}><S content={c} e={e} d={d} /></DeckContext.Provider>).container.textContent!;
    expect(html).toContain("{total}");
    expect(html).not.toMatch(/\$\d/);
  });
});
```

(Fixture CVR = 90,000 / 600,000 = 15.0% ✓; salesTotal 2,345,678 → "Low 7-Fig" ✓.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `slides-hl.tsx`** following the porting procedure and the binding table. Worked example — `hl_challenge` in full (the other four follow the same pattern):

```tsx
"use client";
import { SlideShell, Topbar, Bottombar, Copy, Val, Metric, PageNo, SlotImage, MissingChip, useDeck, type SlideComponent } from "./primitives";
import { slideDef, resolveSlotImages, type HlSlideType } from "@/lib/case-study/kit/slides";
import { usd, mult, pct, count } from "@/lib/case-study/kit/display";
import { isMissing } from "@/lib/case-study/kit/metrics";

const Y = { color: "var(--c-yellow)" } as const;
const TopLabel = ({ text }: { text: string }) => <><span style={{ color: "var(--c-yellow)", fontWeight: 700 }}>■</span>{"  "}{text}</>;

const Challenge: SlideComponent = ({ content, d }) => {
  const { clientName } = useDeck();
  return (
    <SlideShell label="The Challenge">
      <div className="slide-frame">
        <Topbar left={<TopLabel text="The Challenge" />} right={clientName} />
        <div style={{ display: "flex", flexDirection: "column", gap: 36, marginTop: 60, flex: 1, justifyContent: "center" }}>
          <h1 className="title-lg" style={{ fontSize: 84, maxWidth: "26ch" }}>
            <Copy content={content} k="headline" /><br /><span style={Y}><Copy content={content} k="headlineAccent" /></span>
          </h1>
          <p className="body lg" style={{ maxWidth: "62ch", color: "var(--c-mute-2)" }}><Copy content={content} k="body" /></p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 12 }}>
            <div className="card" style={{ padding: "40px 44px" }}>
              <div className="chan sc" style={{ marginBottom: 24 }}><i />The starting point</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 56, lineHeight: 1, color: "var(--c-white)" }}>
                <Val v={usd(d.startSales, "high_level")} missing={d.startSales === null} />
              </div>
              <div style={{ fontSize: 24, color: "var(--c-mute-2)", marginTop: 14 }}><Copy content={content} k="startLabel" /></div>
            </div>
            <div className="card" style={{ padding: "40px 44px", borderColor: "rgba(255,117,31,.35)" }}>
              <div className="chan sc" style={{ marginBottom: 24 }}><i />The target</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 56, lineHeight: 1, color: "var(--c-yellow)" }}>
                <Copy content={content} k="targetValue" />
              </div>
              <div style={{ fontSize: 24, color: "var(--c-mute-2)", marginTop: 14 }}><Copy content={content} k="targetLabel" /></div>
            </div>
          </div>
        </div>
        <Bottombar />
      </div>
    </SlideShell>
  );
};

// Cover, Results, Approach, Creative: port lines 161–201, 228–242, 245–261, 264–308 of the template per the binding table.

export const HL_RENDERERS: Record<HlSlideType, SlideComponent> = {
  hl_cover: Cover, hl_challenge: Challenge, hl_results: Results, hl_approach: Approach, hl_creative: Creative,
};
```

The template line ranges to port: Cover 161–201, Challenge 204–225, Results 228–242, Approach 245–261, Creative 264–308. In Creative, the orange CTA band's mf-mark keeps `style={{ filter: "brightness(0)" }}`; its right text becomes `{contactEmail}{" · "}<PageNo />`.

- [ ] **Step 4: Run → PASS.** `npx vitest run src/components/case-study/kit/slides-hl.test.tsx src/lib/case-study/kit/slides.test.ts`

- [ ] **Step 5: Commit** — `slides-hl.tsx`, test, `primitives.tsx` (SlideComponent export), `slides.ts` + test (creativeCounts); message `feat(case-study): High-Level slides ported from the kit template` + trailer.

---

### Task 13: Detailed slides 1–5 and 14

**Files:**
- Create: `src/components/case-study/kit/slides-detailed-a.tsx`
- Test: `src/components/case-study/kit/slides-detailed-a.test.tsx`

**Interfaces:** Produces `export const DETAILED_A: Pick<Record<DetailedSlideType, SlideComponent>, "cover" | "brief" | "results" | "snapshot" | "approach" | "next_steps">;`

**Binding tables** (template: `Detailed Case Study Template.html`; find each slide by its `data-label`):

| Slide | Placeholder | Binding |
|---|---|---|
| cover | `[Date range]` · `[Positioning line · one phrase]` · `[Bold claim.]` | `period` · `positioning` · `claim` |
| | `[CLIENT NAME] [did what]` | `{clientName} <Copy k="didWhat"/>` |
| | summary · `[Category]` · `[Short client or positioning quote.]` | `summary` · `category` · `quote` (hide the quote element when empty and not editing) |
| | slots `tpl-cover-hero`, `tpl-cover-logo` | `cover-hero`, `cover-logo` |
| brief | topbar `[CLIENT NAME]` | `clientName` |
| | `[Line one.]` / `[Line]` `[two.]` / `[Line three.]` | `line1` / `line2` + orange `line2Accent` / `line3` |
| | situation paragraph, starting point, deliverables | `situation`, `startingPoint`, `deliverables` |
| | `[0.0×]` + `[The single target that defined success]` | `targetValue` + `targetLabel` |
| results | topbar right `[Scope · period]` | `<Copy k="scope"/>` |
| | `[Headline,` six `proof points.]` | `<Copy k="headline"/>` + the literal orange "six" + " proof points." |
| | `· [Date range].` | `period` |
| | KPI1 `$[0.0]M` · label · hint | `usd(e.salesTotal,"detailed")` · `kpi1Label` · `kpi1Hint` |
| | KPI2 `[000]K` | `mult(d.growthMultiple)` · `kpi2Label` · hint as `<span className="kpi-up"><Copy k="kpi2Hint"/></span>` (template's delta chip lives on KPI 4 — keep the chip on the growth KPI only) |
| | KPI3 `$[000]K` | `count(e.adImpressions)` · `kpi3Label` · `kpi3Hint` |
| | KPI4 `[0.0]×` | `usd(e.adSales,"detailed")` · `kpi4Label` · hint defaults to `${mult(d.roas)} ROAS` when `kpi4Hint` is empty |
| | KPI5 `[00]%` · KPI6 `[00]%` | `pct(e.buyBoxPct,0)` · `pct(d.cvrPct)` with labels/hints 5, 6 |
| snapshot | topbar `[CLIENT NAME] · [period]`; body | `clientName · period`; `body` |
| | `[Period]` (card) | `period` |
| | `$[0.0]M` + `[Headline]<br>[context]` | `usd(e.salesTotal,"detailed")` + `headlineLabel` / `headlineContext` |
| | Units sold `[000,000]` · Avg unit price `$[00.00]` · Active ASINs `[00]` · Page views `[value]` | `count(e.unitsTotal)` · `d.asp` as `$${d.asp.toFixed(2)}` (or "—") · `count(e.skuCount)` · `count(e.pageViews)` |
| | Fulfilment `FBA` (hard-coded in template) | `e.fulfilment`; **omit the whole row when missing** (Deviation 5) |
| | engine line | `engineLine` |
| | Sessions `[000]K` `[Period]` · Conversion `[00]%` · Buy Box `[00]%` · ROAS `[0.0]×` | `count(e.sessions)` `period` · `pct(d.cvrPct)` · `pct(e.buyBoxPct,0)` · `mult(d.roas)` |
| approach | body, 5 pillars | `body`, `pillar1..5`, `pillar1Desc..5Desc` |
| next_steps | `hello@marketfoundry.com` (both) · page no. | `contactEmail` · `<PageNo/>`; everything else literal |

- [ ] **Step 1: Write the failing test** — same structure as Task 12's test, with `format: "detailed"`, `slideTotal: 14`, `tokens` including `total: "$2,345,678"`, iterating over `["cover","brief","results","snapshot","approach","next_steps"]`, asserting: no `[…]` brackets; `results` text contains `$2.3M` and `97%`; `snapshot` shows `FBA` when `e.fulfilment = "FBA"` and has no "Fulfilment" text when `e.fulfilment` is undefined; `next_steps` contains `hello@marketfoundry.com` and `14 / 14` (set `slideNo: 14`); all-missing fixture renders without throwing.

```tsx
it("snapshot omits the Fulfilment row when master has no value", () => {
  const without = renderSlide("snapshot", { ...e, fulfilment: undefined }).textContent!;
  expect(without).not.toContain("Fulfilment");
  expect(renderSlide("snapshot", { ...e, fulfilment: "FBA" }).textContent).toContain("FBA");
});
```

(`renderSlide(type, metrics = e)` variant of the Task 12 helper.)

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** per procedure + table. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — message `feat(case-study): Detailed slides 1–5 and 14` + trailer.

---

### Task 14: Detailed slides 6–13

**Files:**
- Create: `src/components/case-study/kit/slides-detailed-b.tsx` (6–9), `src/components/case-study/kit/slides-detailed-c.tsx` (10–13)
- Test: `src/components/case-study/kit/slides-detailed-bc.test.tsx`

**Interfaces:** Produces `DETAILED_B` (`sales_growth`, `product_mix`, `demand_curve`, `paid_media`) and `DETAILED_C` (`brand_story`, `listing_images`, `aplus`, `storefront`), same `SlideComponent` signature.

**Binding tables:**

| Slide | Placeholder | Binding |
|---|---|---|
| sales_growth | topbar `[Metric · period]` | `<Copy k="topRight"/>` |
| | `$[0.0]M` (title) | `usd(e.salesTotal,"detailed")` |
| | body with `$[0,000,000]` | `<Copy k="body"/>`; `{total}` token = `usdExact(e.salesTotal)` (DeckView sets it, Task 15) |
| | organic `$[000]K` · `[00]%` | `usd(d.organicSales,"detailed")` · `pct(d.organicPct,0)` |
| | ad `$[000]K` · `[00]%` | `usd(e.adSales,"detailed")` · `pct(d.adPct,0)` |
| | `$[00].00` Avg unit price | `$${d.asp.toFixed(2)}` split as `$NN` + `.NN` span, "—" when null |
| | `[0.0]K` Units sold | `count(e.unitsTotal)` |
| | legend `[Headline metric]` | `usd(e.salesTotal,"detailed")` |
| | `<svg viewBox="0 0 880 380">` | `<SalesBars series={e.salesMonthly ?? []}/>` |
| | caption `[Date range]` | `period` |
| product_mix | headline / accent / body | `headline` / `headlineAccent` / `body` |
| | 3 revenue rows `[Product one]` `$[000]K` + bar | `e.topByRevenue[i].title` (truncate to 42 chars with "…") + `usd(value,"detailed")`; inner bar width = `value / topByRevenue[0].value × 100%` (keep template bar styles) |
| | `[Top ASINs] = [00]% of revenue` | `Top ${n} ASINs = <strong>${pct(d.top3RevenueSharePct,0)}</strong> of revenue` |
| | 3 unit rows | `e.topByUnits[i]` with `count(value)` |
| | `[0,000] units across [0] SKUs` | `count(e.unitsTotal)` · `count(e.skuCount)` |
| | fewer than 3 products | render only the rows that exist |
| demand_curve | topbar `Cumulative sales · [period]` | `period` |
| | `[From zero to $[00]K, steadily.]` | `<Copy k="headline"/><br/><span style={Y}>{usd(d.cumulative.at(-1)?.value,"detailed")}</span><Copy k="headlineTail"/>` |
| | body | `body` |
| | Peak card `[Peak month — $[0.0]K ordered sales]` | `${monthShort(d.peakMonth)} ${d.peakMonth.slice(0,4)} — <strong>${usd(d.peakSales,"detailed")}</strong> ordered sales` |
| | Base card `[H2 base — $[0.0]K / month — ▲ +[00]% vs H1]` | `H2 base — <strong>${usd(d.h2AvgSales)}</strong> / month — <strong>${d.h2VsH1Pct >= 0 ? "▲ +" : "▼ "}${pct(|d.h2VsH1Pct|,0)}</strong> vs H1`; missing chip when null |
| | `$[00.0]K` + `▲ full year` | `usd(d.cumulative.at(-1)?.value,"detailed")` |
| | `<svg viewBox="0 0 880 340">` | `<CumulativeCurve series={d.cumulative}/>` |
| paid_media | body | `body` |
| | `$[000]K in ad-attributed sales on $[00]K spend — a [0.0]× blended ROAS` | `usd(e.adSales)` · `usd(e.adSpend)` · `mult(d.roas)` |
| | SP card Spend/Sales/ACOS/Orders | `usd(e.paidSp.spend)` / `usd(e.paidSp.sales)` / `pct(d.spAcos,0)` / `count(e.paidSp.orders)` |
| | SP `<svg>` | `<SpendSalesLines block={e.paidSp} gradientId="ppcSp"/>`; month row `<MonthTicks months={e.paidSp.monthly.map(m=>m.month)} want={6}/>` |
| | SB+SD card | same with `e.paidSbSd`, `d.sbSdAcos`, `gradientId="ppcSbSd"` |
| | channel block missing | card body shows `<MissingChip/>` (editing) / "—" values (export) and no chart |
| brand_story | `[CLIENT NAME]` in body | `clientName` |
| | slot `tpl-bs-hero` | `bs-hero` |
| listing_images | `[00]% conversion rate` | `pct(d.cvrPct)` |
| | "A full 9-image set" | `A full ${heroCount}-image set` (heroCount = filled `li-*` slots) |
| | slots `tpl-li-main`, `tpl-li-2..9` | `li-main`, `li-2..li-9` |
| aplus | `[0]` Premium modules · `[0]` ASINs live | `content.creativeCounts?.aplusPremiumModules` · `…aplusAsinsLive` ("—"/chip when null) |
| | 12 slots `tpl-ap-1..4`, `tpl-ap-b1..b4`, `tpl-ap-c1..c4` | same ids minus `tpl-` |
| storefront | slots `tpl-sf-a1`, `tpl-sf-b1`, `tpl-sf-c1` | `sf-a1`, `sf-b1`, `sf-c1` (fit width, top) |

- [ ] **Step 1: Write the failing test** `slides-detailed-bc.test.tsx` — same harness; fixture adds `topByRevenue` (3 rows), `topByUnits`, `paidSp`/`paidSbSd` with 12 monthly points, `skuCount: 24`, `pageViews: 1_200_000`. Assert for every slide: no `[…]` brackets; `sales_growth` contains `$2.3M` and, with `tokens.total = "$2,345,678"` and body `"Total {total}."`, contains `Total $2,345,678.`; `product_mix` shows the three titles and `24`; `paid_media` renders 2 `<svg>`; `demand_curve` renders 1 `<svg>` and the peak month text; with `paidSbSd` undefined `paid_media` renders only 1 `<svg>` and does not throw; `storefront` has `[data-slot="sf-a1"]`; all-missing fixture renders without throwing for all 8.

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** both files per procedure + table. **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — message `feat(case-study): Detailed slides 6–13 (charts + creative)` + trailer.

---

### Task 15: Deck view + render guards

**Files:**
- Create: `src/components/case-study/kit/deck-view.tsx`
- Test: `src/components/case-study/kit/deck-view.test.tsx`

**Interfaces:**
- Consumes: all renderers (Tasks 12–14), `KitCaseStudy` (Task 5), primitives (Task 10).
- Produces:

```tsx
export function DeckView(props: {
  cs: KitCaseStudy; editing: boolean; print?: boolean;
  onEditSlide?: (sectionId: string) => void;
}): JSX.Element;
export const RENDERERS: Record<SlideType, SlideComponent>;
```

Behaviour: imports `./deck.css`; root `<div className={`cs-deck ${outfit.className}`} data-case-study-ready={allImagesSettled ? "" : undefined}>`; computes `e = effective(cs.metrics)`, `d = deriveMetrics(e)`, tokens `{ client, period }` plus `total: usdExact(e.salesTotal)` **only when `cs.format === "detailed"`**; renders `cs.sections` in `sortOrder`, each wrapped in a `DeckContext.Provider` with `slideNo = index+1`, `slideTotal = sections.length`. Screen mode: each slide sits in a wrapper whose width tracks the container (ResizeObserver) and applies `transform: scale(w/1920)` with wrapper height `1080*scale`; an edit pencil button (`data-edit-pencil`, `aria-label="Edit slide"`) calls `onEditSlide(section.id)` when provided. Print mode (`print`): no scaling, no pencils, each slide followed by `style={{ breakAfter: "page" }}`. `data-case-study-ready` is set once every `<img>` inside has fired `load` or `error` (count via `onLoad`/`onError` capture on the root; if there are zero images, ready immediately after mount).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "outfit" }) }));
import { DeckView } from "./deck-view";
import { slidesFor, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { emptyMetrics } from "@/lib/case-study/kit/metrics";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";

const make = (format: "high_level" | "detailed", auto: Record<string, unknown> = {}): KitCaseStudy => {
  const metrics = emptyMetrics("2025-01-01", "2025-12-31");
  metrics.auto = auto;
  return { id: "cs", clientIdCode: "A_SC_US", clientName: "Acme", title: "t", format, stage: "drafting", ownerId: null, ownerName: null,
    sentAt: null, dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", clientSector: "", contactEmail: "hello@marketfoundry.com",
    metrics, updatedAt: "", sections: slidesFor(format).map((def, i) => ({ id: `s${i}`, sectionType: def.type, sortOrder: i,
      content: defaultSectionContent(def, EMPTY_DESIGN_IMAGES) })) };
};

describe("DeckView", () => {
  it("renders 5 / 14 slides with computed page numbers", () => {
    expect(render(<DeckView cs={make("high_level")} editing={false} />).container.querySelectorAll("section.slide")).toHaveLength(5);
    const det = render(<DeckView cs={make("detailed")} editing={false} />).container;
    expect(det.querySelectorAll("section.slide")).toHaveLength(14);
    expect(det.textContent).toContain("14 / 14");
  });
  it("High-Level never gets the {total} token", () => {
    const cs = make("high_level", { salesTotal: 4_321_000 });
    cs.sections[0].content.copy.summary = "We hit {total}.";
    const text = render(<DeckView cs={cs} editing={false} />).container.textContent!;
    expect(text).toContain("{total}");
    expect(text).not.toMatch(/\$\s?4,321/);
  });
  it("pencil calls onEditSlide; print mode has none", () => {
    const onEdit = vi.fn();
    const c = render(<DeckView cs={make("high_level")} editing onEditSlide={onEdit} />).container;
    fireEvent.click(c.querySelector("[data-edit-pencil]")!);
    expect(onEdit).toHaveBeenCalledWith("s0");
    expect(render(<DeckView cs={make("high_level")} editing={false} print />).container.querySelector("[data-edit-pencil]")).toBeNull();
  });
  it("ready flag is set when there are no images", () => {
    expect(render(<DeckView cs={make("high_level")} editing={false} print />).container.querySelector("[data-case-study-ready]")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS**, then the full kit suite: `npx vitest run src/lib/case-study/kit src/components/case-study/kit` and tsc filtered to `case-study/kit` → none.
- [ ] **Step 5: Commit** — message `feat(case-study): deck view with scaling, print mode, readiness flag` + trailer.

---

### Task 16: Builder page + catalog-driven editor

**Files:**
- Rewrite: `src/app/clients/[clientIdCode]/case-study/page.tsx`
- Modify: `src/app/clients/[clientIdCode]/case-study/page-meta.tsx` (only if it references removed types)
- Create: `src/components/case-study/kit/slide-editor.tsx`, `src/components/case-study/kit/create-deck-dialog.tsx`
- Test: `src/components/case-study/kit/slide-editor.test.tsx`

**Interfaces:**
- Consumes: APIs from Tasks 8–9; `DeckView` (Task 15); `slideDef`, `resolveSlotImages`, `SCALAR_KEYS`, `STAGE_LABELS`, `canTransition`.
- Produces:

```tsx
export function SlideEditor(props: {
  cs: KitCaseStudy; sectionId: string; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void; readOnly: boolean;
}): JSX.Element; // Sheet drawer
export function CreateDeckDialog(props: { clientIdCode: string; format: DeckFormat; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }): JSX.Element;
```

Page behaviour (`?format=high_level|detailed`, default `detailed`; `?print=1` → `<DeckView print editing={false}/>` only):
- Loads `GET /api/case-studies?clientIdCode=&format=`; if `null` → empty state "No {High-Level|Detailed} case study yet" + **Create** (opens `CreateDeckDialog`: two `YYYY-MM-DD` date inputs defaulting to the last 12 full months — start = first day of the month 12 months before the current month, end = last day of last month — computed as strings; submit → POST; show "No Intentwise account linked — every number will need data" when `noAccount`).
- Header: client name · format toggle (links to `?format=` sibling) · stage chip + a select of **allowed next stages only** (`canTransition`) → `PATCH {stage}`; a 409 shows the returned blockers list in a dialog · owner select (hub staff list from `GET /api/team` — verify the route with `ls src/app/api/team` and use its response shape; if unsuitable, show owner name read-only and set owner to the current user on Create) · **Refresh data** (confirm: "Re-pull numbers from Redshift and images from Design? Your overrides, copy and manual images are kept.") · **Export PDF** (link to `/api/case-studies/[id]/pdf`, disabled unless stage is `approved` or `sent`, tooltip "Approve the deck first").
- Banner when `metrics.failed.length` ("Redshift didn't return: account, products…  — try Refresh data") and when blockers exist (count + expandable list from `GET /api/case-studies/[id]`'s `blockers`).
- Body: `<DeckView cs editing onEditSlide={openEditor}/>`.
- Viewer role: no Create/Refresh/stage/edit controls (`readOnly`).

`SlideEditor` sections (one drawer per slide):
1. **Copy** — for each `CopyField` of `slideDef(section.sectionType)`: `TextField`/`TextareaField` from the legacy `section-editor/field-controls.tsx` (move `TextField` and `TextareaField` into `slide-editor.tsx` since Task 19 deletes that file). Help text under the drawer title: "Tokens: {client}, {period}" (+ ", {total}" on Detailed).
2. **Numbers on this slide** — for each metric key of the slide that is in `SCALAR_KEYS`: row with label, the Redshift value (`auto`, formatted), origin tag (`Redshift` / `Manual override` / `Missing`), an input for an override, **Save** (PATCH metrics) and **Clear** (PATCH `value: null`). Derived metrics show their computed value read-only with "calculated from …". Series/table metrics show "From Redshift — not editable" with a count.
3. **Images** — for each `ImageSlotDef`: thumbnail of the resolved image, source tag (`From Design` / `Manual — not from Design` / `Missing`); a collapsed `<details>` "Image missing from Design? (emergency only)" containing a URL input + Save (PATCH `manualImages: { [slot]: [url] }`) and, when a manual image is set, **Remove manual image** (PATCH `manualImages: { [slot]: [] }`); when both Design and manual exist, a **Use Design image** button (same as Remove).
- One **Save copy** button PATCHes `{ copy }` for the whole slide.

- [ ] **Step 1: Write the failing test** `slide-editor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SlideEditor } from "./slide-editor";
import { slidesFor, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { emptyMetrics } from "@/lib/case-study/kit/metrics";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }); vi.stubGlobal("fetch", fetchMock); });

const cs = (): KitCaseStudy => {
  const metrics = emptyMetrics("2025-01-01", "2025-12-31");
  metrics.auto = { sessions: 1000 };
  const defs = slidesFor("detailed");
  return { id: "cs", clientIdCode: "A", clientName: "Acme", title: "t", format: "detailed", stage: "drafting", ownerId: null, ownerName: null,
    sentAt: null, dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", clientSector: "", contactEmail: "", metrics, updatedAt: "",
    sections: defs.map((def, i) => ({ id: `s${i}`, sectionType: def.type, sortOrder: i, content: defaultSectionContent(def, { ...EMPTY_DESIGN_IMAGES, heroListing: ["/m"] }) })) };
};

describe("SlideEditor", () => {
  it("renders the slide's copy fields and saves them", async () => {
    render(<SlideEditor cs={cs()} sectionId="s0" open onOpenChange={() => {}} onSaved={() => {}} readOnly={false} />);
    fireEvent.change(screen.getByLabelText("Bold claim"), { target: { value: "Big win" } });
    fireEvent.click(screen.getByRole("button", { name: /save copy/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/case-studies/cs/sections/s0", expect.objectContaining({ method: "PATCH" })));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).copy.claim).toBe("Big win");
  });
  it("shows Redshift value and saves a numeric override", async () => {
    render(<SlideEditor cs={cs()} sectionId="s3" open onOpenChange={() => {}} onSaved={() => {}} readOnly={false} />); // snapshot
    expect(screen.getByText(/1,000/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/override sessions/i), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: /save sessions/i }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ key: "sessions", value: 1500 }));
  });
  it("manual image input lives behind the emergency disclosure and tags the source", () => {
    render(<SlideEditor cs={cs()} sectionId="s0" open onOpenChange={() => {}} onSaved={() => {}} readOnly={false} />);
    expect(screen.getAllByText(/from design/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/emergency only/i).length).toBeGreaterThan(0);
  });
  it("read-only hides save buttons", () => {
    render(<SlideEditor cs={cs()} sectionId="s0" open onOpenChange={() => {}} onSaved={() => {}} readOnly />);
    expect(screen.queryByRole("button", { name: /save copy/i })).toBeNull();
  });
});
```

(Inputs must use `<Label htmlFor>` + `id` so `getByLabelText` works; override inputs get `aria-label={`Override ${key}`}` and save buttons `aria-label={`Save ${key}`}`.)

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** `slide-editor.tsx`, `create-deck-dialog.tsx`, rewrite `page.tsx`. Read `DESIGN.md` first for header/drawer styling; use existing `@/components/ui/*` (Sheet, Button, Badge, Select, Dialog, Input, Textarea, Label). **Step 4: Run → PASS**; tsc filtered to the touched files → none.
- [ ] **Step 5: Commit** — message `feat(case-study): builder page, create dialog, catalog-driven slide editor` + trailer.

---

### Task 17: Tracker page + navigation

**Files:**
- Create: `src/app/case-studies/page.tsx`, `src/components/case-study/kit/tracker-table.tsx`
- Modify: `src/components/layout/top-nav.tsx` (Design group items ~line 224–230; `guessSection` ~line 84–90)
- Test: `src/components/case-study/kit/tracker-table.test.tsx`

**Interfaces:**
- Consumes: `GET /api/case-studies` → `TrackerRow[]`; `STAGE_LABELS`.
- Produces: `export function TrackerTable(props: { rows: TrackerRow[] }): JSX.Element` with client-side filters (stage incl. "Not started", format, owner, "has blockers") and a summary line.

Cell content: stage chip (colour per stage; "Not started" muted), owner name, `formatPeriod(start,end)`, "Updated {relative}", a `!{n}` blockers badge when `blockers > 0`, an amber `{n} manual` badge when `manualImages > 0`. Every cell links to `/clients/{code}/case-study?format={high_level|detailed}` (a "Not started" cell reads "Create").

Summary line: for each format, counts by stage, e.g. `High-Level — 3 sent · 1 approved · 2 in review · 4 drafting · 9 not started`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackerTable } from "./tracker-table";
import type { TrackerRow } from "@/lib/case-study/kit/types";

const cellOf = (stage: "drafting" | "sent", extra = {}) => ({ id: "x", stage, ownerName: "Sam", dateRangeStart: "2025-01-01",
  dateRangeEnd: "2025-12-31", updatedAt: "2026-09-28T00:00:00Z", blockers: 0, manualImages: 0, ...extra });
const rows: TrackerRow[] = [
  { clientIdCode: "A_SC_US", clientName: "Alpha", highLevel: cellOf("sent"), detailed: null },
  { clientIdCode: "B_SC_US", clientName: "Beta", highLevel: null, detailed: cellOf("drafting", { blockers: 3, manualImages: 2 }) },
];

describe("TrackerTable", () => {
  it("one row per client, links to the builder per format, Create for empty cells", () => {
    render(<TrackerTable rows={rows} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /create/i })[0].getAttribute("href")).toBe("/clients/A_SC_US/case-study?format=detailed");
    expect(screen.getByRole("link", { name: /sent/i }).getAttribute("href")).toBe("/clients/A_SC_US/case-study?format=high_level");
  });
  it("shows blockers and manual-image badges", () => {
    render(<TrackerTable rows={rows} />);
    expect(screen.getByText("!3")).toBeTruthy();
    expect(screen.getByText("2 manual")).toBeTruthy();
  });
  it("summary counts by stage per format", () => {
    render(<TrackerTable rows={rows} />);
    expect(screen.getByText(/High-Level — 1 sent · 1 not started/)).toBeTruthy();
    expect(screen.getByText(/Detailed — 1 drafting · 1 not started/)).toBeTruthy();
  });
  it("stage filter narrows rows", () => {
    render(<TrackerTable rows={rows} />);
    fireEvent.change(screen.getByLabelText(/stage/i), { target: { value: "sent" } });
    expect(screen.queryByText("Beta")).toBeNull();
  });
});
```

(Summary lists only non-zero stages, in the order sent · approved · in review · drafting · not started. Use a native `<select aria-label="Stage">` for the filter so the test can drive it.)

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** the table, the page (client component: fetch `/api/case-studies`, loading + error states, heading "Case Studies", subtitle "Every active client · High-Level and Detailed"), and nav: add `{ title: "Case Studies", href: "/case-studies", icon: Presentation, visible: isHubStaff(role) }` to the Design items (import `Presentation` from `lucide-react` and `isHubStaff` from `@/lib/roles`; match how `top-nav.tsx` already derives the role — `grep -n "isAdmin =" src/components/layout/top-nav.tsx`), and `if (pathname.startsWith("/case-studies")) return "Case Studies";` in `guessSection`. Read `DESIGN.md` before styling. **Step 4: Run → PASS**; tsc filtered → none.
- [ ] **Step 5: Commit** — message `feat(case-study): /case-studies tracker + Design nav entry` + trailer.

---

### Task 18: PDF export rework

**Files:**
- Modify: `src/app/api/case-studies/[id]/pdf/route.ts`
- Test: `src/app/api/case-studies/[id]/pdf/route.test.ts`

**Interfaces:** `GET /api/case-studies/[id]/pdf` → PDF; 409 unless stage is `approved` or `sent`; on success from `approved`, sets `stage='sent', sent_at=now()`.

Changes to the existing handler (keep `resolveExecPath`, `resolveChromiumArgs`, cookie forwarding):
- Load via `loadCaseStudy(id)`; 404 if null; 409 `{ error: "Approve the deck before exporting" }` unless `approved|sent`.
- `url = …/clients/${cs.clientIdCode}/case-study?format=${cs.format}&print=1`.
- `page.setViewport({ width: 1920, height: 1080 })`; `waitForSelector("[data-case-study-ready]", { timeout: 45000 })`; `page.pdf({ width: "1920px", height: "1080px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true })`. Add to `deck.css`: `@media print{@page{size:1920px 1080px;margin:0}.cs-deck section.slide{break-after:page}}`.
- Filename: `${cs.clientName} - ${cs.format === "high_level" ? "High-Level" : "Detailed"} Case Study.pdf`, with `/[^\w\s.-]/g` stripped, sent as `filename*=UTF-8''<encoded>` plus an ASCII `filename=`.
- After a successful PDF: `if (cs.stage === "approved") await db.execute(sql\`UPDATE case_studies SET stage='sent', sent_at=now(), updated_at=now() WHERE id=${id}\`)`.
- `maxDuration = 120`.

- [ ] **Step 1: Write the failing test** — mock `puppeteer-core` (`default.launch` → `{ newPage: () => ({ setViewport, setCookie, goto, waitForSelector, pdf: () => Buffer.from("%PDF") }), close }`), `@/lib/chromium-lambda-env`, `fs.existsSync → true`, `load`, `db.execute`. Assert: drafting → 409; approved → 200 with `content-type: application/pdf`, `pdf` called with `width: "1920px"`, goto URL contains `format=high_level&print=1`, and an UPDATE containing `sent` executed; already `sent` → 200 and no UPDATE.

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — message `feat(case-study): 16:9 one-slide-per-page PDF, sets stage to Sent` + trailer.

---

### Task 19: Remove the legacy builder

**Files (delete with `git rm`):**
- `src/components/case-study/case-study-view.tsx`, `case-study-view.test.tsx`, `case-study-tokens.tsx`, `case-study-charts.tsx`, `case-study-generate-modal.tsx`
- `src/components/case-study/sections/` (all files), `src/components/case-study/section-editor/` (all files)
- `src/lib/case-study/generate.ts`, `generate.test.ts`, `narrative.ts`, `narrative.test.ts`, `evidence.ts`, `evidence.test.ts`, `work-signals.ts`, `work-signals.test.ts`, `drive-screenviews.ts`, `drive-screenviews.test.ts`, `format.ts`, `format.test.ts`
- `src/lib/case-study/queries/` (all files)
- `src/app/api/case-studies/[id]/redraft/route.ts`
- `src/app/portal/case-study/page.tsx`
- `scripts/_tmp-cs-redshift-columns.ts`, `scripts/_tmp-cs-plan-probe.ts` (read-only probes from planning, if still present in the worktree)

**Modify:**
- `src/lib/case-study/types.ts` — delete every legacy type; keep only `AplusScreenview` and `AplusScreenviewResult` (used by `aplus-screenviews.ts`). Or move those two into `aplus-screenviews.ts` and delete `types.ts`; either way `grep -rn "case-study/types" src` must end empty or only point at the kept types.
- `src/components/portal/admin-preview-toggle.tsx` — remove the `"case-study": "design",` entry (line ~34).
- `src/app/clients/[clientIdCode]/layout.tsx` — keep the "Case Study" tab (`/case-study`) — it opens the builder.
- Portal nav: `grep -rn "portal/case-study" src` and remove any link to the deleted page.

- [ ] **Step 1: Find every importer before deleting**

Run: `grep -rln "case-study/\(generate\|narrative\|evidence\|work-signals\|drive-screenviews\|format\|queries\|types\)\|components/case-study/\(case-study-\|sections\|section-editor\)" src scripts | sort`
Expected: only files in the delete list, `aplus-screenviews.ts` (types import) and files rewritten in Tasks 8–18. Anything else → stop and report.

- [ ] **Step 2: Delete and edit** as listed (`git rm -r <dir>`, `git rm <file>`; Edit for modifications).

- [ ] **Step 3: Verify**

Run: `grep -rn "case-study/types\|portal/case-study\|redraft\|case-study-tokens\|section-editor" src | grep -v "^src/lib/case-study/aplus-screenviews"` → no output.
Run: `npx vitest run src/lib/case-study src/components/case-study src/app/api/case-studies` → all PASS.
Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | cut -d'(' -f1 | sort -u` → identical to the Task 1 Step 0 baseline list.
Run: `npx eslint src/lib/case-study src/components/case-study src/app/case-studies src/app/api/case-studies "src/app/clients/[clientIdCode]/case-study"` → 0 errors.

- [ ] **Step 4: Commit** — pathspecs every deleted and modified path; message `refactor(case-study): remove legacy 13-section builder, portal page and AI redraft` + trailer.

---

### Task 20: End-to-end verification (browser)

**Prerequisites (Manu):** (1) migration 0120 applied (Task 5 Step 8); (2) the env file copied into the worktree — Claude cannot (hook-blocked). One command for Manu:

```bash
cp /Users/manu/MFHub/.env.local /Users/manu/MFHub/.worktrees/thread-ab-case-study/.env.local
```

- [ ] **Step 1: Full test + type + lint gate**

Run: `npx vitest run src/lib/case-study src/components/case-study src/app/api/case-studies` → PASS (record the count).
Run tsc (compare to baseline) and eslint as in Task 19 Step 3.

- [ ] **Step 2: Start the dev server on 3100** via `.claude/launch.json` in the worktree (`{ "name": "cs-kit", "runtimeExecutable": "npm", "runtimeArgs": ["run","dev"], "port": 3100, "env": { "PORT": "3100" } }`) and `preview_start {name:"cs-kit"}`.

- [ ] **Step 3: Browser checks** (headless auth per memory `headless-verify-via-puppeteer-core` / `portal-client-session-headless-verify`, or Manu's own session). **Each Create/edit writes PRODUCTION rows — ask Manu for the OK and which client to use before Step 3b.** Use `REA_SC_US` (the only client with fulfilment data) unless Manu names another.
  - a. `/case-studies` lists all 19 active clients with two cells each; nav shows Design → Case Studies.
  - b. Create High-Level for the chosen client (last 12 months) → builder opens, 5 slides, no `[` brackets, banded `$`, images from Design; note pull duration.
  - c. Edit one headline and one override (sessions) → deck updates; Refresh data → both survive.
  - d. Add an emergency manual image on one empty slot → amber tag in builder; tracker shows "1 manual".
  - e. In review → Approved (expect a blocker dialog if data/images are missing; resolve or report) → Export PDF → 5 pages, 16:9, no chips/tags; stage becomes Sent.
  - f. Create Detailed → 14 slides; charts drawn; Snapshot shows/omits Fulfilment correctly; PDF 14 pages.
  - g. Console: no errors; network: no 4xx/5xx on image proxies.
  - Screenshot each of the above as proof.

- [ ] **Step 4: Report** to Manu with screenshots and the list of anything off. Test decks created in Step 3 are left in place unless Manu asks to delete them (delete = its own OK).

- [ ] **Step 5: Stop.** Push, PR, merge, deploy and the follow-up migration dropping `case_studies.status` each need their own explicit OK (superpowers:finishing-a-development-branch).
