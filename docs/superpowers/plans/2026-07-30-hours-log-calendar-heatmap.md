# Personal Daily-Hours Calendar Heatmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-style contribution-calendar heatmap of the signed-in user's own daily logged hours to the top of `/hours-log`, clickable to filter the entries table to a day.

**Architecture:** Four new pure helpers in `dashboard-utils.ts` (unit-tested, TDD). One new client component `hours-heatmap-calendar.tsx` that owns a trailing-window range toggle and fetches the user's own entries from the existing owner-only `/api/hours` (no new backend). A small edit to `hours-tracker.tsx` adds a `selectedDate` range-override so a clicked day filters the table. Reuses the admin heatmap's `var(--brand)` / `color-mix` visual tokens.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack React Query, Tailwind v4, Vitest. Spec: `docs/superpowers/specs/2026-07-30-hours-log-calendar-heatmap-design.md`.

## Global Constraints

- Work ONLY in the worktree `/Users/manu/MFHub-wt-hours-log-calendar` (branch `feat/hours-log-calendar-heatmap`). Never touch the main checkout `/Users/manu/MFHub`.
- No new API route, no new Drizzle query, no schema change. Data comes from the existing `/api/hours?from&to` (owner-only) endpoint.
- Tests: `node_modules/.bin/vitest run <path>`. Typecheck (optional, slow, background): `node_modules/.bin/tsc --noEmit`. NEVER `next build`.
- Vitest style: `import { describe, it, expect } from "vitest";` flat `it(...)`, `.toEqual`. Test file `src/lib/hours/dashboard-utils.test.ts` already exists — append to it.
- Colors: reuse only existing tokens — `var(--brand)` (`#FF751F`), `color-mix(in srgb, var(--brand) X%, transparent)`, `border-stone-200 dark:border-zinc-800`, `bg-card`. Introduce no new colors. Honor DESIGN.md.
- Local dates only: use `parseLocalDate` and local-ISO formatting (never `new Date("YYYY-MM-DD")` UTC parsing) to avoid off-by-one.
- Commit one task per commit, explicit pathspec on `git add` AND `git commit` (never `git add .`), keep `graphify-out/*` OUT of every commit. Verify the staged diff before committing. Flag order: `git commit -m "msg" -- <pathspec>`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `hoursBucket` helper

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` (append)
- Test: `src/lib/hours/dashboard-utils.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function hoursBucket(hours: number): 0 | 1 | 2 | 3 | 4` — workday-anchored bucket. `0h`→0, `(0,2)`→1, `[2,4)`→2, `[4,6)`→3, `[6,∞)`→4. Negative/NaN→0.

- [ ] **Step 1: Write the failing test** — append to `src/lib/hours/dashboard-utils.test.ts`. Add `hoursBucket` to the existing import from `"./dashboard-utils"`.

```ts
it("hoursBucket maps hours to workday-anchored levels 0-4", () => {
  expect(hoursBucket(0)).toBe(0);
  expect(hoursBucket(-3)).toBe(0);
  expect(hoursBucket(0.5)).toBe(1);
  expect(hoursBucket(1.99)).toBe(1);
  expect(hoursBucket(2)).toBe(2);
  expect(hoursBucket(3.9)).toBe(2);
  expect(hoursBucket(4)).toBe(3);
  expect(hoursBucket(5.5)).toBe(3);
  expect(hoursBucket(6)).toBe(4);
  expect(hoursBucket(12)).toBe(4);
  expect(hoursBucket(Number.NaN)).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "hoursBucket"`
Expected: FAIL — `hoursBucket is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/hours/dashboard-utils.ts`

```ts
/** Workday-anchored bucket: 0h→0, (0,2)→1, [2,4)→2, [4,6)→3, [6,∞)→4. Non-positive/NaN→0. */
export function hoursBucket(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (!(hours > 0)) return 0; // handles 0, negatives, NaN
  if (hours < 2) return 1;
  if (hours < 4) return 2;
  if (hours < 6) return 3;
  return 4;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "hoursBucket"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git diff --cached --name-only   # verify: only these two files
git commit -m "feat(hours): add hoursBucket workday-anchored level helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 2: `sumHoursByDay` helper

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` (append)
- Test: `src/lib/hours/dashboard-utils.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function sumHoursByDay(rows: { entryDate: string; hours: number }[]): Map<string, number>` — sums `hours` per `entryDate`.

- [ ] **Step 1: Write the failing test** — add `sumHoursByDay` to the import.

```ts
it("sumHoursByDay accumulates hours per entryDate", () => {
  const m = sumHoursByDay([
    { entryDate: "2026-07-21", hours: 8 },
    { entryDate: "2026-07-21", hours: 0.5 },
    { entryDate: "2026-07-22", hours: 7.67 },
  ]);
  expect(m.get("2026-07-21")).toBe(8.5);
  expect(m.get("2026-07-22")).toBe(7.67);
  expect(m.size).toBe(2);
});

it("sumHoursByDay returns empty map for empty input", () => {
  expect(sumHoursByDay([]).size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "sumHoursByDay"`
Expected: FAIL — not a function.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/hours/dashboard-utils.ts`

```ts
/** Sum hours per entryDate. Rows need only { entryDate, hours }. */
export function sumHoursByDay(rows: { entryDate: string; hours: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.entryDate, round2((m.get(r.entryDate) ?? 0) + (Number(r.hours) || 0)));
  }
  return m;
}
```

(`round2` already exists at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "sumHoursByDay"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git diff --cached --name-only
git commit -m "feat(hours): add sumHoursByDay per-day aggregator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 3: `trailingRange` helper

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` (append)
- Test: `src/lib/hours/dashboard-utils.test.ts` (append)

**Interfaces:**
- Consumes: `parseLocalDate` (existing), the private `toIso` (existing, in same file).
- Produces: `export function trailingRange(todayIso: string, months: number): { from: string; to: string }` — `to = todayIso`; `from` = the same day-of-month `months` calendar months earlier, clamped down to the last valid day when that month is shorter (no overflow into the wrong month).

- [ ] **Step 1: Write the failing test** — add `trailingRange` to the import.

```ts
it("trailingRange returns a to=today window months back", () => {
  expect(trailingRange("2026-07-30", 3)).toEqual({ from: "2026-04-30", to: "2026-07-30" });
  expect(trailingRange("2026-07-30", 6)).toEqual({ from: "2026-01-30", to: "2026-07-30" });
  expect(trailingRange("2026-07-30", 12)).toEqual({ from: "2025-07-30", to: "2026-07-30" });
});

it("trailingRange clamps to shorter target months (no month overflow)", () => {
  // 3 months before May 31 is Feb 31 → clamp to Feb 28 (2026 not a leap year)
  expect(trailingRange("2026-05-31", 3)).toEqual({ from: "2026-02-28", to: "2026-05-31" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "trailingRange"`
Expected: FAIL — not a function.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/hours/dashboard-utils.ts`

```ts
/**
 * Trailing window ending at `todayIso` (inclusive). `from` is the same day-of-month
 * `months` calendar months earlier, clamped to that month's last day if shorter
 * (e.g. 3 months before 2026-05-31 → 2026-02-28, not an overflowed March date).
 */
export function trailingRange(todayIso: string, months: number): { from: string; to: string } {
  const today = parseLocalDate(todayIso);
  const targetMonthFirst = new Date(today.getFullYear(), today.getMonth() - months, 1);
  const lastDayOfTarget = new Date(
    targetMonthFirst.getFullYear(),
    targetMonthFirst.getMonth() + 1,
    0,
  ).getDate();
  const day = Math.min(today.getDate(), lastDayOfTarget);
  const from = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth(), day);
  return { from: toIso(from), to: todayIso };
}
```

> Note: `toIso` is currently a private (non-exported) function in this file. It is used internally here — no export needed. If a linter flags it as unused elsewhere, it is not; it is already used by `enumerateDays`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "trailingRange"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git diff --cached --name-only
git commit -m "feat(hours): add trailingRange window helper with month-clamp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 4: `buildCalendarWeeks` helper

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` (append)
- Test: `src/lib/hours/dashboard-utils.test.ts` (append)

**Interfaces:**
- Consumes: `enumerateDays` (existing), `parseLocalDate` (existing).
- Produces:
  ```ts
  export type CalendarWeeks = {
    weeks: string[][]; // each inner array has exactly 7 entries, Mon..Sun; "" = padding
    monthLabels: { index: number; label: string }[]; // week-column index → short month name
  };
  export function buildCalendarWeeks(from: string, to: string): CalendarWeeks
  ```
  Days are Mon-first. The first week is top-padded with `""` before `from`'s weekday; the last week is bottom-padded with `""` after `to`. A month label is emitted at the first week-column that contains the 1st day of a month (and at column 0 for the starting month).

- [ ] **Step 1: Write the failing test** — add `buildCalendarWeeks` and type `CalendarWeeks` to the import.

```ts
it("buildCalendarWeeks lays days into Mon-first week columns with padding", () => {
  // 2026-07-01 is a Wednesday; 2026-07-14 is a Tuesday.
  const { weeks } = buildCalendarWeeks("2026-07-01", "2026-07-14");
  // First column: Mon 06-29, Tue 06-30 are BEFORE 'from' → padded "".
  expect(weeks[0]).toEqual(["", "", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]);
  expect(weeks[1]).toEqual(["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"]);
  // Last column: Mon 07-13, Tue 07-14, then padded to 7.
  expect(weeks[2]).toEqual(["2026-07-13", "2026-07-14", "", "", "", "", ""]);
  expect(weeks[2].length).toBe(7);
});

it("buildCalendarWeeks emits a month label at the starting column and at month changes", () => {
  const { monthLabels } = buildCalendarWeeks("2026-06-28", "2026-07-05");
  // 2026-06-28 is a Sunday → week col 0 is all June (28th). Week col 1 starts Mon 06-29 and contains Jul 1.
  expect(monthLabels[0]).toEqual({ index: 0, label: "Jun" });
  expect(monthLabels.some((m) => m.label === "Jul")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "buildCalendarWeeks"`
Expected: FAIL — not a function.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/hours/dashboard-utils.ts`

```ts
export type CalendarWeeks = {
  weeks: string[][]; // 7 entries each (Mon..Sun); "" = padding
  monthLabels: { index: number; label: string }[];
};

/** Mon-first weekday index (0 = Monday .. 6 = Sunday) for a local date. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Arrange the inclusive [from,to] day range into GitHub-style week columns (Mon..Sun),
 * top/bottom padded with "" so every column has 7 cells, plus month labels per column.
 */
export function buildCalendarWeeks(from: string, to: string): CalendarWeeks {
  const days = enumerateDays(from, to);
  if (days.length === 0) return { weeks: [], monthLabels: [] };

  const cells: string[] = [];
  const lead = mondayIndex(parseLocalDate(days[0]));
  for (let i = 0; i < lead; i++) cells.push("");
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push("");

  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabels: { index: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, index) => {
    const firstReal = week.find((c) => c !== "");
    if (!firstReal) return;
    const month = parseLocalDate(firstReal).getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ index, label: parseLocalDate(firstReal).toLocaleDateString(undefined, { month: "short" }) });
      lastMonth = month;
    }
  });

  return { weeks, monthLabels };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts -t "buildCalendarWeeks"`
Expected: PASS. Then run the whole file to confirm no regressions: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git diff --cached --name-only
git commit -m "feat(hours): add buildCalendarWeeks (Mon-first week columns + month labels)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 5: `HoursHeatmapCalendar` component

**Files:**
- Create: `src/components/hours/hours-heatmap-calendar.tsx`

**Interfaces:**
- Consumes: `trailingRange`, `sumHoursByDay`, `hoursBucket`, `buildCalendarWeeks`, `fmtHM`, `formatDayLabel` from `@/lib/hours/dashboard-utils`; `Button` from `@/components/ui/button`; `useQuery` from `@tanstack/react-query`.
- Produces:
  ```ts
  export function HoursHeatmapCalendar(props: {
    selectedDate: string | null;
    onSelectDay: (date: string) => void;
  }): JSX.Element
  ```
  Fetches `/api/hours?from&to` for its own trailing window (owner-only endpoint), reduces to per-day totals, renders the calendar grid. No unit test — verified by dogfood in Task 6.

> This is UI + data-fetching, so there is no failing-unit-test cycle. The check is: it compiles (tsc/next dev), and renders. Write the file, verify it type-checks, commit. Behavioral verification happens in Task 6's dogfood.

- [ ] **Step 1: Create the component file** — `src/components/hours/hours-heatmap-calendar.tsx`

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

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

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
          {/* Month labels row */}
          <div className="flex pl-8">
            {weeks.map((_, i) => (
              <div key={i} className="w-4 shrink-0 text-[9px] leading-none text-muted-foreground">
                {monthLabelAt(i)}
              </div>
            ))}
          </div>
          {/* Weekday labels + week columns */}
          <div className="mt-1 flex">
            <div className="mr-1 flex w-7 shrink-0 flex-col justify-between">
              {WEEKDAY_LABELS.map((d, i) => (
                <div key={i} className="h-3.5 text-[9px] leading-none text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((date, di) => {
                    if (!date) return <div key={di} className="h-3.5 w-3.5" />;
                    const hours = byDay.get(date) ?? 0;
                    const isSelected = date === selectedDate;
                    return (
                      <button
                        key={di}
                        type="button"
                        title={`${formatDayLabel(date)}: ${fmtHM(hours)}`}
                        onClick={() => onSelectDay(date)}
                        className={`h-3.5 w-3.5 rounded-sm border border-stone-200 transition-colors hover:ring-1 hover:ring-brand dark:border-zinc-800 ${
                          isSelected ? "ring-2 ring-brand" : ""
                        }`}
                        style={{ backgroundColor: bucketFill(hoursBucket(hours)) }}
                        aria-label={`${formatDayLabel(date)}: ${fmtHM(hours)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
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

- [ ] **Step 2: Verify it type-checks**

Run (background, slow): `node_modules/.bin/tsc --noEmit`
Expected: no errors referencing `hours-heatmap-calendar.tsx`. (If tsc is too slow, defer to Task 6's dev-server render, which will surface type/compile errors.)

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/components/hours/hours-heatmap-calendar.tsx
git diff --cached --name-only   # verify: only this file
git commit -m "feat(hours): add HoursHeatmapCalendar personal contribution grid

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/hours/hours-heatmap-calendar.tsx
```

---

### Task 6: Wire calendar into `HoursTracker` + dogfood

**Files:**
- Modify: `src/components/hours/hours-tracker.tsx`

**Interfaces:**
- Consumes: `HoursHeatmapCalendar` from `@/components/hours/hours-heatmap-calendar`.
- Produces: no exports; behavioral change only.

Reference points in the current file (as of `origin/main`): the `range` useMemo is at `hours-tracker.tsx:151-155`; the preset buttons are at `:566-587`; the section heading is at `:625-634`; the returned JSX opens at `:452` with the log-form card ending at `:561`.

- [ ] **Step 1: Add import** — near the other imports at the top of `hours-tracker.tsx`.

```tsx
import { HoursHeatmapCalendar } from "@/components/hours/hours-heatmap-calendar";
import { formatDayLabel } from "@/lib/hours/dashboard-utils";
```

- [ ] **Step 2: Add `selectedDate` state + range override.** Add the state next to the `preset` state (~`:149`):

```tsx
const [selectedDate, setSelectedDate] = useState<string | null>(null);
```

Change the `range` useMemo (currently `:151-155`) to let a selected day override the preset:

```tsx
const range = useMemo(() => {
  if (selectedDate) return { from: selectedDate, to: selectedDate };
  if (preset === "month") return month;
  if (preset === "all") return { from: ALL_TIME_FROM, to: isoDate(new Date()) };
  return week;
}, [selectedDate, preset, week, month]);
```

- [ ] **Step 3: Make preset buttons clear the selected day + expand the selected day on select.** Each of the three preset `onClick` handlers (`:566-587`) becomes e.g. `onClick={() => { setPreset("week"); setSelectedDate(null); }}` (and `"month"`, `"all"`). Add a helper used by the calendar callback:

```tsx
function handleSelectDay(date: string) {
  setSelectedDate(date);
  setExpandedDays(new Set([date]));
}
```

- [ ] **Step 4: Mount the calendar at the top of the returned JSX.** Immediately after the opening `<div className="space-y-6">` (`:453`) and BEFORE the log-form card `<div className="flex flex-wrap ...">` (`:454`), insert:

```tsx
<HoursHeatmapCalendar selectedDate={selectedDate} onSelectDay={handleSelectDay} />
```

- [ ] **Step 5: Add the "Showing <day>" chip + single-day heading.** In the presets block (near `:587`, inside the `flex gap-1` row or just after it), add a chip shown only when a day is selected:

```tsx
{selectedDate && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setSelectedDate(null)}
    className="gap-1"
  >
    Showing {formatDayLabel(selectedDate)}
    <X className="h-3 w-3" />
  </Button>
)}
```

Update the section heading (`:625-634`) so a selected day is reflected — add a leading branch:

```tsx
{selectedDate
  ? formatDayLabel(selectedDate)
  : preset === "week"
    ? `This week (${range.from} → ${range.to})`
    : preset === "month"
      ? `This month (${range.from} → ${range.to})`
      : "All records"}
```

(`X` is already imported in this file. `formatDayLabel` is imported in Step 1.)

- [ ] **Step 6: Type-check + run the existing hours tests (no regressions).**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: PASS (all helper tests).
Optionally (background): `node_modules/.bin/tsc --noEmit` — expect no new errors.

- [ ] **Step 7: Commit.**

```bash
cd /Users/manu/MFHub-wt-hours-log-calendar
git add src/components/hours/hours-tracker.tsx
git diff --cached --name-only   # verify: only this file
git commit -m "feat(hours): mount calendar heatmap on /hours-log + click-to-filter day

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/hours/hours-tracker.tsx
```

- [ ] **Step 8: DOGFOOD (user-verified — auth-gated).** Ask the user to run the dev server from the MAIN checkout (`/Users/manu/MFHub`, `PORT=3000 npm run dev`) against this branch, OR review a preview, and confirm on `/hours-log` (team/super-admin account):
  1. Calendar renders under the log form, above the presets.
  2. `3mo / 6mo / 12mo` toggle changes the window; month + weekday labels correct; window total matches.
  3. Hovering a cell shows `"Mon, Jul 21: 8h 15m"`; color darkens with more hours (workday buckets).
  4. Clicking a day → table filters to that date, that day auto-expands, "Showing …" chip appears.
  5. Clicking Clear or any preset resets to the preset view.
  6. Looks correct in BOTH light and dark mode.

  Do not mark the task complete until the user confirms. Fix any issues, re-commit (explicit pathspec), re-verify.

---

## Self-Review

**Spec coverage:** GitHub calendar visual (Tasks 4–5) ✓; own trailing 3/6/12mo window default 3 (Task 3 + 5) ✓; owner-only `/api/hours`, no backend (Task 5) ✓; Mon→Sun (Task 4) ✓; workday buckets `0/<2/2-4/4-6/6+` (Task 1) ✓; daily totals only (Task 2 + 5) ✓; click→filter table to day + auto-expand + chip (Task 6) ✓; placement top above presets (Task 6 Step 4) ✓; brand/color-mix tokens, light+dark (Task 5) ✓; unit tests for the four helpers (Tasks 1–4) ✓; dogfood (Task 6 Step 8) ✓.

**Placeholder scan:** No TBD/TODO; every code step has real code; test bodies are concrete with expected values.

**Type consistency:** `hoursBucket → 0|1|2|3|4` used as `BUCKET_PCT[level]` and `bucketFill(hoursBucket(hours))` ✓. `trailingRange(todayIso, months) → {from,to}` consumed in Task 5 ✓. `buildCalendarWeeks → {weeks: string[][], monthLabels: {index,label}[]}` consumed via `weeks.map`/`monthLabelAt` ✓. `sumHoursByDay → Map<string,number>` consumed via `.get`/`.values` ✓. Query key `["hours", from, to]` matches the table's existing key shape ✓. `handleSelectDay`/`setSelectedDate`/`setExpandedDays` all defined in Task 6 ✓.
