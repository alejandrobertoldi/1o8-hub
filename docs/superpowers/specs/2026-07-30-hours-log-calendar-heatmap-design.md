# Personal Daily-Hours Calendar Heatmap — Design Spec

**Date:** 2026-07-30
**Branch/worktree:** `feat/hours-log-calendar-heatmap` @ `/Users/manu/MFHub-wt-hours-log-calendar` (based on `origin/main` `62d4a284`)
**Surface:** `/hours-log` (the team-facing "User Hours" page), component [src/components/hours/hours-tracker.tsx](../../../src/components/hours/hours-tracker.tsx)

## Goal

Add a GitHub-style contribution-calendar heatmap of the **signed-in user's own** daily logged
hours to the top of `/hours-log`, so a team member can scan their last few months of activity at
a glance and click any day to jump to that day's entries.

## Why not "the same heatmaps as admin"

The original ask was "the same heatmaps as the admin hours dashboard." They do **not** translate to
a single-user page:

- The admin **Member×client** heatmap has one row per member. For one user it degenerates to a
  single row — a bar chart, not a heatmap.
- The admin **daily strip** renders one column per day with horizontal scroll. Fine for a week or a
  month; unusable for this page's `All Time` preset (`2020-01-01` → today = years of columns).

A **calendar heatmap** (weeks × weekday, color = daily total) is purpose-built for "how much did I
log each day over the last weeks/months," scales to any window, and is the canonical mental model
(GitHub contributions). Decision locked with the user.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Visual | GitHub-style calendar heatmap (weeks as columns, weekday as rows) |
| Data scope | Signed-in user's own entries only (via existing owner-only `/api/hours`) |
| Backend | **None** — no new endpoint, no new query. Reuse `/api/hours?from&to` |
| Range | Calendar owns its own trailing window: **3mo / 6mo / 12mo** toggle, default **3mo**. Independent of the table's Week/Month/All-Time presets |
| Weekday order | **Mon → Sun** (matches existing `currentWeekRange` Monday-start) |
| Color scale | Discrete workday-anchored buckets: `0` / `<2h` / `2–4h` / `4–6h` / `6h+`, brand-orange shades |
| Cell content | Daily **total** hours only — no client/category breakdown in the grid |
| Click action | Clicking a day filters the entries table to that single date (range override) + auto-expands it |
| Placement | Top of page: under the "Log hours" form, above the Week/Month/All presets + table |
| Tests | Pure helpers unit-tested (TDD); component + table interaction dogfood-verified by user |

## Data flow

1. `HoursHeatmapCalendar` owns range state (`months: 3 | 6 | 12`, default 3) and computes its window
   `{ from = trailingRange(today, months).from, to = today }` with the existing local-date helpers
   (`parseLocalDate` / local ISO — no UTC off-by-one).
2. It fetches `/api/hours?from=<calFrom>&to=<calTo>` via React Query, key `["hours", calFrom, calTo]`.
   This is the **same owner-only endpoint** the table already uses (route ignores any `userId` and
   returns the caller's own entries — see [src/app/api/hours/route.ts](../../../src/app/api/hours/route.ts) `GET`).
   When the calendar window and the table range coincide, React Query dedupes; otherwise they are
   independent cache entries. Payloads are the user's own entries only (small).
3. Entries are reduced client-side to `Map<entryDate → totalHours>` via `sumHoursByDay`. Shifts that
   cross midnight are already split into two dated entries server-side, so per-day sums are correct.

No schema change, no new API route, no new Drizzle query.

## Pure helpers (new, in [src/lib/hours/dashboard-utils.ts](../../../src/lib/hours/dashboard-utils.ts), TDD)

```ts
/** Trailing window ending at `todayIso` (inclusive), starting `months` calendar months back. */
export function trailingRange(todayIso: string, months: number): { from: string; to: string }

/** Sum hours per entryDate. Input rows need only { entryDate, hours }. */
export function sumHoursByDay(rows: { entryDate: string; hours: number }[]): Map<string, number>

/** Workday-anchored bucket: 0h→0, (0,2)→1, [2,4)→2, [4,6)→3, [6,∞)→4. */
export function hoursBucket(hours: number): 0 | 1 | 2 | 3 | 4

/**
 * Arrange the inclusive [from,to] day range into GitHub-style week columns.
 * - weeks: string[][] — each inner array is 7 entries (Mon..Sun), "" for padding
 *   cells before `from` in the first week and after `to` in the last week.
 * - monthLabels: { index: number; label: string }[] — week-column index → month name,
 *   emitted at the first column where a new month begins.
 */
export function buildCalendarWeeks(
  from: string,
  to: string,
): { weeks: string[][]; monthLabels: { index: number; label: string }[] }
```

`enumerateDays`, `fmtHM`, `formatDayLabel`, `parseLocalDate` already exist and are reused.

### Edge cases for the pure helpers
- `trailingRange`: clamp is not needed (early data just yields empty cells); month subtraction must
  handle month-length rollover (e.g. subtracting 3 months from May 31). Use date construction, not
  naive `setMonth`, to avoid overflow to the wrong month.
- `buildCalendarWeeks`: first column padded at the top with `""` until `from`'s weekday; last column
  padded at the bottom after `to`. Month label emitted once, at the column where the 1st-of-month (or
  the first visible day of that month) lands.
- `hoursBucket`: exact boundaries go to the higher bucket (`2.0h → 2`, `6.0h → 4`); `0` and negatives
  → `0`.
- `sumHoursByDay`: multiple entries same day accumulate; empty input → empty map.

## Component: `src/components/hours/hours-heatmap-calendar.tsx` (new)

Props:
```ts
{
  selectedDate: string | null;          // highlighted cell (controlled by parent)
  onSelectDay: (date: string) => void;  // click handler → parent sets table filter
}
```
Owns: `months` toggle state + its own `useQuery`. Renders inside a `CARD`
(`rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800`, same as the admin heatmap).

Structure:
- Header row: title "Your hours" + `3mo / 6mo / 12mo` segmented toggle (reuse the admin
  `Button variant/ghost` segmented pattern) + window total (`fmtHM(sum)` e.g. "142h 30m in last 3 months").
- Grid: CSS grid; left weekday labels (Mon/Wed/Fri like GitHub, others blank), a row of month labels
  across the top, then the week columns. Cells are small rounded squares
  (`h-3 w-3` / `~11px`, `gap-1`), `title` tooltip = `${formatDayLabel(date)}: ${fmtHM(hours)}`.
- Color: `bucketFill(bucket)` → for bucket 0 a faint empty look
  (`color-mix(in srgb, var(--brand) 6%, transparent)` or transparent w/ border);
  buckets 1–4 → `color-mix(in srgb, var(--brand) {25|45|70|100}%, transparent)`.
- Legend: `Less ▢▢▢▢ More` using the same four fills.
- Selected cell gets a ring (`ring-2 ring-brand` / `outline`) when `date === selectedDate`.
- Padding cells (`""`) render as inert spacers (no border, no hover, no click).
- Loading / error states mirror the admin heatmap (small muted text).
- Clicking a real cell calls `onSelectDay(date)`.

## Table integration: edit [src/components/hours/hours-tracker.tsx](../../../src/components/hours/hours-tracker.tsx)

- Add state `selectedDate: string | null` (default `null`).
- Range override: when `selectedDate` is set, `range = { from: selectedDate, to: selectedDate }`
  (overrides the `preset`-derived range that feeds the `["hours", from, to]` query). When null,
  behaves exactly as today.
- Preset buttons (`week` / `month` / `all`) additionally `setSelectedDate(null)` on click.
- When `selectedDate` is set:
  - Show a dismissable chip near the presets: `Showing {dayLabel(selectedDate)} · ✕ Clear`
    (Clear → `setSelectedDate(null)`).
  - Auto-expand that day (`setExpandedDays(new Set([selectedDate]))`) so entries are visible.
  - The section heading reflects the single day instead of the preset label.
- Render `<HoursHeatmapCalendar selectedDate={selectedDate} onSelectDay={setSelectedDate} />` at the
  top of the returned JSX, directly under the "Log hours" form card and above the presets block.

Everything else in `hours-tracker.tsx` (log form, filters, grouping, inline edit) is untouched.

## Visual / DESIGN.md compliance

Reuses the established hub heatmap tokens verbatim: `var(--brand)` (`#FF751F` Burnt Orange),
`color-mix(in srgb, var(--brand) X%, transparent)` fills, `border-stone-200 dark:border-zinc-800`,
`bg-card`, muted-foreground labels. Light + dark handled by the same tokens the admin heatmap uses.
No new colors introduced.

## Testing strategy

- **Unit (TDD, `src/lib/hours/dashboard-utils.test.ts`):** `trailingRange` (incl. month-rollover),
  `sumHoursByDay`, `hoursBucket` (boundaries), `buildCalendarWeeks` (padding + month labels + a
  multi-month window). Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`.
- **Component + interaction:** auth-gated (team role) UI → **user dogfoods on the dev server**:
  calendar renders, toggle changes window, hover tooltip, click a day filters the table + expands it,
  Clear/preset resets. Verify light + dark.
- **Typecheck:** `node_modules/.bin/tsc --noEmit` (background, slow). Never `next build`.

## Revision 2 — Task 7 cell redesign (2026-07-30, post-dogfood)

Dogfood of `366407e4` passed functionally but produced two changes. This section
**supersedes**: the "Visual" row of the Locked decisions table; the cell-sizing,
weekday-label and month-label bullets under "Component"; and the
`buildCalendarWeeks` month-label sentence under "Edge cases for the pure
helpers". Every other locked decision stands.

| Decision | Choice |
| --- | --- |
| Cell size | `h-8 w-11` (32 × 44px), matching the admin Member × client heatmap |
| Cell content | That day's total as `fmtHM` text (`"6h 12m"`) inside the cell |
| Zero-hour days | Empty cell on the faint bucket-0 fill — no `"0h 00m"`, no dash |
| Cell text color | Buckets 3–4 `text-brand-foreground`, buckets 1–2 `text-foreground/80` (DESIGN.md: white fails WCAG on `#FF751F`) |
| Month separation | One continuous weeks-as-columns strip; a column starting a new month gets a left divider and the month name in its own header. **Not** one grid per month |
| Column header | ISO-8601 week number, zero-padded (`W18`) — ISO weeks are Monday-based, matching the Mon→Sun rows |
| Weekday labels | All seven (Mon…Sun); the taller rows have room |
| 12mo | Stays. Horizontal scroll accepted. No second small-cell rendering mode |

### Month-label bug fixed in Revision 2

`trailingRange("2026-07-30", 3)` starts the window on Thursday 2026-04-30, so week
column 0 holds both Apr 30 and May 1. The Revision 1 rule labeled column 0 from its
first real day and scanned only *later* columns for a 1st-of-month, so May was never
labeled and the strip rendered "Apr, Jun, Jul".

`buildCalendarWeeks` now gives each column exactly one **owning month** — the month
holding the most real days in that column, ties going to the later month — and emits
a label wherever a column's owning month differs from the previous column's. The
window above now yields `[{0,"May"},{5,"Jun"},{9,"Jul"}]`.

Consequence, accepted: because a week column can straddle a month boundary, the
divider can sit up to 3 days off the true 1st, and a month contributing only a
minority of days to a straddling column gets no label of its own (Apr 30 above sits
under "May"). This is inherent to a continuous weeks-as-columns strip and is the
minimum-error option available.

### Helper added in Revision 2

```ts
/** ISO-8601 week number (1-53) for a local YYYY-MM-DD date. Mon-Sun weeks; week 1 contains the first Thursday. */
export function isoWeekNumber(dateIso: string): number
```

## Out of scope (YAGNI)

Client/category breakdown inside the grid; streaks/averages/stats beyond the window total; changing
the admin dashboard; any new API route or DB change; touching the log form, filters, or inline edit.

## File summary

| File | Change |
| --- | --- |
| `src/lib/hours/dashboard-utils.ts` | + `trailingRange`, `sumHoursByDay`, `hoursBucket`, `buildCalendarWeeks` |
| `src/lib/hours/dashboard-utils.test.ts` | + unit tests for the four helpers |
| `src/components/hours/hours-heatmap-calendar.tsx` | **new** calendar component |
| `src/components/hours/hours-tracker.tsx` | + `selectedDate` override, chip, auto-expand, mount calendar |
