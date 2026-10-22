# Hours-Log Calendar Heatmap — Task 7: Cell Redesign + Month-Label Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enlarge the `/hours-log` calendar heatmap cells so each shows that day's total hours as text, visually separate months with a divider + month name, add an ISO week number (`W00`) to each column header, and fix the month-label rule that silently drops a month whose 1st falls inside the window's first partial week.

**Architecture:** Two pure-helper changes in `src/lib/hours/dashboard-utils.ts` (TDD, unit-tested), then a rewrite of the render body of `src/components/hours/hours-heatmap-calendar.tsx`. The component is restructured so each week column is a self-contained flex column stacking `[month label] [W00] [7 cells]` — this makes header/grid alignment structural rather than arithmetic, eliminating the pixel-pitch class of bug that already required one fix round in Task 5. The data layer (React Query, `/api/hours`, `sumHoursByDay`, `trailingRange`, `hoursBucket`) is **untouched**.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui `Button`, TanStack React Query, Vitest.

## Global Constraints

- Work **only** in the worktree `/Users/manu/MFHub-wt-hours-log-calendar` on branch `feat/hours-log-calendar-heatmap`. Never edit `/Users/manu/MFHub`.
- **No new colors.** Reuse only existing tokens: `var(--brand)`, `color-mix(in srgb, var(--brand) N%, transparent)`, `text-brand-foreground`, `text-foreground`, `text-muted-foreground`, `border-stone-200 dark:border-zinc-800`, `bg-card`, `ring-brand`. Read `DESIGN.md` before any visual decision.
- **Text contrast rule (DESIGN.md):** `--brand-foreground` (`#242222`, identical in light and dark — verified in `src/app/globals.css`, `.dark` does not override it) is the required text color on saturated `--brand` fills, because white fails WCAG on `#FF751F`. Buckets 3–4 must use `text-brand-foreground`; buckets 1–2 use `text-foreground/80`.
- **Font sizes:** `text-[9px]` only — an established size in this app (DESIGN.md: phase badges). Introduce no new type scale.
- **No backend change.** No new endpoint, query, schema, or API route. No edits to `src/app/api/hours/route.ts`.
- **No change to `weeks`.** `buildCalendarWeeks` must keep returning `weeks: string[][]` (7 entries per column, Mon→Sun, `""` padding). Only `monthLabels` changes.
- Tests: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts` (run from the worktree).
- Typecheck: `node_modules/.bin/tsc --noEmit` (slow, ~2min, run in background). **Never `next build`.** Vitest does not typecheck.
- **Append** to `src/lib/hours/dashboard-utils.test.ts` — do not rewrite it. The one sanctioned edit to an existing test is spelled out verbatim in Task 2.
- Commits: `git commit -m "msg" -- <explicit pathspec>` (`-m` **before** `--`). **Never `git add .`.** Verify the staged diff. Keep `graphify-out/*` and `.claude/*` out of every commit (`graphify-out` is permanently dirty in this worktree).
- One task per commit. Every commit ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Decisions already locked by the user (do NOT re-litigate)

| Decision | Choice |
| --- | --- |
| Month separation | ONE continuous weeks-as-columns strip with a visible gap/divider + month name where a month starts. **NOT** one grid per month. |
| 12mo option | Stays in the toggle. Horizontal scroll accepted. **No** second small-cell rendering mode. |
| Zero-hour days | Empty cell, faint bucket-0 background. No `"0h 00m"`, no dash. |
| Cell text | `fmtHM` format (`"6h 12m"`), matching the admin Member × client heatmap. |
| Week header | ISO-8601 week number, zero-padded to 2 digits (`"W05"`, `"W18"`). ISO weeks are Monday-based, matching the existing Mon→Sun row order. |
| Supersedes | The earlier "GitHub calendar visual" decision, on **cell size and cell content only**. Everything else in the spec still governs. |

Unchanged and still locked from Tasks 1–6: own entries only via the existing owner-only `/api/hours`; trailing 3/6/12mo window defaulting to 3mo, independent of the table presets; Mon→Sun rows; discrete buckets `0 / <2h / 2–4h / 4–6h / 6h+`; daily totals only; click a day → table range-override `{from:date,to:date}` + auto-expand + dismissable chip; placement under the log form and above the presets.

## Derived consequence (a decision, not a question)

A continuous weeks-as-columns strip means a month boundary can fall **inside** a column (e.g. column 0 of the 3mo window spans `Apr 30 → May 3`). A divider can only be drawn *between* columns, so it lands within ±3 days of the true boundary, and a column belongs to exactly one month. This follows directly from "ONE continuous strip" + "week number per column" and is therefore settled, not open. The rule below picks the boundary position that minimizes the error.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/lib/hours/dashboard-utils.ts` | Pure date/aggregation helpers, no React/DOM/IO | `+ isoWeekNumber`; rewrite `buildCalendarWeeks`'s `monthLabels` block |
| `src/lib/hours/dashboard-utils.test.ts` | Unit tests for those helpers | Append `isoWeekNumber` + new `monthLabels` tests; one sanctioned edit to an existing assertion |
| `src/components/hours/hours-heatmap-calendar.tsx` | The calendar card: data fetch, window toggle, grid render | Rewrite the render body (data layer untouched) |
| `docs/superpowers/specs/2026-07-30-hours-log-calendar-heatmap-design.md` | Source-of-truth spec | Append a Revision 2 section |

`src/components/hours/hours-tracker.tsx` is **not** touched by Task 7. The mount at line 572 and the `selectedDate` / chip / auto-expand wiring from Task 6 stay exactly as they are.

---

### Task 1: `isoWeekNumber` pure helper

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` (append at end of file)
- Test: `src/lib/hours/dashboard-utils.test.ts` (append at end of file)

**Interfaces:**
- Consumes: `parseLocalDate(entryDate: string): Date` — already exported from the same file.
- Produces: `export function isoWeekNumber(dateIso: string): number` — returns the ISO-8601 week number (1–53) for a `YYYY-MM-DD` local date. Task 3 formats it as `` `W${String(n).padStart(2, "0")}` ``. **The helper returns a bare number; it does not format.**

**Why the algorithm looks like that:** ISO-8601 defines a week as Mon→Sun, and week 1 is the week containing the first Thursday of the year. So: shift the input to the Thursday of its own week, shift Jan 4 (always in week 1) to *its* Thursday, and count the weeks between. Using `Math.round` on the millisecond delta absorbs the ±1h DST drift that local-date arithmetic introduces (verified stable across both 2026 US DST transitions).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/hours/dashboard-utils.test.ts`. `isoWeekNumber` must be added to the existing `import { ... } from "./dashboard-utils"` at the top of the file — do not add a second import statement.

```ts
describe("isoWeekNumber", () => {
  it("returns the ISO-8601 week for ordinary dates", () => {
    expect(isoWeekNumber("2026-04-30")).toBe(18); // Thursday
    expect(isoWeekNumber("2026-05-04")).toBe(19); // the following Monday
    expect(isoWeekNumber("2026-07-30")).toBe(31);
  });

  it("is constant across every day of one Mon-Sun week", () => {
    const week = [
      "2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30",
      "2026-05-01", "2026-05-02", "2026-05-03",
    ];
    expect(week.map(isoWeekNumber)).toEqual([18, 18, 18, 18, 18, 18, 18]);
  });

  it("handles year boundaries by ISO rules, not calendar-year rules", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1);  // Thu -> week 1 of 2026
    expect(isoWeekNumber("2026-12-31")).toBe(53); // Thu -> week 53 of 2026
    expect(isoWeekNumber("2027-01-01")).toBe(53); // Fri -> still 2026-W53
    expect(isoWeekNumber("2024-12-30")).toBe(1);  // Mon -> already 2025-W01
    expect(isoWeekNumber("2021-01-01")).toBe(53); // Fri -> 2020-W53
  });

  it("is stable across DST transitions (local-date arithmetic must not drift)", () => {
    // US spring-forward 2026-03-08, fall-back 2026-11-01.
    expect(isoWeekNumber("2026-03-08")).toBe(10);
    expect(isoWeekNumber("2026-03-09")).toBe(11);
    expect(isoWeekNumber("2026-11-01")).toBe(44);
    expect(isoWeekNumber("2026-11-02")).toBe(45);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "isoWeekNumber"
```
Expected: FAIL. Vitest reports `isoWeekNumber is not a function` or the import is unresolved.

- [ ] **Step 3: Write the implementation**

Append to the end of `src/lib/hours/dashboard-utils.ts`:

```ts
/**
 * ISO-8601 week number (1-53) for a local YYYY-MM-DD date.
 *
 * ISO weeks run Mon-Sun and week 1 is the week containing the first Thursday of
 * the year, so a date's week is found by comparing its own week's Thursday to the
 * Thursday of the week containing Jan 4 (which is always in week 1). `Math.round`
 * absorbs the +/-1h skew that a DST transition introduces into local-date deltas.
 */
export function isoWeekNumber(dateIso: string): number {
  const d = parseLocalDate(dateIso);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  thursday.setDate(thursday.getDate() - mondayIndex(thursday) + 3);

  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - mondayIndex(firstThursday) + 3);

  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}
```

`mondayIndex` is the existing module-private helper (`(d.getDay() + 6) % 7`, defined just above `buildCalendarWeeks`). It stays private — do not export it. If `isoWeekNumber` is appended *below* `buildCalendarWeeks` the hoisted `function mondayIndex` declaration is still in scope; no reordering is needed.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts
```
Expected: PASS, 33/33 (29 existing + 4 new `it` blocks). Output clean, no warnings.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git status --short   # verify ONLY those two files are staged; graphify-out must NOT appear
git commit -m "$(cat <<'EOF'
feat(hours): add isoWeekNumber ISO-8601 week helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 2: Correct the `buildCalendarWeeks` month-label rule

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` — the `monthLabels` block inside `buildCalendarWeeks` (currently lines ~276–297) and the function's doc comment (lines ~253–262)
- Test: `src/lib/hours/dashboard-utils.test.ts` — append new tests; **one** sanctioned edit to the existing test at line ~203

**Interfaces:**
- Consumes: `parseLocalDate`, `enumerateDays`, `mondayIndex` (all already in the file).
- Produces: `buildCalendarWeeks(from: string, to: string): { weeks: string[][]; monthLabels: { index: number; label: string }[] }` — **signature and return shape are unchanged.** Task 3 reads `monthLabels` to decide both the month name and the divider position: a column `wi > 0` that has a label starts a new month and gets a left divider.

**The bug being fixed.** `trailingRange("2026-07-30", 3)` yields `from = 2026-04-30`, a Thursday. Week-column 0 is therefore `["", "", "", "2026-04-30", "2026-05-01", "2026-05-02", "2026-05-03"]` — it holds both April 30 and May 1. The current rule labels column 0 from its *first real day* (`"Apr"`) and then labels only *later* columns containing a day-of-month 1. May 1 sits in column 0, which the scan skips, so May is never labeled and the strip renders "Apr, Jun, Jul". This recurs whenever the window's first partial week straddles a month boundary.

**The new rule (verified against every window below).** Give each week column exactly one **owning month**: the month holding the most real (non-`""`) days in that column; on a tie, the **later** month wins (equivalently, the month of the column's last real day). Emit `{ index, label }` at column 0, and at every subsequent column whose owning month differs from the **immediately preceding** column's owning month.

Two properties this buys, both previously bug sources:
- **At most one label per index**, structurally — a column has exactly one owning month. This is the invariant the Task 4 fix round had to bolt on; now it is impossible to violate.
- **Comparison is against the previous column, not a global seen-set**, so a 12-month window that spans e.g. two Julys can legitimately label both.

**SANCTIONED BEHAVIOR CHANGE — read before editing the test file.** The existing test at line ~203 asserts `buildCalendarWeeks("2026-06-29", "2026-07-05").monthLabels` equals `[{ index: 0, label: "Jun" }]`. `2026-06-29` is a Monday, so that window is a single column holding 2 June days and 5 July days; the new rule labels it `"Jul"`. **The expected label changes from `"Jun"` to `"Jul"`.** This is a deliberate, user-approved rule change, not a test weakened to make an implementation pass. The test's actual load-bearing intent — *"the scan must not push a second entry at that same index"* — is preserved verbatim (both the `toEqual` on a single-element array and the duplicate-index assertion below it). Do not delete the test, do not relax it to `.some(...)`, and do not change any other existing test.

- [ ] **Step 1: Edit the one existing test, then write the failing new tests**

First, in `src/lib/hours/dashboard-utils.test.ts`, replace the existing test at line ~203 in full:

```ts
it("buildCalendarWeeks does not double-label column 0 when a Monday-start week itself contains a 1st-of-month", () => {
  // 2026-06-29 is a Monday -> lead=0, so there is exactly ONE week column: [06-29..07-05].
  // That column holds 2 June days and 5 July days, so its owning month is July.
  // The column must carry exactly ONE label - never one entry per month present.
  const { monthLabels } = buildCalendarWeeks("2026-06-29", "2026-07-05");
  expect(monthLabels).toEqual([{ index: 0, label: "Jul" }]);
  const indices = monthLabels.map((m) => m.index);
  expect(new Set(indices).size).toBe(indices.length); // no duplicate index values
});
```

Then append these new tests at the end of the file:

```ts
describe("buildCalendarWeeks month ownership", () => {
  it("labels the month owning most of a straddling first column (regression: missing May)", () => {
    // trailingRange("2026-07-30", 3) -> from 2026-04-30, a Thursday. Column 0 spans
    // Apr 30 -> May 3: 1 April day, 3 May days. The old rule labeled it "Apr" and then
    // never labeled May at all, rendering "Apr, Jun, Jul".
    const { monthLabels } = buildCalendarWeeks("2026-04-30", "2026-07-30");
    expect(monthLabels).toEqual([
      { index: 0, label: "May" },
      { index: 5, label: "Jun" },
      { index: 9, label: "Jul" },
    ]);
  });

  it("emits at most one label per column index for a full 12-month window", () => {
    const { weeks, monthLabels } = buildCalendarWeeks("2025-07-30", "2026-07-30");
    expect(weeks.length).toBe(53);
    const indices = monthLabels.map((m) => m.index);
    expect(new Set(indices).size).toBe(indices.length);
    expect(monthLabels.length).toBe(12);
    expect(monthLabels[0].index).toBe(0);
  });

  it("never emits two consecutive labels for the same month", () => {
    const { monthLabels } = buildCalendarWeeks("2026-04-30", "2026-07-30");
    for (let i = 1; i < monthLabels.length; i++) {
      expect(monthLabels[i].label).not.toBe(monthLabels[i - 1].label);
    }
  });

  it("labels a single-month window exactly once, at column 0", () => {
    const { monthLabels } = buildCalendarWeeks("2026-07-01", "2026-07-14");
    expect(monthLabels).toEqual([{ index: 0, label: "Jul" }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts
```
Expected: FAIL. The "missing May" regression test reports `"Apr"` where `"May"` is expected; the edited single-column test reports `"Jun"` where `"Jul"` is expected. The `weeks`-shape tests and all Task 1 tests still pass.

- [ ] **Step 3: Write the implementation**

In `src/lib/hours/dashboard-utils.ts`, replace the `buildCalendarWeeks` doc comment's `monthLabels rule` paragraph and the whole `monthLabels` block. The `days` / `cells` / `weeks` construction above it is unchanged.

Replace the doc comment (currently lines ~253–262) with:

```ts
/**
 * Arrange the inclusive [from,to] day range into GitHub-style week columns (Mon..Sun),
 * top/bottom padded with "" so every column has 7 cells, plus month labels per column.
 *
 * monthLabels rule: every column has exactly ONE owning month - the month holding the
 * most real (non-"") days in that column, ties going to the LATER month. A label is
 * emitted at column 0 and at every column whose owning month differs from the column
 * immediately before it.
 *
 * Because a week column can straddle a month boundary, the label (and the divider the
 * component draws from it) can sit up to 3 days off the true 1st-of-month. Owning by
 * majority minimizes that error and, unlike a first-real-day rule, cannot drop a month
 * whose 1st lands inside the window's first partial week.
 */
```

Replace the label block (currently lines ~276–297, from `const monthLabel = ...` through the `weeks.forEach(...)` loop) with:

```ts
  const monthLabel = (dateIso: string): string =>
    parseLocalDate(dateIso).toLocaleDateString(undefined, { month: "short" });

  /** The month owning this column: most real days wins, ties go to the later month. */
  const owningMonth = (week: string[]): { month: number; sample: string } | null => {
    const real = week.filter((c) => c !== "");
    if (real.length === 0) return null;
    const lastMonth = parseLocalDate(real[real.length - 1]).getMonth();
    const counts = new Map<number, number>();
    for (const c of real) {
      const m = parseLocalDate(c).getMonth();
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    let best = lastMonth;
    let bestCount = -1;
    for (const [month, count] of counts) {
      if (count > bestCount || (count === bestCount && month === lastMonth)) {
        best = month;
        bestCount = count;
      }
    }
    return { month: best, sample: real.find((c) => parseLocalDate(c).getMonth() === best)! };
  };

  const monthLabels: { index: number; label: string }[] = [];
  let prevMonth: number | null = null;

  weeks.forEach((week, index) => {
    const owner = owningMonth(week);
    if (!owner) return;
    if (prevMonth === null || owner.month !== prevMonth) {
      monthLabels.push({ index, label: monthLabel(owner.sample) });
      prevMonth = owner.month;
    }
  });
```

The `return { weeks, monthLabels };` line stays as-is. The `firstReal` bootstrap and the `lastMonth` variable from the old implementation are deleted — do not leave them behind as dead code.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts
```
Expected: PASS, 37/37. In particular `buildCalendarWeeks("2026-06-28","2026-07-05")` (the untouched test at line ~196) must still pass: that window's column 0 is a lone Sunday June 28 → `"Jun"`, and column 1 is 2 June + 5 July → `"Jul"`.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
node_modules/.bin/tsc --noEmit
```
Expected: exit 0, no output. Slow (~2 min) — run it in the background and wait for it.

- [ ] **Step 6: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git status --short   # verify ONLY those two files are staged
git commit -m "$(cat <<'EOF'
fix(hours): own each week column by majority month so no month is dropped

trailingRange's window can start mid-week, putting two months in column 0
(Apr 30 + May 1-3 for a 3mo window ending 2026-07-30). The old rule labeled
column 0 from its first real day and scanned only later columns for a 1st of
the month, so May was never labeled and the strip read "Apr, Jun, Jul".

Each column now has exactly one owning month - most real days wins, ties go to
the later month - and a label is emitted wherever that differs from the previous
column. This makes "one label per index" structural rather than a special case.

Sanctioned behavior change: buildCalendarWeeks("2026-06-29","2026-07-05") is a
single column of 2 June + 5 July days and is now labeled "Jul", not "Jun". The
existing test's no-duplicate-index intent is preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 3: Rewrite the calendar grid render

**Files:**
- Modify: `src/components/hours/hours-heatmap-calendar.tsx` (whole file; the data layer within it is unchanged)

**Interfaces:**
- Consumes: `isoWeekNumber(dateIso: string): number` (Task 1); `buildCalendarWeeks(from, to): { weeks: string[][]; monthLabels: { index: number; label: string }[] }` with the Task 2 rule; plus the already-existing `trailingRange`, `sumHoursByDay`, `hoursBucket`, `fmtHM`, `formatDayLabel`.
- Produces: no export change. The component's props stay `{ selectedDate: string | null; onSelectDay: (date: string) => void }`, so `hours-tracker.tsx:572` needs no edit.

**What changes and why:**

1. **Cells are `h-8 w-11`** (32 × 44px) instead of `h-3.5 w-3.5`, matching the admin Member × client heatmap's `h-8` / `minmax(2.75rem, …)` exactly — that heatmap is the stated visual reference.
2. **Cell text** is `fmtHM(hours)` for buckets 1–4 and `""` for bucket 0 (locked: no `"0h 00m"`, no dash).
3. **Text color is bucket-dependent.** `DESIGN.md` states white fails WCAG on `#FF751F`, and `--brand-foreground` (`#242222`) is the required text color on brand fills. Buckets 3–4 (70% / 100% brand) therefore use `text-brand-foreground`; buckets 1–2 use `text-foreground/80`. `--brand-foreground` is **not** overridden in `.dark`, so this is correct in both themes. This concern is new to Task 7 — the old cells carried no text.
4. **Each week column owns its own header.** A column is now a flex column stacking `[month label] [W00] [7 cells]`. The month-label row is no longer a separate sibling row with a hand-computed pixel pitch, which is what forced the Task 5 fix round (`w-4` labels over a 17px grid pitch). Alignment is now structural: a label physically cannot drift from its column.
5. **Month divider.** A column with `wi > 0` that carries a month label gets `ml-2 border-l border-stone-200 pl-2 dark:border-zinc-800`; every other non-first column gets `ml-[3px]` (preserving the existing gap); column 0 gets no left margin.
6. **All seven weekday labels** (`Mon`…`Sun`) instead of `Mon / _ / Wed / _ / Fri / _ / _` — the 32px rows have room now. The gutter mirrors the columns' two header rows with explicit spacers instead of relying on `justify-between` slack, which the Task 5 review flagged as correct only by coincidence.
7. **`title` and `aria-label` both stay, and this is deliberate.** A deferred minor from Task 5 flagged them as duplicated. With visible text in the cell that is now *required*: the cell's text content is only `"6h 12m"`, so `aria-label` is what supplies the date to assistive tech, and `title` is what supplies it on hover to sighted users. Removing either loses information. Record this as resolved-won't-fix.

Not changing: the card wrapper, header row, 3/6/12mo toggle, window total, React Query call and key, loading/error branches, legend, and `bucketFill`/`BUCKET_PCT`.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/components/hours/hours-heatmap-calendar.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  trailingRange,
  sumHoursByDay,
  hoursBucket,
  buildCalendarWeeks,
  isoWeekNumber,
  fmtHM,
  formatDayLabel,
} from "@/lib/hours/dashboard-utils";

const CARD = "rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800";

/** Today as local YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTH_OPTIONS = [
  { months: 3, label: "3mo" },
  { months: 6, label: "6mo" },
  { months: 12, label: "12mo" },
] as const;

/** Bucket 0 = faint empty; 1-4 ramp brand orange. Index by hoursBucket(). */
const BUCKET_PCT = [6, 25, 45, 70, 100];
const bucketFill = (level: number) =>
  `color-mix(in srgb, var(--brand) ${BUCKET_PCT[level]}%, transparent)`;

/**
 * Buckets 3-4 are saturated brand orange. DESIGN.md: white fails WCAG on #FF751F,
 * so text on brand fills uses --brand-foreground (#242222, identical in light and
 * dark - .dark does not override it). Fainter buckets read correctly against the
 * theme's own foreground.
 */
const bucketText = (level: number) =>
  level >= 3 ? "text-brand-foreground" : "text-foreground/80";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One day cell: 2.75rem x 2rem, matching the admin Member x client heatmap. */
const CELL = "h-8 w-11 shrink-0";

type HoursEntry = { entryDate: string; hours: number };

export function HoursHeatmapCalendar({
  selectedDate,
  onSelectDay,
}: {
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
}) {
  const [months, setMonths] = useState<3 | 6 | 12>(3);
  const range = useMemo(() => trailingRange(todayIso(), months), [months]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["hours", range.from, range.to],
    queryFn: async () => {
      const res = await fetch(`/api/hours?from=${range.from}&to=${range.to}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load hours");
      return (await res.json()).entries as HoursEntry[];
    },
  });

  const byDay = useMemo(() => sumHoursByDay(data ?? []), [data]);
  const { weeks, monthLabels } = useMemo(
    () => buildCalendarWeeks(range.from, range.to),
    [range.from, range.to],
  );
  const windowTotal = useMemo(() => {
    let sum = 0;
    for (const v of byDay.values()) sum += v;
    return sum;
  }, [byDay]);

  const monthLabelAt = (index: number) => monthLabels.find((m) => m.index === index)?.label ?? "";
  const activeLabel = MONTH_OPTIONS.find((o) => o.months === months)!.label;

  return (
    <div className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Your hours</div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-stone-200 p-0.5 text-xs dark:border-zinc-800">
            {MONTH_OPTIONS.map((o) => (
              <Button
                key={o.months}
                type="button"
                variant={months === o.months ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setMonths(o.months)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          {!isLoading && !error && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {fmtHM(windowTotal)} in last {activeLabel}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load hours"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex">
            {/* Weekday gutter. The two spacers mirror the columns' month + week header
                rows exactly, so row alignment is structural, not incidental. */}
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
            </div>

            {weeks.map((week, wi) => {
              const monthLabel = monthLabelAt(wi);
              const startsMonth = wi > 0 && monthLabel !== "";
              const firstReal = week.find((c) => c !== "");
              return (
                <div
                  key={wi}
                  className={`flex shrink-0 flex-col ${
                    wi === 0
                      ? ""
                      : startsMonth
                        ? "ml-2 border-l border-stone-200 pl-2 dark:border-zinc-800"
                        : "ml-[3px]"
                  }`}
                >
                  <div className="h-3 whitespace-nowrap text-[9px] font-semibold leading-none text-foreground">
                    {monthLabel}
                  </div>
                  <div className="mt-1 h-3 text-[9px] leading-none tabular-nums text-muted-foreground">
                    {firstReal ? `W${String(isoWeekNumber(firstReal)).padStart(2, "0")}` : ""}
                  </div>
                  <div className="mt-1 flex flex-col gap-[3px]">
                    {week.map((date, di) => {
                      if (!date) return <div key={di} className={CELL} />;
                      const hours = byDay.get(date) ?? 0;
                      const level = hoursBucket(hours);
                      const isSelected = date === selectedDate;
                      return (
                        <button
                          key={di}
                          type="button"
                          title={`${formatDayLabel(date)}: ${fmtHM(hours)}`}
                          aria-label={`${formatDayLabel(date)}: ${fmtHM(hours)}`}
                          onClick={() => onSelectDay(date)}
                          className={`${CELL} flex items-center justify-center rounded-sm border border-stone-200 text-[9px] font-medium tabular-nums transition-colors hover:ring-1 hover:ring-brand dark:border-zinc-800 ${bucketText(
                            level,
                          )} ${isSelected ? "ring-2 ring-brand" : ""}`}
                          style={{ backgroundColor: bucketFill(level) }}
                        >
                          {level > 0 ? fmtHM(hours) : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            <span>Less</span>
            {[1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className="h-3 w-3 rounded-sm border border-stone-200 dark:border-zinc-800"
                style={{ backgroundColor: bucketFill(level) }}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
node_modules/.bin/tsc --noEmit
```
Expected: exit 0, no output. Slow (~2 min) — run in the background and wait. **Vitest does not typecheck, so this step is not optional.**

- [ ] **Step 3: Re-run the unit tests (guard against an accidental helper edit)**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts
```
Expected: PASS, 37/37.

- [ ] **Step 4: Static self-check before committing**

Confirm each of these by reading the file you just wrote — do not assume:
- `hours-tracker.tsx` is **not** in `git status`. The props are unchanged, so it must not need an edit.
- No color literal appears anywhere except the existing `BUCKET_PCT` `color-mix` string. No hex codes, no `rgb(`, no new Tailwind color names.
- Every cell height is `h-8` and every gap between cells is `gap-[3px]`, in **both** the gutter and the columns.
- The gutter's spacer stack (`h-3`, `mt-1 h-3`, `mt-1`) is character-identical in structure to a column's (`h-3`, `mt-1 h-3`, `mt-1`).
- Bucket 0 cells render `""`, not `"0h 00m"`.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/components/hours/hours-heatmap-calendar.tsx
git status --short   # verify ONLY that one file is staged; graphify-out must NOT appear
git commit -m "$(cat <<'EOF'
feat(hours): enlarge heatmap cells with in-cell totals, month dividers, W00 headers

Cells go from 14px squares to 44x32 (matching the admin Member x client heatmap)
and carry that day's fmtHM total; zero-hour days stay empty on the faint bucket-0
fill. Each week column now owns its month label and ISO week number in its own
header stack, so labels cannot drift from their column the way a separate
pixel-pitched label row could. Columns that start a new month get a left divider.

Buckets 3-4 use text-brand-foreground per DESIGN.md (white fails WCAG on
#FF751F); fainter buckets use the theme foreground. title + aria-label both stay
now that the visible cell text is the hours alone and no longer the date.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)" -- src/components/hours/hours-heatmap-calendar.tsx
```

- [ ] **Step 6: STOP — hand off for user dogfood**

The grid is auth-gated (team role), so it cannot be verified by an agent. Do not mark Task 3 complete. Report to the controller that the code gate is passed and the user dogfood is outstanding, with this checklist:

1. Month labels read **May, Jun, Jul** on the 3mo window — "Apr" is correctly absent and **May is present**.
2. A visible divider sits to the left of the first June column and the first July column, and none to the left of column 0.
3. Every column header shows `W18`, `W19`, … zero-padded to two digits, incrementing by 1 with no gaps or repeats.
4. Each worked day shows its total as `6h 12m` inside the cell, legible at a glance.
5. Zero-hour days are empty with the faint background — no `0h 00m`, no dash.
6. Text on the darkest (6h+) cells is readable in **light** mode.
7. Text on the darkest (6h+) cells is readable in **dark** mode. *(Dark mode has never been verified on this branch at all — check the whole card, not just the cells.)*
8. Weekday labels Mon…Sun line up with their rows, at both 3mo and 12mo.
9. Clicking a day still filters the table, auto-expands it, and shows the `Showing … ✕` chip.
10. The 12mo toggle scrolls horizontally inside the card without the page itself scrolling sideways.

---

### Task 4: Record Task 7 in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-hours-log-calendar-heatmap-design.md` (append a new section before `## Out of scope (YAGNI)`)

**Interfaces:** none — documentation only.

The spec is the branch's source of truth and its "Locked decisions" table plus the `Component` section now describe cells that no longer exist (`h-3 w-3`, "no client/category breakdown" is still true but "cell content" now includes text). Leaving it stale would make the final whole-branch review flag spec drift.

- [ ] **Step 1: Append the revision section**

Insert immediately before the `## Out of scope (YAGNI)` heading:

```markdown
## Revision 2 — Task 7 cell redesign (2026-07-30, post-dogfood)

Dogfood of `366407e4` passed functionally but produced two changes. This section
**supersedes** the "Visual" row of the Locked decisions table and the cell-sizing
bullets under "Component", **on cell size and cell content only**. Every other
locked decision stands.

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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add docs/superpowers/specs/2026-07-30-hours-log-calendar-heatmap-design.md
git status --short   # verify ONLY that one file is staged
git commit -m "$(cat <<'EOF'
docs(hours): record Task 7 cell redesign + month-ownership fix in the spec

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)" -- docs/superpowers/specs/2026-07-30-hours-log-calendar-heatmap-design.md
```

---

## After Task 4

1. **User dogfood** of the branch in **both light and dark** against Task 3 Step 6's 10-item checklist. Serve it from the main checkout, which is the one holding `.env.local`:
   ```bash
   cd /Users/manu/MFHub && git switch --detach <sha>
   # restart the dev server, dogfood, then:
   cd /Users/manu/MFHub && git switch main
   ```
   A plain `git switch <branch>` fails — the worktree owns the branch.
2. **Final whole-branch code review** on the most capable model, `MERGE_BASE=62d4a284`, handed the ledger's full deferred-minor list for triage. Task 7 resolves three of them outright (month-label pitch coupling, weekday-alignment coincidence, duplicate `title`/`aria-label`); the rest still need a verdict.
3. **Rebase onto current `main`** before opening a PR — the branch is behind.
4. `superpowers:finishing-a-development-branch`.

## Self-Review

**Spec coverage.** Every Task 7 decision in the user's list maps to a task: bigger cells → T3 (`CELL = "h-8 w-11"`); hours text inside → T3 (`{level > 0 ? fmtHM(hours) : ""}`); month separation via divider + name on one continuous strip → T2 (`monthLabels`) + T3 (`startsMonth` border); `W00` header → T1 (`isoWeekNumber`) + T3 (`padStart(2,"0")`); zero-hour cells empty → T3; `fmtHM` format → T3; missing-May fix → T2. Spec document kept current → T4.

**Placeholder scan.** No `TBD`, no "handle edge cases", no "similar to Task N". Every code step carries the literal code. Every expected test value (`18`, `19`, `31`, `53`, `1`, `10`, `11`, `44`, `45`; `[{0,"May"},{5,"Jun"},{9,"Jul"}]`; 53 columns; 12 labels) was computed and verified against the real algorithm before being written here, not inferred.

**Type consistency.** `isoWeekNumber(dateIso: string): number` is declared in T1 and consumed in T3 with exactly that signature and a string argument (`firstReal`). `buildCalendarWeeks`'s return type is unchanged between T2 and T3, so `monthLabelAt` and the `weeks.map` destructuring still compile. `mondayIndex` stays module-private and is used only inside the module. `hoursBucket` returns `0|1|2|3|4`, and `bucketText(level: number)` / `bucketFill(level: number)` both accept it. The component's props are unchanged, so `hours-tracker.tsx:572` compiles untouched.
