# Admin Daily Hours Heatmap Restyle — Design

**Date:** 2026-08-03
**Status:** Approved, pending implementation plan
**Branch:** `feat/admin-hours-heatmap-restyle` (worktree `.worktrees/admin-hours-heatmap-restyle`, based on `origin/main`)

## Problem

`/hours-admin`'s "Daily hours" section (`DailyHoursHeatmap`, `src/components/admin/daily-hours-heatmap.tsx`) and `/hours-log`'s "Your hours" section (`HoursHeatmapCalendar`, `src/components/hours/hours-heatmap-calendar.tsx`) both render hour-based heatmaps, but they look and behave differently:

- `HoursHeatmapCalendar` groups by Month + ISO week (GitHub-contribution-calendar style), colors cells on a fixed 4-bucket scale, and shows a discrete "Less ▢▢▢▢ More" legend.
- `DailyHoursHeatmap` is a flat grid (one row per member/client, one column per individual day) with plain day-of-week labels, colors cells on a continuous per-row scale, and shows a gradient legend with numeric min/max.

The request: make the admin grid look like the log-hours calendar — specifically, add Month/Week grouping to the header, and match its coloring/legend — without losing the admin grid's multi-row (per member/client) structure, since a full per-person weekday×week calendar can't be nested per row without the page becoming unreasonably tall.

## Decisions

1. **Keep the grid's shape.** Rows stay one-per-member/client (plus the "All" aggregate row), columns stay one-per-day, driven by the page's existing shared date-range picker. No new range control is added — `DailyHoursHeatmap` continues to receive `from`/`to` exactly as it does today.
2. **Add Month + Week header rows above the existing day-label row.** Three header rows total:
   - **Month row** — the month's label (e.g. "Aug 2026") appears in the column where that month starts, blank elsewhere, with a `border-l` divider on that column (mirrors `HoursHeatmapCalendar`'s month-boundary treatment). Label text is allowed to visually overflow into blank neighboring cells, exactly as the calendar component already does.
   - **Week row** — the ISO week number (e.g. "W32") appears in the column where that ISO week starts (via the existing `isoWeekNumber()` util), blank elsewhere.
   - **Day row** — unchanged: `formatDayLabel(d)` per column, as today.
3. **Switch cell coloring to the calendar's fixed 4-bucket scale.** Replace the continuous `fill(v, max)` function (today: `v / max * 100%`, computed separately per-row via `maxCell` and separately for the "All" row via `maxDayTotal`) with `hoursBucket(hours)` + `bucketFill(level)` — the same 0/25/45/70/100% ramp `HoursHeatmapCalendar` uses. Applied uniformly to every cell, including the "All" row, so a color means the same absolute number of hours everywhere in the app (no more dual relative scales).
4. **Switch the legend to the calendar's discrete swatches.** Replace the gradient bar + numeric min/max legend with "Less ▢▢▢▢ More" (4 swatches at the same bucket-fill values), matching `HoursHeatmapCalendar`'s legend markup.
5. **Share the styling code.** `BUCKET_PCT`, `bucketFill(level)`, and `bucketText(level)` currently live as private constants inside `hours-heatmap-calendar.tsx`. Move them into `src/lib/hours/dashboard-utils.ts` as exported functions/constants, and import them from both components, so the two heatmaps literally share one implementation rather than two that can drift apart.

## Explicitly out of scope

- No new date-range control on the Daily hours section — it keeps using the page's existing shared picker (the one that also drives the Member×Client chart above it).
- No change to the outer card chrome: existing border/dark-mode classes (`dark:border-zinc-800` etc.) and the Members/Clients dimension toggle stay as-is. `HoursHeatmapCalendar`'s `light-surface` wrapper class is not copied over — it appears specific to that page's context, not part of the ask.
- Cell geometry is already ~44×32px on both components; only `rounded` → `rounded-sm` changes for an exact match. No other sizing changes.
- `buildDayHeatmap`, `enumerateDays`, and the day-column data/order are unchanged — this is a header/styling change layered on top of the existing data pipeline, not a data-model change.

## Implementation notes for the plan

- New/moved exports in `dashboard-utils.ts`: `BUCKET_PCT`, `bucketFill(level)`, `bucketText(level)` (moved from `hours-heatmap-calendar.tsx`, which switches to importing them).
- `daily-hours-heatmap.tsx` needs: a month-boundary computation over `days` (first day of each month → label + divider), a week-boundary computation over `days` (first day of each ISO week → `isoWeekNumber` label), and replacement of `fill()` call sites (both the per-key rows and the "All" row) with `bucketFill(hoursBucket(v))`.
- The `HoursHeatmapCalendar`'s month/week grouping logic operates on `buildCalendarWeeks()` (weeks-as-columns). That util is **not** reused here — `DailyHoursHeatmap` keeps days-as-columns, so the month/week boundary detection needs its own (simpler) pass over the flat `days` array, not `buildCalendarWeeks`.
