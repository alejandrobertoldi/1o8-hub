# Monthly Reports — Dr. Cuddles Aesthetic Redesign (Design Spec)

**Date:** 2026-04-27
**Branch:** `feat/monthly-reports` (worktree `.worktrees/monthly-reports/`)
**Predecessor spec:** `2026-04-24-monthly-reports-renderer-swap-design.md` (V1.1, shipped cover/toc/kpis/mom/products/appendix on the current A4 paginator)
**WIP / brainstorm record:** `2026-04-27-monthly-reports-redesign-WIP.md`
**Reference HTML:** `_assets/2026-04-27-dr-cuddles-reference.html` (CSS + class structure are authoritative for tokens and primitives)
**Status:** Ready for user review

---

## 1. Why

The V1.1 monthly report renders six sections inside a per-page A4 shell (Space Grotesk display, cream paper, fixed 794×1123 page rectangles). The user wants to retire that aesthetic and adopt the **Dr. Cuddles "Full Audit"** visual language: Inter heavy weights, sticky black top-bar + dark TOC, white/soft/dark section rhythm, and a richer palette of layout primitives (`stats-bar`, `hero-stat`, `callout`, `pullquote`, `dt`, `ladder`, `sku-cards`, `insights`, `chart-card`, `phases`).

Dr. Cuddles is being adopted as a **visual format template only**, not a content blueprint. No AI generation, no analyzers, no auto-commentary. Existing `Report` data (KPIs / MoM / Products) keeps its current source of truth via the orchestrator. Three new sections — Findings, Directions, Scorecard — are introduced as renderers over existing `Report` fields the user populates by hand. Sections auto-hide when their backing array is empty.

---

## 2. Locked decisions (recap)

| # | Decision |
|---|---|
| Q1 | **Option C** — restyle the 6 existing sections in Dr. Cuddles aesthetic AND add new analytical section renderers. |
| Q2 | Add `findings` + `directions` + `scorecard`. **Skip `roadmap`** (quarterly artifact). Findings reuse `highlights` data, Directions reuse `goals`, Scorecard reuses `risks` (with an additive `status?` field for red/amber/green grade). No `Report`-shape breaking change. |
| Q3 | Sticky `top-bar` + `toc` render in the web preview at `/reports/monthly` (the existing selector page that mounts `<Report>`). The print route at `/reports/monthly/print` strips them via a `printMode` prop on `<Report>`. |
| Q4 | `meta.accent` stays on `ReportMeta`, default value moves to `#F8BF1C` (Dr. Cuddles gold; within rounding of `#F7BF1D`). DB-driven per-client accent deferred to V1.2. |
| Q5 / SCOPE CORRECTION | **Visual format template only.** No analyzers, no auto-fill, no orchestrator changes beyond `build-report-data.ts` passing through user-provided `highlights` / `goals` / `risks` arrays. Empty array → renderer skips its section. |

---

## 3. Layout architecture change

This is the load-bearing change in the redesign. Capture it carefully.

### 3.1 Today (V1.1)

- `Report.tsx` renders a `.deck` container with one `.page` div per section (`794×1123px`, A4 aspect).
- Each section component wraps content in `<PageShell>` which absolute-positions a `.page-header` and `.page-footer` inside the page rectangle.
- Print pagination is structural: each `.page` div = one PDF page via `page-break-after: always` in `@media print`.
- `<button class="print-btn">` floats fixed top-right and triggers `window.print()`.

### 3.2 Target (this spec)

- `Report.tsx` renders a flowing document: sticky `<div class="top-bar">` and `<nav class="toc">` followed by `<header class="cover">` and a sequence of `<section>` blocks (default / `.soft` / `.dark` background rhythm).
- No per-section page rectangles. No absolute-positioned per-page header/footer.
- `<PageShell>` and the per-page header/footer chrome are **deleted**. `<SectionHead>` is replaced by an inline `section-tag` + `<h1>` pattern (see §5.2).
- Pagination for PDF is delegated to **Puppeteer + CSS `@page`** directives. The flowing document is paginated naturally during PDF rendering, with `@page { size: A4; margin: ...; }` plus `page-break-inside: avoid` on key primitive blocks (stat-bars, hero-stat cells, sku-cards, insights, ladder rungs, chart-card, phases, callouts, pullquotes) so primitives don't tear across page boundaries.
- The web preview keeps the sticky `top-bar` + `toc`. The print route hides them via the `printMode` prop and a corresponding `body.print-mode` CSS guard.

### 3.3 Routes (unchanged)

- `/reports/monthly` — interactive selector + on-demand `<Report>` mount (the existing page; not `/preview/[id]` despite WIP shorthand).
- `/reports/monthly/print` — JWT-verified Puppeteer target; passes `printMode={true}` to `<Report>`.
- `/api/reports/monthly/pdf` — orchestrates the JWT-signed token + Puppeteer launch (no change beyond what already shipped in V1.1).

### 3.4 Component-tree diff

```
BEFORE                                  AFTER
────────────────────────────────────    ────────────────────────────────────
<Report>                                <Report printMode?>
  <button.print-btn/>                     {!printMode && <TopBar/>}
  <div.deck>                              {!printMode && <TocNav/>}
    <CoverPage/>                          <CoverHeader/>     ← was <CoverPage>
    <TOCPage/>                            <main.report>
    <KPIPage/>                              <KPISection/>    ← was <KPIPage>
    <MoMPage/>                              <MoMSection/>    ← was <MoMPage>
    <ProductsPage/>                         <FindingsSection/>      [NEW]
    <AppendixPage/>                         <ProductsSection/>
  </div.deck>                               <DirectionsSection/>    [NEW]
                                            <ScorecardSection/>     [NEW]
                                            <AppendixSection/>
                                          </main>
```

Section files keep one component each, but the wrapper is a `<section>` element with a CSS variant class (`.soft` / `.dark` / default), not a fixed-aspect `.page` div.

---

## 4. Data contract changes

Goal: zero breaking changes for existing callers. All extensions additive, all fields optional.

### 4.1 `types.ts`

```ts
// Existing severity unchanged — still 'high' | 'med' | 'low'.
// Add an optional status field to Risk for the scorecard's red/amber/green grade.
export interface Risk {
  item: string;
  owner: string;
  severity: Severity;
  impact: string;
  status: string;                          // EXISTING — short status text, e.g. "Mitigating"
  grade?: 'red' | 'amber' | 'green';       // NEW — color grade for the scorecard rendering
}
```

Rationale: `status` is already a free-text field in V1.1 (e.g. `"Mitigating"`). We do **not** repurpose it. The new `grade` field controls the colored cell in the scorecard table independent of severity. Renderer rule: if `grade` is omitted, derive it from `severity` (`high → red`, `med → amber`, `low → green`).

The `SectionId` union does **not** change. Findings, Directions, and Scorecard are new render labels for the existing `highlights`, `goals`, and `risks` IDs respectively. The TOC label map (currently in `TOCPage.tsx`) updates the human-readable strings:

| `SectionId` | V1.1 label | New label |
|---|---|---|
| `highlights` | "Highlights & wins" | "Findings" |
| `goals` | "Next month's goals" | "Directions" |
| `risks` | "Challenges & risks" | "Scorecard" |

All other labels keep their current strings.

### 4.2 `defaults.ts`

Brand tokens shift to the Dr. Cuddles values:

```ts
export const brand = {
  agency: '1o8Hub',
  logoPath: '/1o8hub-mark.svg',
  contactDomain: '1o8.agency',
  colors: {
    ink: '#2C2B36',          // was '#0A0A0A'
    paper: '#FFFFFF',        // was '#FAFAF7'
    paperSoft: '#f7f6f3',    // NEW — for section.soft
    grey: '#2C2B36',         // NEW — for section.dark and table headers
    accent: '#F8BF1C',       // was '#F7BF1D'  (within rounding; matches reference)
    positive: '#35C759',     // NEW
    neutral:  '#FAC800',     // NEW
    negative: '#FF5C60',     // NEW
  },
  fonts: {
    display: 'Inter, system-ui, sans-serif',                  // was Space Grotesk
    body:    'Inter, system-ui, sans-serif',                  // unchanged family, still Inter
    mono:    'JetBrains Mono, ui-monospace, monospace',       // unchanged
  },
} as const;
```

`brand.colors.cream` is dropped (not used in Dr. Cuddles).

### 4.3 `build-report-data.ts`

Three changes, all conservative pass-throughs:

1. Default `meta.accent` value moves from `"#F7BF1D"` to `"#F8BF1C"`.
2. Extend `BuildInput` with optional `highlights?: Highlight[]`, `goals?: Goal[]`, `risks?: Risk[]` fields. `buildReportData` passes them through to the returned `Report` (`highlights: inp.highlights`, etc.). When an array is non-empty, the corresponding `SectionId` (`'highlights'` / `'goals'` / `'risks'`) is pushed into `data.sections`. Section ordering: `[cover, toc, kpis, mom, highlights, products, goals, risks, appendix]`, with each non-default member skipped when its data is missing.
3. No HTTP route changes. The `POST /api/reports/monthly` body still doesn't accept these fields, so production reports will have empty arrays and the new sections render nothing in production until a hand-edit UI is added in a follow-up. The orchestrator still does not auto-populate findings / directions / scorecard — that is the scope correction in §2.

The new fields exist purely so the renderers can be exercised by tests, fixtures, and the future hand-edit UI without re-touching `build-report-data.ts` again.

---

## 5. Visual primitives port

This section is the implementation contract for `report.css`. The reference HTML's `<style>` block is authoritative for property values; reproduce it 1:1 except where called out below.

### 5.1 Tokens (CSS variables on `:root`)

Mirror exactly the reference:

```css
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

  /* App-side overrides for accent. defaults.ts's accent is mirrored into --orange
     at runtime via Report.tsx's existing useEffect. */
  --accent: var(--orange);
}
```

Existing V1.1 paper/cream/Space Grotesk tokens are deleted from `:root`.

### 5.2 Type system

| Element | Class / pattern | Notes |
|---|---|---|
| Eyebrow tag | `.section-tag` | Orange uppercase, underlined |
| Section H1 | `<h1>` with `<em>` accent word | Renders the second half of the title in orange |
| Section H2 | `<h2>` for sub-sections within a section block |
| H3 | `<h3>` for component-level titles (e.g. "Reading the trend") |
| H4 | `.callout-tag`-like uppercase orange micro-label |
| Lede paragraph | `<p class="lead">` | 14px / weight 500 / `<em>` accent |
| Body paragraph | `<p>` | 11.5px / 1.65 / `var(--ink-soft)` |
| Bullet list | `<ul class="regular">` | Orange bullet, no list marker |

**Removed** from V1.1: `h1.display`, `h2.section-title`, `h3.sub`, `.lede` (Space Grotesk variant), `.eyebrow .dot`. Anywhere the V1.1 sections used these, swap to the equivalents above.

### 5.3 Primitive blocks

Lift the following classes verbatim from the reference HTML's `<style>` block (token names, sizes, padding, breakpoints all as written there). Each is a self-contained block with its own grid.

- **`top-bar`** — sticky black bar with orange bottom border. Holds logo wrap, subject label, "Internal · Confidential" pill.
- **`toc`** — sticky dark bar below the top-bar. Horizontal scroll list of `<a>` anchors; first child gets `.brand` (orange).
- **`cover`** — full-bleed dark hero with eyebrow, oversized headline (`<em>` accent), deck paragraph, 5-up `cover-meta` row.
- **`stats-bar`** — 4-up KPI grid with one shared dark border + per-cell orange top-rule (28×3px).
- **`hero-stat`** — 2-up large-numeral KPI pair. Larger padding and 42px values. Variants `.positive`, `.brand`.
- **`callout`** — left-rule callout. Variants: default (orange), `.crit` (negative red), `.ok` (positive green), `.sky` (orange tint). Includes `.callout-tag` micro-label.
- **`pullquote`** — large italic-orange opener. Curly quote glyph absolute-positioned via `::before`.
- **`dt`** — data table with dark header, gold tfoot rule, hover row tint. Cell modifier classes: `.crit`, `.ok`, `.warn`, `.brand`, `.r` (right align).
- **`ladder`** — 5-up rung cards. Variants `.live` (positive top border + green pack number) and `.next` (orange dashed border + orange pack number).
- **`sku-cards` + `econ-table`** — 2-up SKU economics cards. Variants `.loss` (negative top border) and `.profit` (positive top border).
- **`insights`** — 3-up numbered insight cards with orange top border and giant `.insight-num` numeral.
- **`chart-card`** — chart container with orange top border, title row + axis-label meta. Replaces V1.1's `.chart-box`.
- **`phases`** — 3-up dark phase cards with giant `.phase-num` numerals. Used inside `<section class="dark">`.

### 5.4 Section background rhythm

Three section types: default (white), `.soft` (`#f7f6f3`), `.dark` (`#2C2B36`). Default rhythm walking down the report:

| Section | Background |
|---|---|
| Cover (custom `<header class="cover">`) | dark |
| KPIs | default |
| MoM | soft |
| Findings | default |
| Products | soft |
| Directions | default |
| Scorecard | dark |
| Appendix | default |

The TOC and the cover hero are baked-in dark; remaining sections opt in via class.

### 5.5 Footer

Single `<footer>` at end of document (after appendix). Black background, 4px orange top border. Two-column grid: left column "1o8Hub · Monthly Performance Report" (with `<em>` accent), right column issued / classification meta. **No** per-page footer.

### 5.6 What gets deleted from `report.css`

- `--paper`, `--paper-2`, `--cream`, `--font-display` (Space Grotesk), `--page-w`, `--page-h`, `--page-pad`.
- `.deck`, `.page`, `.page-body`, `.page-header`, `.page-footer`, `.cover.variant-b` and friends.
- `h1.display`, `h2.section-title`, `h3.sub`, `.lede`, `.eyebrow` (Space Grotesk version), `.section-head`, `.section-num`.
- `.kpi`, `.kpi-foot`, `.delta` (replaced by `.stats-bar` + `.hero-stat`).
- `.stat-strip` (replaced by `.stats-bar`).
- `.bar`, `.bar-row`, `.pill` (no consumer in the new sections).
- `.toc-row`, `.cover-mark`, `.cover-meta` (V1.1 right-aligned mono variant), `.cover-bottom`, `.cover-center`, `.cover-label`, `.cover-title` (V1.1 88px Space Grotesk variant), `.cover-sub` — replaced by Dr. Cuddles `.cover` block.
- `.team-card`, `.num-list` (no consumer in the new sections; revisit when team/exec-summary sections are added in a future iteration).
- The current `.print-btn` floating button (replace with a non-floating button rendered inside `.top-bar` or above it; see §6.5).
- `body.dense` overrides — V1.1 had a dense toggle that V1 doesn't ship UI for. Drop until needed.

### 5.7 What's kept

- `@import` of Inter + JetBrains Mono fonts.
- The `@media (max-width: 700px)` and `(max-width: 800px)` breakpoint blocks from the reference (verbatim).
- The `@page A4` print rule plus per-section `page-break-inside: avoid` rules (see §6.4).

---

## 6. Section renderer contracts

Each section file lives in `src/components/monthly-report/sections/`. All become flat `<section>` blocks; none mount `<PageShell>`. All accept `{ data: Report }` as their single prop (no more `num`/`total` — pagination is no longer per-section).

### 6.1 Cover (renames file `CoverPage.tsx` → `CoverHeader.tsx`)

Renders `<header class="cover">` containing:
- `<div class="cover-eyebrow">Monthly Performance Report · Internal</div>` (static string; not data-driven).
- `<h1 class="cover-title">` rendering `meta.headline` (default `"Growth, measured in detail."` — same default V1.1 ships). The last two whitespace-delimited words are wrapped in `<em>` for the orange accent. If `meta.headline` has fewer than two words, the entire string is wrapped in `<em>`.
- `<p class="cover-deck">` from `meta.tagline` or, if missing, the V1.1 default: `"A month-over-month review of campaigns, spend, and outcomes across every channel we operate for {meta.client}."` Wrap the client name in `<strong>` for the orange tinted bold treatment.
- `cover-meta` 5-up grid with these labels (in order): Client, Period, Issued, Lead, Report ID.

The 4-up `Pages` strip from V1.1 is removed (no longer relevant in flow layout).

### 6.2 TopBar + TocNav (new components, mounted inside `<Report>` not `sections/`)

Live in `src/components/monthly-report/shell/TopBar.tsx` and `TocNav.tsx` (the directory persists; PageShell + SectionHead are deleted from it).

- `TopBar` renders the sticky black bar. Left: logo wrap with `<svg>` placeholder + `"Monthly Report"` tag (the existing `brand.logoPath` mark is rendered as an `<img>` inside `.logo-wrap`). Center: `{meta.client.toUpperCase()} · {meta.month.toUpperCase()}`. Right: `<span class="confidential">Confidential</span>` red-bordered pill, then the print button (see §7.4).
- `TocNav` derives anchor entries from `data.sections`, skipping `cover` and `toc`, AND skipping any id whose backing data is empty/undefined (so that empty findings/directions/scorecard sections never produce dangling anchors). Anchor IDs match `SectionId` strings (e.g. `#kpis`, `#mom`, `#highlights`). The first emitted anchor gets the `.brand` class. Numbered prefix (`01`, `02`…) is added in render, not in data; numbering starts at 1 at the first content anchor (cover and toc don't count).

Anchor labels for the new sections in TocNav match the section-tag labels: `highlights → "Findings"`, `goals → "Directions"`, `risks → "Scorecard"`. Other ids use the labels in §4.1.

The `toc` `SectionId` is **kept** in the union (so configs that include it still validate), but it does not produce a separate section — its presence in `data.sections` is what causes `TocNav` to render. If `toc` is omitted from `data.sections`, `TocNav` does not render. (This preserves the V1.1 `data.sections` semantics: omit an id, skip the section.)

### 6.3 KPIs (`KPISection.tsx`, was `KPIPage.tsx`)

`<section id="kpis" class="">` (default white background). Renders:
- `<span class="section-tag">Section {NN} · Key metrics</span>` where `NN` is the 2-digit section number computed from position in `data.sections`, counting from 1 at the first non-cover, non-toc id (so if `data.sections = [cover, toc, kpis, mom, ...]`, KPIs is `01` and MoM is `02`).
- `<h1>Key <em>metrics</em></h1>` (last word in `<em>`).
- `<p class="lead">Headline performance for {meta.month}, with deltas against the prior month.</p>`
- A `<div class="stats-bar">` with the first 4 KPIs in input order. Each `.stat-cell` shows `.stat-label` / `.stat-value` / `.stat-meta`. The `.stat-meta` line is the kpi's delta + a separator + the kpi's `foot` text.
- If more than 4 KPIs are provided, the next 2 render in a `<div class="hero-stat">` block below the stats-bar. Remaining KPIs (5+ beyond the hero pair) overflow into a `<table class="dt">` with columns: Metric, Value, Δ, Note. The `Note` column shows the `foot` text.

Cell color modifiers on `.stat-value`: `crit` when direction is `down` and the metric is good-up (e.g. sales declined); `ok` when direction is `up` and good-up; `brand` when the kpi's `highlight: true`; default otherwise. Direction glyphs (▲/▼/—) appear in the `.stat-meta` line preceding the delta, matching V1.1 behavior.

### 6.4 MoM (`MoMSection.tsx`, was `MoMPage.tsx`)

`<section id="mom" class="soft">`. Renders:
- `section-tag` + `<h1>` `"Month-over-<em>month</em>"`.
- `<p class="lead">` from `m.narrative`.
- `<div class="chart-card">` containing the existing `<ComparisonChart>` (revenue vs. target). Header row: `chart-card-title` = "Revenue vs. target", `chart-card-axis` = `"USD · trailing six months"`.
- If `m.cacSeries.length > 0`, a second `<div class="chart-card">` for blended CAC.
- A `<table class="dt">` with the existing four columns (Metric, Prev, Curr, Δ). Footer row uses `<tfoot>` with the Δ summary line as a single full-width cell. Δ direction maps: `up` → `.ok` cell, `down` → `.crit`, `flat` → default.

Charts keep their existing implementations (`<LineChart>`, `<BarChart>`, `<ComparisonChart>`). The chart wrapper class changes from `.chart-box` → `.chart-card`; nothing else inside the SVG renderers needs to change.

### 6.5 Findings (`FindingsSection.tsx`, NEW)

`<section id="highlights" class="">` (default background). Renders:
- `section-tag` + `<h1>Key <em>findings</em></h1>`.
- `<p class="lead">What worked this month, and why it moved the numbers.</p>` (static copy).
- `<div class="insights">` with one `.insight` block per `Highlight`. Insight numeral = `01`, `02`, … in render order. `<h4>` = `highlight.title`. `<p>` = `highlight.body`. `highlight.meta` becomes a small `<p class="muted">` line below the body paragraph.
- If `(data.highlights ?? []).length === 0` → component returns `null` (section skipped).
- If `data.highlights.length > 6`, render the first 6 as cards and overflow the rest into a `<ul class="regular">` below.

### 6.6 Products (`ProductsSection.tsx`, was `ProductsPage.tsx`)

`<section id="products" class="soft">`. Renders:
- `section-tag` + `<h1>` `"Product <em>performance</em>"`.
- `<p class="lead">` `"Per-ASIN breakdown sorted by sales. CVR and buy-box cells use the monthly-report config thresholds."`
- A `<table class="dt">` replacing V1.1's `<table class="pivot">`. Columns unchanged. Threshold-classified cells use `.crit` / `.warn` / `.ok` modifiers (the existing `classifyMetric` already returns those keywords; `.dt` styles are wired to them).
- TOTAL row goes in `<tfoot>` so it picks up the dark/gold tfoot styling.
- Overflow line (`Showing top N of M ASINs`) becomes an inline `<p class="muted" style="font-size: 10px;">` below the table.

### 6.7 Directions (`DirectionsSection.tsx`, NEW)

`<section id="goals" class="">` (default background). Renders:
- `section-tag` + `<h1>Next-month <em>directions</em></h1>`.
- A leading `<div class="pullquote">` with the first goal's `body` text (V1.2 has no separate quote field on `Goal`; the renderer just lifts `goals[0].body`). For now wrap the entire body in `<em>` for the orange-italic treatment; the consumer can opt into finer formatting in a follow-up.
- Below the pullquote, a `<div class="insights">` 3-up grid. Each insight: `.insight-num` = `01..NN`, `<h4>` = `goal.title`, `<p>` = `goal.body`, `<p class="muted">` meta line = `"Owner: {goal.owner} · Success: {goal.success}"`.
- If `(data.goals ?? []).length === 0` → return `null`.
- If `data.goals.length > 6`, render the first 6 as cards and overflow the rest into a `<ul class="regular">` below.

Rationale for using `insights` here instead of `ladder`: ladder rungs are price-pack/variant cards in the reference. Goals are more naturally numbered cards, and reusing `insights` across Findings + Directions gives the report visual rhythm (numbered cards twice = familiar pattern). The pullquote is the intro flourish; if there are no goals, neither pullquote nor insights render.

### 6.8 Scorecard (`ScorecardSection.tsx`, NEW)

`<section id="risks" class="dark">`. Renders:
- `section-tag` (white text on dark) + `<h1>Health <em>scorecard</em></h1>`.
- `<p class="lead">Open risks and mitigations as of {meta.issued}.</p>`
- A `<table class="dt">` with columns: Risk, Owner, Impact, Status, Grade. The Grade cell renders a small inline pill: red (`negative`), amber (`neutral`), or green (`positive`). Grade derives from `risk.grade` if provided, else from `risk.severity` (`high → red`, `med → amber`, `low → green`).
- The legacy `severity` column is **not** rendered separately (it's now expressed only as the grade pill). `risk.status` text continues to render in its own column.
- If `(data.risks ?? []).length === 0` → return `null`.

Notes: putting the scorecard on a dark section background still works for the table because `.dt` styles set explicit white/grey backgrounds on `td` and a dark header on `th`, so contrast holds without modifier rules. The `.section-tag` and `<h1>`/`<p class="lead">` already inherit `.dark` color overrides via the existing `section.dark h1, section.dark p` rules in §5.1's reference styles.

### 6.9 Appendix (`AppendixSection.tsx`, was `AppendixPage.tsx`)

`<section id="appendix" class="...">` (default background). Renders:
- `section-tag` + `<h1>` `"Appendix"` (no em accent).
- Two-column grid (50/50). Left: `<h3>Methodology</h3>` paragraph + `<h3>Sources of truth</h3>` `<table class="dt">` with the existing two-column source list. Right: `<h3>Glossary</h3>` `<table class="dt">` + `<h3>Change log</h3>` `<ul class="regular">`.
- Replace V1.1's bottom `.callout` with a `<div class="callout sky">` showing the contact line + the existing "living document" message.

### 6.10 Footer (new bottom-of-document block)

After `AppendixSection`, render a single `<footer>`:
- Left: `<div class="sig">{brand.agency} · Monthly <em>Report</em></div>`.
- Right: `<div class="meta">{meta.client} · {meta.month} · Issued {meta.issued} · Confidential</div>`.

Black background, 4px orange top border (already in §5.3 token list).

---

## 7. Print-mode handling

### 7.1 Three render modes via two boolean props

Add two optional props on `<Report>`:

```ts
function Report({
  data,
  printMode = false,   // strip ALL chrome; sets body.print-mode
  showTopBar = true,   // suppress just the sticky black bar (selector page)
}: {
  data: ReportData;
  printMode?: boolean;
  showTopBar?: boolean;
}) { … }
```

Mode matrix:

| Caller | `printMode` | `showTopBar` | `<TopBar>` | `<TocNav>` |
|---|---|---|---|---|
| `/reports/monthly` (selector page) | `false` | `false` | hidden | rendered |
| `/reports/monthly/print` (Puppeteer) | `true` | `*` | hidden | hidden |
| Future `/reports/monthly/preview/[id]` | `false` | `true` | rendered | rendered |

Rationale for `showTopBar`: the selector page already has its own sticky chrome (`.report-chrome` controls + Generate button). Stacking a second sticky black TopBar below it is visually busy and adds little value when the selector controls already identify the report. The future read-only preview page (V1.3) will not have selector chrome, so `<TopBar>` is its primary identity bar.

When `printMode` is true, `<Report>` adds `print-mode` to `document.body.classList` in its existing `useEffect`. When false, `print-mode` is removed.

### 7.2 CSS guards

`body.print-mode` overrides:
- Hides the floating print button (which now lives inside the top-bar; see §7.4 — when top-bar isn't rendered the button is gone too, but a defensive `display: none` for `.print-btn` stays).
- Sets `background: #fff` (kills any subtle paper tint that might come from `--bg`).
- Forces every `<section>` to `padding: 48px 0` (Puppeteer needs predictable section pad regardless of dark/soft variant).

### 7.3 `@page` rules

```css
@page {
  size: A4 portrait;
  margin: 18mm 14mm;
}
@media print {
  .top-bar, .toc, .print-btn { display: none !important; }
  section { page-break-inside: auto; }
  .stats-bar, .hero-stat, .callout, .pullquote,
  .insight, .sku-card, .rung, .chart-card,
  .phase, footer { page-break-inside: avoid; break-inside: avoid; }
  h1, h2 { page-break-after: avoid; break-after: avoid; }
  table.dt thead { display: table-header-group; }
}
```

Rationale: per-page page-break behavior is no longer structural (no `.page` divs), so we only need to keep primitives intact. The `@page` margin replaces V1.1's `--page-pad`. Margin units are mm (18mm top/bottom, 14mm sides) rather than px so the result matches Puppeteer's A4 output exactly.

### 7.4 Print button

Move from a floating fixed button to a real button rendered inside `<TopBar>` on the right side, just before the "Internal · Confidential" pill. Class stays `.print-btn` for muscle memory but `position: fixed` is removed; it becomes inline-flex inside `.top-bar`. On print, `.print-btn` is hidden via the `@media print` rule above (the entire `.top-bar` is hidden anyway, but explicit guard stays for defense).

---

## 8. File-by-file change list

| Path | Action | Notes |
|---|---|---|
| `src/components/monthly-report/styles/report.css` | Largely rewrite | New tokens, primitives per §5; delete §5.6 list |
| `src/components/monthly-report/types.ts` | Edit | Add optional `grade` field on `Risk` (§4.1) |
| `src/components/monthly-report/defaults.ts` | Edit | Token shift (§4.2) |
| `src/components/monthly-report/Report.tsx` | Edit | Add `printMode?` and `showTopBar?` props; mount `<TopBar>`/`<TocNav>`/`<footer>` per mode (§7.1); update SECTIONS map to register `highlights → FindingsSection`, `goals → DirectionsSection`, `risks → ScorecardSection`; drop `.deck` wrapper; keep the existing `useEffect` that mirrors `meta.accent` into `--accent` and add a parallel write to `--orange` so primitives that bind to `--orange` track the override |
| `src/components/monthly-report/shell/PageShell.tsx` | Delete | No longer used |
| `src/components/monthly-report/shell/SectionHead.tsx` | Delete | Pattern replaced by inline `section-tag` + `<h1>` |
| `src/components/monthly-report/shell/TopBar.tsx` | New | §6.2 |
| `src/components/monthly-report/shell/TocNav.tsx` | New | §6.2 |
| `src/components/monthly-report/sections/CoverPage.tsx` | Rename → `CoverHeader.tsx`, rewrite | §6.1 |
| `src/components/monthly-report/sections/TOCPage.tsx` | Delete | TOC is now `<TocNav>` in shell |
| `src/components/monthly-report/sections/KPIPage.tsx` | Rename → `KPISection.tsx`, rewrite | §6.3 |
| `src/components/monthly-report/sections/MoMPage.tsx` | Rename → `MoMSection.tsx`, rewrite | §6.4 |
| `src/components/monthly-report/sections/ProductsPage.tsx` | Rename → `ProductsSection.tsx`, rewrite | §6.6 |
| `src/components/monthly-report/sections/AppendixPage.tsx` | Rename → `AppendixSection.tsx`, rewrite | §6.9 |
| `src/components/monthly-report/sections/FindingsSection.tsx` | New | §6.5 |
| `src/components/monthly-report/sections/DirectionsSection.tsx` | New | §6.7 |
| `src/components/monthly-report/sections/ScorecardSection.tsx` | New | §6.8 |
| `src/components/monthly-report/sections/ProductsPage.test.tsx` | Update | Rename to `ProductsSection.test.tsx`; update import + table class assertions (`pivot` → `dt`) |
| `src/lib/monthly-report/build-report-data.ts` | Edit | Default `meta.accent` `"#F7BF1D"` → `"#F8BF1C"` (§4.3). No other changes. |
| `src/lib/monthly-report/build-report-data.test.ts` | Update | Adjust accent default expectation if asserted |
| `src/app/reports/monthly/print/page.tsx` | Edit | Pass `printMode={true}` to `<Report>` |
| `src/app/reports/monthly/page.tsx` | Edit | Pass `showTopBar={false}` (so the selector page's existing `.report-chrome` is the only sticky chrome above the report). The existing `.report-chrome` Tailwind classes stay as-is — they're the **app shell**, not the report shell — and they continue to be hidden by the existing `report-chrome { display: none !important; }` print guard. |

Charts (`charts/`), `lib/monthly-report/orchestrator.ts`, queries, analyzers, config, period helpers: **untouched**.

---

## 9. Edge cases and skip behavior

- **Empty arrays.** `(data.highlights ?? []).length === 0` → Findings section renders nothing (component returns `null`). Same for Directions (`goals`) and Scorecard (`risks`). `<TocNav>` filters out anchors whose backing field is empty/undefined to avoid dangling links (§6.2). The orchestrator only pushes these ids into `data.sections` when their array is non-empty (§4.3), so in normal flow this is double-defended.
- **First-month reports** (no `previous` headline): `narrative` already handles this; MoM table renders `prev: "—"` for each row. No change in V1.2.
- **Less than 4 KPIs.** `stats-bar` still renders with grid auto-fill; the empty cells are simply absent. Visually OK.
- **More than 6 highlights / goals.** Overflow rules in §6.5 / §6.7.
- **Risk grade override.** User can omit `grade` and the renderer falls back to severity mapping. If both are present, `grade` wins.
- **Custom `meta.accent`.** The CSS rule `--orange: var(--accent)` (or vice versa) ensures all references update from a single source. The existing `useEffect` in `Report.tsx` already sets `--accent` on `documentElement.style`. Update it to also set `--orange`, since the Dr. Cuddles primitives use `--orange` as the canonical variable name. (Two-line change.)

---

## 10. Out of scope for this iteration

- Per-client accent lookup from DB (V1.2; `meta.accent` stays a default).
- AI-generated findings / directions / scorecard commentary (deferred — manual entry only).
- A `roadmap` / phases section (deferred until ops validates).
- A `team` section using the `phases` primitive (deferred — current `team` SectionId has no V1.1 renderer; nothing breaks).
- An `execSummary` / `channels` / `financials` renderer port (no V1.1 renderer either; skipped IDs stay skipped).
- The `ladder`, `sku-cards`, `phases` primitives — included in CSS (cheap, kept for future use) but **not consumed** by any V1.2 section. Keep them as a primitive library; no orchestrator wiring.
- A hand-edit UI (selector page that lets the user populate `highlights` / `goals` / `risks` directly). Tracked separately; design doesn't depend on it because the data-flow contract is unchanged.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Puppeteer's natural pagination breaks a primitive across pages, producing visually broken cards. | `page-break-inside: avoid` rules on every primitive (§7.3). Validate visually on the first sample report (Dr. Cuddles, March 2026). |
| Removing per-page header/footer means client name + month no longer appear on each PDF page. | Acceptable: the document is a single themed flow. The cover hero + footer establish identity. If oncoming feedback wants a running header, re-add via `@page` margin boxes (cheap follow-up). |
| `report-chrome` Tailwind selector on the selector page conflicts with the new sticky top-bar in preview mode. | They don't overlap: `.report-chrome` lives on the app-shell controls (above `<Report>`), and `<TopBar>` is rendered inside `<Report>` and sticks to its scroll container. Confirm by ensuring `<Report>` sits in the normal document flow, not inside an `overflow: hidden` parent. |
| Section anchors (`#kpis`, `#mom`…) collide with other Next.js scroll behavior. | IDs are scoped to the report DOM tree; collisions only matter if the host page also uses these IDs. The selector page does not. |
| Dropping `body.dense` removes a feature. | V1.1 had no UI to toggle it. Re-add later if a real consumer materializes. |
| `@sparticuz/chromium` 250 MB Vercel limit (open blocker from primer). | Out of scope here — same risk as V1.1, no change introduced by the redesign. |

---

## 12. Acceptance criteria

A V1.2 monthly report is "done" when:

1. The `/reports/monthly` page renders a Dr. Cuddles–styled report with sticky top-bar + TOC, dark cover, alternating section backgrounds, and the new Findings / Directions / Scorecard sections (when their data is provided).
2. Empty arrays for `highlights`, `goals`, or `risks` cause the corresponding section to be omitted (no blank section, no broken anchor).
3. The PDF download (`/api/reports/monthly/pdf` → Puppeteer → `/reports/monthly/print`) produces a multi-page A4 PDF with no torn primitives, no sticky chrome, and the same content as the web preview.
4. `meta.accent` is honored: setting it to `#FF0066` swaps every gold accent across the report (top-bar bottom border, section-tag underlines, table tfoot rule, callout border, etc.).
5. `npm run lint` passes; existing Vitest suite (`build-report-data.test.ts`, `ProductsSection.test.tsx`, etc.) passes after rename + import updates.
6. No console errors in the web preview; no orphan imports of deleted files (PageShell, SectionHead, TOCPage).

---

## 13. Decisions deferred to writing-plans

The plan should sequence the work in this order (CSS first, then renderers, then routing wiring, then tests), but specific task breakdown and parallelization are for `superpowers:writing-plans` to determine. This spec is the source of truth for **what** changes; the plan is the source of truth for **how** to land it.
