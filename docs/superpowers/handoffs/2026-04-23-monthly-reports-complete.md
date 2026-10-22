# Monthly Reports — Implementation Complete

**Branch:** `feat/monthly-reports` (worktree at `.worktrees/monthly-reports`)
**Date:** 2026-04-23
**Spec:** `docs/superpowers/specs/2026-04-23-monthly-reports-design.md`
**Plan:** `docs/superpowers/plans/2026-04-23-monthly-reports.md`

## What shipped

- Monthly Reports card on `/reports` (7th card).
- `/reports/monthly` — client + month picker, React preview, Download HTML button.
- `/reports/monthly/config` — global + per-client grid toggles with optimistic writes.
- `src/lib/monthly-report/` module: registry-driven analyzers + dual renderers (HTML + React).
- `report_section_config` table (migration `0042`).
- Unit tests for period, format, config, all analyzers, HTML renderers, orchestrator, preview, and both API routes.
- Admin-only guards on both API routes; unknown client → 404; Redshift failure → 502 retryable.

## Task 0 outcome (Redshift schema discovery)

See `docs/superpowers/research/2026-04-23-redshift-monthly-schema.md`.

- **Products section: shipped on `product_summary`.** Native Intentwise per-ASIN table (54 cols) carries sessions (`browser_session + mobile_app_session`), ordered units, product sales, buy-box %, total order items, and per-ASIN ad metrics. No SP-API fallback needed for V1.
- **B2B section: deferred to v0.2.** Intentwise does not surface B2B/consumer split columns. The entry stays in the `SECTIONS` registry but `queries/b2b.ts` is a stub returning null, so the orchestrator silently adds `b2b` to `skipped[]` at runtime. When the Amazon Business Report (`GET_SALES_AND_TRAFFIC_REPORT`) is ingested into Supabase, replace the stub body with a real query.
- **Two catalog quirks documented in the spike script header:** Spectrum external tables are not in `pg_tables` — use `svv_external_tables` / `svv_external_columns`. And `COUNT(*)` comes back as a string through the `pg` driver — coerce with `Number(...)` before truthy checks.

## Plan-deviation fixes applied during execution

- **Task 3 (period/format):** `fmtDelta` flat-branch threshold changed from `Math.abs(pct) < 0.05` to `Math.abs(pct) <= 0.05`, and flat-display hard-coded as `"— 0.0%"`. `slugify` added a `.replace(/['']/g, "")` pass so "Trejo's Tacos" → "trejos-tacos". Tests expressed the correct intent.
- **Task 6 (products query):** `product_summary` has no `parent_asin` column, so the SQL drops it from SELECT/GROUP BY and the mapper emits `parent_asin: null` unconditionally. Aggregates use `MAX(product_title)` and `MAX(sku)` since GROUP BY is by `product` only.
- **Task 7 (B2B):** shipped as a V1 placeholder — `queries/b2b.ts` body is `return null;` with a TODO pointing to v0.2. Analyzer and tests ship verbatim from the plan.
- **Task 11 (monthly route):** test file's `vi.mock()` factory uses `async () => { const actual = await vi.importActual(...); … }` form because the project's Vitest + oxc transformer rejects bare `await` inside a sync factory body.
- **Task 12 (config route):** test file makes `chain.from` the awaitable terminator (instead of `chain.where`) because the GET route calls `db.select().from(reportSectionConfig)` with no `.where()`.
- **Task 13 (React preview):** test uses `getAllByText(/Dr\. Cuddles/)[0]` in one assertion because `clientName` renders in two DOM nodes (the stamp div and the h1).
- **Task 14 (monthly page):** added `AnalyzerResult` to the `src/lib/monthly-report/index.ts` barrel — the plan's page code imports it as a `type` but it was missing from the barrel.

## Follow-ups (explicitly deferred)

- [ ] Lift CLIENTS map to DB (currently duplicated in 3 files: `src/app/reports/page.tsx`, `src/app/reports/monthly/page.tsx`, `src/app/reports/monthly/config/page.tsx`, plus the API route `src/app/api/reports/monthly/route.ts`).
- [ ] Portal visibility (client-facing view of their own monthly).
- [ ] Scheduled send + email drop.
- [ ] Per-ASIN data source for headline `sessions`, `pageviews`, `buyBox`, `cvr` (currently null/zero at the `account_summary` layer — the Products section already uses `product_summary` but the headline strip does not).
- [ ] PDF rendering path (browser print works).
- [ ] SP-API `GET_SALES_AND_TRAFFIC_REPORT` ingestion → B2B section live in v0.2. When implemented, swap the body of `src/lib/monthly-report/queries/b2b.ts` for a real query and the registered entry will automatically light up.

## Manual QA checklist (not executed in this session)

Run `PORT=3000 npm run dev` and exercise:

1. `/reports` shows 7 cards; Monthly Reports navigates to `/reports/monthly`.
2. Default pickers: Dr. Cuddles + last completed calendar month. Click Generate → preview renders within ~5s.
3. KPI strip shows Sales + MoM arrows (▲/▼). Products section renders. B2B is absent (in `skipped[]`).
4. Click Download HTML → file `dr-cuddles-2026-03-1o8-monthly.html` downloads; opens standalone; fonts + logo visible.
5. Paste HTML into Gmail compose → renders acceptably with system-font fallback.
6. `/reports/monthly/config`: toggle global section, verify optimistic save; cycle per-client cell default → ON → OFF → default; reload, verify persistence.
7. Bad input via devtools: `{period: "2099-01"}` → 400; `{clientCode: "NOSUCH"}` → 404.

## How to kick off next session

Open the Monthly Reports card on `/reports`, pick a client, Generate, Download, email.
