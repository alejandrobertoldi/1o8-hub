# Daily hours heatmap — design

**Date:** 2026-07-30
**Branch:** `feat/hours-daily-heatmap` (worktree off `origin/feat/hours-category-filter`)
**Status:** Approved design, pre-implementation

## Goal

Add a second heatmap to the hours dashboard so we can see **how many hours are worked
each day**. Rows are members *or* clients (toggle); columns are one per calendar day in
the selected range; each cell is that row-entity's total hours on that day. A bottom
"All" row gives the total hours worked that day across everyone.

This complements the existing "Member × client hours" heatmap
([`src/components/admin/hours-dashboard.tsx`](../../../src/components/admin/hours-dashboard.tsx) ~L448),
which has no time dimension.

## Locked decisions

- **Day axis:** always one column per calendar day; horizontal scroll when it overflows.
  No bucketing, no range cap. (Consistent with how the existing heatmap scrolls its client columns.)
- **Placement:** same page, new card directly below the Member × client heatmap.
- **Shared controls:** inherits the dashboard's date range AND the category filter.
  The Members/Clients dimension toggle is local to this card.
- **Cell value:** row-entity's summed hours for that day.
  - Members mode: member's hours that day, summed across all clients.
  - Clients mode: client's hours that day, summed across all members (`INTERNAL → "MarketFoundry"`).
- **Totals:** a bottom "All" row = per-day total across everyone. No right-hand total column.
- **Default dimension:** Members.

## Components

### 1. Data layer — `src/lib/hours/queries.ts`

New query, mirroring the style of `summaryRows` and `drillDays`:

```
summaryByDay(from, to, dimension: "member" | "client", categories?: string[])
  → rows of { key: string, keyName: string, entryDate: string, totalHours: string }
```

- Members mode: `groupBy(userId, users.name, entryDate)`, `key = userId`, `keyName = users.name`.
- Clients mode: `groupBy(clientIdCode, entryDate)`, `key = keyName = clientIdCode`.
- `sum(hours)` as `totalHours`.
- Date filter: `gte/lte(entryDate, from/to)`.
- Category filter: reuse the existing pattern —
  `categories && categories.length ? inArray(timeEntries.category, categories) : undefined`.
- Members mode `innerJoin(users)` for the display name; Clients mode needs no join
  (client display names are resolved in the component via the existing `clientNameMap`).

The "All" per-day totals are **derived client-side** by summing the matrix per column —
no extra query.

### 2. API — `src/app/api/hours/summary/daily/route.ts`

New route, sibling to `/api/hours/summary` and `/api/hours/drill`.

- Query params: `from`, `to`, `dimension` (`member`|`client`), `categories` (repeatable/CSV,
  same encoding the existing summary route uses).
- Auth/guard: identical to the existing `summary/route.ts`.
- Returns the day-matrix rows from `summaryByDay`.
- Kept separate from `/summary` because it is a genuinely different aggregation and can be
  fetched lazily when the card first renders.

### 3. Component — `src/components/admin/daily-hours-heatmap.tsx`

New file (keeps the already-large `hours-dashboard.tsx` from growing).

- Props: `{ from: string, to: string, categories: string[] }`.
- Local state: `dimension: "member" | "client"` (default `"member"`).
- Fetches `/api/hours/summary/daily` on mount and whenever props or `dimension` change.
- Builds: the ordered list of dates in `[from, to]`, the row list (keys), a
  `cell(key, date) → number` lookup, and the per-day "All" totals.
- Renders with the **same primitives** as the existing heatmap:
  - `CARD` container class.
  - CSS grid: `gridTemplateColumns: minmax(120px, max-content) repeat(<nDays>, minmax(2.75rem, 1fr))`,
    wrapped in `overflow-x-auto`.
  - Orange fill: `backgroundColor: color-mix(in srgb, var(--brand) <pct>%, transparent)`,
    `pct = round(v / maxCell * 100)`, blank when `v === 0`.
  - `fmtHM(v)` for cell/legend labels; gradient legend `fmtHM(0) … fmtHM(maxCell)`.
- Column headers: compact date labels (e.g. `Jul 30`). Sticky first column for row labels.
- Segmented toggle (Members | Clients) in the card header.
- **"All" totals row** rendered bottom, bold, colored on its **own** scale (per-day totals
  dwarf individual cells; sharing one scale would wash the member/client cells out).

### 4. Wiring — `src/components/admin/hours-dashboard.tsx`

Mount `<DailyHoursHeatmap from={…} to={…} categories={…} />` directly below the existing
Member × client heatmap block, passing the dashboard's current range + category state.
Minimal edit — no restructuring of the existing component.

## Testing

- **Query (TDD first):** `summaryByDay` — shape, dimension switch (member vs client grouping),
  category filtering, empty range → `[]`. Match `src/lib/hours/dashboard-utils.test.ts` conventions.
- **Route:** mirror `src/app/api/hours/summary/route.test.ts` — param parsing, auth guard,
  happy path.
- **Component:** verified by dogfooding on the dev server (auth-gated → user eyeballs).

## Out of scope (YAGNI)

- Weekly/monthly bucketing or range caps.
- Right-hand per-row total column.
- Weekend shading, drill-down from day cells, CSV export.

## Constraints honored

- Built in a worktree off `origin/feat/hours-category-filter`, never on the live working tree.
- Additive-only DB reads (no schema change, no migration).
- One task per commit; category filter reuses existing query plumbing.
