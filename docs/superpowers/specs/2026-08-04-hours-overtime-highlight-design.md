# Hours overtime highlight + calendar year row — design

**Date:** 2026-08-04
**Status:** Approved by Manu, ready for planning

## 1. Problem

Nothing today distinguishes "a full, normal day" from "someone logged an absurd number of
hours" (e.g. 23h in a day, most likely a data-entry mistake). Both render as the same
full-intensity brand-orange cell. There's no visual escalation between 8h and 24h, and no
non-color signal for anyone who can't reliably distinguish orange from red.

Separately, the personal hours calendar is missing a Year header row that the admin daily
grid already has (see §6 — that admin-grid work is on disk, uncommitted, from a prior
session; this design builds on top of it rather than duplicating it).

## 2. Scope

**In scope:**
- A continuous red "overtime" scale (8h → 24h) applied to:
  - `hours-heatmap-calendar.tsx` — the logged-in user's own day cells.
  - `daily-hours-heatmap.tsx` — admin `/hours-admin` grid, **Members dimension rows only**.
- A colorblind-safe, non-hue marker (heavier neutral border) on any overtime cell.
- A Year header row added to `hours-heatmap-calendar.tsx`.

**Out of scope (explicitly deferred, decided during brainstorming):**
- Any active/login-time notification, banner, or toast. This is passive coloring only —
  visible when someone opens the hours page or the admin grid, nothing more.
- The admin grid's **Clients** dimension and its **All** (per-day, all-staff) row. A high
  total there reflects multiple people's combined hours, not one person's overtime, so
  both keep today's plain orange scale.
- The "Total: Xh Ym" text line in `hours-tracker.tsx` (shown above the entries list, becomes
  a single day's total when a calendar cell is selected). Stays plain text.
- Repeating the weekday name inside each day cell in the personal calendar. The calendar's
  row position already implies the weekday (weeks-as-columns, weekdays-as-rows), so this
  would be pure duplication.
- Any backend/API change. Every value needed already comes back from `/api/hours` and
  `/api/hours/summary/daily`; this is entirely a rendering-layer decision.

## 3. Core logic — `src/lib/hours/dashboard-utils.ts`

Three new pure functions, colocated with the existing `hoursBucket`/`bucketFill`/`bucketText`
(same responsibility: hours → visual encoding).

```ts
/** True once a day's total exceeds a standard 8h workday. */
export function isOvertime(hours: number): boolean {
  return hours > 8;
}

/** 0 at <=8h, ramps linearly to 1 at 24h, clamped above (a mis-entered 30h day
 *  renders identically to 24h — no error, no special case). */
export function overtimeRatio(hours: number): number {
  if (!(hours > 8)) return 0;
  return Math.min((hours - 8) / (24 - 8), 1);
}

/** Interpolates from solid brand orange (ratio 0, i.e. hours===8) to solid
 *  brand-red (ratio 1, i.e. hours>=24). At hours===8 this equals bucketFill(4)
 *  exactly, so there is no discontinuity the instant a day crosses into overtime —
 *  it escalates smoothly from "full orange day" into red as the day worsens. */
export function overtimeFill(hours: number): string {
  const pct = Math.round(overtimeRatio(hours) * 100);
  return `color-mix(in srgb, var(--brand-red) ${pct}%, var(--brand) ${100 - pct}%)`;
}
```

**Text color:** WCAG-checked — dark text (`--brand-foreground`, #111) clears AA contrast
(≥5:1) at every point on the orange→red ramp (6.2:1 at pure `--brand-red`, higher everywhere
between). Overtime cells reuse the same dark-text class the top orange bucket (`bucketText(4)`
→ `text-brand-foreground`) already uses. No new text-color branching.

**Colorblind-safe marker:** any cell with `isOvertime(hours)` true gets a heavier, dark
**neutral** border (`border-2 border-foreground/60`) in place of the default hairline
(`border-stone-200 dark:border-zinc-800`). This is a luminance/thickness signal, not a hue
signal, so it stays visible under any color-vision deficiency regardless of how far into the
red ramp the fill has climbed. The cell's `title`/`aria-label` also gets an explicit
"· Overtime" suffix, for anyone not perceiving the visual difference at all.

## 4. `hours-heatmap-calendar.tsx` (personal "Your hours" calendar)

Each day cell already computes `hours` and `level = hoursBucket(hours)`. Add
`const overtime = isOvertime(hours)`. When true:
- `style={{ backgroundColor: overtimeFill(hours) }}` instead of `bucketFill(level)`.
- Border classes swap to the neutral overtime marker.
- Text class forced to the dark-foreground class regardless of `level`.
- `title`/`aria-label` get the "· Overtime" suffix.

Legend row gets one more swatch appended after the existing Less→More ramp: a solid
`--brand-red` square labeled "8h+ overtime".

## 5. `daily-hours-heatmap.tsx` (admin `/hours-admin` grid)

Identical per-cell treatment, computed once per render as
`const flagOvertime = dimension === "member"`, then per cell:
`flagOvertime && isOvertime(v)`. When false (Clients dimension, or the separate "All" row,
which is rendered by its own code path already excluded), cells keep today's plain
`bucketFill(hoursBucket(v))` treatment untouched. Same legend swatch addition as §4, shown
regardless of dimension so it's available for reference when the admin flips back to
Members.

## 6. Year row — `hours-heatmap-calendar.tsx`

The admin grid (`daily-hours-heatmap.tsx`) already computes `yearColumnGroups` /
`monthColumnGroups` / `weekColumnGroups` over its flat one-column-per-day layout (this is
existing, uncommitted work from a prior session — not part of this design, just a sibling
this design is consistent with).

The personal calendar's layout is different — weeks as columns (`buildCalendarWeeks`),
weekdays as rows — so it needs its own year-per-column labels, not a reused function.
`buildCalendarWeeks` already computes `monthLabels: { index, label }[]` with an
"owning column" rule (majority of real days in that week-column; ties go to the later
period) to handle a week column straddling a month boundary. A week column can straddle
Dec 31/Jan 1 the same way it can straddle a month boundary (e.g. the week of
2025-12-29..2026-01-04), so the identical tie-break applies to years too.

Rather than duplicating the majority/tie-break loop a second time, factor the existing
`owningMonth` logic into a generic `owningPeriod(week, keyOf)` helper (parameterized by a
function that extracts the grouping key — and a display-label function — from a date), and
call it once for months (existing behavior, unchanged output) and once for years (new).
This keeps the tie-break rule defined in exactly one place, matching this file's existing
principle that shared scale/threshold logic must live in one spot so two call sites cannot
silently drift onto different rules (see the `BUCKET_PCT` comment on `bucketFill`/`bucketText`
for the precedent). Extend `CalendarWeeks` with a sibling
`yearLabels: { index: number; label: string }[]` produced this way.

Component change: add a new header row above the existing Month row (`{yearLabel}`), plus a
matching spacer row (`h-3`) in the left gutter. The file already documents that gutter
spacers and column headers must stay height-matched or every weekday label slides out of
register — the new spacer follows that same existing invariant, no new pattern introduced.

## 7. Testing

New unit tests in `dashboard-utils.test.ts`:
- `isOvertime`: 8.0 → false, 8.01 → true, negative/NaN → false.
- `overtimeRatio`: at 8 → 0, at 16 → 0.5, at 24 → 1, at 30 → 1 (clamped).
- `overtimeFill(8)` equals `bucketFill(4)` exactly — the one regression that would be easy
  to introduce silently, since it's the boundary continuity claim in §3.
- `buildCalendarWeeks` year-label tests mirroring the existing month-label tests: single
  year in range → one label at index 0; a range crossing Dec 31/Jan 1 → two labels, second
  one landing on the later year per the majority/tie-break rule.

No component/integration tests planned beyond what the plan's implementer adds — this
repo's existing pattern for these two files is pure-function unit tests plus manual
verification of the rendered grid.

## 8. Risks / non-goals carried forward

- This design assumes the in-flight, uncommitted admin-grid header work
  (`yearColumnGroups`/`monthColumnGroups`/`weekColumnGroups`/`formatWeekdayLabel` in
  `dashboard-utils.ts`) lands as-is; if that work changes shape before this is implemented,
  §6 above may need re-checking against the new function signatures.
- No change to `hoursBucket`'s existing 0–6h+ ramp; overtime is a separate, higher band that
  only ever overrides the *rendering* for hours > 8, never the bucket math itself.
