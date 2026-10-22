# Monthly Reports — Renderer Swap (V1.1)

**Date:** 2026-04-24
**Branch:** `feat/monthly-reports` (worktree `.worktrees/monthly-reports/`)
**Status:** Design — pending approval
**Predecessor:** `2026-04-23-monthly-reports-design.md` (V1, shipped this branch)

## Goal

Replace the Monthly Reports renderer with the A4 print-ready React template at `/Users/manu/1o8Hub/1o8hub-report/`. Ship a server-side PDF endpoint so reviewers can download a branded PDF and attach it to the client email. One source of truth for the report visual.

## Why

- **End state:** team member reviews the report → emails it as a PDF attachment to the client. A PDF deliverable is the product; the current single-file HTML download isn't.
- **V1 deliverable** (orange-on-dark HTML shell + React preview) shipped but isn't the design we want on clients' desks.
- **New template** is purpose-built for print: A4 pages, `page-break-after: always`, SVG charts, print CSS tuned against 794×1123px.

## Non-goals

- Email-send pipeline (Resend attachment, Gmail draft). v1.2.
- B2B section, ExecSummary, Highlights, Risks, Financials, Team, Goals. Defer per primer.
- Per-client `lead`/`accent` DB fields. Hardcode for V1, lift later.
- Lifting `CLIENTS` map to DB. Tracked as follow-up in primer.

## V1 section list

Ordered: `cover`, `toc`, `kpis`, `mom`, `products`, `appendix`.

- `products` replaces the template's `channels` slot — we render per-ASIN data we already have, not fake channel data.
- B2B query + analyzer stay on disk but unwired. Rewire in v0.2 once SP-API Business Report lands.

## Decisions (from brainstorming, 2026-04-24)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Products as Channel | Add **new `products` section** to template | Honest mapping to the data we have |
| 2 | MoM data depth | **Fetch 6 months** of `account_summary`; hide target + CAC lines | Cheap extra query, real line chart |
| 3 | Replace vs keep old renderers | **Replace both** (`render-html/`, `render-react/`) | Single source of truth |
| 4 | PDF in V1 | **Server-rendered endpoint** (reviewer downloads manually) | Sets up v1.2 email-send without blocking V1.1 |
| 5 | Headless runtime | **`puppeteer-core` + `@sparticuz/chromium` on Vercel** | Zero infra drift; low volume (~17 PDFs/mo) |
| 6 | Integration pattern | **Copy-in-place + thin adapter** | Template README-sanctioned; minimal friction |

## Architecture

```
src/
  components/monthly-report/              # NEW — template lands here
    Report.tsx                            # entry, section map
    shell/{PageShell,SectionHead}.tsx
    charts/{LineChart,BarChart,ComparisonChart,Donut,Spark}.tsx
    sections/
      CoverPage.tsx
      TOCPage.tsx
      KPIPage.tsx
      MoMPage.tsx
      ProductsPage.tsx                    # NEW — replaces ChannelPage
      AppendixPage.tsx
    styles/report.css                     # print-tuned, scoped via layout.tsx
    defaults.ts
    types.ts                              # template data contract

  lib/monthly-report/
    build-report-data.ts                  # NEW — orchestrator → Report
    types.ts                              # unchanged
    orchestrator.ts                       # updated (returns {report, skipped})
    queries/
      account.ts                          # updated (+ fetchRevenueSeries)
      products.ts                         # unchanged
      b2b.ts                              # unchanged, dormant
    analyzers/                            # unchanged
    # DELETED: render-html/, render-react/, registry.ts

  app/
    reports/monthly/
      layout.tsx                          # NEW — scopes report.css import
      page.tsx                            # UPDATED — renders <Report> preview
      print/page.tsx                      # NEW — internal route for Puppeteer
      config/…                            # unchanged
    api/reports/monthly/
      route.ts                            # UPDATED — returns {report, skipped}
      route.test.ts                       # UPDATED
      pdf/route.ts                        # NEW — Puppeteer → application/pdf
      pdf/route.test.ts                   # NEW
```

### Data adapter — `build-report-data.ts`

Pure function. No I/O. Signature:

```ts
export interface BuildInput {
  client: ClientContext;
  period: MonthlyPeriod;
  headline: HeadlineResult | null;
  products: ProductsResult | null;
  revenueSeries: Array<{ month: string; revenue: number }>;
  lead: string;
}
export function buildReportData(inp: BuildInput): Report;
```

Mapping table:

| Template field | Source | Notes |
|---|---|---|
| `meta.client` | `inp.client.name` | |
| `meta.month` | `inp.period.label` | "March 2026" |
| `meta.period` | derived from `period.start`/`end` | "01 Mar – 31 Mar" |
| `meta.lead` | `inp.lead` | V1: hardcode `"Manu Lancharro"` |
| `meta.issued` | `Date.now()` formatted | "Apr 24, 2026" |
| `meta.reportId` | `${period}-${clientSlug}` | "2026-03-dr-cuddles" |
| `meta.accent` | `"#F7BF1D"` | brand gold |
| `sections` | static V1 array | `['cover','toc','kpis','mom','products','appendix']` |
| `kpis[]` | `headline.current` + `headline.deltas` | 6 cards |
| `mom.revenueSeries` | `inp.revenueSeries` | 6 points |
| `mom.revenueTargetSeries`, `cacSeries` | `[]` | hidden in V1 |
| `mom.table` | `headline.current` vs `headline.previous` | 5 delta rows |
| `mom.narrative` | templated | e.g. "Revenue +18.4% vs previous month…" |
| `products` | `inp.products.rows` | extension to template types |
| `appendix` | static object | methodology + sources + glossary + contact |

### Template type extensions

In `src/components/monthly-report/types.ts`:
1. Add `'products'` to `SectionId` union.
2. Add `products?: ProductRow[]` to `Report`. `ProductRow` shape matches `src/lib/monthly-report/types.ts` → re-export rather than duplicate.

### Data fetch changes

**`queries/account.ts`** — add:
```ts
export async function fetchRevenueSeries(
  accountId: string,
  periodStart: string,
): Promise<Array<{ month: string; revenue: number }>>;
```
Single Redshift query against `intentwise_ecommerce_graph.account_summary`. Groups by `date_trunc('month', report_date)`, filters to `[periodStart - 5 months, periodStart]`. Returns `month` as `"MAR"` and `revenue` as `Number`-coerced. Gap-fills missing months in JS, not SQL.

**`orchestrator.ts`** — add `fetchRevenueSeries` to the existing `Promise.all`. Call `buildReportData(...)`. New return shape:
```ts
export interface ReportPayload {
  report: Report;
  headline: HeadlineResult | null;
  skipped: SectionKey[];
  // REMOVED: html, sections[]
}
```

### Products section design

Single-A4-page ASIN table using template's existing `.pivot` classes:
- Columns: Product (title, 340px truncate), Sessions, Units, Sales, CVR, Buy-box.
- Thresholds reuse existing `thresholds.ts` (CVR ≥ 8% good, 4–8% warn, <4% bad; Buy-box ≥ 95% good, 85–95% warn, <85% bad).
- Grand-total row uses template's `tr.grand` (inverted black).
- Top 20 ASINs by sales; overflow shows "Showing top 20 of X ASINs." Multi-page pagination is a v1.2 follow-up.
- If `products.rows.length === 0` the section is omitted (`data.products && <ProductsPage/>`).

### PDF endpoint

**Route:** `POST /api/reports/monthly/pdf`, body `{clientCode, period}`, response `application/pdf` with `Content-Disposition: attachment`.

**Flow:**
1. Authorize (admin or editor role).
2. Validate body (same Zod schema as existing POST route).
3. `generateReport(client, period, config)`.
4. Sign a short-lived JWT (5-min TTL, HMAC) containing the `Report` payload.
5. Launch `puppeteer-core` with `@sparticuz/chromium.executablePath()`.
6. `page.goto('http://localhost:3000/reports/monthly/print?token=…')`.
7. `page.waitForSelector('[data-report-ready]')` (template injects after hydration).
8. `page.pdf({ format: 'A4', printBackground: true, margin: 0 })`.
9. Close browser, return PDF.

**Print route** (`src/app/reports/monthly/print/page.tsx`):
- Server component, reads & validates token, decodes `Report`, renders `<Report>`.
- Marks `robots: noindex, nofollow`.
- Hits middleware auth so public access 404s.

**Deps added:**
- `@sparticuz/chromium` ^131.0.0
- `puppeteer-core` ^23.0.0

**vercel.json** — bump `/api/reports/monthly/pdf` to `{ memory: 1024, maxDuration: 60 }`.

**Local dev:** document `PUPPETEER_EXECUTABLE_PATH` in `.env.example` with a comment showing the macOS Chrome path.

**Failure mode:** if Chromium fails to launch → 500 with `{ error: 'PDF renderer unavailable' }`. Reviewer falls back to ⌘P manually.

### Page-level changes

**`/reports/monthly/page.tsx`:**
- Sticky header chrome (pickers + Generate + "Configure sections" link) unchanged.
- `Generate` POSTs to `/api/reports/monthly`, receives `{report, skipped}`.
- Preview replaces `<ReportPreview>` with `<Report data={report} />`.
- `Download HTML` button → `Download PDF` — POSTs to `/api/reports/monthly/pdf`, receives the `Blob`, triggers browser download.
- Chrome wrapped in `<div className="report-chrome">` with `@media print { .report-chrome { display: none } }` added to `report.css`.

**`src/app/reports/monthly/layout.tsx`** (new, ~5 lines):
```tsx
import '@/components/monthly-report/styles/report.css';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```
Scopes template CSS to `/reports/monthly/**`. Nothing else in the app sees it.

## Testing

**Stay (unchanged):**
- `format.test.ts`, `period.test.ts`, `config.test.ts`
- `analyzers/headline-kpis.test.ts`
- `analyzers/products.test.ts`
- `analyzers/b2b.test.ts`

**Rewrite:**
- `orchestrator.test.ts` — asserts `{report, skipped}`, drops HTML.
- `api/reports/monthly/route.test.ts` — new response shape.

**Delete:**
- `render-html/kpi-strip.test.ts`
- `render-html/sections.test.ts`
- `render-react/ReportPreview.test.tsx`

**New:**
- `build-report-data.test.ts` — missing previous month (deltas null); zero products (section excluded); all sections present.
- `queries/account.test.ts` — `fetchRevenueSeries` happy path + 6-month gap-fill.
- `api/reports/monthly/pdf/route.test.ts` — mock Puppeteer, assert 200 + `application/pdf` + filename; assert 500 on launch failure.

## Manual QA checklist (runs against worktree before merge)

1. `PORT=3000 npm run dev` → `/reports/monthly` → Dr. Cuddles / last completed month → Generate. Preview matches template pixel-for-pixel.
2. ⌘P in browser → chrome hidden; page breaks clean; A4 margins look right.
3. Click Download PDF → PDF downloads → matches browser print visually.
4. Pick a client with no product rows → Products page omitted, no error.
5. `/reports/monthly/config` → toggle products off → Generate → Products section skipped.
6. Smoke-test `/`, `/portal`, `/reports` — no CSS regressions from template styles leaking.

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Puppeteer cold start ~3–5s | Document expected wait; swap to Browserless if it becomes painful. |
| 2 | `@sparticuz/chromium` vs 250 MB Vercel function limit | Validate on `vercel dev` build output before merge; Browserless fallback. |
| 3 | Template CSS leaks into non-report routes | Import only in `app/reports/monthly/layout.tsx`; smoke-test sibling routes. |
| 4 | Missing JWT signing secret at runtime | Add `MONTHLY_REPORT_JWT_SECRET` to `.env.example`; generate+document. |
| 5 | Hardcoded `lead` and `CLIENTS` map | Known debt; out of scope; flagged in follow-ups. |

## Code to delete (~800 LOC)

- `src/lib/monthly-report/render-html/` (8 files: primitives, kpi-strip, template, logo, products, b2b, + tests)
- `src/lib/monthly-report/render-react/` (5 files: ReportPreview, KpiStrip, ProductsSection, B2bSection, + test)
- `src/lib/monthly-report/registry.ts`

## Open follow-ups (out of scope)

1. Email-send pipeline — `Send to client` button → Resend attachment → Gmail draft. v1.2.
2. Per-ASIN 6-month sparkline in Products section.
3. Revenue target series (needs target table + goals system).
4. CAC series (needs ad spend ingest).
5. Lift `CLIENTS` map to DB (primer).
6. Per-client `lead`, `accent` in DB (primer).
7. Multi-page Products when ASINs > 20.
8. Re-wire B2B section for v0.2 post SP-API Business Report ingest.
