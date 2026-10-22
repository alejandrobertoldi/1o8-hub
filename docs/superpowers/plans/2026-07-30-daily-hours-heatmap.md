# Daily Hours Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second heatmap to the hours dashboard showing per-day hours, with rows toggling between members and clients and a bottom "All" per-day total.

**Architecture:** Pure reshaping/formatting logic lives in `src/lib/hours/dashboard-utils.ts` (unit-tested, matching how the existing dashboard helpers are tested). A thin Drizzle query `summaryByDay` in `queries.ts` feeds a new `/api/hours/summary/daily` route (tested by mocking the query, like the existing summary route). A new client component `daily-hours-heatmap.tsx` fetches that route via react-query and renders using the same grid/color/legend primitives as the existing Member × client heatmap. It is mounted in `hours-dashboard.tsx` below the existing heatmap.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM (PostgreSQL/Supabase), @tanstack/react-query, Tailwind v4, Vitest 4.

## Global Constraints

- Branch `feat/hours-daily-heatmap`, worktree `/Users/manu/MFHub-wt-hours-daily-heatmap` (off `origin/feat/hours-category-filter`). Never edit the main working tree.
- DB reads only — no schema change, no migration, additive-only (dev DB IS prod Supabase).
- Category filter reuses the existing pattern: `categories && categories.length ? inArray(timeEntries.category, categories) : undefined`.
- Tests: `node_modules/.bin/vitest run <path>` (node_modules is symlinked into the worktree). Typecheck: `node_modules/.bin/tsc --noEmit` (SLOW ~2min, run in background). NEVER `next build`.
- One task per commit. Explicit pathspec on `git add` AND `git commit`. Keep `graphify-out/*` OUT of commits. Commit flag order: `-m "msg"` BEFORE `-- <pathspec>`.
- Trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Component is auth-gated/super-admin only → final visual verification is a user dogfood, not an automated assertion.

## File Structure

- Modify `src/lib/hours/dashboard-utils.ts` — export `fmtHM` (moved from the component), add `enumerateDays`, `buildDayHeatmap`, and the `DayRow`/`DayHeatmap` types.
- Modify `src/lib/hours/dashboard-utils.test.ts` — tests for the three new/moved helpers.
- Modify `src/lib/hours/queries.ts` — add `summaryByDay` query.
- Create `src/app/api/hours/summary/daily/route.ts` — new GET route.
- Create `src/app/api/hours/summary/daily/route.test.ts` — route tests (mock `summaryByDay`).
- Create `src/components/admin/daily-hours-heatmap.tsx` — the heatmap component.
- Modify `src/components/admin/hours-dashboard.tsx` — remove local `fmtHM` (import from utils), mount the new component.

---

### Task 1: Pure helper `enumerateDays` in dashboard-utils

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts`
- Test: `src/lib/hours/dashboard-utils.test.ts`

**Interfaces:**
- Produces: `export function enumerateDays(from: string, to: string): string[]` — inclusive list of `YYYY-MM-DD` from `from` to `to`; `[]` when `from > to`. Uses local dates (no UTC drift), consistent with `parseLocalDate`.

- [ ] **Step 1: Write the failing test** — append to `dashboard-utils.test.ts`:

```ts
describe("enumerateDays", () => {
  it("lists inclusive days in a range", () => {
    expect(enumerateDays("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01", "2026-07-02", "2026-07-03",
    ]);
  });
  it("returns a single day when from === to", () => {
    expect(enumerateDays("2026-07-05", "2026-07-05")).toEqual(["2026-07-05"]);
  });
  it("crosses month boundaries", () => {
    expect(enumerateDays("2026-07-30", "2026-08-01")).toEqual([
      "2026-07-30", "2026-07-31", "2026-08-01",
    ]);
  });
  it("returns [] when from is after to", () => {
    expect(enumerateDays("2026-07-05", "2026-07-01")).toEqual([]);
  });
});
```

Add `enumerateDays` to the existing top-of-file import from `./dashboard-utils`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: FAIL — `enumerateDays is not a function` / import error.

- [ ] **Step 3: Write minimal implementation** — add to `dashboard-utils.ts` (reuse the existing `parseLocalDate` + an `isoDate` local helper):

```ts
function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function enumerateDays(from: string, to: string): string[] {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  const out: string[] = [];
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toIso(d));
  }
  return out;
}
```

(If a local `isoDate`/`toIso` already exists in the file, reuse it instead of redefining.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git commit -m "feat(hours): enumerateDays helper for daily heatmap axis

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
```

---

### Task 2: Pure helper `buildDayHeatmap` + `fmtHM` move in dashboard-utils

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts`
- Test: `src/lib/hours/dashboard-utils.test.ts`

**Interfaces:**
- Consumes: `enumerateDays` output (a `days: string[]`).
- Produces:
  ```ts
  export type DayRow = { key: string; keyName: string | null; entryDate: string; totalHours: string };
  export type DayHeatmap = {
    keys: { key: string; keyName: string | null }[]; // sorted by row total desc
    cell: (key: string, date: string) => number;
    dayTotal: (date: string) => number;
    maxCell: number;      // max single cell, floored at 1
    maxDayTotal: number;  // max per-day total, floored at 1
  };
  export function buildDayHeatmap(rows: DayRow[], days: string[]): DayHeatmap;
  export function fmtHM(hours: number): string; // "HHh MMm", minutes zero-padded
  ```

- [ ] **Step 1: Write the failing test** — append to `dashboard-utils.test.ts`:

```ts
describe("fmtHM", () => {
  it("formats decimal hours as HHh MMm, zero-padded minutes", () => {
    expect(fmtHM(26.73)).toBe("26h 44m");
    expect(fmtHM(2)).toBe("2h 00m");
    expect(fmtHM(0)).toBe("0h 00m");
  });
});

describe("buildDayHeatmap", () => {
  const days = ["2026-07-01", "2026-07-02"];
  const rows = [
    { key: "u1", keyName: "Ana", entryDate: "2026-07-01", totalHours: "4.00" },
    { key: "u1", keyName: "Ana", entryDate: "2026-07-02", totalHours: "1.50" },
    { key: "u2", keyName: "Bo", entryDate: "2026-07-01", totalHours: "8.00" },
  ];

  it("sorts keys by total hours desc and carries keyName", () => {
    const h = buildDayHeatmap(rows, days);
    expect(h.keys).toEqual([
      { key: "u2", keyName: "Bo" },
      { key: "u1", keyName: "Ana" },
    ]);
  });
  it("cell returns hours for a key+date, 0 when absent", () => {
    const h = buildDayHeatmap(rows, days);
    expect(h.cell("u1", "2026-07-01")).toBe(4);
    expect(h.cell("u2", "2026-07-02")).toBe(0);
  });
  it("dayTotal sums all keys for a date", () => {
    const h = buildDayHeatmap(rows, days);
    expect(h.dayTotal("2026-07-01")).toBe(12);
    expect(h.dayTotal("2026-07-02")).toBe(1.5);
  });
  it("exposes maxCell and maxDayTotal floored at 1", () => {
    expect(buildDayHeatmap(rows, days).maxCell).toBe(8);
    expect(buildDayHeatmap(rows, days).maxDayTotal).toBe(12);
    expect(buildDayHeatmap([], days).maxCell).toBe(1);
    expect(buildDayHeatmap([], days).maxDayTotal).toBe(1);
  });
});
```

Add `buildDayHeatmap`, `fmtHM`, and `type DayRow` to the top-of-file import.

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: FAIL — `buildDayHeatmap`/`fmtHM` not exported.

- [ ] **Step 3: Write minimal implementation** — add to `dashboard-utils.ts`:

```ts
export function fmtHM(hours: number): string {
  const totalMinutes = Math.round((hours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export type DayRow = { key: string; keyName: string | null; entryDate: string; totalHours: string };
export type DayHeatmap = {
  keys: { key: string; keyName: string | null }[];
  cell: (key: string, date: string) => number;
  dayTotal: (date: string) => number;
  maxCell: number;
  maxDayTotal: number;
};

export function buildDayHeatmap(rows: DayRow[], days: string[]): DayHeatmap {
  const dayset = new Set(days);
  const byKey = new Map<string, { keyName: string | null; total: number; cells: Map<string, number> }>();
  const dayTotals = new Map<string, number>();
  let maxCell = 0;

  for (const r of rows) {
    if (!dayset.has(r.entryDate)) continue;
    const hours = Number(r.totalHours);
    let entry = byKey.get(r.key);
    if (!entry) {
      entry = { keyName: r.keyName, total: 0, cells: new Map() };
      byKey.set(r.key, entry);
    }
    entry.total += hours;
    entry.cells.set(r.entryDate, (entry.cells.get(r.entryDate) ?? 0) + hours);
    dayTotals.set(r.entryDate, (dayTotals.get(r.entryDate) ?? 0) + hours);
    if (entry.cells.get(r.entryDate)! > maxCell) maxCell = entry.cells.get(r.entryDate)!;
  }

  const keys = [...byKey.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, v]) => ({ key, keyName: v.keyName }));
  const maxDayTotal = Math.max(1, ...[...dayTotals.values()]);

  return {
    keys,
    cell: (key, date) => byKey.get(key)?.cells.get(date) ?? 0,
    dayTotal: (date) => dayTotals.get(date) ?? 0,
    maxCell: Math.max(1, maxCell),
    maxDayTotal,
  };
}
```

Then in `hours-dashboard.tsx`: delete the local `function fmtHM(...)` definition and add `fmtHM` to the existing `@/lib/hours/dashboard-utils` import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: PASS. Also start a background typecheck: `node_modules/.bin/tsc --noEmit` (verify no new errors from the `fmtHM` move).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts src/components/admin/hours-dashboard.tsx
git commit -m "feat(hours): buildDayHeatmap + shared fmtHM for daily heatmap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts src/components/admin/hours-dashboard.tsx
```

---

### Task 3: `summaryByDay` query

**Files:**
- Modify: `src/lib/hours/queries.ts`

**Interfaces:**
- Consumes: `timeEntries`, `users` schema; `and/asc/eq/gte/lte/inArray/sql` (already imported).
- Produces: `export function summaryByDay(from: string, to: string, dimension: "member" | "client", categories?: string[])` returning rows shaped `{ key: string; keyName: string | null; entryDate: string; totalHours: string }`.

- [ ] **Step 1: Add the query** (thin Drizzle builder — no direct unit test, consistent with `summaryRows`/`drillDays`; covered via the route test in Task 4):

```ts
export function summaryByDay(
  from: string,
  to: string,
  dimension: "member" | "client",
  categories?: string[],
) {
  const catCond =
    categories && categories.length ? inArray(timeEntries.category, categories) : undefined;

  if (dimension === "client") {
    return db
      .select({
        key: timeEntries.clientIdCode,
        keyName: sql<string | null>`${timeEntries.clientIdCode}`,
        entryDate: timeEntries.entryDate,
        totalHours: sql<string>`sum(${timeEntries.hours})`,
      })
      .from(timeEntries)
      .where(and(gte(timeEntries.entryDate, from), lte(timeEntries.entryDate, to), catCond))
      .groupBy(timeEntries.clientIdCode, timeEntries.entryDate)
      .orderBy(asc(timeEntries.entryDate));
  }

  return db
    .select({
      key: timeEntries.userId,
      keyName: users.name,
      entryDate: timeEntries.entryDate,
      totalHours: sql<string>`sum(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(and(gte(timeEntries.entryDate, from), lte(timeEntries.entryDate, to), catCond))
    .groupBy(timeEntries.userId, users.name, timeEntries.entryDate)
    .orderBy(asc(timeEntries.entryDate));
}
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` (background). Expected: no new errors (both branches share the `{ key, keyName, entryDate, totalHours }` shape).

- [ ] **Step 3: Commit**

```bash
git add src/lib/hours/queries.ts
git commit -m "feat(hours): summaryByDay query (member|client x day, category-aware)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/queries.ts
```

---

### Task 4: `/api/hours/summary/daily` route

**Files:**
- Create: `src/app/api/hours/summary/daily/route.ts`
- Test: `src/app/api/hours/summary/daily/route.test.ts`

**Interfaces:**
- Consumes: `summaryByDay` (Task 3), `getAuthSession`, `isValidDateString`.
- Produces: `GET(req: NextRequest)` returning `{ dimension: "member"|"client", rows: DayRow[] }`; 401 unauth, 403 non-super-admin, 400 bad range.

- [ ] **Step 1: Write the failing test** — `src/app/api/hours/summary/daily/route.test.ts` (mirrors `../route.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({ summaryByDay: vi.fn() }));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { summaryByDay } from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function req(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/hours/summary/daily");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const RANGE = { from: "2026-07-01", to: "2026-07-31" };

describe("GET /api/hours/summary/daily", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await GET(req(RANGE))).status).toBe(401);
  });

  it("403 for non-super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", isSuperAdmin: false } });
    expect((await GET(req(RANGE))).status).toBe(403);
  });

  it("400 with missing/invalid range", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", isSuperAdmin: true } });
    expect((await GET(req({ from: "2026-07-01" }))).status).toBe(400);
  });

  it("defaults dimension to member and returns rows", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", isSuperAdmin: true } });
    asMock(summaryByDay).mockResolvedValue([
      { key: "u1", keyName: "Ana", entryDate: "2026-07-01", totalHours: "4.00" },
    ]);
    const res = await GET(req(RANGE));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dimension).toBe("member");
    expect(summaryByDay).toHaveBeenCalledWith("2026-07-01", "2026-07-31", "member", []);
    expect(json.rows).toEqual([
      { key: "u1", keyName: "Ana", entryDate: "2026-07-01", totalHours: "4.00" },
    ]);
  });

  it("passes dimension=client and category filters through", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", isSuperAdmin: true } });
    asMock(summaryByDay).mockResolvedValue([]);
    await GET(req({ ...RANGE, dimension: "client" }));
    expect(summaryByDay).toHaveBeenCalledWith("2026-07-01", "2026-07-31", "client", []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/app/api/hours/summary/daily/route.test.ts`
Expected: FAIL — `./route` has no `GET`.

- [ ] **Step 3: Write minimal implementation** — `src/app/api/hours/summary/daily/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isValidDateString } from "@/lib/hours/validation";
import { summaryByDay } from "@/lib/hours/queries";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const dimension = req.nextUrl.searchParams.get("dimension") === "client" ? "client" : "member";
  const categories = req.nextUrl.searchParams.getAll("category");

  const rows = await summaryByDay(from, to, dimension, categories);

  return NextResponse.json({
    dimension,
    rows: rows.map((r) => ({
      key: r.key,
      keyName: r.keyName,
      entryDate: r.entryDate,
      totalHours: r.totalHours,
    })),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/app/api/hours/summary/daily/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/hours/summary/daily/route.ts src/app/api/hours/summary/daily/route.test.ts
git commit -m "feat(hours): GET /api/hours/summary/daily route (super-admin gated)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/app/api/hours/summary/daily/route.ts src/app/api/hours/summary/daily/route.test.ts
```

---

### Task 5: `DailyHoursHeatmap` component

**Files:**
- Create: `src/components/admin/daily-hours-heatmap.tsx`

**Interfaces:**
- Consumes: `enumerateDays`, `buildDayHeatmap`, `fmtHM`, `clientLabel`, `buildCategoryQuery`, `formatDayLabel`, `type DayRow` from `@/lib/hours/dashboard-utils`; `/api/hours/summary/daily`.
- Produces: `export function DailyHoursHeatmap(props: { from: string; to: string; categories: string[]; clientNameMap: Map<string, string> })`.

- [ ] **Step 1: Write the component** (no unit test — client component verified by dogfood, consistent with the existing heatmap having no component test):

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import {
  clientLabel,
  buildCategoryQuery,
  enumerateDays,
  buildDayHeatmap,
  fmtHM,
  formatDayLabel,
  type DayRow,
} from "@/lib/hours/dashboard-utils";

const CARD = "rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800";

export function DailyHoursHeatmap({
  from,
  to,
  categories,
  clientNameMap,
}: {
  from: string;
  to: string;
  categories: string[];
  clientNameMap: Map<string, string>;
}) {
  const [dimension, setDimension] = useState<"member" | "client">("member");

  const { data } = useQuery({
    queryKey: ["hours-daily", from, to, dimension, categories],
    queryFn: async () => {
      const res = await fetch(
        `/api/hours/summary/daily?from=${from}&to=${to}&dimension=${dimension}${buildCategoryQuery(categories)}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load daily hours");
      return res.json() as Promise<{ dimension: string; rows: DayRow[] }>;
    },
  });

  const days = enumerateDays(from, to);
  const h = buildDayHeatmap(data?.rows ?? [], days);
  if (days.length === 0) return null;

  const labelFor = (key: string, keyName: string | null) =>
    dimension === "client" ? clientNameMap.get(key) ?? clientLabel(key) : keyName ?? key;

  const fill = (v: number, max: number) =>
    v > 0 ? `color-mix(in srgb, var(--brand) ${Math.round((v / max) * 100)}%, transparent)` : "transparent";

  return (
    <div className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Daily hours</div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-stone-200 p-0.5 text-xs dark:border-zinc-800">
            {(["member", "client"] as const).map((d) => (
              <Button
                key={d}
                variant={dimension === d ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setDimension(d)}
              >
                {d === "member" ? "Members" : "Clients"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{fmtHM(0)}</span>
            <div
              className="h-2 w-24 rounded"
              style={{ background: "linear-gradient(to right, color-mix(in srgb, var(--brand) 6%, transparent), var(--brand))" }}
            />
            <span className="tabular-nums">{fmtHM(h.maxCell)}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid w-full gap-1 text-xs"
          style={{ gridTemplateColumns: `minmax(120px, max-content) repeat(${days.length}, minmax(2.75rem, 1fr))` }}
        >
          <div />
          {days.map((d) => (
            <div key={d} className="flex flex-col items-center justify-end gap-0.5 px-0.5 pb-1 text-center text-[9px] font-semibold leading-tight text-muted-foreground" title={d}>
              {formatDayLabel(d)}
            </div>
          ))}

          {h.keys.map((row) => (
            <Fragment key={row.key}>
              <div className="truncate pr-2 text-[11px] font-medium text-muted-foreground" title={labelFor(row.key, row.keyName)}>
                {labelFor(row.key, row.keyName)}
              </div>
              {days.map((d) => {
                const v = h.cell(row.key, d);
                return (
                  <div
                    key={d}
                    title={`${labelFor(row.key, row.keyName)} · ${d}: ${fmtHM(v)}`}
                    className="flex h-8 items-center justify-center rounded border border-stone-200 text-[9px] font-medium tabular-nums text-foreground/80 dark:border-zinc-800"
                    style={{ backgroundColor: fill(v, h.maxCell) }}
                  >
                    {v > 0 ? fmtHM(v) : ""}
                  </div>
                );
              })}
            </Fragment>
          ))}

          {/* All (per-day total) row — own scale so it doesn't wash out the cells above */}
          <div className="truncate pr-2 text-[11px] font-semibold text-foreground">All</div>
          {days.map((d) => {
            const v = h.dayTotal(d);
            return (
              <div
                key={d}
                title={`All · ${d}: ${fmtHM(v)}`}
                className="flex h-8 items-center justify-center rounded border border-stone-300 text-[9px] font-semibold tabular-nums text-foreground dark:border-zinc-700"
                style={{ backgroundColor: fill(v, h.maxDayTotal) }}
              >
                {v > 0 ? fmtHM(v) : ""}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` (background). Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/daily-hours-heatmap.tsx
git commit -m "feat(hours): DailyHoursHeatmap component (member/client x day + All row)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/admin/daily-hours-heatmap.tsx
```

---

### Task 6: Mount in the dashboard + verify

**Files:**
- Modify: `src/components/admin/hours-dashboard.tsx`

**Interfaces:**
- Consumes: `DailyHoursHeatmap` (Task 5); existing `from`, `to`, `categoryFilter`, `clientNameMap` in `HoursDashboard`.

- [ ] **Step 1: Import the component** — add near the existing component imports:

```tsx
import { DailyHoursHeatmap } from "@/components/admin/daily-hours-heatmap";
```

- [ ] **Step 2: Mount below the Member × client heatmap** — immediately after the closing of the `{/* Member × client heatmap */}` block (currently ends ~L504), add:

```tsx
<DailyHoursHeatmap from={from} to={to} categories={categoryFilter} clientNameMap={clientNameMap} />
```

- [ ] **Step 3: Full test + typecheck**

Run: `node_modules/.bin/vitest run src/lib/hours src/app/api/hours` — Expected: PASS.
Run: `node_modules/.bin/tsc --noEmit` (background) — Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/hours-dashboard.tsx
git commit -m "feat(hours): mount DailyHoursHeatmap under member x client heatmap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/admin/hours-dashboard.tsx
```

- [ ] **Step 5: User dogfood (auth-gated)**

Ask the user to open the hours dashboard as super-admin, pick a date range, and confirm: the "Daily hours" card renders below the existing heatmap; the Members/Clients toggle switches rows; columns are the days of the range and scroll horizontally when wide; the category filter narrows both heatmaps; the bottom "All" row shows per-day totals. Fix any visual issues reported before considering the feature done.

---

## Self-Review

**Spec coverage:**
- Second heatmap, days as columns, scroll → Task 5 (grid + `overflow-x-auto`, `enumerateDays`). ✅
- Rows toggle members/clients → Task 5 (`dimension` state + toggle). ✅
- Cell = row-entity hours that day → Tasks 2/3 (`buildDayHeatmap`/`summaryByDay`). ✅
- Bottom "All" per-day total row → Tasks 2 (`dayTotal`) + 5 (render, own scale). ✅
- Same page, shared date range + category filter, local toggle → Task 6 (props) + 5. ✅
- New endpoint → Task 4. ✅
- Reuse orange scale/`fmtHM`/legend/naming → Tasks 2/5 (`fmtHM`, `color-mix`, `clientLabel`). ✅
- Tests: query pure-logic + route → Tasks 1,2,4. Component → dogfood (Task 6). ✅

**Placeholder scan:** No TBD/TODO; every code step has concrete content.

**Type consistency:** `DayRow { key, keyName, entryDate, totalHours }` is identical across Tasks 2 (type), 3 (query select), 4 (route/test), 5 (fetch). `DayHeatmap` members (`keys`, `cell`, `dayTotal`, `maxCell`, `maxDayTotal`) used consistently in Tasks 2 and 5. `dimension: "member"|"client"` consistent across Tasks 3/4/5.
