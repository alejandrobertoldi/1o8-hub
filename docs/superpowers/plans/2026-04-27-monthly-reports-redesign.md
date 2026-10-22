# Monthly Reports — Dr. Cuddles Aesthetic Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the V1.1 per-page A4 monthly-report layout and adopt the Dr. Cuddles "Full Audit" visual language (sticky black top-bar + dark TOC, dark cover, alternating section rhythm, Inter heavy weights, gold accent), introduce three new analytical sections (Findings/Directions/Scorecard) as renderers over existing data, and let Puppeteer paginate the flowing document via CSS `@page`.

**Architecture:**
- Layout shifts from per-page A4 rectangles (`.page` divs + `<PageShell>`) to flowing `<section>` blocks. Puppeteer paginates via `@page` + per-primitive `page-break-inside: avoid`.
- `Report.tsx` gains two booleans: `printMode` (strip all chrome) and `showTopBar` (suppress just the sticky top bar — used by the selector page so its `.report-chrome` is the only sticky chrome).
- Findings/Directions/Scorecard are renderer aliases over existing `highlights`/`goals`/`risks` `SectionId`s. No new `SectionId` values. `Risk` gains an additive optional `grade?: 'red' | 'amber' | 'green'` field.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 (for the selector page chrome — the report uses plain CSS in `report.css`), Vitest + React Testing Library, Puppeteer (PDF rendering), Inter via Google Fonts.

**Worktree:** `/Users/manu/1o8Hub/.worktrees/monthly-reports/` (branch `feat/monthly-reports`)

**Spec:** `docs/superpowers/specs/2026-04-27-monthly-reports-redesign-design.md`
**Reference HTML (CSS authoritative):** `docs/superpowers/specs/_assets/2026-04-27-dr-cuddles-reference.html`

---

## File Structure

### Files to create
| Path | Responsibility |
|---|---|
| `src/components/monthly-report/shell/TopBar.tsx` | Sticky black top bar with logo wrap, subject label, confidential pill, print button. Hidden by `printMode`/`showTopBar=false`. |
| `src/components/monthly-report/shell/TocNav.tsx` | Sticky dark TOC bar. Renders one `<a>` per content section in `data.sections`, skipping `cover`/`toc` and any id whose backing data is empty. |
| `src/components/monthly-report/shell/section-number.ts` | Pure helper — computes the 2-digit section number for a `SectionId` (counting from 1 at the first non-cover, non-toc id). |
| `src/components/monthly-report/sections/CoverHeader.tsx` | Renames `CoverPage.tsx`, full rewrite. Renders `<header class="cover">` with eyebrow, oversized headline, deck, 5-up cover-meta. |
| `src/components/monthly-report/sections/KPISection.tsx` | Renames `KPIPage.tsx`, full rewrite. Renders `<section id="kpis">` with `stats-bar` (4-up) → `hero-stat` (2-up overflow) → `dt` table (5+ overflow). |
| `src/components/monthly-report/sections/MoMSection.tsx` | Renames `MoMPage.tsx`, full rewrite. Renders `<section id="mom" class="soft">` with `chart-card` wrappers + `dt` table. |
| `src/components/monthly-report/sections/FindingsSection.tsx` | New. Renders `<section id="highlights">` over `data.highlights` using `insights` 3-up grid. Returns `null` when array is empty. |
| `src/components/monthly-report/sections/ProductsSection.tsx` | Renames `ProductsPage.tsx`, full rewrite. Renders `<section id="products" class="soft">` with `dt` table replacing the V1.1 `pivot` table. |
| `src/components/monthly-report/sections/DirectionsSection.tsx` | New. Renders `<section id="goals">` over `data.goals` with leading `pullquote` + `insights` 3-up grid. Returns `null` when empty. |
| `src/components/monthly-report/sections/ScorecardSection.tsx` | New. Renders `<section id="risks" class="dark">` with `dt` table including a Grade pill column. Returns `null` when empty. |
| `src/components/monthly-report/sections/AppendixSection.tsx` | Renames `AppendixPage.tsx`, full rewrite. Renders `<section id="appendix">` with two-column grid + `callout sky` contact. |
| `src/components/monthly-report/sections/ProductsSection.test.tsx` | Renames `ProductsPage.test.tsx`. Updates import + asserts `td.ok` / `td.crit` cell modifiers (was `td.good` / `td.bad`). |

### Files to modify
| Path | Change |
|---|---|
| `src/components/monthly-report/types.ts` | Add optional `grade?: 'red' \| 'amber' \| 'green'` field to `Risk` interface. |
| `src/components/monthly-report/defaults.ts` | Token shift (ink, paper, accent, fonts) per §4.2. |
| `src/components/monthly-report/styles/report.css` | Largely rewrite — replace V1.1 `.page`/`.deck`/`.kpi`/`.cover` ecosystem with Dr. Cuddles primitives. CSS reference in spec §5 + reference HTML `<style>` block. |
| `src/components/monthly-report/Report.tsx` | Add `printMode?` and `showTopBar?` props; mount `<TopBar>`/`<TocNav>`/`<footer>` per §7.1; update SECTIONS map (drop `num`/`total`, register `highlights`/`goals`/`risks`). Drop `.deck` wrapper and the floating `.print-btn`. Update `useEffect` to also set `--orange`. |
| `src/lib/monthly-report/build-report-data.ts` | Default `meta.accent` `"#F7BF1D"` → `"#F8BF1C"`; extend `BuildInput` with optional `highlights/goals/risks`; pass them through and push corresponding `SectionId` into `data.sections` when arrays are non-empty. |
| `src/lib/monthly-report/build-report-data.test.ts` | Update accent default expectation (`"#F7BF1D"` → `"#F8BF1C"`); add coverage for the new pass-through behavior. |
| `src/app/reports/monthly/page.tsx` | Pass `showTopBar={false}` to `<ReportView>` (selector page already has `.report-chrome`). |
| `src/app/reports/monthly/print/page.tsx` | Pass `printMode={true}` to `<ReportView>`. |

### Files to delete
| Path | Why |
|---|---|
| `src/components/monthly-report/shell/PageShell.tsx` | No flow consumer — sections are now flat `<section>` blocks. |
| `src/components/monthly-report/shell/SectionHead.tsx` | Replaced by inline `section-tag` + `<h1>` pattern. |
| `src/components/monthly-report/sections/CoverPage.tsx` | Replaced by `CoverHeader.tsx` (rename). |
| `src/components/monthly-report/sections/TOCPage.tsx` | Replaced by `<TocNav>` in shell. |
| `src/components/monthly-report/sections/KPIPage.tsx` | Replaced by `KPISection.tsx` (rename). |
| `src/components/monthly-report/sections/MoMPage.tsx` | Replaced by `MoMSection.tsx` (rename). |
| `src/components/monthly-report/sections/ProductsPage.tsx` | Replaced by `ProductsSection.tsx` (rename). |
| `src/components/monthly-report/sections/AppendixPage.tsx` | Replaced by `AppendixSection.tsx` (rename). |
| `src/components/monthly-report/sections/ProductsPage.test.tsx` | Replaced by `ProductsSection.test.tsx` (rename). |

### Files NOT touched (per spec §8)
- `src/components/monthly-report/charts/*` (LineChart, BarChart, ComparisonChart, Spark)
- `src/lib/monthly-report/orchestrator.ts`, `analyzers/`, `queries/`, `config.ts`, `period.ts`, `format.ts`, `pdf-token.ts`, `thresholds.ts`, `tokens.ts`, `types.ts`
- `src/app/api/reports/monthly/*` (route handlers)

---

## Spec → Task Coverage

| Spec section | Implementing task(s) |
|---|---|
| §3 Layout architecture | Task 4 (CSS), Task 16 (Report.tsx flow) |
| §4.1 `Risk.grade?` | Task 1 |
| §4.2 Brand tokens shift | Task 2 |
| §4.3 `BuildInput` extension + section ordering | Task 3 |
| §5 CSS rewrite | Task 4 |
| §6.1 Cover | Task 7 |
| §6.2 TopBar / TocNav | Task 5, Task 6 |
| §6.3 KPISection | Task 9 |
| §6.4 MoMSection | Task 10 |
| §6.5 FindingsSection | Task 11 |
| §6.6 ProductsSection | Task 12 |
| §6.7 DirectionsSection | Task 13 |
| §6.8 ScorecardSection | Task 14 |
| §6.9 AppendixSection | Task 15 |
| §6.10 Footer | Task 16 (mounted in Report.tsx) |
| §7 printMode/showTopBar/@page | Task 4 (CSS guards), Task 16 (props), Tasks 17–18 (route wiring) |
| §12 Acceptance | Task 19 (final verification) |

---

## Conventions for this plan

1. **Worktree:** All paths are relative to `/Users/manu/1o8Hub/.worktrees/monthly-reports/`. Run all commands from that directory.
2. **Dev server:** `PORT=3000 npm run dev` (Webpack — Turbopack panics on PostCSS).
3. **Test runner:** `npm test -- <path>` runs a specific file. `npm test` runs everything.
4. **Lint:** `npm run lint`.
5. **Commits:** One commit per task (or per coherent step pair within a task). Author defaults are the user's git config; do not override.
6. **Risk grade ↔ severity mapping (spec §6.8):** `high → red`, `med → amber`, `low → green`. Used when `risk.grade` is undefined.
7. **Threshold band → cell class mapping (spec §6.6):** `classifyMetric` returns `"good" | "warn" | "bad" | ""`; the `.dt` styles need `"ok" | "warn" | "crit" | ""`. Map at the renderer boundary: `good → ok`, `warn → warn`, `bad → crit`, `"" → ""`.
8. **KPI stat-value modifier precedence (spec §6.3):** direction wins when not flat (`down → crit`, `up → ok`); when direction is `flat` and `highlight === true`, apply `brand`; otherwise no modifier.

---

## Phase A — Data contract foundations

These are quick, additive type/data changes. They unblock the renderers in Phase D.

### Task 1: Add `grade?` field to Risk

**Files:**
- Modify: `src/components/monthly-report/types.ts:154-160`

- [ ] **Step 1: Read the file**

Read `src/components/monthly-report/types.ts:140-165` to locate the `Risk` interface.

- [ ] **Step 2: Add the new field**

Edit `src/components/monthly-report/types.ts`. Replace:

```ts
export interface Risk {
  item: string;
  owner: string;
  severity: Severity;
  impact: string;    // "−$61K"
  status: string;    // "Mitigating"
}
```

with:

```ts
export interface Risk {
  item: string;
  owner: string;
  severity: Severity;
  impact: string;    // "−$61K"
  status: string;    // "Mitigating"
  /** Optional explicit color grade for the scorecard pill.
   *  Falls back to severity mapping (high→red, med→amber, low→green). */
  grade?: 'red' | 'amber' | 'green';
}
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: No new errors. Existing call sites don't pass `grade`, so optional adds zero pressure.

- [ ] **Step 4: Commit**

```bash
git add src/components/monthly-report/types.ts
git commit -m "feat(monthly-report): add optional Risk.grade field for scorecard

Additive optional field. Renderers in later tasks will derive a fallback
from severity when grade is omitted (high→red, med→amber, low→green)."
```

---

### Task 2: Token shift in defaults.ts

**Files:**
- Modify: `src/components/monthly-report/defaults.ts`

- [ ] **Step 1: Replace the file contents**

Edit `src/components/monthly-report/defaults.ts`. Replace the entire file with:

```ts
// 1o8Hub brand tokens (single-tenant).
// If you need to change brand colors, change them here; styles/report.css
// consumes them via CSS variables.

export const brand = {
  agency: '1o8Hub',
  logoPath: '/1o8hub-mark.svg',   // drop the real logo at public/1o8hub-mark.svg
  contactDomain: '1o8.agency',
  colors: {
    ink: '#2C2B36',          // was '#0A0A0A'
    paper: '#FFFFFF',        // was '#FAFAF7'
    paperSoft: '#f7f6f3',    // for section.soft
    grey: '#2C2B36',         // for section.dark and table headers
    accent: '#F8BF1C',       // was '#F7BF1D' (Dr. Cuddles canonical)
    positive: '#35C759',
    neutral:  '#FAC800',
    negative: '#FF5C60',
  },
  fonts: {
    display: 'Inter, system-ui, sans-serif',                // was Space Grotesk
    body:    'Inter, system-ui, sans-serif',
    mono:    'JetBrains Mono, ui-monospace, monospace',
  },
} as const;
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: No errors. `brand.colors.cream` is dropped — confirm no consumer references it (the only consumer was V1.1 `report.css`, which Task 4 rewrites).

Run: `grep -rn "brand.colors.cream\|colors\\.cream" src/`
Expected: No matches.

- [ ] **Step 3: Commit**

```bash
git add src/components/monthly-report/defaults.ts
git commit -m "feat(monthly-report): shift brand tokens to Dr. Cuddles palette

Ink #0A0A0A → #2C2B36, paper #FAFAF7 → #FFFFFF, accent #F7BF1D → #F8BF1C.
Drop cream (no consumer in new design), add paperSoft/grey/positive/neutral/negative.
Display font Space Grotesk → Inter."
```

---

### Task 3: Extend `build-report-data.ts` with highlights/goals/risks pass-through

**Files:**
- Modify: `src/lib/monthly-report/build-report-data.ts`
- Modify: `src/lib/monthly-report/build-report-data.test.ts`

- [ ] **Step 1: Update the failing test expectation first (TDD)**

Edit `src/lib/monthly-report/build-report-data.test.ts`. Replace the "uses brand gold as default accent" test:

```ts
  it("uses brand gold as default accent", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.meta.accent).toBe("#F7BF1D");
  });
```

with:

```ts
  it("uses brand gold as default accent (Dr. Cuddles canonical)", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.meta.accent).toBe("#F8BF1C");
  });

  it("passes through highlights/goals/risks when provided and pushes ids in correct order", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      highlights: [{ title: "h", body: "b", meta: "m" }],
      goals:      [{ title: "g", body: "b", owner: "o", success: "s" }],
      risks:      [{ item: "r", owner: "o", severity: "high", impact: "x", status: "s" }],
    });
    expect(r.sections).toEqual([
      "cover", "toc", "kpis", "mom", "highlights", "products", "goals", "risks", "appendix",
    ]);
    expect(r.highlights?.length).toBe(1);
    expect(r.goals?.length).toBe(1);
    expect(r.risks?.length).toBe(1);
  });

  it("omits new sections when their arrays are empty or undefined", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      highlights: [],
      // goals/risks omitted
    });
    expect(r.sections).not.toContain("highlights");
    expect(r.sections).not.toContain("goals");
    expect(r.sections).not.toContain("risks");
    expect(r.highlights).toEqual([]);     // pass-through preserves the empty array
    expect(r.goals).toBeUndefined();
    expect(r.risks).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/monthly-report/build-report-data.test.ts`
Expected: 3 failures (default accent mismatch, BuildInput type rejects new fields, sections list missing entries).

- [ ] **Step 3: Update `BuildInput` and `buildReportData`**

Edit `src/lib/monthly-report/build-report-data.ts`. Add the import at the top of the existing imports:

```ts
import type {
  Report, KPI, MoMTableRow, ProductRow as TplProductRow, SectionId,
  Highlight, Goal, Risk,
} from "@/components/monthly-report/types";
```

Replace the `BuildInput` interface:

```ts
export interface BuildInput {
  client: ClientContext;
  period: MonthlyPeriod;
  headline: HeadlineResult | null;
  products: ProductsResult | null;
  revenueSeries: Array<{ month: string; revenue: number }>;
  lead: string;
}
```

with:

```ts
export interface BuildInput {
  client: ClientContext;
  period: MonthlyPeriod;
  headline: HeadlineResult | null;
  products: ProductsResult | null;
  revenueSeries: Array<{ month: string; revenue: number }>;
  lead: string;
  /** Optional analytical content. Empty arrays cause the corresponding
   *  SectionId to be omitted from data.sections (renderers also defend
   *  with a null return — double-defended). */
  highlights?: Highlight[];
  goals?: Goal[];
  risks?: Risk[];
}
```

Replace the `buildReportData` function body. Find:

```ts
export function buildReportData(inp: BuildInput): Report {
  const { client, period, headline, products, revenueSeries, lead } = inp;

  const sections: SectionId[] = ["cover", "toc"];
  if (headline) sections.push("kpis", "mom");
  if (products && products.rows.length > 0) sections.push("products");
  sections.push("appendix");

  return {
    meta: {
      client: client.name,
      month: period.label,
      period: humanPeriod(period.start, period.end),
      lead,
      issued: issuedToday(),
      reportId: `${period.period}-${client.slug}`,
      accent: "#F7BF1D",
    },
    sections,
    kpis: headline ? buildKpis(headline) : undefined,
    mom: headline ? {
      revenueSeries: revenueSeries.map(p => ({ label: p.month, value: p.revenue })),
      revenueTargetSeries: [],
      cacSeries: [],
      table: buildMoMTable(headline),
      narrative: narrative(headline, client.name),
    } : undefined,
    products: products && products.rows.length > 0 ? buildProducts(products) : undefined,
    appendix: {
```

and replace with:

```ts
export function buildReportData(inp: BuildInput): Report {
  const { client, period, headline, products, revenueSeries, lead, highlights, goals, risks } = inp;

  // Section ordering: cover → toc → kpis → mom → highlights → products → goals → risks → appendix.
  // Each non-default member is omitted when its data is missing or empty.
  const sections: SectionId[] = ["cover", "toc"];
  if (headline) sections.push("kpis", "mom");
  if (highlights && highlights.length > 0) sections.push("highlights");
  if (products && products.rows.length > 0) sections.push("products");
  if (goals && goals.length > 0) sections.push("goals");
  if (risks && risks.length > 0) sections.push("risks");
  sections.push("appendix");

  return {
    meta: {
      client: client.name,
      month: period.label,
      period: humanPeriod(period.start, period.end),
      lead,
      issued: issuedToday(),
      reportId: `${period.period}-${client.slug}`,
      accent: "#F8BF1C",
    },
    sections,
    kpis: headline ? buildKpis(headline) : undefined,
    mom: headline ? {
      revenueSeries: revenueSeries.map(p => ({ label: p.month, value: p.revenue })),
      revenueTargetSeries: [],
      cacSeries: [],
      table: buildMoMTable(headline),
      narrative: narrative(headline, client.name),
    } : undefined,
    highlights,
    goals,
    risks,
    products: products && products.rows.length > 0 ? buildProducts(products) : undefined,
    appendix: {
```

(Leave the `appendix: { … }` body and closing brackets unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/monthly-report/build-report-data.test.ts`
Expected: All tests pass (4 original + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/build-report-data.ts src/lib/monthly-report/build-report-data.test.ts
git commit -m "feat(monthly-report): add highlights/goals/risks pass-through to BuildInput

Default accent moves to #F8BF1C (Dr. Cuddles canonical, within rounding).
Section ordering: cover → toc → kpis → mom → highlights → products → goals → risks → appendix.
Each new id is omitted when its array is empty/undefined; renderers also
defend with null returns. HTTP route signature unchanged — production
reports get empty arrays until a hand-edit UI lands."
```

---

## Phase B — CSS rewrite

### Task 4: Rewrite `report.css` with Dr. Cuddles primitives

**Files:**
- Modify (rewrite): `src/components/monthly-report/styles/report.css`

This is one big content swap. The reference HTML's `<style>` block is the canonical source for property values; we extend it with the V1.1 print guards (`@page`, per-primitive `page-break-inside: avoid`) and the `body.print-mode` overrides.

- [ ] **Step 1: Replace the file contents**

Edit `src/components/monthly-report/styles/report.css`. Overwrite the entire file with:

```css
/* ============================================
   MONTHLY REPORT — Dr. Cuddles aesthetic
   Flowing document; Puppeteer paginates via @page.
   ============================================ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  --orange: #F8BF1C;
  --grey: #2C2B36;
  --grey-2: #1f1e26;
  --grey-3: #3a3946;
  --black: #000000;
  --white: #FFFFFF;

  --bg: #FFFFFF;
  --bg-soft: #f7f6f3;
  --bg-card: #FFFFFF;
  --rule: #e6e4dd;
  --rule-2: rgba(44,43,54,0.1);

  --ink: #2C2B36;
  --ink-soft: #4a4956;
  --muted: #7a7886;

  --positive: #35C759;
  --neutral: #FAC800;
  --negative: #FF5C60;

  /* Report.tsx mirrors meta.accent into both --accent and --orange so that
     primitives that bind either name track per-client overrides. */
  --accent: var(--orange);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.6;
  font-size: 11px;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.container { max-width: 1140px; margin: 0 auto; padding: 0 48px; }

/* === TOP BAR === */
.top-bar {
  background: var(--black);
  color: var(--white);
  padding: 14px 0;
  border-bottom: 3px solid var(--orange);
  position: sticky;
  top: 0;
  z-index: 100;
}
.top-bar-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: rgba(255,255,255,0.85);
}
.logo-wrap {
  display: inline-flex;
  align-items: center;
  gap: 14px;
}
.logo-wrap img { height: 22px; width: auto; flex-shrink: 0; display: block; }
.logo-tag {
  color: rgba(255,255,255,0.6);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  border-left: 1px solid rgba(255,255,255,0.2);
  padding-left: 12px;
  margin-left: 4px;
}
.confidential {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.25em;
  color: var(--negative);
  text-transform: uppercase;
  padding: 4px 10px;
  border: 1px solid var(--negative);
  border-radius: 2px;
}

/* === TOC NAV === */
.toc {
  background: var(--grey);
  color: var(--white);
  border-bottom: 1px solid var(--orange);
  position: sticky;
  top: 53px;
  z-index: 99;
}
.toc-inner {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 12px 0;
  overflow-x: auto;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.toc a {
  color: rgba(255,255,255,0.75);
  text-decoration: none;
  padding: 6px 14px;
  border-right: 1px solid rgba(255,255,255,0.12);
  transition: color 0.15s;
  text-transform: uppercase;
}
.toc a:first-child { border-left: 1px solid rgba(255,255,255,0.12); }
.toc a:hover { color: var(--orange); }
.toc a.brand {
  color: var(--orange);
  font-weight: 700;
  border-right: 1px solid var(--orange);
  margin-right: 4px;
}

/* === COVER === */
.cover {
  background: var(--grey);
  color: var(--white);
  padding: 70px 0 80px;
  position: relative;
  overflow: hidden;
}
.cover::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 92% 18%, rgba(248,191,28,0.08) 0%, transparent 38%);
  pointer-events: none;
}
.cover-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--orange);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  margin-bottom: 32px;
}
.cover-title {
  font-weight: 800;
  font-size: clamp(44px, 6.5vw, 72px);
  line-height: 1.0;
  letter-spacing: -0.035em;
  color: var(--white);
  margin-bottom: 22px;
  max-width: 18ch;
}
.cover-title em { font-style: normal; color: var(--orange); }
.cover-deck {
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  max-width: 64ch;
  line-height: 1.6;
  margin-top: 24px;
}
.cover-deck strong { color: var(--orange); font-weight: 700; }
.cover-meta {
  margin-top: 50px;
  padding-top: 24px;
  border-top: 1px solid rgba(255,255,255,0.15);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 28px;
}
.cover-meta div { padding-right: 12px; }
.cover-meta .label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.5);
  margin-bottom: 6px;
}
.cover-meta .value {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--white);
}

/* === SECTIONS === */
section {
  padding: 64px 0;
  border-bottom: 1px solid var(--rule);
}
section.dark { background: var(--grey); color: var(--white); }
section.dark h1, section.dark h2, section.dark h3, section.dark p strong { color: var(--white); }
section.dark p { color: rgba(255,255,255,0.85); }
section.dark .lead { color: var(--white); }
section.dark .section-tag { color: var(--orange); }
section.soft { background: var(--bg-soft); }

.section-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--orange);
  text-transform: uppercase;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  margin-bottom: 14px;
  display: block;
}

h1 {
  font-weight: 800;
  font-size: 36px;
  line-height: 1.05;
  letter-spacing: -0.025em;
  color: var(--ink);
  margin-bottom: 18px;
}
h1 em { font-style: normal; color: var(--orange); }

h2 {
  font-weight: 700;
  font-size: clamp(20px, 2.8vw, 26px);
  line-height: 1.05;
  letter-spacing: -0.025em;
  color: var(--ink);
  margin-bottom: 18px;
  max-width: 26ch;
}
h2 em { font-style: normal; color: var(--orange); }

h3 {
  font-weight: 700;
  font-size: 14px;
  line-height: 1.3;
  color: var(--ink);
  margin: 28px 0 10px;
  letter-spacing: -0.005em;
}
h3 em { font-style: normal; color: var(--orange); }

h4 {
  font-weight: 700;
  font-size: 11px;
  line-height: 1.3;
  color: var(--orange);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  margin: 22px 0 8px;
}

p {
  margin-bottom: 12px;
  max-width: 76ch;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--ink-soft);
}
p.lead {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--ink);
  max-width: 60ch;
  margin-bottom: 24px;
  letter-spacing: -0.005em;
}
p.lead em { font-style: normal; color: var(--orange); font-weight: 600; }
p.muted { color: var(--muted); font-size: 10px; }
strong { color: var(--ink); font-weight: 600; }
section.dark strong { color: var(--white); }

ul.regular { list-style: none; margin: 14px 0; max-width: 76ch; }
ul.regular li {
  padding: 8px 0 8px 22px;
  position: relative;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--ink-soft);
}
ul.regular li::before {
  content: "•";
  position: absolute;
  left: 0;
  color: var(--orange);
  font-weight: 700;
}
ul.regular li strong { color: var(--ink); }

/* === STATS BAR (4-up KPI grid) === */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  margin: 28px 0 16px;
  border: 1px solid var(--grey);
  background: var(--grey);
}
@media (max-width: 800px) { .stats-bar { grid-template-columns: repeat(2, 1fr); } }
.stat-cell {
  background: var(--white);
  padding: 24px 22px;
  border-right: 1px solid var(--grey);
  position: relative;
}
.stat-cell:last-child { border-right: none; }
.stat-cell::before {
  content: "";
  position: absolute;
  top: 0; left: 0;
  width: 28px;
  height: 3px;
  background: var(--orange);
}
@media (max-width: 800px) {
  .stat-cell:nth-child(2) { border-right: none; }
  .stat-cell:nth-child(-n+2) { border-bottom: 1px solid var(--grey); }
}
.stat-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}
.stat-value {
  font-weight: 800;
  font-size: 32px;
  line-height: 1;
  letter-spacing: -0.025em;
  color: var(--ink);
}
.stat-value.crit { color: var(--negative); }
.stat-value.ok { color: var(--positive); }
.stat-value.warn { color: var(--neutral); }
.stat-value.brand { color: var(--orange); }
.stat-meta {
  font-size: 11px;
  margin-top: 8px;
  color: var(--muted);
  line-height: 1.4;
}

/* === HERO STAT (2-up large) === */
.hero-stat {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin: 32px 0 20px;
  border: 1px solid var(--grey);
  background: var(--grey);
}
@media (max-width: 700px) { .hero-stat { grid-template-columns: 1fr; } }
.hero-cell {
  background: var(--white);
  padding: 28px 26px;
  border-right: 1px solid var(--grey);
  position: relative;
}
.hero-cell:last-child { border-right: none; }
.hero-cell::before {
  content: "";
  position: absolute;
  top: 0; left: 0;
  width: 32px;
  height: 4px;
  background: var(--orange);
}
@media (max-width: 700px) {
  .hero-cell { border-right: none; border-bottom: 1px solid var(--grey); }
  .hero-cell:last-child { border-bottom: none; }
}
.hero-cell .label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}
.hero-cell .value {
  font-weight: 800;
  font-size: 42px;
  line-height: 1;
  letter-spacing: -0.025em;
  color: var(--ink);
}
.hero-cell .value.positive { color: var(--positive); }
.hero-cell .value.brand { color: var(--orange); }
.hero-cell .meta {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--ink-soft);
  line-height: 1.5;
}

/* === CALLOUT === */
.callout {
  margin: 24px 0;
  padding: 22px 26px;
  background: var(--bg-soft);
  border-left: 4px solid var(--orange);
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink);
  max-width: 80ch;
}
.callout.crit { border-left-color: var(--negative); background: rgba(255,92,96,0.04); }
.callout.ok { border-left-color: var(--positive); background: rgba(53,199,89,0.04); }
.callout.sky { border-left-color: var(--orange); background: rgba(248,191,28,0.06); }
.callout-tag {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--orange);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  margin-bottom: 8px;
}
.callout.crit .callout-tag { color: var(--negative); }
.callout.ok .callout-tag { color: var(--positive); }
.callout strong { color: var(--ink); }
.callout em { font-style: normal; color: var(--orange); font-weight: 600; }

/* === PULLQUOTE === */
.pullquote {
  margin: 36px 0;
  padding: 30px 36px 30px 48px;
  background: var(--bg-soft);
  border-left: 4px solid var(--orange);
  font-size: 19px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--ink);
  letter-spacing: -0.005em;
  position: relative;
  max-width: 50ch;
}
.pullquote::before {
  content: "\201C";
  position: absolute;
  left: 16px;
  top: 26px;
  font-size: 48px;
  line-height: 0.5;
  color: var(--orange);
  font-weight: 800;
  font-family: Georgia, serif;
}
.pullquote em { font-style: normal; color: var(--orange); font-weight: 700; }

/* === DATA TABLES === */
.dt {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  margin: 18px 0;
  border: 1px solid var(--grey);
}
.dt th {
  background: var(--grey);
  color: var(--white);
  text-align: left;
  padding: 10px 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--grey-3);
}
.dt th.r, .dt td.r { text-align: right; }
.dt td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--rule);
  background: var(--white);
  font-size: 11px;
  color: var(--ink-soft);
}
.dt td.label, .dt tbody tr td:first-child {
  font-weight: 500;
  color: var(--ink);
}
.dt tbody tr:hover td { background: var(--bg-soft); }
.dt .crit, .dt .negative { color: var(--negative); font-weight: 600; }
.dt .ok, .dt .positive { color: var(--positive); font-weight: 600; }
.dt .warn, .dt .neutral { color: var(--neutral); font-weight: 600; }
.dt .brand { color: var(--orange); font-weight: 600; }
.dt tfoot td {
  background: var(--grey-2);
  color: var(--white);
  border-top: 2px solid var(--orange);
  border-bottom: none;
  font-weight: 700;
  font-size: 12.5px;
}
.dt code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  color: var(--ink);
}

/* Grade pill (used inside Scorecard table cells) */
.grade-pill {
  display: inline-block;
  padding: 3px 10px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  border-radius: 2px;
}
.grade-pill.red    { background: rgba(255,92,96,0.15); color: var(--negative); }
.grade-pill.amber  { background: rgba(250,200,0,0.18); color: #8a6a10; }
.grade-pill.green  { background: rgba(53,199,89,0.15); color: var(--positive); }

/* === LADDER (kept as primitive library; no V1.2 consumer) === */
.ladder {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin: 28px 0;
}
@media (max-width: 700px) { .ladder { grid-template-columns: repeat(2, 1fr); gap: 10px; } }
.rung {
  border: 1px solid var(--rule);
  background: var(--white);
  padding: 18px 14px;
  text-align: center;
}
.rung.live { border-top: 3px solid var(--positive); }
.rung.next {
  border-top: 3px solid var(--orange);
  border-left: 1px dashed var(--orange);
  border-right: 1px dashed var(--orange);
  border-bottom: 1px dashed var(--orange);
}
.rung .pack {
  font-weight: 800;
  font-size: 30px;
  line-height: 1;
  color: var(--ink);
  letter-spacing: -0.025em;
}
.rung.live .pack { color: var(--positive); }
.rung.next .pack { color: var(--orange); }

/* === SKU CARDS (kept as primitive library; no V1.2 consumer) === */
.sku-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin: 24px 0;
}
@media (max-width: 700px) { .sku-cards { grid-template-columns: 1fr; } }
.sku-card { border: 1px solid var(--rule); background: var(--white); }
.sku-card.loss { border-top: 3px solid var(--negative); }
.sku-card.profit { border-top: 3px solid var(--positive); }
.econ-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.econ-table td { padding: 9px 18px; border-bottom: 1px solid var(--rule); }

/* === INSIGHTS (numbered cards — used by Findings + Directions) === */
.insights {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin: 28px 0;
}
@media (max-width: 800px) { .insights { grid-template-columns: 1fr; } }
.insight {
  border: 1px solid var(--rule);
  background: var(--white);
  padding: 24px 22px;
  border-top: 3px solid var(--orange);
}
.insight-num {
  font-weight: 800;
  font-size: 26px;
  line-height: 1;
  color: var(--orange);
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}
.insight h4 {
  font-size: 15px;
  color: var(--ink);
  line-height: 1.25;
  text-transform: none;
  text-decoration: none;
  letter-spacing: -0.005em;
  margin: 0 0 8px;
  font-weight: 700;
}
.insight p {
  font-size: 12.5px;
  margin: 0 0 8px;
  color: var(--ink-soft);
  line-height: 1.55;
  max-width: none;
}
.insight p.muted {
  font-size: 10px;
  color: var(--muted);
}

/* === CHART CARD === */
.chart-card {
  background: var(--white);
  border: 1px solid var(--rule);
  padding: 28px 28px 22px;
  margin: 28px 0;
  border-top: 3px solid var(--orange);
}
.chart-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 12px;
}
.chart-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.chart-card-axis {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--muted);
}

/* === PHASES (kept as primitive library; no V1.2 consumer) === */
.phases {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  margin: 28px 0;
  border: 1px solid rgba(255,255,255,0.1);
}
@media (max-width: 800px) { .phases { grid-template-columns: 1fr; } }
.phase {
  padding: 28px 24px;
  border-right: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.02);
  position: relative;
}
.phase:last-child { border-right: none; }
.phase::before {
  content: "";
  position: absolute;
  top: 0; left: 0;
  width: 36px;
  height: 3px;
  background: var(--orange);
}
.phase-num {
  font-weight: 800;
  font-size: 64px;
  line-height: 0.85;
  color: var(--orange);
  letter-spacing: -0.04em;
}

/* === FOOTER === */
footer {
  padding: 44px 0;
  background: var(--black);
  color: var(--white);
  border-top: 4px solid var(--orange);
}
footer .container {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 40px;
  align-items: end;
}
footer .sig {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
footer .sig em { font-style: normal; color: var(--orange); }
footer .meta {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.6);
  text-align: right;
  line-height: 1.7;
}

/* === PRINT BUTTON (now inline inside top-bar) === */
.print-btn {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 12px;
  background: var(--white);
  color: var(--black);
  border: none;
  cursor: pointer;
  border-radius: 2px;
}
.print-btn:hover { background: var(--orange); color: var(--black); }

@media (max-width: 700px) {
  .container { padding: 0 22px; }
  section { padding: 52px 0; }
  .cover { padding: 50px 0 60px; }
  .cover-meta { grid-template-columns: repeat(2, 1fr); gap: 18px; }
  .pullquote { padding: 24px 22px 24px 38px; font-size: 16px; }
  .pullquote::before { left: 12px; font-size: 38px; }
}

/* === PRINT MODE (selector page suppresses TopBar via showTopBar=false; the
       print route suppresses everything via printMode=true which adds
       body.print-mode and the @media print rules below take over). === */
body.print-mode { background: #fff; }
body.print-mode .top-bar,
body.print-mode .toc,
body.print-mode .print-btn,
body.print-mode .report-chrome { display: none !important; }
body.print-mode section { padding: 48px 0 !important; }

@page {
  size: A4 portrait;
  margin: 18mm 14mm;
}
@media print {
  body { background: #fff; }
  .top-bar, .toc, .print-btn, .report-chrome { display: none !important; }
  section { page-break-inside: auto; padding: 48px 0 !important; }
  .stats-bar, .hero-stat, .callout, .pullquote,
  .insight, .sku-card, .rung, .chart-card,
  .phase, footer { page-break-inside: avoid; break-inside: avoid; }
  h1, h2 { page-break-after: avoid; break-after: avoid; }
  table.dt thead { display: table-header-group; }
}
```

- [ ] **Step 2: Verify no obvious CSS errors**

Run: `npm run lint`
Expected: No CSS-related errors. (Some files imported in old `.tsx` may still reference deleted classes — that's fine; those `.tsx` files are rewritten in later tasks. The CSS file itself doesn't surface lint errors via Next.js's lint config.)

- [ ] **Step 3: Visual smoke check (manual)**

Start the dev server in a separate terminal: `PORT=3000 npm run dev`

Open `http://localhost:3000/reports/monthly` in a browser. You'll see broken visuals because the V1.1 sections still reference old class names — that's expected at this point. Confirm only that **the CSS itself loads without console errors** (DevTools Network tab → no 404 on `report.css`; DevTools Console → no parse errors).

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/monthly-report/styles/report.css
git commit -m "feat(monthly-report): rewrite report.css with Dr. Cuddles primitives

Replaces V1.1 per-page A4 ecosystem (.page/.deck/.kpi/.cover/.toc-row) with
flowing Dr. Cuddles primitives: top-bar, toc, cover, stats-bar, hero-stat,
callout, pullquote, dt (data table), insights, chart-card. Keeps ladder,
sku-cards, phases as primitive library (no V1.2 consumer).

Print pagination delegates to Puppeteer via @page A4 + page-break-inside:avoid
on every primitive. body.print-mode mirrors @media print rules so the
print-route renders identically with or without an actual print dialog.

Sections will be visually broken until the renderer rewrites land."
```

---

## Phase C — Shell components (TopBar, TocNav, helper)

### Task 5: Create section-number helper

**Files:**
- Create: `src/components/monthly-report/shell/section-number.ts`

- [ ] **Step 1: Write the helper**

Create `src/components/monthly-report/shell/section-number.ts` with:

```ts
import type { SectionId } from '../types';

/**
 * Returns a 2-digit section number for the given id.
 * Counts from 1 at the first non-cover, non-toc id in the order list.
 * Returns "" if the id is not in the list, or is one of cover/toc.
 */
export function sectionNumber(sections: SectionId[], id: SectionId): string {
  if (id === 'cover' || id === 'toc') return '';
  const filtered = sections.filter(s => s !== 'cover' && s !== 'toc');
  const idx = filtered.indexOf(id);
  if (idx < 0) return '';
  return String(idx + 1).padStart(2, '0');
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/monthly-report/shell/section-number.ts
git commit -m "feat(monthly-report): add sectionNumber helper for 2-digit numbering

Counts non-cover, non-toc ids from 1. Used by KPISection / MoMSection /
FindingsSection / ProductsSection / DirectionsSection / ScorecardSection /
AppendixSection in section-tag labels (e.g. 'Section 03 · Findings')."
```

---

### Task 6: Create TopBar component

**Files:**
- Create: `src/components/monthly-report/shell/TopBar.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/monthly-report/shell/TopBar.tsx` with:

```tsx
import React from 'react';
import type { Report } from '../types';
import { brand } from '../defaults';

export function TopBar({ data }: { data: Report }) {
  const { meta } = data;
  return (
    <div className="top-bar">
      <div className="container top-bar-inner">
        <span className="logo-wrap">
          <img src={brand.logoPath} alt={`${brand.agency} mark`} />
          <span className="logo-tag">Monthly Report</span>
        </span>
        <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>
          {meta.client.toUpperCase()} · {meta.month.toUpperCase()}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="print-btn"
            onClick={() => { if (typeof window !== 'undefined') window.print(); }}
          >
            ⌘P · Export PDF
          </button>
          <span className="confidential">Internal · Confidential</span>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/monthly-report/shell/TopBar.tsx
git commit -m "feat(monthly-report): add TopBar shell component

Sticky black bar with logo wrap, subject label, inline print button,
confidential pill. Hidden when printMode=true or showTopBar=false."
```

---

### Task 7: Create TocNav component

**Files:**
- Create: `src/components/monthly-report/shell/TocNav.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/monthly-report/shell/TocNav.tsx` with:

```tsx
import React from 'react';
import type { Report, SectionId } from '../types';

const LABELS: Record<SectionId, string> = {
  cover:       'Cover',
  toc:         'Contents',
  execSummary: 'Executive summary',
  kpis:        'Key metrics',
  mom:         'Month-over-month',
  highlights:  'Findings',
  risks:       'Scorecard',
  channels:    'Channels',
  products:    'Products',
  financials:  'Financials',
  team:        'Team',
  goals:       'Directions',
  appendix:    'Appendix',
};

/**
 * Returns true if the section's backing data is present and non-empty.
 * A section that's listed in data.sections but has no backing data should
 * not produce a dangling anchor — render-time defense for the orchestrator's
 * own filtering in build-report-data.ts.
 */
function hasBackingData(data: Report, id: SectionId): boolean {
  switch (id) {
    case 'kpis':        return (data.kpis ?? []).length > 0;
    case 'mom':         return !!data.mom;
    case 'highlights':  return (data.highlights ?? []).length > 0;
    case 'goals':       return (data.goals ?? []).length > 0;
    case 'risks':       return (data.risks ?? []).length > 0;
    case 'products':    return (data.products ?? []).length > 0;
    case 'appendix':    return !!data.appendix;
    case 'execSummary': return !!data.execSummary;
    case 'channels':    return (data.channels ?? []).length > 0;
    case 'financials':  return !!data.financials;
    case 'team':        return (data.team ?? []).length > 0;
    case 'cover':
    case 'toc':         return true; // never filtered here
  }
}

export function TocNav({ data }: { data: Report }) {
  const ids = data.sections
    .filter(id => id !== 'cover' && id !== 'toc')
    .filter(id => hasBackingData(data, id));

  return (
    <nav className="toc">
      <div className="container">
        <div className="toc-inner">
          <a href="#cover" className="brand">MONTHLY REPORT</a>
          {ids.map((id, i) => {
            const num = String(i + 1).padStart(2, '0');
            return (
              <a key={id} href={`#${id}`}>{num} {LABELS[id]}</a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/monthly-report/shell/TocNav.tsx
git commit -m "feat(monthly-report): add TocNav shell component

Sticky dark TOC bar. Filters cover/toc and any id whose backing data is
empty/undefined — defends against orphaned anchors when the orchestrator
hasn't filtered (e.g. fixtures or hand-built Report objects).

Anchor labels: highlights → Findings, goals → Directions, risks → Scorecard."
```

---

## Phase D — Section renderers

These tasks rewrite the existing 4 sections (Cover, KPIs, MoM, Products, Appendix) and add 3 new ones (Findings, Directions, Scorecard). Each is independent of the others — the file-by-file ordering below is convenient for review but they could be done in any order once Phase A–C is complete.

### Task 8: Rewrite Cover (rename CoverPage.tsx → CoverHeader.tsx)

**Files:**
- Delete: `src/components/monthly-report/sections/CoverPage.tsx`
- Create: `src/components/monthly-report/sections/CoverHeader.tsx`

- [ ] **Step 1: Delete the old file**

```bash
git rm src/components/monthly-report/sections/CoverPage.tsx
```

- [ ] **Step 2: Create the new file**

Create `src/components/monthly-report/sections/CoverHeader.tsx` with:

```tsx
import React from 'react';
import type { Report } from '../types';

/**
 * Splits the headline into a head + accent-tail pair. The last two
 * whitespace-delimited words become accent. If there are fewer than 2 words,
 * the entire string is the accent tail (head is empty).
 */
function splitHeadline(headline: string): { head: string; tail: string } {
  const words = headline.trim().split(/\s+/);
  if (words.length < 2) return { head: '', tail: headline };
  return {
    head: words.slice(0, -2).join(' '),
    tail: words.slice(-2).join(' '),
  };
}

export function CoverHeader({ data }: { data: Report }) {
  const { meta } = data;
  const headline = meta.headline ?? 'Growth, measured in detail.';
  const { head, tail } = splitHeadline(headline);

  const tagline = meta.tagline
    ?? `A month-over-month review of campaigns, spend, and outcomes across every channel we operate for ${meta.client}.`;

  return (
    <header className="cover" id="cover">
      <div className="container">
        <div className="cover-eyebrow">Monthly Performance Report · Internal</div>
        <h1 className="cover-title">
          {head ? <>{head} </> : null}<em>{tail}</em>
        </h1>
        <p className="cover-deck">
          {tagline.split(meta.client).map((chunk, i, arr) => (
            <React.Fragment key={i}>
              {chunk}
              {i < arr.length - 1 ? <strong>{meta.client}</strong> : null}
            </React.Fragment>
          ))}
        </p>
        <div className="cover-meta">
          <div><div className="label">Client</div><div className="value">{meta.client}</div></div>
          <div><div className="label">Period</div><div className="value">{meta.period}</div></div>
          <div><div className="label">Issued</div><div className="value">{meta.issued}</div></div>
          <div><div className="label">Lead</div><div className="value">{meta.lead}</div></div>
          <div><div className="label">Report ID</div><div className="value">{meta.reportId}</div></div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: No errors yet related to CoverHeader. (Report.tsx still imports `CoverPage` and will fail until Task 16 — that's fine; we're staging.)

- [ ] **Step 4: Commit**

```bash
git add -A src/components/monthly-report/sections/
git commit -m "feat(monthly-report): rewrite cover as CoverHeader (Dr. Cuddles)

Renders <header class=\"cover\"> with eyebrow, oversized headline (last 2 words
in <em> for orange accent), deck (client name in <strong>), 5-up cover-meta
grid (Client / Period / Issued / Lead / Report ID).

Removed: V1.1 4-up Pages strip (irrelevant in flow layout)."
```

---

### Task 9: Delete TOCPage.tsx

**Files:**
- Delete: `src/components/monthly-report/sections/TOCPage.tsx`

- [ ] **Step 1: Delete and commit**

```bash
git rm src/components/monthly-report/sections/TOCPage.tsx
git commit -m "feat(monthly-report): remove TOCPage (replaced by TocNav shell)

TOC is now a sticky horizontal nav rendered above the cover, not a page.
Anchors are derived from data.sections in the new TocNav component."
```

(Type-check will still fail until Task 16 because Report.tsx still imports it. That's fine.)

---

### Task 10: Rewrite KPIs (rename KPIPage.tsx → KPISection.tsx)

**Files:**
- Delete: `src/components/monthly-report/sections/KPIPage.tsx`
- Create: `src/components/monthly-report/sections/KPISection.tsx`

- [ ] **Step 1: Delete the old file**

```bash
git rm src/components/monthly-report/sections/KPIPage.tsx
```

- [ ] **Step 2: Create the new file**

Create `src/components/monthly-report/sections/KPISection.tsx` with:

```tsx
import React from 'react';
import type { Report, KPI } from '../types';
import { sectionNumber } from '../shell/section-number';

/**
 * Picks the cell modifier class for a stat-value based on direction + highlight.
 * Direction wins when it's not flat; highlight is the fallback for flat metrics.
 */
function statValueClass(k: KPI): string {
  if (k.direction === 'down') return 'crit';
  if (k.direction === 'up') return 'ok';
  if (k.highlight) return 'brand';
  return '';
}

function directionGlyph(d: KPI['direction']): string {
  return d === 'up' ? '▲' : d === 'down' ? '▼' : '—';
}

export function KPISection({ data }: { data: Report }) {
  const kpis = data.kpis ?? [];
  if (kpis.length === 0) return null;

  const num = sectionNumber(data.sections, 'kpis');
  const top4 = kpis.slice(0, 4);
  const hero = kpis.slice(4, 6);          // 5th & 6th render as hero-stat
  const overflow = kpis.slice(6);         // 7th+ render as table rows

  return (
    <section id="kpis">
      <div className="container">
        <span className="section-tag">Section {num} · Key metrics</span>
        <h1>Key <em>metrics</em></h1>
        <p className="lead">
          Headline performance for {data.meta.month}, with deltas against the prior month.
        </p>

        <div className="stats-bar">
          {top4.map((k, i) => {
            const cls = statValueClass(k);
            return (
              <div key={i} className="stat-cell">
                <div className="stat-label">{k.label}</div>
                <div className={`stat-value${cls ? ' ' + cls : ''}`}>{k.value}</div>
                <div className="stat-meta">
                  {directionGlyph(k.direction)} {k.delta} · {k.foot}
                </div>
              </div>
            );
          })}
        </div>

        {hero.length > 0 && (
          <div className="hero-stat">
            {hero.map((k, i) => {
              const cls = k.direction === 'up' ? 'positive'
                        : k.highlight ? 'brand'
                        : '';
              return (
                <div key={i} className="hero-cell">
                  <div className="label">{k.label}</div>
                  <div className={`value${cls ? ' ' + cls : ''}`}>{k.value}</div>
                  <div className="meta">{directionGlyph(k.direction)} {k.delta} · {k.foot}</div>
                </div>
              );
            })}
          </div>
        )}

        {overflow.length > 0 && (
          <table className="dt">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="r">Value</th>
                <th className="r">Δ</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {overflow.map((k, i) => (
                <tr key={i}>
                  <td>{k.label}</td>
                  <td className="r">{k.value}</td>
                  <td className={`r ${k.direction === 'up' ? 'ok' : k.direction === 'down' ? 'crit' : ''}`}>
                    {directionGlyph(k.direction)} {k.delta}
                  </td>
                  <td>{k.foot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A src/components/monthly-report/sections/
git commit -m "feat(monthly-report): rewrite KPIs as KPISection (Dr. Cuddles)

Renders 4-up stats-bar for first 4 KPIs; 5th-6th overflow into 2-up hero-stat;
7th+ overflow into a dt table. Cell color modifiers: direction wins (down→crit,
up→ok), highlight is the fallback for flat metrics (→brand)."
```

---

### Task 11: Rewrite MoM (rename MoMPage.tsx → MoMSection.tsx)

**Files:**
- Delete: `src/components/monthly-report/sections/MoMPage.tsx`
- Create: `src/components/monthly-report/sections/MoMSection.tsx`

- [ ] **Step 1: Delete the old file**

```bash
git rm src/components/monthly-report/sections/MoMPage.tsx
```

- [ ] **Step 2: Create the new file**

Create `src/components/monthly-report/sections/MoMSection.tsx` with:

```tsx
import React from 'react';
import type { Report } from '../types';
import { LineChart } from '../charts/LineChart';
import { BarChart } from '../charts/BarChart';
import { ComparisonChart } from '../charts/ComparisonChart';
import { brand } from '../defaults';
import { sectionNumber } from '../shell/section-number';

export function MoMSection({ data }: { data: Report }) {
  const m = data.mom;
  if (!m) return null;

  const accent = data.meta.accent ?? brand.colors.accent;
  const hasTarget = (m.revenueTargetSeries?.length ?? 0) > 0;
  const hasCAC = (m.cacSeries?.length ?? 0) > 0;
  const series = [
    { name: 'Actual', data: m.revenueSeries },
    ...(hasTarget ? [{ name: 'Target', data: m.revenueTargetSeries! }] : []),
  ];
  const cacData = hasCAC
    ? m.cacSeries!.map((p, i) => ({
        ...p,
        highlight: m.highlightLastCac && i === m.cacSeries!.length - 1,
      }))
    : [];

  const num = sectionNumber(data.sections, 'mom');
  const firstLabel = m.revenueSeries[0]?.label ?? '';
  const lastLabel = m.revenueSeries.at(-1)?.label ?? '';

  return (
    <section id="mom" className="soft">
      <div className="container">
        <span className="section-tag">Section {num} · Trends</span>
        <h1>Month-over-<em>month</em></h1>
        <p className="lead">{m.narrative}</p>

        <div className="chart-card">
          <div className="chart-card-meta">
            <div className="chart-card-title">Revenue vs. target</div>
            <div className="chart-card-axis">USD · {firstLabel} → {lastLabel}</div>
          </div>
          <ComparisonChart series={series} accent={accent} />
        </div>

        {hasCAC && (
          <div className="chart-card">
            <div className="chart-card-meta">
              <div className="chart-card-title">Blended CAC</div>
              <div className="chart-card-axis">USD · {firstLabel} → {lastLabel}</div>
            </div>
            <BarChart data={cacData} accent={accent} />
          </div>
        )}

        <table className="dt">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="r">Prev</th>
              <th className="r">Curr</th>
              <th className="r">Δ</th>
            </tr>
          </thead>
          <tbody>
            {m.table.map((r, i) => {
              const cls = r.deltaDirection === 'up' ? 'ok'
                        : r.deltaDirection === 'down' ? 'crit'
                        : '';
              return (
                <tr key={i}>
                  <td>{r.metric}</td>
                  <td className="r">{r.prev}</td>
                  <td className="r">{r.curr}</td>
                  <td className={`r ${cls}`}>{r.delta}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>{m.narrative}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
```

Note on `LineChart` import: it remains imported in case a future variant wants it; lint may flag it as unused. Drop the `LineChart` import line if your lint config errors on unused imports — easy patch:

If `npm run lint` flags unused `LineChart` in step 3, remove `import { LineChart } from '../charts/LineChart';` and delete that line from imports.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: Either passes, OR flags unused `LineChart` import — in which case remove that import line and re-run lint to confirm clean.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/monthly-report/sections/
git commit -m "feat(monthly-report): rewrite MoM as MoMSection (Dr. Cuddles)

Wraps charts in chart-card primitives (gold top-rule + title row).
ComparisonChart for revenue vs. target; optional BarChart for CAC.
Replaces V1.1's grid layout with a flowing column. dt table replaces
the old data table; narrative renders both as the lead and the tfoot summary."
```

---

### Task 12: Create FindingsSection

**Files:**
- Create: `src/components/monthly-report/sections/FindingsSection.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/monthly-report/sections/FindingsSection.tsx` with:

```tsx
import React from 'react';
import type { Report } from '../types';
import { sectionNumber } from '../shell/section-number';

const MAX_CARDS = 6;

export function FindingsSection({ data }: { data: Report }) {
  const items = data.highlights ?? [];
  if (items.length === 0) return null;

  const num = sectionNumber(data.sections, 'highlights');
  const cards = items.slice(0, MAX_CARDS);
  const overflow = items.slice(MAX_CARDS);

  return (
    <section id="highlights">
      <div className="container">
        <span className="section-tag">Section {num} · Findings</span>
        <h1>Key <em>findings</em></h1>
        <p className="lead">What worked this month, and why it moved the numbers.</p>

        <div className="insights">
          {cards.map((h, i) => (
            <div key={i} className="insight">
              <div className="insight-num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{h.title}</h4>
              <p>{h.body}</p>
              {h.meta && <p className="muted">{h.meta}</p>}
            </div>
          ))}
        </div>

        {overflow.length > 0 && (
          <ul className="regular">
            {overflow.map((h, i) => (
              <li key={i}><strong>{h.title}.</strong> {h.body}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/monthly-report/sections/FindingsSection.tsx
git commit -m "feat(monthly-report): add FindingsSection renderer

Renders <section id=\"highlights\"> over data.highlights using insights
3-up grid. Returns null when array is empty/undefined.
Overflow (>6) drops to ul.regular bullet list."
```

---

### Task 13: Rewrite Products (rename ProductsPage.tsx → ProductsSection.tsx) + update test

**Files:**
- Delete: `src/components/monthly-report/sections/ProductsPage.tsx`
- Delete: `src/components/monthly-report/sections/ProductsPage.test.tsx`
- Create: `src/components/monthly-report/sections/ProductsSection.tsx`
- Create: `src/components/monthly-report/sections/ProductsSection.test.tsx`

- [ ] **Step 1: Write the failing test first (TDD)**

Delete and recreate via git rename + content rewrite. First, delete old files:

```bash
git rm src/components/monthly-report/sections/ProductsPage.tsx
git rm src/components/monthly-report/sections/ProductsPage.test.tsx
```

Create `src/components/monthly-report/sections/ProductsSection.test.tsx` with:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductsSection } from "./ProductsSection";
import type { Report } from "../types";

function makeReport(rows: Report["products"]): Report {
  return {
    meta: {
      client: "Dr. Cuddles",
      month: "March 2026",
      period: "01 Mar – 31 Mar",
      lead: "Manu Lancharro",
      issued: "Apr 24, 2026",
      reportId: "2026-03-dr-cuddles",
    },
    sections: ["cover", "toc", "products"],
    products: rows,
  };
}

describe("ProductsSection", () => {
  it("renders rows sorted by sales desc with grand total in tfoot", () => {
    const data = makeReport([
      { asin: "A1", title: "Small widget", sku: "SKU-A", sessions: 100, units: 5,  sales: 50,  cvr: 5,  buyBox: 90 },
      { asin: "B2", title: "Big widget",   sku: "SKU-B", sessions: 200, units: 40, sales: 400, cvr: 20, buyBox: 98 },
    ]);
    const { container } = render(<ProductsSection data={data} />);
    const bodyRows = container.querySelectorAll("table.dt tbody tr");
    expect(bodyRows[0]?.textContent).toContain("Big widget");
    expect(bodyRows[1]?.textContent).toContain("Small widget");
    const footRow = container.querySelector("table.dt tfoot tr");
    expect(footRow?.textContent).toMatch(/TOTAL/);
  });

  it("caps at top 20 and shows overflow note", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      asin: `A${i}`, title: `P${i}`, sku: `S${i}`,
      sessions: 1, units: 1, sales: 1000 - i, cvr: 5, buyBox: 90,
    }));
    render(<ProductsSection data={makeReport(many)} />);
    expect(screen.getByText(/Showing top 20 of 25 ASINs/i)).toBeInTheDocument();
  });

  it("applies ok/warn/crit cell modifiers (mapped from threshold bands)", () => {
    const data = makeReport([
      { asin: "A1", title: "X", sku: "S", sessions: 100, units: 5, sales: 50, cvr: 15, buyBox: 98 }, // good/good → ok/ok
      { asin: "B2", title: "Y", sku: "S", sessions: 100, units: 5, sales: 40, cvr: 3,  buyBox: 70 }, // bad/bad → crit/crit
    ]);
    const { container } = render(<ProductsSection data={data} />);
    expect(container.querySelectorAll("td.ok").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("td.crit").length).toBeGreaterThan(0);
  });

  it("returns null when products is empty", () => {
    const data = makeReport([]);
    const { container } = render(<ProductsSection data={data} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/monthly-report/sections/ProductsSection.test.tsx`
Expected: FAIL with "Cannot find module './ProductsSection'" (file doesn't exist yet).

- [ ] **Step 3: Write the component**

Create `src/components/monthly-report/sections/ProductsSection.tsx` with:

```tsx
import React from 'react';
import type { Report, ProductRow } from '../types';
import { classifyMetric, THRESHOLDS, type MetricBand } from '@/lib/monthly-report/thresholds';
import { sectionNumber } from '../shell/section-number';

const DOLLAR = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat('en-US');
const PCT = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`;

/**
 * Maps the threshold engine's "good"/"warn"/"bad" band names to the
 * .dt table's "ok"/"warn"/"crit" cell modifier class names.
 */
function bandClass(b: MetricBand): string {
  if (b === 'good') return 'ok';
  if (b === 'bad') return 'crit';
  if (b === 'warn') return 'warn';
  return '';
}

function sum<T>(xs: T[], pick: (t: T) => number): number {
  return xs.reduce((a, t) => a + pick(t), 0);
}

export function ProductsSection({ data }: { data: Report }) {
  const allRows = data.products ?? [];
  if (allRows.length === 0) return null;

  const sorted = [...allRows].sort((a, b) => b.sales - a.sales);
  const top = THRESHOLDS.report.topProducts;
  const rows = sorted.slice(0, top);
  const overflow = sorted.length > top ? sorted.length : 0;

  const grand = {
    sessions: sum(sorted, r => r.sessions),
    units: sum(sorted, r => r.units),
    sales: sum(sorted, r => r.sales),
  };

  const num = sectionNumber(data.sections, 'products');

  return (
    <section id="products" className="soft">
      <div className="container">
        <span className="section-tag">Section {num} · Products</span>
        <h1>Product <em>performance</em></h1>
        <p className="lead">
          Per-ASIN breakdown sorted by sales. CVR and buy-box cells use the
          monthly-report config thresholds.
        </p>

        <table className="dt">
          <thead>
            <tr>
              <th>Product</th>
              <th className="r">Sessions</th>
              <th className="r">Units</th>
              <th className="r">Sales</th>
              <th className="r">CVR</th>
              <th className="r">Buy-box</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: ProductRow) => (
              <tr key={r.asin}>
                <td title={r.title}>{r.title}</td>
                <td className="r">{INT.format(r.sessions)}</td>
                <td className="r">{INT.format(r.units)}</td>
                <td className="r">{DOLLAR.format(r.sales)}</td>
                <td className={`r ${bandClass(classifyMetric(r.cvr, 'cvr'))}`}>{PCT(r.cvr)}</td>
                <td className={`r ${bandClass(classifyMetric(r.buyBox, 'buyBox'))}`}>{PCT(r.buyBox)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td className="r">{INT.format(grand.sessions)}</td>
              <td className="r">{INT.format(grand.units)}</td>
              <td className="r">{DOLLAR.format(grand.sales)}</td>
              <td className="r">—</td>
              <td className="r">—</td>
            </tr>
          </tfoot>
        </table>

        {overflow > 0 && (
          <p className="muted" style={{ fontSize: 10 }}>
            Showing top {top} of {overflow} ASINs.
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/monthly-report/sections/ProductsSection.test.tsx`
Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/monthly-report/sections/
git commit -m "feat(monthly-report): rewrite Products as ProductsSection (Dr. Cuddles)

Replaces V1.1 .pivot table with .dt table primitive.
TOTAL row moves to <tfoot> for the dark/gold styling.
classifyMetric's good/warn/bad bands map to ok/warn/crit cell modifiers
at the renderer boundary (threshold engine stays stable).
Tests updated for new component name + cell modifier names + tfoot grand row."
```

---

### Task 14: Create DirectionsSection

**Files:**
- Create: `src/components/monthly-report/sections/DirectionsSection.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/monthly-report/sections/DirectionsSection.tsx` with:

```tsx
import React from 'react';
import type { Report } from '../types';
import { sectionNumber } from '../shell/section-number';

const MAX_CARDS = 6;

export function DirectionsSection({ data }: { data: Report }) {
  const items = data.goals ?? [];
  if (items.length === 0) return null;

  const num = sectionNumber(data.sections, 'goals');
  const cards = items.slice(0, MAX_CARDS);
  const overflow = items.slice(MAX_CARDS);
  const opener = items[0];

  return (
    <section id="goals">
      <div className="container">
        <span className="section-tag">Section {num} · Directions</span>
        <h1>Next-month <em>directions</em></h1>

        <div className="pullquote">
          <em>{opener.body}</em>
        </div>

        <div className="insights">
          {cards.map((g, i) => (
            <div key={i} className="insight">
              <div className="insight-num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{g.title}</h4>
              <p>{g.body}</p>
              <p className="muted">Owner: {g.owner} · Success: {g.success}</p>
            </div>
          ))}
        </div>

        {overflow.length > 0 && (
          <ul className="regular">
            {overflow.map((g, i) => (
              <li key={i}><strong>{g.title}.</strong> {g.body}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/monthly-report/sections/DirectionsSection.tsx
git commit -m "feat(monthly-report): add DirectionsSection renderer

Renders <section id=\"goals\"> over data.goals: pullquote opener (lifts the
first goal's body) followed by insights 3-up grid with owner/success meta.
Returns null when array is empty/undefined. Overflow (>6) → ul.regular."
```

---

### Task 15: Create ScorecardSection

**Files:**
- Create: `src/components/monthly-report/sections/ScorecardSection.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/monthly-report/sections/ScorecardSection.tsx` with:

```tsx
import React from 'react';
import type { Report, Risk } from '../types';
import { sectionNumber } from '../shell/section-number';

function gradeFor(r: Risk): 'red' | 'amber' | 'green' {
  if (r.grade) return r.grade;
  if (r.severity === 'high') return 'red';
  if (r.severity === 'med') return 'amber';
  return 'green';
}

export function ScorecardSection({ data }: { data: Report }) {
  const items = data.risks ?? [];
  if (items.length === 0) return null;

  const num = sectionNumber(data.sections, 'risks');

  return (
    <section id="risks" className="dark">
      <div className="container">
        <span className="section-tag">Section {num} · Scorecard</span>
        <h1>Health <em>scorecard</em></h1>
        <p className="lead">Open risks and mitigations as of {data.meta.issued}.</p>

        <table className="dt">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Owner</th>
              <th>Impact</th>
              <th>Status</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => {
              const g = gradeFor(r);
              return (
                <tr key={i}>
                  <td>{r.item}</td>
                  <td>{r.owner}</td>
                  <td>{r.impact}</td>
                  <td>{r.status}</td>
                  <td><span className={`grade-pill ${g}`}>{g}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/monthly-report/sections/ScorecardSection.tsx
git commit -m "feat(monthly-report): add ScorecardSection renderer

Renders <section id=\"risks\" class=\"dark\"> over data.risks with a dt table
including a grade-pill column. Grade derives from risk.grade if provided,
else from severity (high→red, med→amber, low→green). Returns null when empty."
```

---

### Task 16: Rewrite Appendix (rename AppendixPage.tsx → AppendixSection.tsx)

**Files:**
- Delete: `src/components/monthly-report/sections/AppendixPage.tsx`
- Create: `src/components/monthly-report/sections/AppendixSection.tsx`

- [ ] **Step 1: Delete the old file**

```bash
git rm src/components/monthly-report/sections/AppendixPage.tsx
```

- [ ] **Step 2: Create the new file**

Create `src/components/monthly-report/sections/AppendixSection.tsx` with:

```tsx
import React from 'react';
import type { Report } from '../types';
import { sectionNumber } from '../shell/section-number';

export function AppendixSection({ data }: { data: Report }) {
  const a = data.appendix;
  if (!a) return null;

  const num = sectionNumber(data.sections, 'appendix');

  return (
    <section id="appendix">
      <div className="container">
        <span className="section-tag">Section {num} · Appendix</span>
        <h1>Appendix</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <h3>Methodology</h3>
            <p>{a.methodology}</p>

            <h3>Sources of truth</h3>
            <table className="dt">
              <tbody>
                {a.sources.map(([d, s], i) => (
                  <tr key={i}><td>{d}</td><td>{s}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3>Glossary</h3>
            <table className="dt">
              <tbody>
                {a.glossary.map(([t, def], i) => (
                  <tr key={i}><td><strong>{t}</strong></td><td>{def}</td></tr>
                ))}
              </tbody>
            </table>

            <h3>Change log</h3>
            {a.changelog.length === 0 ? (
              <p className="muted">No changes logged this issue.</p>
            ) : (
              <ul className="regular">
                {a.changelog.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
          </div>
        </div>

        <div className="callout sky">
          <span className="callout-tag">Contact</span>
          <p>
            Questions, corrections, or additions? This report is a living document.
            Flag items in the shared workspace by the 5th of the following month.
          </p>
          <p><strong>{a.contactLine}</strong></p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A src/components/monthly-report/sections/
git commit -m "feat(monthly-report): rewrite Appendix as AppendixSection (Dr. Cuddles)

Two-column grid: Methodology + Sources on the left, Glossary + Change log
on the right. Bottom callout uses .callout.sky variant with contact line.
Renders an empty-state line when changelog is empty."
```

---

## Phase E — Report.tsx + shell deletes

### Task 17: Rewrite Report.tsx + delete obsolete shell files

**Files:**
- Delete: `src/components/monthly-report/shell/PageShell.tsx`
- Delete: `src/components/monthly-report/shell/SectionHead.tsx`
- Modify (rewrite): `src/components/monthly-report/Report.tsx`

- [ ] **Step 1: Delete the obsolete shell files**

```bash
git rm src/components/monthly-report/shell/PageShell.tsx
git rm src/components/monthly-report/shell/SectionHead.tsx
```

- [ ] **Step 2: Rewrite Report.tsx**

Edit `src/components/monthly-report/Report.tsx`. Overwrite the entire file with:

```tsx
'use client';
import React from 'react';
import type { Report as ReportData, SectionId } from './types';
import { brand } from './defaults';
import { TopBar } from './shell/TopBar';
import { TocNav } from './shell/TocNav';
import { CoverHeader } from './sections/CoverHeader';
import { KPISection } from './sections/KPISection';
import { MoMSection } from './sections/MoMSection';
import { FindingsSection } from './sections/FindingsSection';
import { ProductsSection } from './sections/ProductsSection';
import { DirectionsSection } from './sections/DirectionsSection';
import { ScorecardSection } from './sections/ScorecardSection';
import { AppendixSection } from './sections/AppendixSection';

type SectionRenderer = (props: { data: ReportData }) => React.ReactNode;

const SECTIONS: Partial<Record<SectionId, SectionRenderer>> = {
  cover:      ({ data }) => <CoverHeader data={data} />,
  // 'toc' is rendered by TocNav at the top of Report; we omit it from the body map.
  kpis:       ({ data }) => <KPISection data={data} />,
  mom:        ({ data }) => <MoMSection data={data} />,
  highlights: ({ data }) => <FindingsSection data={data} />,
  products:   ({ data }) => <ProductsSection data={data} />,
  goals:      ({ data }) => <DirectionsSection data={data} />,
  risks:      ({ data }) => <ScorecardSection data={data} />,
  appendix:   ({ data }) => <AppendixSection data={data} />,
};

export function Report({
  data,
  printMode = false,
  showTopBar = true,
}: {
  data: ReportData;
  printMode?: boolean;
  showTopBar?: boolean;
}) {
  const accent = data.meta.accent ?? brand.colors.accent;
  const order = data.sections;
  const showToc = !printMode && order.includes('toc');

  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--orange', accent);
    if (printMode) {
      document.body.classList.add('print-mode');
    } else {
      document.body.classList.remove('print-mode');
    }
    return () => {
      document.body.classList.remove('print-mode');
    };
  }, [accent, printMode]);

  return (
    <>
      {!printMode && showTopBar && <TopBar data={data} />}
      {showToc && <TocNav data={data} />}
      {order.map((id, i) => (
        <React.Fragment key={id + i}>
          {SECTIONS[id]?.({ data })}
        </React.Fragment>
      ))}
      <footer>
        <div className="container">
          <div className="sig">{brand.agency} · Monthly <em>Report</em></div>
          <div className="meta">
            {data.meta.client} · {data.meta.month} · Issued {data.meta.issued} · Confidential
          </div>
        </div>
      </footer>
    </>
  );
}
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit`
Expected: No errors. (If you see errors about missing imports, double-check Tasks 8/10/11/13/14/15/16 all created their files.)

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 4: Run all section + build-data tests**

Run: `npm test -- src/components/monthly-report src/lib/monthly-report/build-report-data`
Expected: All pass (ProductsSection 4 tests + buildReportData 6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A src/components/monthly-report/
git commit -m "feat(monthly-report): rewrite Report.tsx + delete obsolete shell files

- Add printMode? and showTopBar? props (mode matrix per spec §7.1).
- Mount TopBar/TocNav per mode; render flat <section> blocks (no .deck).
- Footer renders inline at bottom of document.
- useEffect mirrors meta.accent into both --accent and --orange so primitives
  binding either name track per-client overrides; toggles body.print-mode.
- Drop floating .print-btn (now lives inside TopBar).
- Delete PageShell + SectionHead (no consumers in flow layout)."
```

---

## Phase F — Routing wiring

### Task 18: Pass `printMode={true}` from print route

**Files:**
- Modify: `src/app/reports/monthly/print/page.tsx`

- [ ] **Step 1: Edit the print route**

Edit `src/app/reports/monthly/print/page.tsx`. Find:

```tsx
  return (
    <>
      <ReportView data={report!} />
      <div data-report-ready="true" />
    </>
  );
```

and replace with:

```tsx
  return (
    <>
      <ReportView data={report!} printMode={true} />
      <div data-report-ready="true" />
    </>
  );
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/reports/monthly/print/page.tsx
git commit -m "feat(monthly-report): pass printMode=true from /reports/monthly/print

Strips TopBar + TocNav for the Puppeteer target. body.print-mode also gets
applied so the @media print rules render identically with or without an
actual print dialog (Puppeteer renders this URL as a regular page first)."
```

---

### Task 19: Pass `showTopBar={false}` from selector route

**Files:**
- Modify: `src/app/reports/monthly/page.tsx`

- [ ] **Step 1: Edit the selector route**

Edit `src/app/reports/monthly/page.tsx`. Find:

```tsx
          <ReportView data={data.report} />
        </>
      )}
```

and replace with:

```tsx
          <ReportView data={data.report} showTopBar={false} />
        </>
      )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/reports/monthly/page.tsx
git commit -m "feat(monthly-report): pass showTopBar=false from /reports/monthly selector

Prevents stacking the new sticky top-bar below the existing .report-chrome
sticky controls. TocNav still renders so the report has its own sticky
contents bar. Future read-only preview routes will keep showTopBar=true."
```

---

## Phase G — Verification

### Task 20: Full lint, test, and visual smoke test

This is the acceptance criteria pass from spec §12.

**Files:** none (verification only)

- [ ] **Step 1: Lint everything**

Run: `npm run lint`
Expected: No errors. (If unused-import warnings remain in MoMSection.tsx, drop the offending import per Task 11 step 3 — likely already done.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: All tests pass. The relevant suites:
- `src/components/monthly-report/sections/ProductsSection.test.tsx` — 4 tests
- `src/lib/monthly-report/build-report-data.test.ts` — 6 tests
- `src/lib/monthly-report/orchestrator.test.ts`, `format.test.ts`, `period.test.ts`, `pdf-token.test.ts`, `config.test.ts` — unchanged, must still pass.

If any unexpected failure surfaces in `orchestrator.test.ts` (it consumes `buildReportData`), check whether the test asserts on `meta.accent` or section ordering — if it asserts the old `#F7BF1D` accent, update the assertion the same way Task 3 did for `build-report-data.test.ts`.

- [ ] **Step 3: Type-check the whole tree**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Visual smoke test — selector page**

Start the dev server: `PORT=3000 npm run dev` (in a separate terminal)

Navigate to `http://localhost:3000/reports/monthly`. Open DevTools.

Confirm the following per spec §12:
1. Selector chrome (the `.report-chrome` sticky bar with client/month dropdowns) renders unchanged at the top.
2. Click "Generate" with the default Dr. Cuddles client + most-recent month.
3. Below the selector, the report appears: dark cover, sticky **TocNav only** (no TopBar — `showTopBar=false`), KPIs, MoM (soft background), Products (soft background), Appendix.
4. No console errors.
5. Findings/Directions/Scorecard do **not** render (their arrays are empty in production HTTP responses — that's expected).
6. Confirm `meta.accent` propagation: in DevTools Console run `getComputedStyle(document.documentElement).getPropertyValue('--accent')` and `... .getPropertyValue('--orange')`. Both should be `#F8BF1C` (or the configured accent).

- [ ] **Step 5: Visual smoke test — TocNav anchor jumps**

Click each anchor in TocNav. The page should scroll smoothly to the corresponding section. The first anchor (`MONTHLY REPORT` brand label) jumps to `#cover`.

- [ ] **Step 6: Visual smoke test — print preview**

In the same browser tab, hit `Cmd+P` (or `Ctrl+P`). The print preview should show:
- No TopBar, no TocNav, no `.report-chrome` selector chrome, no print button.
- Multi-page A4 layout with 18mm/14mm margins.
- No primitive (stat-cell, hero-cell, callout, pullquote, insight, chart-card, footer) torn across page boundaries.

Cancel the print dialog.

- [ ] **Step 7: Visual smoke test — PDF download**

Click "Download PDF" in the selector chrome. A PDF named `1899670-<period>-1o8-monthly.pdf` should download.

Open the PDF and confirm:
- Same content as the web preview, no chrome.
- Multi-page layout, no torn primitives.
- Cover hero on page 1, footer on the last page.

- [ ] **Step 8: Visual smoke test — Findings/Directions/Scorecard with fixtures**

(Optional but recommended — exercises the new renderers since production data doesn't populate them yet.)

In DevTools Console on the rendered selector page, after clicking Generate, run:

```js
// Hot-patch the rendered report's data with sample fixtures via React state.
// This is a smoke test only — refresh to revert.
console.log('Findings/Directions/Scorecard render via hand-edited build-input — verify in a unit test or wait for the V1.3 hand-edit UI.')
```

Skip if no hand-edit UI is available — this is acceptable for V1.2 since the data-flow contract is already verified by `buildReportData` unit tests.

- [ ] **Step 9: Stop the dev server**

Press `Ctrl+C` in the terminal running the dev server.

- [ ] **Step 10: Final commit**

The previous tasks should have left no uncommitted changes. Verify:

Run: `git status`
Expected: "nothing to commit, working tree clean".

If there are uncommitted changes (e.g. test snapshots, or you fixed an extra import during smoke testing), commit them with a descriptive message:

```bash
git add -A
git commit -m "fix(monthly-report): post-verification cleanup"
```

- [ ] **Step 11: Branch summary**

Run: `git log --oneline feat/monthly-reports ^main | head -30` (or use `git log --oneline -25`).

Expected: ~20 commits, one per task above.

---

## Self-Review

### Spec coverage check

Walked the spec sections:
- §1 Why — implicit in commit messages, not a code requirement.
- §2 Locked decisions Q1–Q5 — all executed (Tasks 11/13/14 add the three new sections, Task 17 adds printMode/showTopBar, Tasks 2/3 default the accent to #F8BF1C, Task 17 keeps the orchestrator changes minimal to pass-through).
- §3 Layout — Task 4 (CSS), Task 17 (Report.tsx flow).
- §4.1 Risk.grade — Task 1.
- §4.2 Tokens — Task 2.
- §4.3 BuildInput + section ordering — Task 3.
- §5 Primitives — Task 4.
- §5.6 Deletes — Task 4 omits all listed classes.
- §6.1–6.10 Section renderers — Tasks 8, 10, 11, 12, 13, 14, 15, 16, 17 (footer in Report.tsx).
- §7.1–7.4 Print mode — Tasks 4, 17, 18, 19.
- §8 File-by-file — every row implemented except the build-report-data.test.ts row, which is folded into Task 3.
- §9 Edge cases — defended in renderer null-returns and TocNav `hasBackingData`.
- §10 Out of scope — respected (no per-client accent lookup, no AI generation, ladder/sku-cards/phases CSS kept but no consumer).
- §11 Risks — primitive `page-break-inside: avoid` rules in Task 4 mitigate Puppeteer pagination tearing; the report-chrome / TopBar conflict is mitigated by `showTopBar={false}` in Task 19; section anchor collision is benign.
- §12 Acceptance — Task 20 walks every criterion.
- §13 Order (CSS first → renderers → routing → tests) — followed: Task 4 CSS first, Tasks 5–17 renderers/shell/Report.tsx, Tasks 18–19 routing, Task 20 verification.

No spec requirement is unimplemented.

### Type consistency

- `printMode?: boolean` and `showTopBar?: boolean` defined consistently in Report.tsx (Task 17), consumed in Tasks 18 and 19.
- `sectionNumber(sections, id)` signature is identical across Tasks 5, 10, 11, 12, 13, 14, 15, 16.
- `Risk.grade` field defined in Task 1 (`'red' | 'amber' | 'green'`) consumed in Task 15 with the same union.
- `BuildInput.highlights/goals/risks` defined in Task 3 consumed nowhere else (HTTP route untouched per spec).
- `bandClass(MetricBand)` defined inline in Task 13.

### Placeholder scan

No "TBD", "TODO", "implement later", "fill in details", or vague "add error handling" lines. Every step has either exact file paths, exact code, or exact commands with expected output.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-27-monthly-reports-redesign.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
