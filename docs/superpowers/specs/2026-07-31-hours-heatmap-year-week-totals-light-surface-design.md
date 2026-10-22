# Hours heatmap — year on month labels, per-week totals footer, light surface in dark mode

Date: 2026-07-31
Status: approved (user, 2026-07-31)
Branch: `feat/hours-log-calendar-heatmap`
Predecessor spec (source of truth for everything not restated here):
`docs/superpowers/specs/2026-07-30-hours-log-calendar-heatmap-design.md`

This is **Task 8** of the hours-log calendar heatmap, layered on Task 7 (HEAD `24a3a952`).
It changes three things and nothing else.

## Why

The user dogfooded the Task 7 heatmap and asked for three changes:

1. Month labels should carry the year.
2. Each week column should show that week's total hours in a footer.
3. The heatmap should keep its light appearance in dark mode.

A fourth request — a custom date-range slicer for the records table — is **explicitly deferred**
(see [Out of scope](#out-of-scope)).

## Locked decisions

Decided with the user on 2026-07-31. Do not re-litigate.

| Decision | Value | Rationale |
|---|---|---|
| Year placement | **Inline on every month label** — `"Jun 2026"` | User chose this over a year-only-on-change row. See [Year fits](#8a--year-on-month-labels). |
| Year source | The **owning month's** sample date, inside `buildCalendarWeeks` | Deriving it in the component is wrong at year boundaries. See [Rejected alternative](#rejected-alternative-deriving-the-year-in-the-component). |
| Week total format | **`fmtHM`** — `"38h 30m"` | Identical to the day cells and the card-header window total. One hours format in the component. |
| Zero-total week | **Blank cell** | Matches the existing zero-hour day rule (`level > 0` gate). No `"0h 00m"`, no dash. |
| Footer position | Directly under the 7 day cells, **above** the legend, with a top border | Reads as a column summary, not as an eighth day. |
| Footer gutter label | `"Total"` | Plain word over `Σ`. Widening the gutter is harmless — it is a flex row. |
| Dark mode | Heatmap card **keeps its light look** in dark mode | User's explicit choice, made after being told it deviates from DESIGN.md:214. |
| Light-surface mechanism | Widen the existing `:root` light-token selector; **do not** duplicate values | Zero drift. See [8c](#8c--light-surface-in-dark-mode). |
| Bucket ramp | **Unchanged.** No `BUCKET_PCT` retuning | `--brand` and `--brand-foreground` are identical in both themes, so pinning `--card` makes the ramp pixel-identical to light mode for free. |
| Date-range slicer | **Deferred** until branch A lands | It collides with thread B. See [Out of scope](#out-of-scope). |

## 8a — Year on month labels

`monthLabel` inside `buildCalendarWeeks` gains the year:

- **Before** (`src/lib/hours/dashboard-utils.ts:280-281`): `toLocaleDateString(undefined, { month: "short" })` → `"Jun"`
- **After**: `toLocaleDateString(undefined, { month: "short", year: "numeric" })` → `"Jun 2026"`

That is the entire production change for 8a. `monthLabels`' type is unchanged
(`{ index: number; label: string }[]`), so the component needs no edit for this part —
`hours-heatmap-calendar.tsx:153-155` already renders `monthLabel` verbatim with
`whitespace-nowrap`.

### Year fits — no extra row, no truncation, no bleed

Established by measurement before the design was approved, and load-bearing for the
"inline" choice:

- Two month labels are never adjacent. The shortest month (February, 28 days) under the
  majority-ownership rule spans **at least 4 columns**, so consecutive labels sit ≥4 columns
  (≈188px) apart. The intervening columns' label divs render `""`.
- `"Jun 2026"` at `text-[9px] font-semibold` measures ≈41px, inside the 44px (`w-11`) cell.

So the label neither collides with its neighbour nor widens the column (a flex column's width
is the max of its children's, and 41px < 44px). The header stays at **two rows**, and the
gutter's two spacers (`hours-heatmap-calendar.tsx:124-125`) stay correct.

### Rejected alternative: deriving the year in the component

The component already computes `firstReal` for the `W##` header, so `getFullYear()` on it looks
free. It is wrong at exactly the boundary the year exists to disambiguate: a column holding
Dec 30-31 + Jan 1-5 is **owned by January** (5 real days beat 2), but `firstReal` is
`2026-12-30`, so the label would render `"Jan 2026"` where the truth is `"Jan 2027"`.

The year must come from the owning month's sample date, which only `buildCalendarWeeks` has.

### Sanctioned test change

Adding the year changes `buildCalendarWeeks`' observable output, so existing assertions on
label *values* must be updated. This is the same category as Task 2's sanctioned `"Jun"→"Jul"`
edit: a direct, unavoidable consequence of the change the user ordered, **not** a test weakened
to pass. It is recorded here so the final review does not read it as a defect.

Exactly five literal sites in `src/lib/hours/dashboard-utils.test.ts` change:

| Line | Before | After |
|---|---|---|
| 199 | `{ index: 0, label: "Jun" }` | `{ index: 0, label: "Jun 2026" }` |
| 200 | `m.label === "Jul"` | `m.label === "Jul 2026"` |
| 208 | `[{ index: 0, label: "Jul" }]` | `[{ index: 0, label: "Jul 2026" }]` |
| 251-255 | the three-entry `["May","Jun","Jul"]` array | `"May 2026"`, `"Jun 2026"`, `"Jul 2026"` |
| 276 | `[{ index: 0, label: "Jul" }]` | `[{ index: 0, label: "Jul 2026" }]` |

Assertions that must **not** change, and must still pass:

- Line 209 and 261 — the no-duplicate-index assertions. These are the load-bearing intent of
  the month-label tests and are untouched by this change.
- Line 263-264 — `monthLabels.length === 12` and `monthLabels[0].index === 0` for the 12-month
  window. Neither asserts a label value.
- Line 269-270 — consecutive labels are never equal. Still holds; the year can only ever make
  two labels *more* distinct, never less.

One new assertion is added to the existing 12-month-window test (`"2025-07-30"` →
`"2026-07-30"`, line 259), which is the only test that crosses a year boundary: its labels must
contain both `"Dec 2025"` and `"Jan 2026"`. This is the regression guard for the year being
sourced from the owning month rather than from `firstReal`.

## 8b — Per-week totals footer

### New pure helper

Appended to `src/lib/hours/dashboard-utils.ts`, following this branch's established split —
pure logic in `dashboard-utils.ts` with tests, component renders only:

```ts
/**
 * Total hours per week column. Index-aligned with `weeks`; padding cells ("") and days
 * absent from `byDay` contribute 0.
 */
export function weekTotals(weeks: string[][], byDay: Map<string, number>): number[]
```

Behaviour:

- Returns one number per column, same length and order as `weeks`.
- Sums `byDay.get(date) ?? 0` over the column's non-`""` dates.
- An all-padding or all-zero column returns `0`.
- `weeks: []` returns `[]`.
- Does not round. `fmtHM` at the render site owns formatting.

### Render

In `hours-heatmap-calendar.tsx`, after the 7-cell stack in each column:

- Footer cell: `mt-1 border-t border-stone-200 pt-1`, then a `h-4 w-11` box with
  `text-[9px] font-semibold tabular-nums text-foreground` (not muted — it is a total).
- Content: `total > 0 ? fmtHM(total) : ""`.
- No `title`/`aria-label` — the footer is decorative summary of cells that already announce
  their own values, and the card header already announces the window total.

### Alignment is the hazard

The Task 3 reviewer proved gutter/column alignment is **structural**, not incidental: both
stacks compute to exactly 274px because the gutter's two spacers mirror the two header rows.
The footer must add a **byte-identical** `mt-1 border-t border-stone-200 pt-1` + `h-4` block to
**both** the gutter stack (holding the word `"Total"`) and every column stack. Adding it to one
side only slides every weekday label out of register.

Both stacks must therefore measure the same new height. Verify during dogfood (checklist item
11 below), not by inspection.

### 100h+ weeks

`fmtHM` of a 100h+ week is 8 glyphs (`"112h 00m"`) ≈ 43px in a 44px cell — at the edge. It is
reachable only in theory (`MAX_SHIFT_MIN` is 960 = 16h, so 7 days caps at 112h). Accepted with
`whitespace-nowrap`; no truncation logic.

## 8c — Light surface in dark mode

### Two constraints from the code

1. `@custom-variant dark (&:is(.dark *))` (`src/app/globals.css:21`). A `dark:` utility matches
   **any** descendant of `.dark`, so no wrapper can un-match one. The heatmap's five
   `dark:border-zinc-800` utilities (lines 16, 90, 149, 172, 193) must be **deleted**, not
   overridden. Their `border-stone-200` partner is a static Tailwind color, already
   theme-independent, so deletion leaves a correct light border.
2. Everything else in the card resolves through tokens — `bg-card`, `text-foreground`,
   `text-muted-foreground`, and shadcn `Button`'s seven `dark:` utilities, which reference
   `--accent` / `--input` / `--primary` rather than hardcoded colors. Redeclaring those tokens
   locally makes the buttons follow with no `Button` edit.

### The bucket ramp needs no work

`--brand` is `#FF751F` and `--brand-foreground` is `#242222` in **both** `:root`
(`globals.css:170-172`) and `.dark` (`globals.css:274-276`). `bucketFill`'s
`color-mix(in srgb, var(--brand) N%, transparent)` therefore already emits an identical
translucent orange in both themes — only the surface it composites over differs. Pinning
`--card` to `#FEFEFE` makes the ramp pixel-identical to light mode. `BUCKET_PCT` is untouched.

### Mechanism — widen the light selector, do not duplicate it

Copying the light values into a new class would fork them from `:root` and drift silently.
Instead widen the existing light-token selector at `globals.css:123`:

- **Before**: `:root {`
- **After**: `:root, .light-surface {`

Then add `light-surface` to the `CARD` class string in `hours-heatmap-calendar.tsx:16`.

Cascade: `.dark` declares the dark tokens on `<html>`; `.light-surface` declares the light ones
directly on the card element. A direct declaration always beats an inherited value, so there is
no specificity contest and no `!important`. Single source of truth for light values; the
utility is reusable for any future light island.

Re-declaring the whole `:root` block on a nested element also sets tokens the card never uses
(`--background`, chart tokens). Harmless — unused custom properties have no effect.

### Documented deviation

`DESIGN.md:214` records that cards were standardized on the `bg-card` token and
`bg-white dark:bg-zinc-900/50` was retired. This reverses that for one card, producing a bright
`#FEFEFE` panel against the `#2A5059` charcoal-blue page — a hard, visible edge. The user chose
this after being shown the conflict.

Task 8 **must** append a row to the DESIGN.md decisions table (the `2026-07-22`/`2026-07-27`
format at `DESIGN.md:213-215`) recording the deviation, its scope (the hours heatmap card
only), and the `.light-surface` mechanism. A silent deviation is a defect.

## Files

| File | Change |
|---|---|
| `src/lib/hours/dashboard-utils.ts` | `monthLabel` gains `year: "numeric"`; new `weekTotals` |
| `src/lib/hours/dashboard-utils.test.ts` | 5 label literals updated; year-boundary assertion added; `weekTotals` cases appended |
| `src/components/hours/hours-heatmap-calendar.tsx` | footer row in gutter + columns; `light-surface` on `CARD`; 5 `dark:border-zinc-800` deleted |
| `src/app/globals.css` | `:root` → `:root, .light-surface` (one line) |
| `DESIGN.md` | one decisions-table row |

`src/components/hours/hours-tracker.tsx` is **not** touched and must not appear in any Task 8
commit. Thread B (`feat/hours-inline-edit`) touches none of the five files above, so Task 8 has
no collision surface with it.

## Testing

`node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts` — 37 existing tests stay
green — 4 of them carrying the 5 updated label literals — plus the new year-boundary assertion
and the `weekTotals` cases.

`node_modules/.bin/tsc --noEmit` must be run by the controller, not trusted from an
implementer's report. Vitest does not typecheck.

8c is not unit-testable — CSS token scoping has no assertion surface. Dogfood owns it.

## Dogfood

Task 7's 10-item checklist
(`.superpowers/sdd/2026-07-30-hours-log-calendar-heatmap-task7-cell-redesign/task-3-brief.md`
Step 6) has **never been run by anyone**. Task 8's dogfood runs it plus the items below, in
**both** light and dark. Folding Task 8 in before landing exists specifically so this happens
once instead of twice.

New items:

11. Weekday labels still line up with their rows after the footer is added — the alignment
    hazard above. Check the Mon row and the Sun row at both ends of the strip.
12. Month labels read `"May 2026"`, `"Jun 2026"`, `"Jul 2026"` — with **May present**. This
    supersedes checklist item 1 and remains the likeliest thing to be quietly broken.
13. Week footer totals are plausible: each column's footer equals the sum of the cells above
    it, and a week with no entries renders blank.
14. In dark mode the heatmap card is light — background, text, borders, the 3mo/6mo/12mo
    buttons (both active and inactive), and the legend swatches — with no dark-on-dark or
    light-on-light text anywhere inside it.
15. In dark mode the bucket ramp looks the same as in light mode, and text on the darkest
    6h+ cells is legible. This supersedes checklist item 7.
16. The 12-month window still scrolls horizontally without the footer breaking containment.

Auth is team-role gated. Good account: 1899670 (Dr. Cuddles); June 2026 has data.

## Out of scope

- **Custom date-range slicer for the records table.** Requested 2026-07-31, deferred by the
  user's explicit choice. It needs three edits in `hours-tracker.tsx` — the `RangePreset` type
  (`:145`), the `range` memo (`:154-159`), and the preset button row (`:576-618`) — inside a
  file thread B is rewriting (+441/-112). Beyond the text conflict, thread B's Task 6 effect
  declares deps `[range.from, range.to]` and flushes uncommitted drafts on range change, so a
  new range source is a semantic interaction with code that does not exist on that branch yet.
  Design already settled for whenever it runs: a 4th `"custom"` preset revealing two native
  `<Input type="date">` controls (the same control the log form uses — no shadcn Calendar, no
  new dependency), with `selectedDate` keeping precedence over it.
- **Heatmap following the table's range.** The heatmap's trailing 3/6/12mo window is
  independent of the table presets by locked decision in the predecessor spec.
- **`BUCKET_PCT` retuning** — unnecessary, see 8c.
- **A year-only-on-change header row** — considered and rejected by the user in favour of
  inline.
