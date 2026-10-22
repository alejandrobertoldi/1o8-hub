# Monthly Reports V1.3 — Design

**Status:** approved (brainstorm 2026-04-27)
**Branch:** `feat/monthly-reports` (worktree `/Users/manu/1o8Hub/.worktrees/monthly-reports/`)
**Builds on:** V1.2 redesign (commits `103c283..001d2db`)
**Builds toward:** mergeable `feat/monthly-reports`

## Scope

V1.2 shipped mechanically green (tsc clean, 57/57 tests). The visual smoke test surfaced four polish items that block merge. This spec captures fixes for all four. Out of scope: a `top-nav.tsx` hydration warning that originates from uncommitted work on `main`, not this branch.

## 1. Untagged section background

**Problem.** `report.css:203` styles `section { padding: 64px 0; border-bottom: 1px solid var(--rule); }` with no `background`. Only `.soft` and `.dark` modifiers set one. The reference HTML at `docs/superpowers/specs/_assets/2026-04-27-dr-cuddles-reference.html` worked as a standalone document where `body { background: var(--bg) }` (white) filled untagged sections. In the host app, the report renders inside the dark-themed shadcn shell, so untagged sections become transparent and the host's `bg-background` (near-black) bleeds through. Sections affected: `kpis` (01), `highlights` (03), `goals` (05), `appendix` (07).

**Change.** Add a default white background to `section` so it stops inheriting the host theme:

```css
section {
  padding: 64px 0;
  border-bottom: 1px solid var(--rule);
  background: var(--bg);
}
```

The existing `section.soft` and `section.dark` rules already cascade higher and stay intact.

## 2. Cover redesign (B1)

**Problem.** V1.2 cover defaults to `headline = "Growth, measured in detail."` and a long deck describing the doc. Internal stakeholders want a literal, branded cover that reads "Monthly Performance Report · {Month} {Year}" with the agency mark visible.

**Change.** Rework `CoverHeader.tsx` and the `meta` defaults in `build-report-data.ts`:

- **Logo block** — render `<img src={brand.logoPath} />` (already at `public/1o8hub-mark.svg`) with the wordmark "1o8Marketplace" beside it, top-left of the cover container, above the eyebrow.
- **Eyebrow** — keep position and styling. Default text becomes `${client.name} · Performance` (was "Monthly Performance Report · Internal").
- **Title** — fixed string `"Monthly Performance Report"` with `Performance Report` rendered as the gold `<em>` accent. Drop the `splitHeadline` helper; the title is now static. `meta.headline` becomes ignored or removed (see migration note below).
- **Sub-headline (new)** — directly under the title, a giant gold month + smaller muted year, e.g. `<div class="cover-period"><span class="month">March</span><span class="year">2026</span></div>`. Sized at ~64px / 28px. Drives the "main place" requirement for the period.
- **Deck** — remove. Drop the `<p className="cover-deck">` element entirely. `meta.tagline` becomes unused.
- **Meta strip** — keep the existing 5-up grid (`Client · Period · Issued · Lead · Report ID`).
- **Report ID format** — change from `${period.period}-${client.slug}` (`2026-03-dr-cuddles`) to `${YYYY}|${MM}|${clientCode}` (`2026|03|1899670`). The numeric client code is the key in the `CLIENTS` map at `src/app/reports/monthly/page.tsx:10` and is the same value already passed to the `/api/reports/monthly` POST as `clientCode`. The orchestrator at `src/lib/monthly-report/orchestrator.ts` (callsite for `buildReportData`) must thread `clientCode` through to the `meta.reportId` template; `client.slug` stays unchanged for filenames and download paths.

**CSS additions in `report.css`:**

```css
.cover-logo { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 22px; }
.cover-logo img { height: 26px; width: auto; }
.cover-logo .wordmark { font-weight: 700; font-size: 13px; color: var(--white); letter-spacing: -0.01em; }
.cover-period { margin-top: 14px; line-height: 0.9; letter-spacing: -0.04em; }
.cover-period .month { font-weight: 900; font-size: clamp(48px, 8vw, 72px); color: var(--orange); }
.cover-period .year { font-weight: 700; font-size: clamp(20px, 3vw, 30px); color: rgba(255,255,255,0.55); margin-left: 10px; }
```

**Migration note.** `meta.headline` and `meta.tagline` become unread by V1.3 cover. Leave the fields on the `Report.meta` type (they may be used by exports or external integrations) but stop populating defaults from `build-report-data.ts`. If no external consumer exists after grep, remove from the type in a follow-up.

## 3. ComparisonChart fix + empty-state card

**Problem.** `MoMSection.tsx:42` passes `series` to `ComparisonChart`. If `m.revenueSeries` is empty (e.g. data not yet ingested for the chosen period), `ComparisonChart.tsx:11` does `Math.max(...[])` → `-Infinity`, all coordinates become `NaN`, and the SVG renders blank. If `series` itself is empty, `series[0].data.length` crashes outright.

**Change in `ComparisonChart.tsx`.** Guard at the top:

```typescript
if (series.length === 0 || series[0].data.length === 0) return null;
```

Returning `null` keeps the component pure and lets the consumer decide what to render in place.

**Change in `MoMSection.tsx`.** Wrap the chart in a graceful empty-state when no revenue data exists. Detect the empty case once and render an "no data" placeholder card instead of the live chart:

```tsx
const hasRevenueData = m.revenueSeries.length > 0;

<div className="chart-card">
  <div className="chart-card-meta">…</div>
  {hasRevenueData
    ? <ComparisonChart series={series} accent={accent} />
    : <p className="muted" style={{ padding: '32px 0', textAlign: 'center' }}>
        No revenue data available for {data.meta.month}.
      </p>}
</div>
```

CAC chart (`BarChart`) is gated by `hasCAC` already and is out of scope here. Same for `LineChart` — defer to a separate audit only if a bug is observed.

**Upstream investigation.** When implementing, run `npm run dev` and inspect the actual `revenueSeries` for Dr. Cuddles March 2026. If empty, trace `build-report-data.ts:113-142` and the underlying `headline` analyzer to confirm whether the ingestion gap is the chart's root cause. Document findings in the implementation plan; fixing ingestion is out of V1.3 scope unless it's a one-line bug.

## 4. Section configuration UI — expand toggleable keys

**Problem.** `src/lib/monthly-report/config.ts:6` defines `ALL_SECTION_KEYS = ["products", "b2b"]`. The config UI at `/reports/monthly/config` only exposes those two. The user wants control over every body section. Additionally, `b2b` is in the list but has no entry in the `SECTIONS` renderer map at `Report.tsx:18-28`, so toggling it has no visible effect today (ghost toggle).

**Change in `src/lib/monthly-report/config.ts`.** Replace `ALL_SECTION_KEYS` to match the `SECTIONS` renderer map in `Report.tsx`:

```typescript
export const ALL_SECTION_KEYS: readonly SectionKey[] = [
  "kpis", "mom", "highlights", "products", "goals", "risks", "appendix",
] as const;
```

`cover` and `toc` stay non-configurable (always render).
`b2b` is removed from `ALL_SECTION_KEYS` until a renderer exists; this collapses the ghost toggle.

**Change in `SectionKey` type.** Update the union in `src/lib/monthly-report/types.ts` to match the seven-key list above. If `SectionKey` was a free string before, narrow it — type-checked drift becomes impossible.

**Change in `/reports/monthly/config/page.tsx:8-19`.** Update the `SECTIONS` array of display metadata to cover all seven keys. Each entry needs `key`, `label`, and `deck` text:

```typescript
const SECTIONS = [
  { key: "kpis",       label: "Key metrics",     deck: "Top-line KPIs with month-over-month deltas." },
  { key: "mom",        label: "Trends",          deck: "Revenue vs. target and CAC charts with the comparison table." },
  { key: "highlights", label: "Findings",        deck: "Numbered highlights and decisions made this period." },
  { key: "products",   label: "Product performance", deck: "Per-ASIN breakdown sorted by sales." },
  { key: "goals",      label: "Directions",      deck: "Forward-looking experiments and bets." },
  { key: "risks",      label: "Scorecard",       deck: "Risk register and grades against monthly targets." },
  { key: "appendix",   label: "Appendix",        deck: "Methodology, sources, glossary." },
];
```

**Database migration.** The existing `monthly_report_section_overrides` table (or wherever the config persists) gains rows for the five new keys when users toggle. No schema change needed as long as `section_key` is a free string column. Verify before implementing.

**Migration of existing data.** Any stored row referencing `b2b` becomes orphaned. Since the toggle had no effect, dropping it is safe. The implementation plan should add a one-liner cleanup migration or simply ignore `b2b` rows on read (defensively filter against `ALL_SECTION_KEYS`).

## Out of scope

- **`top-nav.tsx` hydration warning at `#page-meta-slot`.** Originates in uncommitted portal-slot work on `main`, not in this branch's worktree. File as a separate todo.
- **Deeper chart audit (BarChart, LineChart).** Address only if observed broken.
- **Per-section content configuration** (e.g. "show top N products"). Deferred to V1.4 spec.

## Test plan

- `report.css` change: visually verify Sections 01, 03, 05, 07 render with white background on `/reports/monthly` after generating a report. Existing `.soft` (02, 04) and `.dark` (06) sections unchanged.
- Cover: visual confirmation of B1 layout — logo, eyebrow, title, giant month/muted year, 5-up meta with new ID format. Existing component snapshot tests (if any) updated to match new markup.
- Chart fix: a unit test in `ComparisonChart.test.tsx` (new) covering `series=[]` and `series[0].data=[]` returning `null`. Visual confirmation of empty-state placeholder when revenue is missing.
- Section config: existing config UI tests updated for the seven-key list. Verify global toggle and per-client cycle still work for each key.
- Full suite: `npm run test` must remain at 57/57 monthly-report tests passing (or higher after additions).

## Acceptance criteria

1. Visual smoke test on `/reports/monthly` for Dr. Cuddles, March 2026: no untagged section shows host-dark bleed-through; cover renders the new B1 layout; MoM chart either renders correctly or shows the empty-state placeholder; config UI lists all seven sections.
2. `tsc` clean.
3. Test suite green.
4. Branch ready for `superpowers:finishing-a-development-branch`.
