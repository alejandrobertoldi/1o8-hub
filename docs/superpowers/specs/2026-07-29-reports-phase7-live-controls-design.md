# Reports Redesign — Phase 7: Live Controls

**Date:** 2026-07-29
**Branch:** `feat/reports-redesign`
**Status:** Approved, ready for `/writing-plans`

## Goal

Give the v2 reports page the SAME *behavior* the current `/reports` page has — client
picker, Week/Custom date range, Refresh — but presented as a v2-native controls strip
rather than the cramped app-header widget. Selecting a client / date range / refresh
filters the whole v2 page (both surfaces in the dev preview).

Reframe: not a literal transcription of the header controls (the sticky header was
deliberately removed in 8086a04b). Same logic, v2-native presentation.

## Approach (chosen)

Standalone `useReportControls` hook + presentational `<ReportsControlsBar>`, hosted by
the page, feeding derived `{accountId, start, end, refreshKey}` into
`PerformanceOverviewV2`. One control-state source drives N surfaces. Pure date/client
logic extracted to a shared, TDD'd module. Phase-8 swap = drop the host into `/reports`.

Rejected: (B) controls inside the v2 shell — shell renders per-surface, preview stacks
hub+portal → duplicate bars. (C) transcribe header JSX verbatim — ~150 lines duplicated,
clashes with v2 look.

## Module layout

| File | Type | Responsibility |
|---|---|---|
| `src/lib/report-date-range.ts` | NEW, pure | `formatDate`, `getFirstDayOfCurrentMonth`, `getWeekNumber`, `getSundayOfWeek`, and new `resolveRange(mode, opts) → {start, end}`. TDD'd. Extracted from old page's inlined helpers. |
| `src/lib/report-date-range.test.ts` | NEW, test | Vitest: week-number + Sunday-of-week year-boundary / W1 / W52 cases, `resolveRange` week-vs-custom. |
| `src/components/reports/v2/use-report-controls.ts` | NEW, client hook | Owns control state: fetch `/api/clients`, `selectedClient`, `mode` (week/custom), custom dates, year/week, `refreshKey`. Derives `accountId` (= `rawData.IntentwiseID.trim()`) + `{start,end}` via the pure lib. Exposes state + setters + `bumpRefresh`. Also `clientsLoading` + `clients`. |
| `src/components/reports/v2/reports-controls-bar.tsx` | NEW, presentational | Dumb v2-styled strip: client `<select>`, Week/Custom toggle, `DatePicker`s / week+year selectors, existing `<RefreshButton section="overview">`. `surface`-aware accent. All state via props. |
| `src/app/reports/v2-preview/page.tsx` | WIRED | Host the hook once, render ONE shared bar (`surface="hub"`), feed identical `{accountId,start,end,refreshKey}` into both `<PerformanceOverviewV2>` (hub + portal). Remove hardcoded `1707700` + month-to-date. |

## Data flow

1. Page mounts → `useReportControls` fetches `/api/clients` → `ActiveClient[]`.
2. Default `selectedClient` picked (first active, or preserve current if still active).
3. `accountId = selectedClientObj.rawData.IntentwiseID.trim()`; `{start,end}` from `resolveRange`.
4. Both shells receive identical props → each lifts its 3 hooks once (unchanged).
5. Refresh: `RefreshButton` POSTs `refresh=true` to `/api/reports/{overview,keywords,campaigns,product-performance}` then `onRefreshed()` → `bumpRefresh()` → `refreshKey++` → shells' `requestKey` changes → forced re-fetch. **Zero new endpoints.**

## 3-state discipline (controls included)

- Client `<select>`: *loading* (disabled placeholder) · *populated* · *empty/failed* ("No clients available").
- Empty `accountId` → shells already render their "data unavailable" state; sections degrade independently, as locked.

## Palette / NEVER-orange-on-portal

`<ReportsControlsBar>` takes a `surface` prop driving its accent (active toggle, Refresh
border) via `getSurfacePalette`. The bar is global control *chrome*, not a portal data
surface, so in the preview the single shared bar mounts `surface="hub"` (orange accent OK
on chrome). Phase-8 real page passes its own surface. Rule stays intact: no orange
*inside* portal data panels.

## Error handling

- `/api/clients` fails → empty list → bar shows "No clients available"; empty `accountId`
  → shells show "data unavailable". No crash.
- Refresh failure → `RefreshButton` shows its own inline message (already handled).

## Testing

- **TDD** `report-date-range.ts` (vitest, real asserts — pure derivations only).
- Hook + bar (fetch/DOM): verified by `npx tsc --noEmit` + **user visual dogfood** — no
  fake DOM asserts (locked rule). Good account: 1899670, June 2026.
- `npx vitest run src/components/reports/v2/` stays green.

## Non-goals (YAGNI)

- Not refactoring old `/reports/page.tsx` to consume the new lib (working prod code, out of scope; leaves its duplicate helpers).
- Not touching the subscribe-save year-only variant.
- Not building the phase-8 swap (mount into real `/reports`).

## Honored locked decisions

- Shell lifts `useOverview`+`useCampaigns`+`useKeywords` once per surface; no new endpoints; sections degrade independently.
- Emphasis = `getSurfacePalette(surface).accent` (#FF751F hub / #2A5059 portal, never orange on portal).
- Every panel = 3 states.
- KPI hero stays bright #FF751F/#FF8B48 (untouched).
