# Hours dashboard — day-level drill (Layer 2)

**Date:** 2026-07-22
**Branch:** `feat/super-admin-hours-dashboard`
**Depends on:** `2026-07-21-super-admin-hours-dashboard-design.md` (the shipped dashboard)

## Goal

Add a second drill-down layer to the bottom summary table of the super-admin hours
dashboard. Today the table expands one level:

- **pivot = client:** client (L0) → members (L1)
- **pivot = member:** member (L0) → clients (L1)

This feature adds **Layer 2 = per-day detail** under the existing L1 rows:

- **pivot = client:** client → member → **days**
- **pivot = member:** member → client → **days**

Each L2 row is one calendar day with the total hours that member logged for that client
on that day, within the active date range.

## Non-goals

- No change to Layer 0 / Layer 1 behavior, the KPIs, bar charts, or heatmap.
- No per-time-entry breakdown (start/end/note). Layer 2 is per-day aggregate only.
- No schema change. No DB writes. Reads are additive and read-only.

## Architecture decision: lazy drill endpoint

The current `/api/hours/summary` returns the entire member×client grid for the range in
one payload; the client re-pivots it (`filterSummary`) and every view derives from it. It
carries **no** day data.

**Decision (locked):** fetch day data **lazily per drill**, not by fattening the summary.

- Rejected: embedding every day for every member×client in the summary payload. That grows
  the payload ~30× (up to ~27k nested rows for a 90-day range), re-pivots on every filter
  toggle, and pays the full cost even though a super-admin drills into 1–2 cells per session.
- Chosen: a new gated endpoint returns per-day hours for **one** member×client cell, fetched
  only when that cell is expanded. React Query caches each drill, so re-expanding is instant.
  Cost: a brief spinner the first time a cell is opened.

## Components

### 1. DB query — `src/lib/hours/queries.ts`

Add:

```ts
export function drillDays(from: string, to: string, userId: string, clientIdCode: string) {
  return db
    .select({
      entryDate: timeEntries.entryDate,
      hours: sql<string>`sum(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .where(and(
      eq(timeEntries.userId, userId),
      eq(timeEntries.clientIdCode, clientIdCode),
      gte(timeEntries.entryDate, from),
      lte(timeEntries.entryDate, to),
    ))
    .groupBy(timeEntries.entryDate)
    .orderBy(asc(timeEntries.entryDate));
}
```

Read-only, parameterized (Drizzle) — no injection surface, no schema change.

### 2. Endpoint — `src/app/api/hours/drill/route.ts` (new)

- **Auth gate identical to `/api/hours/summary`:** `401` if no session, `403` unless
  `session.user.isSuperAdmin`. This gate is the security boundary — per-user day data must
  never reach a non-super-admin.
- Params: `from`, `to` (validated by `isValidDateString`), `userId`, `clientIdCode`
  (required, non-empty). Invalid/missing → `400`.
- Response: `{ days: { entryDate: string; hours: number }[] }`, `hours` rounded to 2 dp,
  ordered by date ascending.

### 3. Pure helpers — `src/lib/hours/dashboard-utils.ts`

```ts
export type DrillDay = { entryDate: string; hours: number };

// Parse a YYYY-MM-DD string as a LOCAL calendar date (NOT UTC).
export function parseLocalDate(entryDate: string): Date { ... }

// "Mon, Jul 21" — composes parseLocalDate.
export function formatDayLabel(entryDate: string): string { ... }
```

`parseLocalDate` is the primary correctness concern and the main TDD target:
`new Date("2026-07-21")` is parsed as UTC midnight and renders as **Jul 20** in any
negative-offset timezone. `parseLocalDate` must construct the date from its
year/month/day components so the displayed day matches the stored day.

No `drillTotal` helper — the L1 row already shows the member×client total, so a subtotal
would be redundant.

### 4. Component — `src/components/admin/hours-dashboard.tsx`

- New state `expandedDays: Set<string>`, key = `` `${userId}|${clientIdCode}` ``
  (**pivot-independent** — identical whether reached via member→client or client→member).
- New child component `DayDrillRows({ from, to, userId, clientIdCode })`:
  - Owns a `useQuery` keyed `["hours-drill", from, to, userId, clientIdCode]` that fetches
    `/api/hours/drill`. Mounts only when the cell is expanded → lazy fetch; cached by React
    Query → re-expand is instant.
  - Renders a loading row, an error row, or one `<TableRow>` per day
    (`formatDayLabel(entryDate)` + `fmtNum(hours)`).
  - A child component (not an inline map) because hooks cannot be called inside `.map`.
- Both pivot tables: the existing L1 rows gain an inline chevron + `onClick` toggling the
  composite key; when open, render `<DayDrillRows>`.
- Indentation: L0 chevron in the `w-8` column, L1 chevron inline at `pl-8`, L2 day rows at
  `pl-14`, no chevron.

## Data flow

1. User expands an L0 row (existing) → L1 rows show (from cached summary).
2. User clicks an L1 row → composite key added to `expandedDays` → `<DayDrillRows>` mounts →
   fires `/api/hours/drill?from&to&userId&clientIdCode`.
3. Endpoint gate-checks super-admin, runs `drillDays`, returns `{ days }`.
4. Child renders one row per day. Collapse/re-expand reuses the React Query cache.

The member/client filters only decide which L1 pairs are visible; a single member×client
drill is unaffected by them, so no filter/drill conflict exists.

## Error handling

- Endpoint: `401`/`403`/`400` as above; `500` on query failure (default Next.js).
- Client: `DayDrillRows` shows the endpoint error message in a muted row; loading shows a
  "Loading…" row; zero days shows a "No entries" row (defensive — L1 only exists when hours
  > 0).

## Testing

- **Vitest (unit):** `parseLocalDate` (off-by-one guard — asserts local Y/M/D components,
  not a UTC-shifted day) and `formatDayLabel` (shape), added alongside existing
  dashboard-utils tests.
- **`npm run build`:** the TS gate (Vitest does not typecheck).
- Manual dogfood after: expand a client → member → day, and a member → client → day; confirm
  day totals sum to the L1 total; confirm a plain admin still gets `403`.

## Files touched

| File | Change |
|---|---|
| `src/lib/hours/queries.ts` | add `drillDays` |
| `src/app/api/hours/drill/route.ts` | new gated endpoint |
| `src/lib/hours/dashboard-utils.ts` | add `DrillDay`, `parseLocalDate`, `formatDayLabel` |
| `src/lib/hours/dashboard-utils.test.ts` | add helper tests |
| `src/components/admin/hours-dashboard.tsx` | `expandedDays` state, `DayDrillRows`, L1 chevrons |
