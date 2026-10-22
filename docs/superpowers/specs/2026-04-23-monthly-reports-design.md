# Monthly Reports — Design Spec

**Date:** 2026-04-23
**Author:** Manu (via Claude brainstorming session)
**Status:** Draft, pending plan

## Problem

Every month, the 1o8 agency sends Amazon seller clients a branded performance review for the prior month. Today this is a manual exercise: pull a Seller Central Business Report CSV, feed it into the `1o8hub-monthly-report` Python skill, send the resulting HTML to the client. The skill produces a beautifully branded artifact but it is offline, CSV-driven, and unfinished — the original author explicitly notes "not finished as I need to setup the connection with Redshift, wire with clients, etc."

Parallel to this, the hub already exposes Redshift-backed analytics at `/reports` (Overview, Period Comparative, Inventory, Share of Voice, Subscribe & Save, Advertising Audit), each living as a card that opens into a live dashboard.

This spec defines a new **"Monthly Reports"** card that closes the gap: an in-hub flow where an admin picks a client + month, previews a branded monthly review live in the browser, and downloads a single-file HTML deliverable ready to email.

## Goals (V1)

- New card on `/reports` labelled **Monthly Reports** that routes to `/reports/monthly`.
- Admin picks client + month (defaults to **last completed calendar month**) and presses Generate.
- Report covers four sections: **Headline KPIs** (with MoM deltas), **Product performance**, **B2B split**, plus placeholder for future sections via a registry.
- Two outputs from one pipeline: an interactive React preview inside the hub, and a self-contained branded HTML file (inline CSS + inline SVG logo, no external assets) downloadable from the preview page.
- A separate admin config page at `/reports/monthly/config` to toggle sections on/off **globally** and **per client** (per-client overrides win).
- Graceful skip: any section whose analyzer returns `null` (no data) is omitted from both renderers without an empty shell.

## Non-goals (V1)

- Scheduled / background generation. Admin presses Generate each time.
- Persistent storage of generated HTML. Artifact produced on demand.
- Portal (client-facing) visibility. Architecture makes adding this later a small addition.
- PDF output. HTML is the deliverable; browsers handle print-to-PDF.
- Automated email send.
- Per-run section override (only global + per-client configs exist).
- Additional report sections beyond the four above: Inventory, Ads, SoV, S&S are already standalone cards and can be folded into the monthly bundle in later versions by adding registry entries.

## User flows

### Admin — generate and send

1. Admin opens `/reports`, clicks **Monthly Reports** card.
2. On `/reports/monthly`: client picker (17 clients from the existing hard-coded `CLIENTS` map), month picker (default = last completed calendar month; future months disabled; current month disabled until day 2 of the next month to allow Intentwise lag).
3. Admin presses **Generate**. Page issues `POST /api/reports/monthly` with `{ clientCode, period: "YYYY-MM" }`.
4. API loads section config, runs enabled analyzers against Redshift, orchestrates both renderers, returns `{ html, analyzerResults, skipped[] }`.
5. Page shows the **React preview** (a faithful visual rendering of the report, same sections, same numbers as the HTML) and a **Download HTML** button whose filename is `<client-slug>-<YYYY-MM>-1o8-monthly.html`.
6. Admin verifies, downloads, emails to client.

### Admin — configure sections

1. From `/reports/monthly`, link → `/reports/monthly/config`.
2. UI:
   - **Global defaults** card: one row per section, on/off toggle.
   - **Per-client grid**: columns = sections, rows = clients. Cell states: `ON` / `OFF` / `— default` (inherits global). Click cycles.
3. Saves are optimistic via `PUT /api/reports/monthly/config`. Admin-role enforced.

## Architecture

Three layers — **analyzers → renderers → orchestrator** — mirroring the Python skill's separation. All code lives under `src/lib/monthly-report/`.

```
src/lib/monthly-report/
├── index.ts                      # public API: generateReport()
├── types.ts                      # AnalyzerResult, SectionKey, MonthlyPeriod, ReportConfig
├── thresholds.ts                 # CVR/buy-box/SKU bands (port of thresholds.yaml)
├── queries/
│   ├── redshift-account.ts       # account-level KPIs, month + prev-month (for MoM)
│   ├── redshift-product.ts       # per-ASIN sessions/units/sales/buy-box  ← data-availability unknown
│   └── redshift-b2b.ts           # B2B split  ← data-availability unknown
├── analyzers/
│   ├── headline-kpis.ts          # row-sets → KPI dict + MoM deltas
│   ├── products.ts
│   └── b2b-split.ts
├── render-html/
│   ├── template.ts               # single-file HTML shell (ported from references/template.html)
│   ├── primitives.ts             # pivot(), obs(), section()
│   ├── kpi-strip.ts
│   ├── products.ts
│   ├── b2b-split.ts
│   └── orchestrator.ts           # renderHtml(results, config, client, period)
├── render-react/
│   ├── KpiStrip.tsx
│   ├── ProductsSection.tsx
│   ├── B2bSection.tsx
│   └── ReportPreview.tsx
└── registry.ts                   # single source of truth
```

```
src/app/reports/monthly/
├── page.tsx                      # pickers + preview + download
└── config/page.tsx               # global + per-client toggles

src/app/api/reports/monthly/
├── route.ts                      # POST → { html, analyzerResults, skipped }
└── config/route.ts               # GET (resolved), PUT (write)

drizzle/migrations/
└── 00XX_monthly_report_config.sql
```

### Registry

The single list both renderers and the config UI walk:

```ts
export const SECTIONS = [
  {
    key: "products",
    label: "Product performance",
    deck: "Per-ASIN breakdown sorted by sales. Colour coding is driven by thresholds.",
    analyzer: analyzeProducts,
    html: renderProductsHtml,
    react: ProductsSection,
  },
  {
    key: "b2b",
    label: "B2B split",
    deck: "Share of revenue and units from Amazon Business buyers versus consumers.",
    analyzer: analyzeB2b,
    html: renderB2bHtml,
    react: B2bSection,
  },
] as const;
```

Headline KPIs are **not** a registry section — they always render, above the section loop, matching the Python skill's handling.

### Shared design tokens

Brand tokens (colours, fonts, spacing scales) live once in `src/lib/monthly-report/tokens.ts`:

- Consumed as a CSS string by `render-html/template.ts` (for the artifact's inline `<style>`).
- Consumed as Tailwind class mappings / inline styles by `render-react/` components.

Both renderers produce the same visual result for the same analyzer input. Adding a new colour means editing one file.

## Data flow

```
User → /reports/monthly page
       (picks client + month)
       ↓
       POST /api/reports/monthly { clientCode, period }
       ↓
       Route handler:
         • resolve period → { start, end, prevStart, prevEnd }
         • load section config (per-client → global → default)
         • for each enabled section:
             run analyzer(redshift_rows, thresholds) → dict | null
         • renderHtml(results, client, period) → string
       ↓
       Response { html, analyzerResults, skipped }
       ↓
Page displays:
  - React preview (driven by analyzerResults)
  - Download button (Blob from html, filename clientSlug-YYYY-MM-1o8-monthly.html)
```

## Data sources

| Section | Redshift table (proposed) | Notes |
|---|---|---|
| Headline KPIs + MoM | `intentwise_ecommerce_graph.account_summary` | Already used by `/api/reports/period-comparative`. Two queries (month + prev-month). |
| Product performance | **Unknown — spike required** | Needs per-ASIN sessions, units, sales, buy-box %. `advertised_product_summary` only covers advertised products. Likely need a Seller Central Business Report table (e.g. `business_report`, `asin_summary`) or fall back to SP-API. |
| B2B split | **Unknown — spike required** | Business Report CSV has explicit `-B2B` columns; may or may not exist in Intentwise Redshift. |

**Data discovery spike** (first task in the implementation plan): connect to Redshift, list tables in `intentwise_ecommerce_graph`, find whether per-ASIN and B2B data are available. If not, fallback options:
- Pull Seller Central Business Reports via SP-API and cache in a new Supabase table keyed by (client, date, asin).
- Ship V1 with only Headline KPIs + MoM; mark Products and B2B as v0.2.

Either outcome is compatible with the registry-based architecture; only the query layer for those sections changes.

## Configuration model

DB schema (new Drizzle migration):

```sql
CREATE TABLE report_section_config (
  scope        text        NOT NULL,       -- 'global' | 'client'
  scope_key    text        NOT NULL,       -- 'default' | clientCode (e.g. 'BNU_SC_US')
  section_key  text        NOT NULL,       -- e.g. 'products'
  enabled      boolean     NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_key, section_key)
);
```

Resolution function:

```ts
configFor(clientCode, sectionKey):
  client-scoped row → use it
  else global-scoped row → use it
  else default → true (new sections default on)
```

Config page POSTs the complete grid; route handler upserts rows. No separate onboarding step — the table can be empty and the system behaves correctly.

## Error handling

| Failure mode | Behavior |
|---|---|
| Redshift connection fails | API returns `502` with `{ error, retryable: true }`. UI retry button. |
| Individual analyzer returns no rows | Section omitted from response; listed in `skipped[]`. Preview hides it; HTML never contains an empty section. |
| Per-ASIN data not available (spike outcome) | Products + B2B return `null`; report ships with KPIs + MoM only. |
| Unknown client code | `404`. |
| Future month selected | Month picker disables future + current (until day 2); server returns `400` if bypassed. |
| Config table empty | Default to all sections enabled. |
| HTML renderer throws | Log + `500`. React preview still works. Download button disabled with error surfaced. |

**Data freshness banner:** "Data current through <latest date in Redshift>." Picker disables the current month until day 2 of the next month (Intentwise lag ~24-48h).

## Testing

1. **Analyzer unit tests (vitest)** — pure function in / dict out. For each analyzer: happy path, empty input, partial columns, edge thresholds (exactly `cvr.critical`, zero sessions). ~6–8 tests per analyzer.
2. **HTML renderer snapshot tests** — fixed analyzer dict → snapshot HTML string. Catches visual drift. Separate test confirms `{logo}` / `{client}` / `{period}` placeholders substituted.
3. **Registry integration test** — for every entry in `SECTIONS`, `expectTypeOf` that analyzer output matches what both renderers consume.
4. **Route test `/api/reports/monthly`** — mock `@/lib/redshift`, `@/lib/auth-db`, `@/lib/db` per project convention. Assert: admin auth, config resolution order, `skipped[]` populated when analyzer returns null, response shape.
5. **Config route test** — GET returns resolved config; PUT enforces admin role; round-trip persistence.
6. **Manual QA checklist** — open downloaded HTML in Gmail compose to confirm standalone rendering (fonts load, inline SVG visible, single-file integrity).

## Implementation order (preview — full plan to come from writing-plans)

1. **Spike:** discover Redshift tables for per-ASIN and B2B data. Outcome decides section scope for V1.
2. Drizzle migration + `report_section_config` table.
3. Shared foundations: `types.ts`, `tokens.ts`, `thresholds.ts`, `registry.ts`.
4. Headline KPIs: query + analyzer + HTML renderer + React component.
5. Products + B2B (or fallback plan from step 1).
6. API routes (`/api/reports/monthly`, `/api/reports/monthly/config`).
7. UI pages (`/reports/monthly`, `/reports/monthly/config`) and card on `/reports`.
8. Tests (interleaved with each step via TDD).
9. Manual QA: email preview.

## Open questions / risks

- **Per-ASIN + B2B data availability in Redshift** — resolved by the spike in step 1.
- **Intentwise data-freshness semantics** — assumes 24–48h lag; may need validation after the spike.
- **Font loading in email clients** — the Python template relies on Google Fonts (`Inter`). Gmail strips `<link>` to external fonts; fallback to system stack is acceptable and already present via CSS. Confirmed acceptable in manual QA step.
