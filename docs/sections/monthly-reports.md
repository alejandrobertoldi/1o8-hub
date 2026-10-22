# Monthly Reports

Admin generates a branded monthly performance report for an Amazon seller client. Lives at `/reports/monthly` with configuration at `/reports/monthly/config`.

## Behaviour

- Picks client (from hard-coded CLIENTS map) + month (default: last completed calendar month; day-1 of next month backs off one more month for Intentwise lag).
- On Generate, `POST /api/reports/monthly` runs the orchestrator:
  1. `resolveConfig(clientCode)` reads `report_section_config` (per-client > global > default-on).
  2. Parallel fetch: current-month and previous-month account rollup from `intentwise_ecommerce_graph.account_summary`.
  3. `buildHeadlineResult` computes KPIs + MoM deltas.
  4. For each section in `SECTIONS`, run its analyzer if enabled; sections whose analyzer returns null are added to `skipped[]` and omitted from both preview and HTML.
  5. `renderShell` emits a single-file HTML artifact with inline SVG logo and inline CSS.
- React preview mirrors the HTML artifact (same numbers, same order, hub dark theme).
- Downloaded filename: `<client-slug>-<YYYY-MM>-1o8-monthly.html`.

## Architecture

`src/lib/monthly-report/` — pure library, no framework concerns:
- `queries/` — Redshift fetchers (`account`, `products`, `b2b`).
- `analyzers/` — data → typed result | null.
- `render-html/` — result → single-file HTML.
- `render-react/` — result → React preview.
- `registry.ts` — single source of truth for sections.
- `orchestrator.ts` — public `generateReport()` walks the registry.

Section registry is consumed by: HTML orchestrator, React preview, and the config grid UI.

## Adding a section

1. Add a query function in `queries/<key>.ts` returning a raw shape.
2. Add an analyzer in `analyzers/<key>.ts` returning a typed result or null.
3. Add an HTML renderer in `render-html/<key>.ts`.
4. Add a React component in `render-react/<Key>Section.tsx`.
5. Append a tuple to `SECTIONS` in `registry.ts`.
6. Add the key to `SectionKey` in `types.ts` and to `AnalyzerResult`.
7. Update the branch in `orchestrator.ts` to call the new query + analyzer.

The config UI, route, and preview pick up the new entry automatically.

## Config resolution

```
configFor(clientCode, sectionKey):
  per-client row → use it
  global row     → use it
  otherwise      → true
```

Table: `report_section_config(scope, scope_key, section_key, enabled, updated_at)` with composite PK. Migration `drizzle/migrations/0042_monthly_report_config.sql`.

## Known limitations (V1)

- `sessions`, `pageviews`, `buyBox`, and `cvr` in headline KPIs are null until a per-ASIN data source lands (see research doc `docs/superpowers/research/2026-04-23-redshift-monthly-schema.md`). The Products section uses `product_summary` for per-ASIN metrics, but the headline strip itself is wired to `account_summary` which omits these fields.
- **B2B section deferred to v0.2** — Intentwise does not surface the Amazon Business Report's B2B/consumer split. The B2B entry remains registered but its query is a stub returning null, so the section is silently skipped. Follow-up is to ingest `GET_SALES_AND_TRAFFIC_REPORT` via SP-API into a dedicated Supabase table.
- No PDF export (browser Print works).
- No scheduled / automated send.
- No persistent storage of generated HTML — each Generate is fresh.
- Clients map is hard-coded in 3 places (reports page, monthly page, config page). A DB lift is follow-up work.
