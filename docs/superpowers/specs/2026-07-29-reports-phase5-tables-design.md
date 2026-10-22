# Reports Redesign — Phase 5 (Data Tables) Design Spec

**Date:** 2026-07-29
**Status:** Approved design → ready for writing-plans
**Parent spec:** `docs/superpowers/specs/2026-07-27-reports-redesign-design.md` (§9 Tables, §12 States, §16 Testing)
**Brand authority:** `DESIGN.md`

---

## 1. Purpose & scope

Phase 5 fills the two table sections the v2 shell already reserves in
`src/components/reports/v2/performance-overview-v2.tsx`:

- `keywords` → **Keyword analysis** — Sponsored Products keywords table.
- `campaigns` → **Campaign & product detail** — Campaign performance table.

Both currently render the scaffold blurb via `sectionContent[s.id] ?? <Surface>…</Surface>`.
Phase 5 replaces those two entries with real tables.

### Locked decisions (confirmed 2026-07-29, do not re-litigate)

1. **One shared `MetricTable` primitive**, not two bespoke tables. The two tables are ~90%
   identical; the shared primitive is parameterized by column defs + first-column label +
   filter set. Matches parent-spec §14's "shared primitives" philosophy.
2. **Product-performance table is deferred** to a later phase. Phase 5 ships exactly two
   tables (keyword + campaign). The `campaigns` section renders the campaign table only.
3. **Shell lifts a 3rd fetch — `useKeywords` — once per surface.** Forced by the parent
   spec's locked rule "no per-component fetch, sections degrade independently." The keyword
   data (`/api/reports/keywords`) is not fetched anywhere in v2 yet; the keyword table must
   NOT fetch its own data. This is not a new endpoint (the route exists) and not a
   per-component fetch — it is the same lift-once pattern as `useOverview`/`useCampaigns`.
   It also pre-provisions Phase 6 (decision support reads keywords).
4. The campaign table reuses the already-lifted `useCampaigns().data.rowsByName`
   (per-campaign-name rows) — **zero new campaign fetch**.
5. **v1 wires exactly what parent-spec §9 mandates:** search + filter + sort + CSV export +
   metric tooltips. Column chooser, saved views, pagination/virtualization, expandable rows,
   and XLSX are NOT scaffolded as dead interfaces (that is over-engineering). The
   config-driven `MetricColumn[]` design is itself the extension seam.

### Out of scope

- Product-performance table (deferred — needs its own `useProduct` lifted fetch).
- Any backend/API/schema change. No new endpoints.
- Phase 6 (Decision support) and Phase 7 (Controls / live wiring / a11y sweep).

---

## 2. Data plumbing

### 2.1 New types — `src/components/reports/v2/primitives/keywords.ts`

Types the existing `GET /api/reports/keywords` response (verified in `route.ts`):

```ts
export interface KeywordRow {
  keyword: string;
  campaignType: string;
  matchType: string;      // "BROAD" | "PHRASE" | "EXACT" | ... (raw from Redshift)
  isBrand: boolean;
  adSpend: number;
  adRevenue: number;
  adClicks: number;
  adConversions: number;
  adImpressions: number;
  acos: number;           // PERCENT POINTS (spend/rev*100) — confirmed in route
  roas: number;           // ratio
  cpc: number;
  ctr: number;            // percent points (unused by the table)
  cvr: number;            // percent points
}
export interface KeywordsResponse { keywords: KeywordRow[] }
```

### 2.2 New hook — `src/components/reports/v2/use-keywords.ts`

Byte-for-byte structural mirror of `use-campaigns.ts` / `use-overview.ts`:
`useKeywords(accountId?, start?, end?, refreshKey = 0): { data: KeywordsResponse | null; loading: boolean; requestKey: string }`.
Fetches `/api/reports/keywords?accountId=&start=&end=` in an effect keyed on `requestKey`,
ignores stale responses, returns `null` on fetch failure. Same eslint-disable header as the
sibling hooks.

### 2.3 Shell change — `performance-overview-v2.tsx`

- Lift `useKeywords` once per surface (3rd lifted fetch), alongside `useOverview` + `useCampaigns`.
- Fill `sectionContent.keywords` with `<KeywordAnalysisSection surface … keywords … loading … requestKey />`.
- Fill `sectionContent.campaigns` with `<CampaignDetailSection surface … campaigns … loading … requestKey />`
  (reuses the existing `campaigns`/`campaignsLoading`).

---

## 3. Normalized row (`MetricRow`)

The raw keyword and campaign shapes disagree on field names for the same concepts
(keywords: `adClicks`/`cpc`/`adImpressions`; campaigns: `clicks`/`avgCpc`/`impressions`).
Both are normalized to one shape so the primitive and all pure logic stay generic:

```ts
export interface MetricRow {
  name: string;         // keyword text, or campaign name ("—" when null)
  matchType?: string;   // keyword tables only
  adSpend: number;
  adRevenue: number;
  acos: number;         // percent points
  roas: number;         // ratio
  avgCpc: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cvr: number;          // percent points
}
```

Neither table renders CTR or TACoS (the current dashboards don't either), so those fields
are dropped from `MetricRow`. Column set = the 9 metric columns + the sticky name column.

Mapping functions (pure, tested):
- `keywordToMetricRow(k: KeywordRow): MetricRow` — `name = k.keyword`, `avgCpc = k.cpc`,
  `impressions = k.adImpressions`, `clicks = k.adClicks`, `conversions = k.adConversions`,
  `matchType = k.matchType`.
- `campaignToMetricRow(c: CampaignRow): MetricRow` — `name = c.campaignName ?? "—"`; the rest
  map by identical names.

---

## 4. Shared primitive — `primitives/metric-table.tsx`

Presentational only (no data fetching, no filter/sort logic — those are passed in).

Props:
```ts
interface MetricColumn {
  key: keyof MetricRow;          // sortable numeric metric key
  label: string;
  align: "left" | "right";
  fmt: (n: number) => string;    // reuse kpi-derivations formatters
  heat?: "roas" | "acos";        // render via HeatCell with the matching band classifier
  bar?: boolean;                 // CVR → ProgressBar + numeric value
  tooltip?: string;              // metric definition, rendered as title= on the <th>
}
interface MetricTableProps {
  rows: MetricRow[];             // already filtered + sorted
  columns: MetricColumn[];
  firstColumnLabel: string;      // "Keyword" | "Campaign"
  totalsRow: MetricRow | null;   // computed totals; null hides the <tfoot>
  sortKey: keyof MetricRow;
  sortDir: "asc" | "desc";
  onSort: (key: keyof MetricRow) => void;
  palette: SurfacePalette;       // CVR bar accent + total-row top border color
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode;           // native <select>s from the section
  count: string;                 // "N keywords" — TableToolbar count slot
  onExportCsv: () => void;       // Export CSV button in the toolbar
  emptyLabel: string;            // in-body message when rows.length === 0
}
```

Renders:
- `Surface` frame → `TableToolbar` (search + `filters` + `count` + an **Export CSV** button)
  → scroll container (`overflow-auto`, `max-h-[520px]`, table `min-w-[1160px]`).
- Semantic `<table>`/`<thead>`/`<tbody>`/`<tfoot>`.
- **Sticky header** (`thead` `sticky top-0`) + **sticky first column** (`left-0` on the name
  `<th>`/`<td>`) at every breakpoint.
- 40–44px rows, zebra striping, full-row hover.
- Sortable numeric headers (click → `onSort`; ↑/↓/↕ indicator in the surface accent).
- ACoS/ROAS columns → `HeatCell` with `classifyAcos`/`classifyRoas`; the numeric value stays
  visible inside the cell + an `aria-label` (never color-only).
- CVR column → `ProgressBar(pct=cvr, palette)` + numeric value.
- `<tfoot>` **total row** pinned at the bottom, `--mf-charcoal-900` fill + a top border in the
  surface accent (orange hub / charcoal portal). Reuses `computeTotals`.
- Metric-definition tooltips via `title=` on the metric `<th>`s (ACoS, ROAS, Avg. CPC, CVR).
- `rows.length === 0` → a single spanning body row showing `emptyLabel`.

---

## 5. Pure derivations — `primitives/table-derivations.ts` (TDD teeth)

All independently unit-tested in `table-derivations.test.ts`:

- `keywordToMetricRow`, `campaignToMetricRow` — field remap + null-name → "—".
- `filterRows(rows, { search, matchType?, roasBand?, acosBand? }): MetricRow[]` —
  case-insensitive `name` search; optional `matchType` equality; `roasBand`/`acosBand`
  predicates built on `classifyRoas`/`classifyAcos`. Filters compose (AND).
- `sortRows(rows, key, dir): MetricRow[]` — plain **stable** numeric sort (matches the current
  dashboards; no special zero/none handling — that would be over-engineering the existing tables
  don't have); default caller uses `adSpend` desc.
- `computeTotals(rows): MetricRow` — name `"Total"`; sum additives (adSpend, adRevenue,
  impressions, clicks, conversions); **recompute** ratios from the sums
  (acos = Σspend/Σrev·100, roas = Σrev/Σspend, avgCpc = Σspend/Σclicks, cvr = Σconv/Σclicks·100),
  each /0-guarded → 0. Empty input → all-zero totals.
- `toCsv(columns, rows): string` — header row from column labels + first-column label; one line
  per row; RFC-4180 quoting for any field containing comma, double-quote, or newline.
  Returns the string; the Blob/anchor download is section-owned DOM glue.

---

## 6. Section wrappers (net-new v2 components)

Each renders inside the `<section>` the shell already provides (the shell owns the `<h2>`).

### `keyword-analysis-section.tsx` — `{ surface, keywords, loading, requestKey }`
- Maps `keywords.keywords` → `MetricRow[]` via `keywordToMetricRow`.
- Local state: `search`, `sortKey`/`sortDir` (default `adSpend`/`desc`),
  `matchType` filter, `roasBand` filter, `acosBand` filter.
- Pipeline: `filterRows` → `sortRows` → `computeTotals`, passed to `MetricTable`.
- Filters slot: native `<select>`s — Match type (All + distinct matchType values),
  ROAS band (All / Healthy≥4 / Watch 2–4 / At-risk<2), ACoS band (All / Healthy≤25 /
  Watch 25–60 / At-risk>60).
- CSV: `toCsv` → `Blob` download `keywords-{account}-{start}-{end}.csv`.

### `campaign-detail-section.tsx` — `{ surface, campaigns, loading, requestKey }`
- Maps `campaigns.rowsByName` → `MetricRow[]` via `campaignToMetricRow`.
- Same state/pipeline **minus the match-type filter** (campaigns have no match type).
- CSV download `campaigns-{account}-{start}-{end}.csv`.

---

## 7. The three states (parent-spec §12), per section

Mirrors `BusinessPerformanceSection`:

| Condition | Render |
|---|---|
| `!requestKey` | `Surface` — "Select a client and date range to load the table." |
| `loading` | skeleton card (`animate-pulse`) |
| `data == null` (fetch failed) | `Surface` — "Data unavailable for this period." |
| `data` present, 0 rows | `MetricTable` with `emptyLabel` in the body, no total row |
| `data` present, rows filter to 0 | `MetricTable` with "No rows match your filters", total row hidden |
| populated | full `MetricTable` |

Never a blank panel.

---

## 8. Testing strategy (parent-spec §16)

**TDD (pure logic, real assertions):** `keywordToMetricRow` / `campaignToMetricRow`,
`filterRows` (search case-insensitivity, match-type, each band, combined AND),
`sortRows` (asc/desc, none-to-bottom, stability), `computeTotals` (additive sums, recomputed
ratios, /0 guards, empty→zeros), `toCsv` (header, quoting of comma/quote/newline, empty rows).
Band classifiers already covered by `status-bands.test.ts`.

**Not unit-tested (tsc + visual dogfood, never fake DOM/SVG asserts):** `MetricTable` DOM,
sticky header/first-column, the `<select>` filter UI, the Blob CSV download, both section
wrappers.

Commands: typecheck `npx tsc --noEmit` (never `next build`); tests
`npx vitest run <path>`. Green vitest can hide TS errors — run tsc before claiming compile.

---

## 9. Commit sequence (one task per commit, TDD-first)

1. `primitives/keywords.ts` (types) + `use-keywords.ts` (hook). Verify: `tsc`.
2. `primitives/table-derivations.ts` + `table-derivations.test.ts` (**tests first**).
   Verify: `vitest` (all green) + `tsc`.
3. `primitives/metric-table.tsx` (shared presentational primitive). Verify: `tsc`.
4. `keyword-analysis-section.tsx` + lift `useKeywords` into shell + fill
   `sectionContent.keywords`. Verify: `tsc` + visual dogfood (ask user to eyeball).
5. `campaign-detail-section.tsx` + fill `sectionContent.campaigns`. Verify: `tsc` + dogfood.

---

## 10. Risks & open items

- **Match-type filter values** come raw from Redshift (`match_type`); the filter builds its
  option list from the distinct values present in the current dataset, so casing/labels follow
  the source (no hardcoded enum that could drift).
- **Metric tooltips** are `title=` attributes on the 4 rendered metric columns (ACoS, ROAS,
  Avg. CPC, CVR). CTR/TACoS definitions from §9 have no column to attach to and are omitted.
  A richer hover-card tooltip primitive is a future enhancement, not v1.
- **Dogfood is auth-flaky** (preview bounces to /auth/signin) — visual verification of commits
  4–5 is by asking the user to eyeball in their real browser.
