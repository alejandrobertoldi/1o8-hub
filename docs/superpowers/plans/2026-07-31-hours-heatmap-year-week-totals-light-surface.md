# Hours Heatmap — Year Labels, Week Totals Footer, Light Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Task 8 of the hours-log calendar heatmap — the year inline on every month label, a per-week totals footer under each column, and a heatmap card that keeps its light appearance in dark mode.

**Architecture:** Three independent, sequential commits on `feat/hours-log-calendar-heatmap`. Tasks 1 and 2 follow this branch's established split: pure logic lands in `src/lib/hours/dashboard-utils.ts` with vitest coverage, and `src/components/hours/hours-heatmap-calendar.tsx` only renders. Task 3 is a CSS-token-scoping change with no assertion surface — it is carried by `tsc`, a grep gate, and dogfood.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (`strict: true`, `noUncheckedIndexedAccess` OFF), Tailwind CSS 4 with a single `@theme inline` block, shadcn/ui Button, vitest.

**Spec (source of truth):** `docs/superpowers/specs/2026-07-31-hours-heatmap-year-week-totals-light-surface-design.md`
**Predecessor spec:** `docs/superpowers/specs/2026-07-30-hours-log-calendar-heatmap-design.md`
**Baseline:** HEAD `0c5f9f84`, merge base `62d4a284`. All line numbers in this plan are accurate at `0c5f9f84` and were verified against the live files on 2026-07-31.

## Global Constraints

Every task's requirements implicitly include this section.

- **Only these five files may be touched, across all three tasks:** `src/lib/hours/dashboard-utils.ts`, `src/lib/hours/dashboard-utils.test.ts`, `src/components/hours/hours-heatmap-calendar.tsx`, `src/app/globals.css`, `DESIGN.md`.
- **`src/components/hours/hours-tracker.tsx` must NOT appear in any Task 8 commit.** Thread B (`feat/hours-inline-edit`) is rewriting that file (+441/-112) in a different worktree.
- **No new dependencies.** No shadcn Calendar, no date library, no test-harness additions.
- **Colors:** reuse existing tokens from `src/app/globals.css` only. Read `DESIGN.md` before any visual decision. `border-stone-200` is a static Tailwind color and is already theme-independent — keep it.
- **Tests:** `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`. Baseline is **37 passing**.
- **Typecheck:** `node_modules/.bin/tsc --noEmit` (~2 min, run in background). **The controller runs this itself after every task and never accepts an implementer's claim. Vitest does not typecheck.** NEVER run `next build`.
- **No component unit test.** `hours-heatmap-calendar.tsx` has no test file and Task 8 does not add one — that is this branch's established pattern (pure logic is tested, render is dogfooded). Do not scaffold React Testing Library for it.
- **Commits:** one task per commit. NEVER `git add .` — explicit pathspec on `add` AND `commit`, and verify the staged diff before committing. Flag order is `git commit -m "msg" -- <pathspec>`. Keep `graphify-out/*` and `.claude/*` out of every commit (`graphify-out/` is permanently dirty in this worktree and a post-commit hook re-dirties it — this is expected, ignore it).
- **Commit trailer, exact:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Work only in the worktree** `/Users/manu/MFHub-wt-hours-log-calendar`. Never edit `/Users/manu/MFHub`.
- **Do not push, open a PR, merge to main, deploy, or touch the DB schema.** The user grants those per-action.
- **Do not re-litigate the spec's Locked decisions table.** In particular: inline year (not a year-only-on-change row), `fmtHM` for week totals, blank on a zero week, footer above the legend, `"Total"` as the gutter label, no `BUCKET_PCT` retuning.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/hours/dashboard-utils.ts` | Pure hours logic. `monthLabel` (nested in `buildCalendarWeeks`) gains the year; new exported `weekTotals`. | 1, 2 |
| `src/lib/hours/dashboard-utils.test.ts` | Vitest coverage for the above. 5 sanctioned label-literal edits + 1 new year-boundary assertion (Task 1); a new `weekTotals` describe block appended at EOF (Task 2). | 1, 2 |
| `src/components/hours/hours-heatmap-calendar.tsx` | Render only. Footer row in the gutter stack and in every column stack (Task 2); `light-surface` on `CARD` and deletion of all five `dark:border-zinc-800` (Task 3). | 2, 3 |
| `src/app/globals.css` | One-line selector widening at `:root` so the light token block is reusable as `.light-surface`. | 3 |
| `DESIGN.md` | One appended decisions-table row recording the deliberate deviation from the `2026-07-22` `bg-card` row at `DESIGN.md:214`. | 3 |

---

### Task 1: Year on every month label (8a)

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts:280-281`
- Test: `src/lib/hours/dashboard-utils.test.ts` (lines 199, 200, 208, 251-255, 276, and a new assertion inside the test at 258-265)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no signature change. `buildCalendarWeeks(from: string, to: string): CalendarWeeks` where `CalendarWeeks = { weeks: string[][]; monthLabels: { index: number; label: string }[] }`. Only the *values* in `monthLabels[].label` change, from `"Jun"` to `"Jun 2026"`. `hours-heatmap-calendar.tsx:153-155` already renders the label verbatim with `whitespace-nowrap`, so the component needs no edit in this task.

**Why the year must come from `buildCalendarWeeks` and not the component:** a column holding Dec 30-31 + Jan 1-5 is owned by January (5 real days beat 2), but the component's `firstReal` is `2026-12-30`. Deriving the year there renders `"Jan 2026"` where the truth is `"Jan 2027"`. Only `owningMonth`'s `sample` has the right year. The new assertion in Step 1 is the regression guard for exactly this.

**Sanctioned test change:** adding the year changes `buildCalendarWeeks`' observable output, so assertions on label *values* must be updated. This is a direct, unavoidable consequence of the change the user ordered — the same category as Task 2's pre-approved `"Jun"→"Jul"` edit — **not** a test weakened to pass. The load-bearing assertions (no-duplicate-index at lines 210 and 262, `monthLabels.length === 12` and `monthLabels[0].index === 0` at 263-264, never-two-consecutive-equal at 269-270) are untouched and must still pass.

- [ ] **Step 1: Update the five label literals and add the year-boundary assertion**

⚠️ **Edit hazard:** lines 208 and 276 are byte-identical strings (`  expect(monthLabels).toEqual([{ index: 0, label: "Jul" }]);`). A bare string replace will hit the wrong one or refuse as ambiguous. Include the preceding line as context for each, as shown below.

Site 1 — line 199, inside `it("buildCalendarWeeks emits a month label at the starting column and at month changes")`:

```ts
  expect(monthLabels[0]).toEqual({ index: 0, label: "Jun 2026" });
  expect(monthLabels.some((m) => m.label === "Jul 2026")).toBe(true);
```

(That block replaces lines 199-200 together, covering sites 1 and 2.)

Site 3 — line 208, disambiguated by the `buildCalendarWeeks("2026-06-29", "2026-07-05")` line above it:

```ts
  const { monthLabels } = buildCalendarWeeks("2026-06-29", "2026-07-05");
  expect(monthLabels).toEqual([{ index: 0, label: "Jul 2026" }]);
```

Site 4 — lines 251-255, the three-entry array:

```ts
    expect(monthLabels).toEqual([
      { index: 0, label: "May 2026" },
      { index: 5, label: "Jun 2026" },
      { index: 9, label: "Jul 2026" },
    ]);
```

Site 5 — line 276, disambiguated by the `buildCalendarWeeks("2026-07-01", "2026-07-14")` line above it:

```ts
  const { monthLabels } = buildCalendarWeeks("2026-07-01", "2026-07-14");
  expect(monthLabels).toEqual([{ index: 0, label: "Jul 2026" }]);
```

New assertion — append inside the existing `it("emits at most one label per column index for a full 12-month window")`, immediately after `expect(monthLabels[0].index).toBe(0);` (line 264), leaving every existing line in that test intact:

```ts
    // The only test window that crosses a year boundary. The year must come from the
    // owning month's own sample date, so Dec and Jan carry DIFFERENT years. Deriving
    // it from the column's first real day would render "Jan 2026" here.
    const labels = monthLabels.map((m) => m.label);
    expect(labels).toContain("Dec 2025");
    expect(labels).toContain("Jan 2026");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`

Expected: **5 failed, 32 passed.** The five failures are the four tests carrying the updated literals plus the 12-month test now asserting `toContain("Dec 2025")`. Each label failure must read as `expected "Jun" to equal "Jun 2026"` — i.e. the *received* value is the old year-less label. If any failure instead reports a different index, a duplicate index, or a missing month, stop: the change is interacting with month ownership and that is not what this task does.

- [ ] **Step 3: Add the year to `monthLabel`**

In `src/lib/hours/dashboard-utils.ts`, replace lines 280-281:

```ts
  const monthLabel = (dateIso: string): string =>
    parseLocalDate(dateIso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
```

That is the **entire** production change for Task 1. Do not touch `owningMonth`, the label-emission loop at 307-314, or the `CalendarWeeks` type.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`

Expected: **37 passed, 0 failed.** Still 37 — this task changes assertions inside existing tests and adds no new `it`.

- [ ] **Step 5: Controller typechecks**

Run (controller, in background): `node_modules/.bin/tsc --noEmit`

Expected: exit 0, no output. Do not proceed on an implementer's claim that it compiles.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git diff --cached --stat
git commit -m "feat(hours): put the year on every heatmap month label

Adds year: \"numeric\" to monthLabel inside buildCalendarWeeks so labels read
\"Jun 2026\". Sourced from the owning month's sample date, not the column's
first real day, which is wrong when a column straddles Dec/Jan. The five
updated label literals in the test are a sanctioned consequence of the
change; the no-duplicate-index assertions are untouched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 2: Per-week totals footer (8b)

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` (append `weekTotals` after `isoWeekNumber`, at EOF)
- Modify: `src/lib/hours/dashboard-utils.test.ts:2` (import), append a `describe("weekTotals")` block at EOF
- Modify: `src/components/hours/hours-heatmap-calendar.tsx` (import at 6-14, a `FOOTER_ROW` constant after line 48, a memo near 76-80, a footer block in the gutter stack at 123-136, a footer block in each column stack at 143-183)

**Interfaces:**
- Consumes: `buildCalendarWeeks` and `sumHoursByDay` from `dashboard-utils.ts` (already exported); `fmtHM(hours: number): string`.
- Produces: `export function weekTotals(weeks: string[][], byDay: Map<string, number>): number[]` — one number per column, same length and order as `weeks`. Padding cells (`""`) and days absent from `byDay` contribute 0. Unrounded; `fmtHM` at the render site owns formatting.

**The alignment hazard — read this before writing any JSX.** Gutter/column row alignment is **structural**, not incidental: the gutter's two spacers (`h-3` and `mt-1 h-3`, lines 124-125) mirror the columns' month + week header rows exactly, so both stacks compute to exactly 274px. The footer must add a **byte-identical** wrapper and a **same-height** `h-4` inner box to **both** the gutter stack and every column stack. Both then measure 299px (4 + 1 + 4 + 16 = 25 added). Adding it to one side only slides every weekday label out of register.

Byte-identity is enforced with a **shared constant**, `FOOTER_ROW`, not by typing the same class string twice. This is the file's own idiom — `CELL` at line 48 already exists because that cell class string is used in two places — and it makes drift impossible rather than merely discouraged. The inner box's *text* classes still differ between the two stacks (the gutter label is muted like its sibling weekday labels; the column total is `text-foreground` because it is a total); only the wrapper and the `h-4` height are shared.

Widening the gutter with the word `"Total"` is expected and harmless: the gutter is a flex row, so all columns shift right together and vertical alignment is unaffected.

- [ ] **Step 1: Import `weekTotals` in the test file and write the failing tests**

In `src/lib/hours/dashboard-utils.test.ts:2`, add `weekTotals` to the existing single-line import (place it after `isoWeekNumber`, before the `type` imports):

```ts
import { clientLabel, computeKpis, topMembers, topClients, buildHeatmap, filterSummary, parseLocalDate, formatDayLabel, formatDayRowLabel, formatTimeRange, buildCategoryQuery, enumerateDays, buildDayHeatmap, fmtHM, hoursBucket, sumHoursByDay, trailingRange, buildCalendarWeeks, isoWeekNumber, weekTotals, type Summary, type DayRow, type CalendarWeeks } from "./dashboard-utils";
```

Append at EOF (after the closing `});` of the `describe("buildCalendarWeeks month ownership")` block at line 278):

```ts

describe("weekTotals", () => {
  it("sums each column's real days and ignores padding", () => {
    const weeks = [
      ["", "", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
      ["2026-07-06", "2026-07-07", "", "", "", "", ""],
    ];
    const byDay = new Map([
      ["2026-07-01", 8],
      ["2026-07-02", 7.5],
      ["2026-07-03", 0.25],
      ["2026-07-06", 4],
      // 2026-07-20 is outside every column above and must not leak into a total.
      ["2026-07-20", 99],
    ]);
    // 8 + 7.5 + 0.25 = 15.75, all binary-exact, so toEqual is safe here.
    expect(weekTotals(weeks, byDay)).toEqual([15.75, 4]);
  });

  it("returns 0 for an all-padding column and for a column whose days are absent from byDay", () => {
    const weeks = [
      ["", "", "", "", "", "", ""],
      ["2026-07-06", "2026-07-07", "", "", "", "", ""],
    ];
    expect(weekTotals(weeks, new Map())).toEqual([0, 0]);
  });

  it("returns [] for no weeks", () => {
    expect(weekTotals([], new Map([["2026-07-01", 8]]))).toEqual([]);
  });

  it("is index-aligned with buildCalendarWeeks output", () => {
    // 3 columns: [pad,pad,07-01..07-05], [07-06..07-12], [07-13,07-14,pad...].
    const { weeks } = buildCalendarWeeks("2026-07-01", "2026-07-14");
    const byDay = sumHoursByDay([
      { entryDate: "2026-07-01", hours: 2 },
      { entryDate: "2026-07-13", hours: 3 },
    ]);
    const totals = weekTotals(weeks, byDay);
    expect(totals.length).toBe(weeks.length);
    expect(totals).toEqual([2, 0, 3]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`

Expected: the **whole file fails to load**, with a transform/import error naming `weekTotals` (esbuild rejects an import of a named export that does not exist). That is the correct red for this step — you will not see "4 failed, 37 passed". If instead the suite runs and only the four new tests fail, `weekTotals` already exists somewhere; stop and investigate before implementing.

- [ ] **Step 3: Implement `weekTotals`**

Append to `src/lib/hours/dashboard-utils.ts`, after `isoWeekNumber` (i.e. after line 336):

```ts

/**
 * Total hours per week column. Index-aligned with `weeks`: one number per column, in
 * the same order. Padding cells ("") and days absent from `byDay` contribute 0, so an
 * all-padding or all-zero column returns 0 and `weeks: []` returns [].
 *
 * Deliberately does not round. `fmtHM` at the render site owns formatting, and rounding
 * here would fork the day cells' and the footer's notion of a total.
 */
export function weekTotals(weeks: string[][], byDay: Map<string, number>): number[] {
  return weeks.map((week) => {
    let sum = 0;
    for (const date of week) {
      if (date === "") continue;
      sum += byDay.get(date) ?? 0;
    }
    return sum;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`

Expected: **41 passed, 0 failed** (37 from Task 1 + 4 new).

- [ ] **Step 5: Wire the totals into the component**

Three edits in `src/components/hours/hours-heatmap-calendar.tsx`.

5a — add `weekTotals` to the existing import block (lines 6-14), after `buildCalendarWeeks`:

```tsx
import {
  trailingRange,
  sumHoursByDay,
  hoursBucket,
  buildCalendarWeeks,
  weekTotals,
  isoWeekNumber,
  fmtHM,
  formatDayLabel,
} from "@/lib/hours/dashboard-utils";
```

5b — add the memo immediately after the `windowTotal` memo (which closes at line 80), before `monthLabelAt` at line 82:

```tsx
  const totals = useMemo(() => weekTotals(weeks, byDay), [weeks, byDay]);
```

5c — add the shared wrapper constant immediately after `const CELL = "h-8 w-11 shrink-0";` (line 48):

```tsx
/**
 * Week-total footer wrapper. Shared by the gutter and every column on purpose:
 * row alignment is structural (see the gutter's spacer comment), so the two stacks
 * must grow by exactly the same height. A shared constant makes drift impossible.
 */
const FOOTER_ROW = "mt-1 border-t border-stone-200 pt-1";
```

5d — add the footer to **both** stacks. In the gutter (lines 123-136), append the footer as the last child of the gutter's `flex-col`, after the weekday-labels div closes:

```tsx
            <div className="mr-2 flex shrink-0 flex-col">
              <div className="h-3" />
              <div className="mt-1 h-3" />
              <div className="mt-1 flex flex-col gap-[3px]">
                {WEEKDAY_LABELS.map((d) => (
                  <div
                    key={d}
                    className="flex h-8 items-center text-[9px] leading-none text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>
              {/* Week-total footer. Shares FOOTER_ROW and the h-4 height with the
                  columns' footer, or every weekday label above slides out of
                  register with its row. */}
              <div className={FOOTER_ROW}>
                <div className="flex h-4 items-center text-[9px] leading-none text-muted-foreground">
                  Total
                </div>
              </div>
            </div>
```

And in each column, append the footer as the last child of the column's `flex-col`, after the 7-cell div closes at line 181 and before the column's closing `</div>` at line 182:

```tsx
                  <div className={FOOTER_ROW}>
                    <div className="flex h-4 w-11 items-center justify-center whitespace-nowrap text-[9px] font-semibold leading-none tabular-nums text-foreground">
                      {total > 0 ? fmtHM(total) : ""}
                    </div>
                  </div>
```

`total` comes from a `const` added alongside the column's existing locals, immediately after `const firstReal = week.find((c) => c !== "");` (line 141):

```tsx
                  const total = totals[wi];
```

Notes, all load-bearing:
- The footer goes **above the legend**. The legend block (lines 188-198) is a sibling of the `flex` row, outside the columns — do not move it, and do not put the footer inside it.
- Blank on zero, per the locked decision — `total > 0` mirrors the day cells' `level > 0` gate. No `"0h 00m"`, no dash.
- No `title` and no `aria-label` on the footer. The day cells already announce their own values and the card header already announces the window total; the footer is a decorative summary.
- `whitespace-nowrap` covers the theoretical 8-glyph `"112h 00m"` (≈43px in the 44px `w-11` cell — `MAX_SHIFT_MIN` is 960, so 7 days cap at 112h). No truncation logic.
- Do not add `dark:border-zinc-800` to the footer border. Task 3 deletes the five that exist; adding a sixth means Task 3 has to delete it again.

- [ ] **Step 6: Controller typechecks**

Run (controller, in background): `node_modules/.bin/tsc --noEmit`

Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts src/components/hours/hours-heatmap-calendar.tsx
git diff --cached --stat
git commit -m "feat(hours): add a per-week totals footer to the hours heatmap

New pure weekTotals(weeks, byDay) helper with tests, rendered as a bordered
footer row under each week column and under the weekday gutter. Blank on a
zero week, fmtHM elsewhere. The footer wrapper is byte-identical on both
stacks because gutter/column row alignment is structural.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts src/components/hours/hours-heatmap-calendar.tsx
```

---

### Task 3: Light surface in dark mode (8c)

**Files:**
- Modify: `src/app/globals.css:123` (one line)
- Modify: `src/components/hours/hours-heatmap-calendar.tsx` (`CARD` at line 16, plus four more `dark:border-zinc-800` sites)
- Modify: `DESIGN.md` (append one row to the Decisions Log table, which currently ends at line 216)

**Interfaces:**
- Consumes: the component and CSS as left by Task 2.
- Produces: a reusable `.light-surface` class that pins the light token block onto any element, and a heatmap card carrying it.

**No unit-test surface.** CSS token scoping has no assertion surface, so this task is gated by the grep in Step 4, `tsc`, the unchanged 41-test suite, and dogfood items 14-15.

**⚠️ Line numbers in `hours-heatmap-calendar.tsx` have shifted** — Task 2 added lines. Locate every site in this task by its content string, not by the line number quoted from the spec.

**Why the five `dark:border-zinc-800` utilities must be deleted, not overridden:** `src/app/globals.css:21` declares `@custom-variant dark (&:is(.dark *));`. A `dark:` utility therefore matches **any** descendant of `.dark`, so no wrapper class can un-match one. Their `border-stone-200` partner is a static Tailwind color that is already theme-independent, so deletion leaves a correct light border in both themes.

**Why widening the selector beats a new class:** copying the light values into `.light-surface` would fork them from `:root` and drift silently on the next palette change. Widening keeps one source of truth. The cascade works because `.dark` declares its tokens on `<html>` while `.light-surface` declares the light ones **directly on the card element** — a direct declaration always beats an inherited value, so there is no specificity contest and no `!important`. Verified: `@theme inline` is the only `@theme` block in `globals.css`, so `bg-card` compiles to `var(--card)` resolved at the use site, which is what makes local redeclaration work at all.

**Why the bucket ramp needs no work:** `--brand` (`#FF751F`) and `--brand-foreground` (`#242222`) are byte-identical in `:root` (lines 170, 172) and `.dark` (lines 274, 276). `bucketFill`'s `color-mix(in srgb, var(--brand) N%, transparent)` therefore already emits the same translucent orange in both themes — only the surface it composites over differs. Pinning `--card` to `#FEFEFE` makes the ramp pixel-identical to light mode for free. **`BUCKET_PCT` is untouched.**

**Why the 3mo/6mo/12mo buttons follow with no `Button` edit:** shadcn `Button`'s seven `dark:` utilities reference `--destructive`, `--input` and `--accent`, and its `default` variant resolves `--primary`/`--primary-foreground`. All four are declared inside the `:root` block (which spans lines 123-233), so `.light-surface` redeclares them on the card and every descendant button inherits the light values.

- [ ] **Step 1: Widen the light-token selector**

In `src/app/globals.css`, line 123 — the selector opening the `LIGHT THEME` block:

- Before: `:root {`
- After: `:root, .light-surface {`

Change the selector and nothing else. **Do not** duplicate, move, or reorder any declaration inside the block, and do not touch the `.dark` block at line 238. Re-declaring the whole block on a nested element also sets tokens the card never uses (`--background`, chart tokens, `--radius`, `--sidebar-*`); unused custom properties have no effect, so this is harmless and is the point of not forking the values.

- [ ] **Step 2: Put `light-surface` on the card and drop its dark border**

In `src/components/hours/hours-heatmap-calendar.tsx`, replace the `CARD` constant (line 16):

- Before: `const CARD = "rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800";`
- After:

```tsx
const CARD = "light-surface rounded-xl border border-stone-200 bg-card p-4";
```

- [ ] **Step 3: Delete the remaining four `dark:border-zinc-800`**

Four sites, each identified by its content. Delete only the ` dark:border-zinc-800` token (and the single space before it) — change nothing else on these lines.

Site 2, the 3mo/6mo/12mo button group wrapper:

- Before: `<div className="flex rounded-md border border-stone-200 p-0.5 text-xs dark:border-zinc-800">`
- After: `<div className="flex rounded-md border border-stone-200 p-0.5 text-xs">`

Site 3, the month-divider branch inside the column `className` template:

- Before: `? "ml-2 border-l border-stone-200 pl-2 dark:border-zinc-800"`
- After: `? "ml-2 border-l border-stone-200 pl-2"`

Site 4, the day-cell `className` template literal — the `dark:border-zinc-800` sits between `hover:ring-brand` and the `bucketText` interpolation. Before:

```tsx
                          className={`${CELL} flex items-center justify-center rounded-sm border border-stone-200 text-[9px] font-medium tabular-nums transition-colors hover:ring-1 hover:ring-brand dark:border-zinc-800 ${bucketText(
                            level,
                          )} ${isSelected ? "ring-2 ring-brand" : ""}`}
```

After:

```tsx
                          className={`${CELL} flex items-center justify-center rounded-sm border border-stone-200 text-[9px] font-medium tabular-nums transition-colors hover:ring-1 hover:ring-brand ${bucketText(
                            level,
                          )} ${isSelected ? "ring-2 ring-brand" : ""}`}
```

Site 5, the legend swatch:

- Before: `className="h-3 w-3 rounded-sm border border-stone-200 dark:border-zinc-800"`
- After: `className="h-3 w-3 rounded-sm border border-stone-200"`

- [ ] **Step 4: Verify zero `dark:` utilities remain in the component**

Run: `grep -n "dark:" src/components/hours/hours-heatmap-calendar.tsx`

Expected: **no output** (grep exits 1). Any hit is a leftover — a `dark:` utility inside a `.light-surface` island still matches `&:is(.dark *)` and will paint a dark artifact on a light card.

- [ ] **Step 5: Record the deviation in `DESIGN.md`**

Append one row to the end of the Decisions Log table (currently ending at line 216, after the `2026-07-27` typography row). This is **mandatory** — `DESIGN.md:214` records that cards were standardized on `bg-card` and `bg-white dark:bg-zinc-900/50` was retired, and this reverses that for one card. A silent deviation is a defect.

```markdown
| 2026-07-31 | Hours-log heatmap card is a permanent light island in dark mode via a new `.light-surface` utility | Deliberate, user-approved deviation from the 2026-07-22 "cards standardized on `bg-card`" row above, scoped to the `/hours-log` heatmap card only — no other card changes. The density ramp reads better on a white surface, and the user chose this after being shown the conflict. Mechanism: `globals.css` widens the light-token selector from `:root` to `:root, .light-surface` (values are never duplicated, so they cannot drift), and the card carries `light-surface`, declaring the light tokens directly on itself so they beat the inherited `.dark` values with no `!important`. The card's five `dark:border-zinc-800` utilities were deleted rather than overridden, because `@custom-variant dark (&:is(.dark *))` matches any descendant of `.dark` and no wrapper can un-match them. `BUCKET_PCT` needed no retuning: `--brand` and `--brand-foreground` are identical in both themes. |
```

- [ ] **Step 6: Controller typechecks and re-runs the suite**

Run (controller): `node_modules/.bin/tsc --noEmit` in the background, and `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`.

Expected: `tsc` exit 0, no output; **41 passed, 0 failed** (this task changes no logic).

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/components/hours/hours-heatmap-calendar.tsx DESIGN.md
git diff --cached --stat
git commit -m "feat(hours): keep the hours heatmap card light in dark mode

Widens the light-token selector to \":root, .light-surface\" so the values are
declared once, and puts light-surface on the heatmap card. Declaring the
tokens directly on the card beats the inherited .dark values without
!important. The card's five dark:border-zinc-800 utilities are deleted, not
overridden, because @custom-variant dark matches any .dark descendant.
Records the deviation from the bg-card standardization in DESIGN.md.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/app/globals.css src/components/hours/hours-heatmap-calendar.tsx DESIGN.md
```

---

## Dogfood (after Task 3, once — controller-run with the user)

Task 7's 10-item checklist (`.superpowers/sdd/2026-07-30-hours-log-calendar-heatmap-task7-cell-redesign/task-3-brief.md`, Step 6) has **never been run by anyone**. Folding Task 8 in before landing exists specifically so this happens once. Run all 16 items in **both** light and dark.

Items 11-16, from the spec:

11. Weekday labels still line up with their rows after the footer is added — check the Mon row and the Sun row at both ends of the strip. *(The alignment hazard. Verify visually, not by inspection.)*
12. Month labels read `"May 2026"`, `"Jun 2026"`, `"Jul 2026"` — with **May present**. Supersedes item 1, and is the likeliest thing to be quietly broken.
13. Week footer totals are plausible: each column's footer equals the sum of the cells above it, and a week with no entries renders blank.
14. In dark mode the heatmap card is light — background, text, borders, the 3mo/6mo/12mo buttons (both active and inactive), and the legend swatches — with no dark-on-dark or light-on-light text anywhere inside it.
15. In dark mode the bucket ramp looks the same as in light mode, and text on the darkest 6h+ cells is legible. Supersedes item 7.
16. The 12-month window still scrolls horizontally without the footer breaking containment.

Setup: `/hours-log` is auth-gated on a team role. Good account 1899670 (Dr. Cuddles); June 2026 has data. Run the dev server from `/Users/manu/MFHub` (the only checkout with `.env.local`), re-detached to the new HEAD — a plain `git switch <branch>` fails there because this worktree owns the branch, so use `git switch --detach <sha>`, and return it with `git switch main` afterwards.

## Self-Review

**Spec coverage.** 8a → Task 1 (one-line `monthLabel` change, 5 sanctioned literals, year-boundary guard). 8b → Task 2 (`weekTotals` + tests + footer on both stacks). 8c → Task 3 (selector widening, `light-surface` on `CARD`, 5 deletions, DESIGN.md row). Spec's Files table: all five files appear, `hours-tracker.tsx` appears nowhere. Spec's Testing section: vitest command and the controller-runs-`tsc` rule are in Global Constraints and in every task. Spec's Dogfood section: reproduced above with the Task 7 checklist pointer. Spec's Out-of-scope items are not built anywhere in this plan. No gaps.

**Placeholders.** None. Every code step carries the literal text to write; every run step carries the exact command and the exact expected result, including the two non-obvious ones (Task 1 Step 2 expects 5 failures, not 4; Task 2 Step 2 expects a load error rather than test failures).

**Type consistency.** `weekTotals(weeks: string[][], byDay: Map<string, number>): number[]` is spelled identically in the Task 2 interface block, the test import, the implementation, and the component's `useMemo`. `weeks` is `string[][]` from `CalendarWeeks` and `byDay` is `Map<string, number>` from `sumHoursByDay` — both match the component's existing locals at lines 71-75. `total` is `number` (`noUncheckedIndexedAccess` is off, and `weekTotals` returns exactly `weeks.length` entries, so `totals[wi]` is always present). `monthLabels`' type is unchanged by Task 1, so the component's `monthLabelAt` needs no edit.

**Verified against the live files at `0c5f9f84`** (not trusted from the spec): all five `dark:border-zinc-800` sites; `CARD` at :16; gutter spacers at :124-125; month-label render at :153-155; `monthLabel` at :280-281; test literals at 199/200/208/251-255/276 and the untouched assertions at 210/262/263-264/269-270; `globals.css:21` `@custom-variant`, `:123` `:root {`, `:129` `--card: #FEFEFE`, `:170-172` and `:274-276` brand tokens, `:238` `.dark {`; `@theme inline` as the only `@theme` block with `--color-card: var(--card)`; `DESIGN.md:214` as the `bg-card` row with the table ending at 216; `.light-surface` and `weekTotals` unused anywhere in `src/`; `noUncheckedIndexedAccess` absent from `tsconfig.json`.
