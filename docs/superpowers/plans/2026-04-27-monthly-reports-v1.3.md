# Monthly Reports V1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the four V1.2 visual-smoke-test items that block merge of `feat/monthly-reports`.

**Architecture:** Four narrow, independent changes inside the existing monthly-report stack — one CSS rule, one cover redesign across three files, one chart guard + empty-state, one config-list expansion. No new components, no new routes.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, Vitest. Worktree `/Users/manu/1o8Hub/.worktrees/monthly-reports/`. Branch `feat/monthly-reports`. HEAD `ec4383f`. Spec: `docs/superpowers/specs/2026-04-27-monthly-reports-v1.3-design.md`.

**Run commands** (always from the worktree root):
```bash
PORT=3000 npm run dev    # uses --webpack (Turbopack panics on PostCSS)
npm run test             # vitest
npm run lint
```

---

## Task 1: Fix untagged section background bleed-through

**Files:**
- Modify: `src/components/monthly-report/styles/report.css:203-206`

- [ ] **Step 1: Read current section rule**

Read lines 202-212 of `src/components/monthly-report/styles/report.css`. Confirm the rule reads:
```css
section {
  padding: 64px 0;
  border-bottom: 1px solid var(--rule);
}
section.dark { background: var(--grey); color: var(--white); }
section.soft { background: var(--bg-soft); }
```

- [ ] **Step 2: Add default background**

Edit the `section` block to add `background: var(--bg);`:
```css
section {
  padding: 64px 0;
  border-bottom: 1px solid var(--rule);
  background: var(--bg);
}
```
Leave the `.dark` and `.soft` rules unchanged — they cascade higher.

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run lint
npm run test -- --run src/components/monthly-report
```
Expected: PASS — no test depends on transparent-bg behavior.

- [ ] **Step 4: Visual verify in browser**

```bash
PORT=3000 npm run dev
```
Navigate to `http://localhost:3000/reports/monthly`. Generate a Dr. Cuddles March 2026 report. Confirm Sections 01 (kpis), 03 (highlights), 05 (goals), 07 (appendix) render with white backgrounds. Sections 02 (mom) and 04 (products) keep their soft grey. Section 06 (risks) stays dark.

- [ ] **Step 5: Commit**

```bash
git add src/components/monthly-report/styles/report.css
git commit -m "fix(monthly-report): default white bg on section to stop host theme bleed-through"
```

---

## Task 2: Cover B1 redesign

**Files:**
- Modify: `src/components/monthly-report/sections/CoverHeader.tsx` (full rewrite of return body)
- Modify: `src/components/monthly-report/styles/report.css` (add `.cover-logo`, `.cover-period`, drop unused `.cover-deck` styling — keep selectors but simplify since markup goes away)
- Modify: `src/lib/monthly-report/build-report-data.ts:132` (new reportId format)

- [ ] **Step 1: Update reportId in build-report-data**

In `src/lib/monthly-report/build-report-data.ts`, find the `meta:` block (around line 125-135). Replace:
```typescript
reportId: `${period.period}-${client.slug}`,
```
with:
```typescript
reportId: `${period.period.replace("-", "|")}|${client.accountId}`,
```

This produces `2026|03|1899670` from `period.period = "2026-03"` and the client's numeric Intentwise ID.

- [ ] **Step 2: Update build-report-data test**

Find `src/lib/monthly-report/build-report-data.test.ts`. If it asserts on `reportId`, update the expected value to match the new format. Run:
```bash
npm run test -- --run src/lib/monthly-report/build-report-data
```
Expected: PASS.

- [ ] **Step 3: Add CSS for cover-logo and cover-period**

In `src/components/monthly-report/styles/report.css`, after the existing `.cover-meta` rules (around line 200), add:
```css
.cover-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
}
.cover-logo img { height: 26px; width: auto; }
.cover-logo .wordmark {
  font-weight: 700;
  font-size: 13px;
  color: var(--white);
  letter-spacing: -0.01em;
}
.cover-period {
  margin-top: 14px;
  margin-bottom: 8px;
  line-height: 0.9;
  letter-spacing: -0.04em;
}
.cover-period .month {
  font-weight: 900;
  font-size: clamp(48px, 8vw, 72px);
  color: var(--orange);
}
.cover-period .year {
  font-weight: 700;
  font-size: clamp(20px, 3vw, 30px);
  color: rgba(255,255,255,0.55);
  margin-left: 10px;
}
```

- [ ] **Step 4: Rewrite CoverHeader.tsx**

Replace the entire contents of `src/components/monthly-report/sections/CoverHeader.tsx` with:
```tsx
import React from 'react';
import type { Report } from '../types';
import { brand } from '../defaults';

/**
 * Splits "March 2026" into { month: "March", year: "2026" }.
 * Falls back to the full string in `month` if the input has no space.
 */
function splitMonthYear(label: string): { month: string; year: string } {
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return { month: label, year: '' };
  return {
    month: parts.slice(0, -1).join(' '),
    year: parts[parts.length - 1],
  };
}

export function CoverHeader({ data }: { data: Report }) {
  const { meta } = data;
  const { month, year } = splitMonthYear(meta.month);

  return (
    <header className="cover" id="cover">
      <div className="container">
        <div className="cover-logo">
          <img src={brand.logoPath} alt={`${brand.agency} mark`} />
          <span className="wordmark">1o8Marketplace</span>
        </div>
        <div className="cover-eyebrow">{meta.client} · Performance</div>
        <h1 className="cover-title">
          Monthly <em>Performance Report</em>
        </h1>
        <div className="cover-period">
          <span className="month">{month}</span>
          {year && <span className="year">{year}</span>}
        </div>
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
Note: `meta.headline` and `meta.tagline` are no longer read. Leave them on the `ReportMeta` type — they may be referenced by exports.

- [ ] **Step 5: Run tests**

```bash
npm run test -- --run src/components/monthly-report
npm run lint
```
Expected: PASS. If a CoverHeader snapshot test exists, update it to match new markup.

- [ ] **Step 6: Visual verify**

In the running dev server (or restart with `PORT=3000 npm run dev`), navigate to `http://localhost:3000/reports/monthly`, generate a Dr. Cuddles March 2026 report. Confirm:
- Logo + "1o8Marketplace" wordmark top-left of the cover
- Eyebrow reads "Dr. Cuddles · Performance"
- Big white title "Monthly Performance Report" with "Performance Report" in gold
- Giant gold "March" + smaller muted "2026" sub-headline
- 5-up meta with Report ID showing `2026|03|1899670`
- No long deck paragraph

- [ ] **Step 7: Commit**

```bash
git add src/components/monthly-report/sections/CoverHeader.tsx \
        src/components/monthly-report/styles/report.css \
        src/lib/monthly-report/build-report-data.ts \
        src/lib/monthly-report/build-report-data.test.ts
git commit -m "feat(monthly-report): cover B1 redesign — logo, fixed title, gold month sub-headline, pipe-delimited reportId"
```

---

## Task 3: ComparisonChart defensive guards + MoMSection empty state

**Files:**
- Modify: `src/components/monthly-report/charts/ComparisonChart.tsx`
- Modify: `src/components/monthly-report/sections/MoMSection.tsx:30-44`
- Create: `src/components/monthly-report/charts/ComparisonChart.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/monthly-report/charts/ComparisonChart.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ComparisonChart } from './ComparisonChart';

describe('ComparisonChart', () => {
  it('returns null when series is empty', () => {
    const { container } = render(<ComparisonChart series={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when first series has no data points', () => {
    const { container } = render(
      <ComparisonChart series={[{ name: 'Actual', data: [] }]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders an svg when data is present', () => {
    const { container } = render(
      <ComparisonChart series={[{ name: 'Actual', data: [
        { label: 'Jan', value: 10 },
        { label: 'Feb', value: 20 },
      ]}]} />
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm run test -- --run src/components/monthly-report/charts/ComparisonChart
```
Expected: FAIL (the empty-series cases throw or render NaN, not null).

- [ ] **Step 3: Add guard to ComparisonChart**

In `src/components/monthly-report/charts/ComparisonChart.tsx`, immediately after the `pad`, `w`, `h` consts (around line 10), insert:
```typescript
if (series.length === 0 || series[0].data.length === 0) return null;
```

Place it before the `const all = series.flatMap(...)` line so the dangerous `Math.max(...all)` and `series[0].data` accesses are skipped when there's no data.

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- --run src/components/monthly-report/charts/ComparisonChart
```
Expected: PASS — all three cases.

- [ ] **Step 5: Add empty-state to MoMSection**

In `src/components/monthly-report/sections/MoMSection.tsx`, locate the chart-card render block around lines 37-43. Replace:
```tsx
<div className="chart-card">
  <div className="chart-card-meta">
    <div className="chart-card-title">Revenue vs. target</div>
    <div className="chart-card-axis">USD · {firstLabel} → {lastLabel}</div>
  </div>
  <ComparisonChart series={series} accent={accent} />
</div>
```
with:
```tsx
<div className="chart-card">
  <div className="chart-card-meta">
    <div className="chart-card-title">Revenue vs. target</div>
    <div className="chart-card-axis">USD · {firstLabel} → {lastLabel}</div>
  </div>
  {m.revenueSeries.length > 0 ? (
    <ComparisonChart series={series} accent={accent} />
  ) : (
    <p className="muted" style={{ padding: '32px 0', textAlign: 'center' }}>
      No revenue data available for {data.meta.month}.
    </p>
  )}
</div>
```

- [ ] **Step 6: Run full monthly-report test suite**

```bash
npm run test -- --run src/components/monthly-report
npm run lint
```
Expected: PASS — all 57 existing tests + the 3 new ComparisonChart tests = 60 passing.

- [ ] **Step 7: Visual verify**

Generate a report for Dr. Cuddles, March 2026 at `http://localhost:3000/reports/monthly`. If revenue data is present, the chart renders. If empty (likely for at least one client/period combination in 18 months of selectable history), Section 02 shows the placeholder text instead of a blank chart.

- [ ] **Step 8: Commit**

```bash
git add src/components/monthly-report/charts/ComparisonChart.tsx \
        src/components/monthly-report/charts/ComparisonChart.test.tsx \
        src/components/monthly-report/sections/MoMSection.tsx
git commit -m "fix(monthly-report): guard ComparisonChart against empty data + add MoM empty-state placeholder"
```

---

## Task 4: Section config expansion

**Files:**
- Modify: `src/lib/monthly-report/types.ts:5` (`SectionKey` union)
- Modify: `src/lib/monthly-report/config.ts:6` (`ALL_SECTION_KEYS`)
- Modify: `src/lib/monthly-report/config.test.ts` (update test fixtures)
- Modify: `src/app/reports/monthly/config/page.tsx:8-19` (`SECTIONS` metadata)

- [ ] **Step 1: Update SectionKey union**

In `src/lib/monthly-report/types.ts`, find line 5:
```typescript
export type SectionKey = "products" | "b2b";
```
Replace with:
```typescript
export type SectionKey =
  | "kpis"
  | "mom"
  | "highlights"
  | "products"
  | "goals"
  | "risks"
  | "appendix";
```

This narrows the union — TypeScript will now flag any code referencing `"b2b"` as an invalid `SectionKey`.

- [ ] **Step 2: Update ALL_SECTION_KEYS**

In `src/lib/monthly-report/config.ts`, replace line 6:
```typescript
export const ALL_SECTION_KEYS: readonly SectionKey[] = ["products", "b2b"] as const;
```
with:
```typescript
export const ALL_SECTION_KEYS: readonly SectionKey[] = [
  "kpis",
  "mom",
  "highlights",
  "products",
  "goals",
  "risks",
  "appendix",
] as const;
```

- [ ] **Step 3: Run typecheck to find downstream references**

```bash
npx tsc --noEmit
```
Expected: errors at any callsite that referenced `"b2b"` as a `SectionKey`. If errors point to `config.test.ts` or other test fixtures, capture them — those need fixture updates.

- [ ] **Step 4: Update config tests**

Open `src/lib/monthly-report/config.test.ts`. Anywhere a fixture asserts on the exact set `["products", "b2b"]`, replace with the new seven-key list. If a test specifically exercises `"b2b"` toggling, change it to test `"kpis"` or another new key.

Run:
```bash
npm run test -- --run src/lib/monthly-report/config
```
Expected: PASS.

- [ ] **Step 5: Update config page SECTIONS metadata**

In `src/app/reports/monthly/config/page.tsx`, replace lines 8-19:
```typescript
const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string; deck: string }> = [
  {
    key: "products",
    label: "Product performance",
    deck: "Per-ASIN breakdown sorted by sales. Colour coding is driven by CVR and buy-box thresholds.",
  },
  {
    key: "b2b",
    label: "B2B split",
    deck: "Share of revenue and units from Amazon Business buyers versus consumers.",
  },
];
```
with:
```typescript
const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string; deck: string }> = [
  { key: "kpis",       label: "Key metrics",         deck: "Top-line KPIs with month-over-month deltas." },
  { key: "mom",        label: "Trends",              deck: "Revenue vs. target and CAC charts with the comparison table." },
  { key: "highlights", label: "Findings",            deck: "Numbered highlights and decisions made this period." },
  { key: "products",   label: "Product performance", deck: "Per-ASIN breakdown sorted by sales and gated by CVR / buy-box thresholds." },
  { key: "goals",      label: "Directions",          deck: "Forward-looking experiments and bets for the coming month." },
  { key: "risks",      label: "Scorecard",           deck: "Risk register and grades against monthly targets." },
  { key: "appendix",   label: "Appendix",            deck: "Methodology, data sources, glossary." },
];
```

- [ ] **Step 6: Run full type and test pass**

```bash
npx tsc --noEmit
npm run test
npm run lint
```
Expected: PASS — all 60 tests pass (57 monthly-report + 3 new chart). One pre-existing SEO route test may still fail (unrelated to this branch).

- [ ] **Step 7: Visual verify config UI**

Navigate to `http://localhost:3000/reports/monthly/config`. Confirm the Global defaults section lists all seven section names. The per-client override table has seven columns. Click a cell — it cycles through default → ON → OFF as before. Refresh the page; the change persists (writes to `/api/reports/monthly/config`).

- [ ] **Step 8: Verify report respects toggles end-to-end**

On `/reports/monthly`, set a per-client override to OFF for `kpis` (Dr. Cuddles). Generate a Dr. Cuddles report. Confirm Section 01 is absent. Confirm the TOC numbers shift accordingly (highlights is now 02, etc.). Reset the override.

- [ ] **Step 9: Commit**

```bash
git add src/lib/monthly-report/types.ts \
        src/lib/monthly-report/config.ts \
        src/lib/monthly-report/config.test.ts \
        src/app/reports/monthly/config/page.tsx
git commit -m "feat(monthly-report): expand section config to all 7 body sections; drop b2b ghost toggle"
```

---

## Final verification

- [ ] **Step 1: Full suite green**

```bash
npm run test
npx tsc --noEmit
npm run lint
```
Expected: 60 monthly-report tests pass. Pre-existing unrelated SEO route test failure (if still present) is acceptable.

- [ ] **Step 2: Update primer**

Edit `~/.claude/primer.md`. Under the "Active Project" section, change the V1.3 status to reflect completion: list the four V1.3 commits, note tests green, and update "Exact Next Step" to call for `superpowers:finishing-a-development-branch`.

- [ ] **Step 3: Push branch**

```bash
git push origin feat/monthly-reports
```

- [ ] **Step 4: Hand off**

Open a fresh session and invoke `superpowers:finishing-a-development-branch` to merge.
