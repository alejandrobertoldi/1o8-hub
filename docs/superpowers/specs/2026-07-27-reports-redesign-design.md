# Reports Dashboard Redesign — Design Spec

**Date:** 2026-07-27
**Status:** Approved design → ready for writing-plans
**Design source of truth:** `docs/design/market-foundry-dashboard-redesign.html` (prototype) + `docs/design/market-foundry-dashboard-redesign-brief.md` (guidance)
**Brand authority:** `DESIGN.md` (overrides the prototype wherever they conflict)

---

## 1. Purpose & problem

The current reports dashboard renders every element at the same visual weight — orange fills, dark panels, thick outlines, repeated goal boxes, dense charts, and long tables all compete for attention at once. A user cannot tell in ten seconds whether the account is healthy.

The redesign imposes an executive-first reading sequence:

1. **What happened?** — Executive Insights + headline KPIs
2. **Why did it happen?** — trend, efficiency, traffic, and funnel charts
3. **Where is the issue/opportunity?** — campaign and keyword diagnostics (tables)
4. **What next?** — ranked performers, risks, recommended actions (decision support)

This is a **visual + information-architecture redesign of the overview/performance dashboard**. It does not change the reporting math, the database, or the API contracts.

---

## 2. Scope

### In scope (both surfaces)

Exactly two routes render this redesigned composition:

- **Hub (internal):** `src/app/reports/page.tsx`
- **Portal (client-facing):** `src/app/portal/reports2/overview/page.tsx`

### Out of scope

- The other `src/app/portal/reports2/*` sub-routes (advertising-audit, business-model-audit, inventory, period-comparative, share-of-voice, subscribe-save) — these are separate report types, untouched.
- `src/app/reports/monthly/*` — separate monthly report, untouched.
- Any backend/API/schema change. **No new endpoints are required** (see §11).
- AI-generated insight copy (insights are deterministic in v1; AI summaries are a later, separate effort).

### Locked decisions (do not re-litigate)

1. **Full prototype parity now** — build all six net-new sections plus their client-side data derivation.
2. **Both surfaces** get the new look.
3. **Parallel route, swap when ready** — build v2 components alongside the live dashboards; keep current `/reports` and `/portal/reports2/overview` untouched and live until a final swap phase repoints both.
4. **Adopt the prototype's `--mf-*` tokens as-is** into `globals.css` (namespaced `--mf-*`, not renamed). Flag — do not silently rename — that `--mf-orange` equals the existing `--brand` (`#FF751F`).
5. **Portal recolors orange → charcoal** — the portal version keeps the layout/hierarchy but swaps every *brand-orange emphasis* usage to `--portal-accent` charcoal (see §4.4).
6. **KPI hierarchy:** 3 orange/charcoal hero cards + 4 supporting cards; dropped metrics relocate (see §6).

---

## 3. Delivery model

Build v2 as a **new, self-contained composition** that does not mutate the currently-shipping shared components until the swap phase.

- New v2 components live in `src/components/reports/v2/` (net-new + restyled wrappers).
- New shared primitives live in `src/components/reports/v2/primitives/`.
- A **v2 dashboard composition** component (e.g. `PerformanceOverviewV2`) accepts a `surface: 'hub' | 'portal'` prop that selects the palette (§4.4). Both routes will eventually render this one composition with different `surface` values.
- During build (phases 0–7), v2 is reachable only from a throwaway preview mount (a dev-only route or a feature-flagged branch of the existing page) so it can be dogfooded without disturbing the live dashboards.
- **Swap (phase 8):** repoint `src/app/reports/page.tsx` → `<PerformanceOverviewV2 surface="hub" />` and `src/app/portal/reports2/overview/page.tsx` → `<PerformanceOverviewV2 surface="portal" />`, wired to their existing data-fetch layers. Retire the superseded old composition only after both routes are verified.

Rationale: reconciles locked decisions 2 + 3. Nothing shared is edited destructively mid-flight; the swap is a two-line repoint plus cleanup.

---

## 4. Brand reconciliation (DESIGN.md wins)

The prototype and `DESIGN.md` conflict in four places. `DESIGN.md` is the authority. Resolutions:

### 4.1 Token adoption

Add the prototype's `--mf-*` variables to `src/app/globals.css` verbatim (namespaced). Document, in a comment block, how each maps to an existing app token:

| `--mf-*` token | Value | Existing app token | Relationship |
|---|---|---|---|
| `--mf-orange` | `#FF751F` | `--brand` | **Identical.** Comment must flag the duplication; do not rename. Use for accents/borders/icons/current-period series/progress bars only. |
| `--mf-charcoal` | `#2A5059` | `--portal-accent` / dark `--background` | Identical. App shell + portal accent. |
| `--mf-charcoal-900` | `#19343B` | *(none)* | Net-new deeper charcoal — table header/footer, high-contrast structure. |
| `--mf-charcoal-700` | `#23464F` | *(none)* | Net-new. Header/shell mid-tone. |
| `--mf-ghost` | `#F0EFF6` | `--background` (light) | Identical (Ghost White). Neutral panels, inactive controls. |
| `--mf-white` | `#FEFEFE` | `--card` / Tailwind `white` | Identical (brand White). Card + table surfaces. |
| `--mf-ink` | `#242222` | `--foreground` (light) | Identical (Off Black). Primary text. |
| `--mf-muted` | `#68777C` | ~`--muted-foreground` | Close; adopt `--mf-muted` for report secondary text. |
| `--mf-line` | `#DBE1E4` | ~`--border` | Close; adopt `--mf-line` for report borders. |
| `--mf-positive` `#18864B` / `--mf-positive-bg` `#E9F7EF` | | `--brand-green` `#34C759` | **Different green.** `--mf-positive` is a darker *text-on-tint* green (AA on light bg); `--brand-green` is a *badge/fill* green. Both coexist: use `--mf-*` status for report heat cells, existing tokens elsewhere. Flag the duplication. |
| `--mf-negative` `#C73737` / `-bg` `#FFF0F0` | | `--brand-red` `#FF5C5F` | Same rationale — darker text-on-tint red. |
| `--mf-warning` `#A66600` / `-bg` `#FFF7DF` | | `--brand-yellow` `#FAC800` | Same rationale — darker text-on-tint amber. |

### 4.2 Hero contrast — `#B8500F`, not `#FF751F`

The prototype paints white text on `#FF751F` (~2.7:1, **fails WCAG AA**). `DESIGN.md`'s 2026-07-22 decision already governs this: text-bearing orange fills use `--brand-solid` (`#B8500F`, ~5:1 with white). The brief's own acceptance criteria demand AA.

**Resolution:** hub hero cards fill with `--brand-solid` (`#B8500F`) + white text. Bright `--mf-orange`/`--brand` (`#FF751F`) stays for accents, borders, icons, the current-period line, and progress bars — never as a fill behind text. Visually near-identical to the prototype, actually compliant.

### 4.3 Typography — Outfit, not Inter

The prototype declares Inter. The app is single-family **Outfit** (weight/case/size hierarchy only; `DESIGN.md` §Typography). All v2 text uses Outfit via the existing `--font-sans`. Map the brief's type scale onto Outfit weights: KPI values = Outfit 850/Bold; labels = Outfit Bold uppercase `text-[10px]`; section titles = Outfit Bold. `tabular-nums` on all numeric cells and KPI values.

### 4.4 Dual-accent — the `surface` prop (the load-bearing rule)

`DESIGN.md`: Hub = Burnt Orange, Portal = Charcoal Blue, **never mixed** ("intentional and load-bearing"). The prototype is orange-everything. Since decision #5 recolors the portal to charcoal, and a charcoal-filled hero on a charcoal canvas would be invisible, the two surfaces diverge on **canvas** as well as **accent**:

| | **Hub** (`surface="hub"`) | **Portal** (`surface="portal"`) |
|---|---|---|
| Shell / page canvas | Charcoal `--mf-charcoal` (dark, per prototype) | **Ghost-white `--mf-ghost` (light, clean client look)** |
| Hero card fill | `--brand-solid` `#B8500F` + white text | `--mf-charcoal` `#2A5059` + white text (pops on light canvas) |
| Primary CTA (Refresh) | Orange `--brand-solid` | Charcoal `--portal-accent` |
| Active segmented / selected | Orange accent | Charcoal accent |
| Current-period line, progress bars, sparkline stroke | `--mf-orange` `#FF751F` | `--portal-accent` `#2A5059` |
| Section-heading eyebrow | `text-brand` | `text-portal-accent` |

**Recolor applies ONLY to the brand-orange emphasis usages above.** The categorical **data** colors are shared and unchanged on both surfaces: ad-revenue green `--mf-positive`, ad-spend purple `#65418A`, CVR/CTR blue `#5B6EF5`, ACoS status red/green bars, heat-cell green/amber/red. These are semantic data encodings, not brand accent, so recoloring them would break the charts.

> **Flag for spec review:** the portal-on-light-canvas / hub-on-dark-canvas split is my proposed resolution of the "charcoal hero on charcoal bg" problem. Decision #5 (charcoal emphasis on portal) is locked; the light-canvas choice for the portal is the sub-detail to confirm.

---

## 5. Information architecture

Page order, top to bottom (matches prototype):

1. **App header** (72px sticky): brand block left; client select, date granularity, date range, comparison, export, refresh right. Refresh is the primary (accent) action.
2. **Page heading**: "Performance overview" + last-refreshed badge.
3. **Executive Insights** — 4-card strip (§7).
4. **Headline performance** — KPI grid, 3 heroes + 4 supporting (§6), with an All/Sales/Advertising/Traffic segmented filter.
5. **Business performance** — charts (§8): one dominant combined chart + CPC/CVR + traffic + funnel + ROAS ranking + scatter.
6. **Keyword analysis** — Sponsored Products keywords table (§9).
7. **Campaign & product detail** — campaign performance table, collapsible in production (§9).
8. **Decision support** — Top performers / Efficiency risks / Recommended actions (§10).

Layout system: 12-column CSS grid, max-width `1760px`, 16px card gap, 40px desktop section spacing. Responsive per prototype media queries (§Layout of brief): desktop 3–4 KPIs/row, tablet 2/row + 2-col insights, mobile single column; tables stay horizontally scrollable with sticky header + sticky first column at every breakpoint.

---

## 6. KPI hierarchy & dropped-metric relocation

**Heroes (3, span-4 each, filled emphasis card):** Total Sales · Organic Sales · Ad Revenue.
**Supporting (4, span-3 each, white card):** Ad Spend · ACoS · ROAS · Conversion Rate.

Card anatomy: label (uppercase micro) · current value · status chip · two mini-stats · current+previous sparkline. The prototype's per-card mini-stats:

- Total Sales → Previous year, Period goal
- Organic Sales → Previous year, Share of sales
- Ad Revenue → Previous year, Share of sales
- Ad Spend → Previous year, Budget used %
- ACoS → Previous year, Target
- ROAS → Previous year, Target
- Conversion Rate → Previous year, Conversions (count)

**Removed pattern:** large repeated "Daily Goal" boxes. Targets now appear as mini-stats / variance chips only.

**Dropped from the top grid, relocated (decision #6, "I propose new homes"):**

| Metric | New home |
|---|---|
| Sessions | Conversion funnel (step 1) + traffic chart context |
| Clicks | Conversion funnel (step 2) + traffic chart (line) |
| Impressions | Traffic chart (bars) |
| CTR | Traffic chart (line) + a supporting chip on that chart |
| Conversions | Conversion funnel (step 3) + ROAS/CVR card mini-stat |
| Units Sold | Combined-chart summary strip mini-value, and available as a keyword/campaign table column |
| TACoS | Executive Insights target-variance line (has a goal) + defined in table tooltips (ACoS/TACoS/ROAS/CTR/CVR glossary) |

Existing card components to reuse/restyle: `total-sales-card`, `organic-sales-card`, `ad-revenue-card`, `ad-spend-card`, `acos-card`, `roas-card`. Dropped-metric cards (`units-sold-card`, `tacos-card`, `sessions-card`, `impressions-ctr-card`, `clicks-conversions-card`) are removed from the grid (not deleted from the repo — left for the untouched old dashboard until swap cleanup). **Conversion Rate card is net-new** (no `cvr-card.tsx` exists); CVR derives client-side as conversions / clicks (fallback conversions / sessions if clicks absent — pick one and document; default: conversions / clicks to match "conversion rate of ad clicks").

---

## 7. Executive Insights (deterministic — TDD)

A pure function `computeInsights(overview): Insight[]` returns the **top 4** insights ranked by severity. Each insight is `{ kind, severity, title, detail, sourceMetrics }` and must be traceable to visible metrics (no opaque AI text in v1).

Candidate rules (evaluate all, emit top 4 by severity magnitude):

1. **Material YoY change** — for each of {total sales, organic sales, ad revenue}, compute YoY %; severity = |%|. Emit the largest mover. *("Sales are down 26.9% YoY — $33.06K vs $45.20K.")*
2. **Efficiency pressure** — if ad spend YoY ↑ **and** ad revenue YoY ↓, emit with severity = spendΔ% + |revenueΔ%|. *("Ad spend is 16.4% higher while ad revenue fell.")*
3. **Target variance** — only for metrics with goals (sales, adSpend, ACoS, TACoS, ROAS). If ACoS > target or ROAS < target, emit variance; severity = distance from target. *("ACoS is above target — 36.22% vs 25.00%.")*
4. **Traffic/conversion anomaly** — if conversions YoY ↓ or CVR YoY ↓ materially, emit; severity = |CVRΔ%|. *("Clicks +5.1% but conversions −30.1%; CVR 15.90%.")*

**GAP (documented, not blocking):** targets exist only for sales/adSpend/ACoS/TACoS/ROAS. CVR, conversions, clicks, and ad-revenue have **no** goal, so their insights are YoY-based only — never "vs target." `computeInsights` must not fabricate targets for metrics that lack them.

Thresholds (what counts as "material") live in a config object with defaults; overridable per account/client later.

**TDD targets:** YoY math, severity ranking, top-4 selection, the no-fabricated-target rule, tie-breaking, and the empty/missing-PY case (fewer than 4 insights → render fewer cards, never pad).

---

## 8. Charts

Six charts. Verify by `npx tsc --noEmit` + visual dogfood — **not** by asserting Recharts SVG in jsdom (jsdom-unfriendly; fake SVG assertions are banned).

| Chart | Status | Data source | Notes |
|---|---|---|---|
| **Combined performance** (sales line + ad-revenue line + ad-spend line + ACoS status bars + ACoS target dashed line) | Restyle `sales-acos-chart.tsx` (already consumes `overview.daily`) into the dominant chart | `overview.daily[]` / `dailyPY[]` | Series toggles: Current / Previous year / Target. Granularity: Daily/Weekly/Monthly. Default view shows current only, not every series. 4-value summary strip above (Total Sales, Ad Revenue, Ad Spend, ACoS). |
| **CPC & conversion rate** (CPC bars + CVR line) | Restyle existing `cpc-cvr-chart.tsx` | `overview.daily` (spend, clicks, conversions) | Avg-CPC chip. |
| **Clicks, impressions & CTR** (impression bars + clicks line + CTR line) | Restyle existing `clicks-impressions-ctr-chart.tsx` | `overview.daily` | CTR chip. |
| **Conversion funnel** (Sessions → Clicks → Conversions → Sales) | **Net-new** | `overview` scalars (sessions, clicks, conversions, totalSales) | Each step shows count + % of sessions; final step shows $/order. Pure derivation; no new endpoint. |
| **ROAS by campaign** (horizontal bars, sorted desc, target line at 4.0) | **Net-new** | `campaigns` route `rows[]` (roas per campaign) | Bar color by health band (good/warn/bad). |
| **Spend vs ROAS scatter** (x=spend, y=ROAS, bubble=ad revenue, color=health) | **Net-new** | `campaigns` route `rows[]` (adSpend, roas, adRevenue) | Target ROAS reference line. Exposes high-spend/low-return + low-spend/high-return. |

Combined chart grid span: full width (span-12). CPC/CVR + traffic: half width each (span-6). Funnel + ROAS ranking + scatter: third width each (span-4). Collapse per responsive rules.

**TDD targets (pure derivation only):** funnel step values + percentages + $/order; ROAS-ranking sort + health banding; scatter bubble-size scaling + health classification; CVR/CPC/CTR per-day derivations. The SVG rendering itself is not unit-tested.

---

## 9. Tables

Two tables: **Sponsored Products keywords** (`keywords` route) and **Campaign performance** (`campaigns` route). Product performance table available as a third collapsible section.

Behavior (per brief):
- Sticky header + sticky first column (keyword/campaign name), both breakpoints.
- 40–44px row height, zebra striping, full-row hover.
- Table toolbar **inside** the table component: search input + filter selects (match type, ROAS band, ACoS band) + result count + Export CSV.
- High-contrast total row pinned at bottom (`--mf-charcoal-900` fill + orange/charcoal top border by surface).
- Horizontal scroll on narrow viewports (`min-width: 1160px` table).

**Conditional formatting** (heat cells) on ACoS and ROAS:
- ROAS: good ≥ 4.0, warn 2.0–3.99, bad < 2.0 (and 0.00 / "—" for zero-conversion) — mirror prototype bands.
- ACoS: good ≤ 25%, warn 25–60%, bad > 60% (and "—" for zero-revenue).
- CVR shown with a compact progress bar + numeric value.

**Accessibility:** never color-only. Keep the numeric value visible in every heat cell; add an icon/`aria-label` where status must be unambiguous. Semantic `<table>`/`<thead>`/`<tfoot>` markup; the chart summaries double as accessible data (brief a11y checklist).

Production features to scaffold as interfaces (not all wired in v1): column chooser, saved filter views, sortable columns, pagination/virtualization, expandable campaign rows, CSV/XLSX export, metric-definition tooltips (ACoS, TACoS, ROAS, CTR, CVR). v1 wires search + filter + sort + CSV export + tooltips; the rest are typed stubs.

---

## 10. Decision support (deterministic — TDD)

Three cards fed by pure functions over `campaigns` + `keywords` data. Thresholds in a config object (defaults below), overridable per account/client (brief requirement).

- **Top performers** — entities with ROAS ≥ `4.0`, ranked by ROAS desc, top 2. *("Sports shot for cramps — ROAS 25.58 · CVR 57.14% · candidate for scale.")*
- **Efficiency risks** — entities where ACoS > `60%` **or** (spend > `$15` **and** conversions = 0), ranked by spend desc, top 2. *("Leg cramps instant relief — ACoS 262.87% with one conversion.")*
- **Recommended actions** — derived from the risks/performers: "Reduce bids on zero-conversion terms (spend > $15, 0 orders)"; "Shift budget toward ROAS ≥ 4 campaigns." Actions are generated from the same rule outputs, not hardcoded.

Default thresholds: `{ roasScaleFloor: 4.0, acosRiskCeiling: 0.60, zeroConvSpendFloor: 15 }`.

**TDD targets:** each rule's inclusion/exclusion at boundary values, ranking, top-N truncation, the zero-conversion + spend AND-condition, empty-state (no qualifying entities → render an explicit "no risks / no scale candidates" state, never an empty card).

---

## 11. Data mapping (no new endpoints)

| Section | Endpoint(s) | Fields |
|---|---|---|
| KPI scalars + PY + YoY | `overview` | current + PY + YoY for all headline metrics; goals for sales/adSpend/ACoS/TACoS/ROAS only |
| Sparklines, combined chart, CPC/CVR, traffic, funnel | `overview.daily[]` / `dailyPY[]` | report_date, product_sales, ad_revenue, ad_spend, sessions, clicks, conversions, impressions |
| Keywords table | `keywords` | per-keyword adSpend, adRevenue, adConversions, roas, acos, avgCpc, impressions, clicks, cvr |
| Campaign table, ROAS ranking, scatter | `campaigns` | `rowsByName[]`/`rows[]`: adSpend, adRevenue, roas, acos, avgCpc, impressions, clicks, conversions, cvr (aggregated, no PY) |
| Decision support | `keywords` + `campaigns` | rule inputs above; all rules run client-side |
| Client selector | `client` | client list/context |

**GAP (§7):** no target/goal for CVR, conversions, clicks, ad-revenue. Insight "vs target" lines are limited to sales/adSpend/ACoS/TACoS/ROAS. Campaign data has no PY, so campaign-level YoY is unavailable — campaign insights are absolute/threshold-based only.

---

## 12. State, loading, and error handling

Production wiring (phase 7) connects controls to existing state/data-fetch layers:

- **Client / date-range / granularity / comparison** selectors → drive the existing fetch params.
- **Series visibility** toggles on the combined chart → local chart state.
- **Table filters / sort / search** → local table state.
- **Export** → CSV from current filtered rows.
- **Refresh** → re-fetch.

Every data panel implements three states (brief requirement): **skeleton loading**, **populated**, and an explicit **"data unavailable"** state — never a blank chart or empty card. Insights/decision-support with too few results render fewer items, not padded placeholders.

The redesign inherits the ECONNRESET / partial-data hardening from the current branch (`7cc9e963`) — panels must degrade to "data unavailable" rather than blanking the whole dashboard when one query fails.

---

## 13. Accessibility (brief checklist + DESIGN.md)

- WCAG AA contrast everywhere (drives the §4.2 hero-fill resolution).
- Visible focus styles on all controls; keyboard support for segmented controls and collapsible sections.
- Semantic headings and table markup; accessible names for filters/buttons.
- Status never by color alone — numeric value stays visible; icons/labels where needed.
- Charts carry text summaries or accessible data tables.
- Respect `prefers-reduced-motion`.

---

## 14. Component inventory

**Net-new components** (`src/components/reports/v2/`):
`ExecutiveInsightGrid` + `InsightCard`, `ConversionFunnel`, `RoasRankingChart`, `SpendRoasScatter`, `DecisionSupportSection` + `ActionCard`, `CvrCard`, `PerformanceOverviewV2` (composition, takes `surface`).

**Restyle existing → v2 wrappers:**
`total-sales-card`, `organic-sales-card`, `ad-revenue-card` (→ hero variant), `ad-spend-card`, `acos-card`, `roas-card` (→ supporting variant), `sales-acos-chart` (→ combined performance chart), `cpc-cvr-chart`, `clicks-impressions-ctr-chart`, `keywords-table`, `campaign-name-table` / `campaign-summary-table`, `product-performance-table`, `refresh-button`.

**Shared primitives** (`src/components/reports/v2/primitives/`):
`Surface` (card frame), `KpiCard` (hero/supporting variants), `Chip` (positive/negative/warning/neutral), `Segmented` (accessible segmented control), `TableToolbar`, `ChartFrame`, `HeatCell`, `ProgressBar`. All accept the surface palette via context/prop so hub↔portal recolor is one switch.

---

## 15. Phasing (one spec, review checkpoints)

- **Phase 0 — Tokens + primitives.** Add `--mf-*` to `globals.css` with the reconciliation comment block; build `Surface`, `KpiCard`, `Chip`, `Segmented`, `TableToolbar`, `ChartFrame`, `HeatCell`, `ProgressBar`; establish the `surface` palette switch.
- **Phase 1 — Shell + scaffold.** v2 header, page heading, section skeletons on the dev-only preview mount.
- **Phase 2 — KPI hero/supporting hierarchy.** 3+4 grid, sparklines, PY/target/variance chips, dropped-metric relocation, net-new `CvrCard`.
- **Phase 3 — Executive Insights.** `computeInsights` (TDD) + `ExecutiveInsightGrid`.
- **Phase 4 — Charts.** Combined performance (restyle `sales-acos-chart`), CPC/CVR, traffic, funnel (new), ROAS ranking (new), scatter (new). Pure derivations TDD'd; SVG verified by tsc + dogfood.
- **Phase 5 — Tables.** Toolbar, conditional formatting, sticky header/first column, total row, search/filter/sort/CSV, tooltips.
- **Phase 6 — Decision support.** Rule functions (TDD) + `DecisionSupportSection`.
- **Phase 7 — Live wiring + states + a11y.** Connect controls to fetch/state; skeleton + "data unavailable" states; full a11y pass; ECONNRESET degradation.
- **Phase 8 — Swap.** Repoint `src/app/reports/page.tsx` (`surface="hub"`) and `src/app/portal/reports2/overview/page.tsx` (`surface="portal"`) to `PerformanceOverviewV2`; verify both; retire the old composition + remove the dropped KPI cards from the grid.

---

## 16. Testing strategy

TDD where it has teeth — pure logic:

- `computeInsights` ranking + YoY + no-fabricated-target + top-4 + empty-PY (§7).
- Decision-support rules: boundaries, ranking, top-N, zero-conv AND-condition, empty-state (§10).
- Chart derivations: funnel values/percentages/$-per-order, ROAS-ranking sort + banding, scatter scaling + classification, CVR/CPC/CTR per-day (§8).
- Heat-cell band classification (ROAS/ACoS thresholds).

**Not** unit-tested: Recharts/SVG rendering (jsdom-unfriendly — no fake SVG assertions). Charts verified by `npx tsc --noEmit` + visual dogfood.

Commands: typecheck `npx tsc --noEmit` (PORT 3000 is taken — **never** `next build`); tests `npx vitest run <path>`. Note: green vitest can hide TS errors — always run tsc before claiming a change compiles.

---

## 17. Acceptance criteria (from brief)

- Overall performance identifiable within ~10 seconds.
- Primary KPIs visually distinct from supporting metrics.
- Orange (hub) / charcoal (portal) signals emphasis, not general decoration (≈60% white/ghost, 30% charcoal, 10% accent).
- Chart titles/legends readable at normal desktop zoom.
- Tables scannable without losing the active row or first column.
- Poor/strong performance visible without reading every number.
- Page ends with clear opportunities and risks.
- Usable on tablet and mobile.
- **Plus:** WCAG AA contrast (hero fills compliant); hub↔portal color separation preserved (no orange anywhere on the portal surface).

---

## 18. Risks & open items

- **Portal light-canvas** (§4.4) is proposed, not yet confirmed — the one thing to check at spec review.
- **Combined-chart complexity** — sales/revenue/spend lines + ACoS bars + target on one chart with toggles is the highest-effort chart; default to a single series to avoid the "everything at once" problem the redesign is fixing.
- **Threshold configurability** (§7, §10) is scaffolded with defaults now; per-client override UI is a later effort, out of scope for v1.
- **Dropped-metric cards** are removed from the grid but not deleted until phase 8 cleanup, to keep the old dashboard live during parallel build.
