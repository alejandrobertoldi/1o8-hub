# Hours Day-Level Drill (Layer 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-day (Layer 2) drill under the existing member/client rows of the super-admin hours dashboard's summary table.

**Architecture:** Keep `/api/hours/summary` lean; add a new gated `/api/hours/drill` endpoint that returns per-day hours for one member×client cell, fetched lazily (and cached by React Query) only when that cell is expanded. Add two pure date helpers with unit tests; wire a `DayDrillRows` child component into both pivot tables.

**Tech Stack:** Next.js 16 App Router route handler, Drizzle ORM (Postgres/Supabase), NextAuth session, TanStack React Query, Vitest, Tailwind + shadcn/ui.

## Global Constraints

- DEV DB **is** PROD Supabase — reads only; additive; **no** schema change, **no** migration, **no** DB write anywhere in this plan.
- `npm run build` is the TS gate (Vitest does not typecheck) — run it before claiming TS compiles.
- Brand color is Burnt Orange `#FF751F` = `--brand`/`text-brand`; there is no "red". Errors use the existing `text-destructive`.
- Auth gate on the new endpoint must be byte-for-byte the same as `/api/hours/summary`: `401` if no session, `403` unless `session.user.isSuperAdmin`.
- Stage explicit files only — **never** `git add .`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Format hours with the existing `fmtNum`; format dates with the new `formatDayLabel`.

---

### Task 1: Pure date helpers + `DrillDay` type (TDD)

**Files:**
- Modify: `src/lib/hours/dashboard-utils.ts` (append helpers)
- Test: `src/lib/hours/dashboard-utils.test.ts` (append cases)

**Interfaces:**
- Produces: `type DrillDay = { entryDate: string; hours: number }`; `parseLocalDate(entryDate: string): Date`; `formatDayLabel(entryDate: string): string`. Consumed by Task 3 (component) and shape-shared with Task 2 (endpoint response).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/hours/dashboard-utils.test.ts`. Also add `parseLocalDate, formatDayLabel` to the existing import from `./dashboard-utils` on line 2.

```ts
it("parseLocalDate builds a local-midnight date matching the input components (no UTC off-by-one)", () => {
  const d = parseLocalDate("2026-07-21");
  expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 21]);
});

it("formatDayLabel renders a non-empty label containing the day of month", () => {
  const label = formatDayLabel("2026-07-21");
  expect(label.length).toBeGreaterThan(0);
  expect(label).toContain("21");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: FAIL — `parseLocalDate is not a function` / `formatDayLabel is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/hours/dashboard-utils.ts`:

```ts
export type DrillDay = { entryDate: string; hours: number };

/**
 * Parse a YYYY-MM-DD string as a LOCAL calendar date (not UTC). Avoids the
 * off-by-one where `new Date("2026-07-21")` is UTC midnight and renders as the
 * previous day in negative-offset timezones.
 */
export function parseLocalDate(entryDate: string): Date {
  const [y, m, d] = entryDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Compact day label in the viewer's locale, e.g. "Mon, Jul 21". */
export function formatDayLabel(entryDate: string): string {
  return parseLocalDate(entryDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: PASS (all cases, existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git commit -m "feat(hours): day-drill date helpers + DrillDay type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `drillDays` query + gated `/api/hours/drill` endpoint

**Files:**
- Modify: `src/lib/hours/queries.ts` (append `drillDays`)
- Create: `src/app/api/hours/drill/route.ts`

**Interfaces:**
- Consumes: `isValidDateString` from `@/lib/hours/validation`; `getAuthSession` from `@/lib/auth-db`; `session.user.isSuperAdmin`.
- Produces: `drillDays(from, to, userId, clientIdCode)` returning rows `{ entryDate: string; hours: string }[]`; endpoint `GET /api/hours/drill` returning `{ days: { entryDate: string; hours: number }[] }`. Consumed by Task 3.

> No unit test here: the query hits the PROD Supabase DB, so it is proven by `npm run build` (Task 4) plus manual dogfood — not by an automated test that would read prod. This is intentional, not an omitted test.

- [ ] **Step 1: Append `drillDays` to `src/lib/hours/queries.ts`**

`and, asc, eq, gte, lte, sql` are already imported at the top of the file — no new imports needed.

```ts
export function drillDays(from: string, to: string, userId: string, clientIdCode: string) {
  return db
    .select({
      entryDate: timeEntries.entryDate,
      hours: sql<string>`sum(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        eq(timeEntries.clientIdCode, clientIdCode),
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to)
      )
    )
    .groupBy(timeEntries.entryDate)
    .orderBy(asc(timeEntries.entryDate));
}
```

- [ ] **Step 2: Create `src/app/api/hours/drill/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isValidDateString } from "@/lib/hours/validation";
import { drillDays } from "@/lib/hours/queries";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const userId = sp.get("userId");
  const clientIdCode = sp.get("clientIdCode");

  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (!userId || !clientIdCode) {
    return NextResponse.json(
      { error: "userId and clientIdCode are required" },
      { status: 400 }
    );
  }

  const rows = await drillDays(from, to, userId, clientIdCode);
  const days = rows.map((r) => ({
    entryDate: r.entryDate,
    hours: Math.round(Number(r.hours) * 100) / 100,
  }));
  return NextResponse.json({ days });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: build completes with no TypeScript errors (the new route and query compile).

- [ ] **Step 4: Commit**

```bash
git add src/lib/hours/queries.ts src/app/api/hours/drill/route.ts
git commit -m "feat(hours): gated per-day drill query + /api/hours/drill endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `DayDrillRows` + Layer-2 expand in both pivot tables

**Files:**
- Modify: `src/components/admin/hours-dashboard.tsx`

**Interfaces:**
- Consumes: `DrillDay`, `formatDayLabel` (Task 1); `GET /api/hours/drill` (Task 2); existing `fmtNum`, `clientLabel`, `Fragment`, `ChevronDown`, `ChevronRight`, `useQuery`, `useState`, `Table*` cells.
- Produces: no exports; internal `DayDrillRows` component + `expandedDays` state.

- [ ] **Step 1: Extend the imports**

Change the `react` import (currently line 3) to also pull `ReactNode` (the `row` helper in Step 2 needs it; the `React` namespace is NOT in scope under this file's JSX transform):

```tsx
import { Fragment, useMemo, useState, type ReactNode } from "react";
```

Change the dashboard-utils import block (currently lines 18–26) to also pull the new symbols:

```tsx
import {
  clientLabel,
  computeKpis,
  topMembers,
  topClients,
  buildHeatmap,
  filterSummary,
  formatDayLabel,
  type Summary,
  type DrillDay,
} from "@/lib/hours/dashboard-utils";
```

- [ ] **Step 2: Add the `DayDrillRows` child component**

Add this function just above `export function HoursDashboard()` (after the `MultiSelect` component). It owns its own query so re-expanding hits the React Query cache; it is a component (not an inline map) because hooks cannot run inside `.map`.

```tsx
function DayDrillRows({
  from,
  to,
  userId,
  clientIdCode,
}: {
  from: string;
  to: string;
  userId: string;
  clientIdCode: string;
}) {
  const { data, isLoading, error } = useQuery<{ days: DrillDay[] }>({
    queryKey: ["hours-drill", from, to, userId, clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/hours/drill?from=${from}&to=${to}&userId=${encodeURIComponent(userId)}&clientIdCode=${encodeURIComponent(clientIdCode)}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load days");
      return res.json();
    },
  });

  const row = (content: ReactNode, right?: ReactNode, tone = "text-muted-foreground") => (
    <TableRow className="bg-muted/20">
      <TableCell />
      <TableCell className={`pl-14 text-xs ${tone}`}>{content}</TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">{right}</TableCell>
    </TableRow>
  );

  if (isLoading) return row("Loading…");
  if (error) return row((error as Error).message, undefined, "text-destructive");

  const days = data?.days ?? [];
  if (days.length === 0) return row("No entries");

  return (
    <>
      {days.map((d) => (
        <TableRow key={d.entryDate} className="bg-muted/20">
          <TableCell />
          <TableCell className="pl-14 text-xs text-muted-foreground">{formatDayLabel(d.entryDate)}</TableCell>
          <TableCell className="text-right text-xs text-muted-foreground">{fmtNum(d.hours)}h</TableCell>
        </TableRow>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Add `expandedDays` state + `toggleDay`**

Inside `HoursDashboard`, just after the existing `const [expanded, setExpanded] = useState<Set<string>>(new Set());` (line 114):

```tsx
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
```

And just after the existing `toggle` function (ends line 145), add:

```tsx
  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
```

- [ ] **Step 4: Wire Layer 2 into the `pivot === "client"` table**

Replace the L1 member block (currently lines 345–352, the `{expanded.has(c.clientIdCode) && c.members.map(...)}`) with:

```tsx
                    {expanded.has(c.clientIdCode) &&
                      c.members.map((m) => {
                        const dayKey = `${m.userId}|${c.clientIdCode}`;
                        const open = expandedDays.has(dayKey);
                        return (
                          <Fragment key={dayKey}>
                            <TableRow className="cursor-pointer bg-muted/40" onClick={() => toggleDay(dayKey)}>
                              <TableCell />
                              <TableCell className="pl-8 text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  {m.name ?? m.userId}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">{fmtNum(m.hours)}h</TableCell>
                            </TableRow>
                            {open && <DayDrillRows from={from} to={to} userId={m.userId} clientIdCode={c.clientIdCode} />}
                          </Fragment>
                        );
                      })}
```

- [ ] **Step 5: Wire Layer 2 into the `pivot === "member"` table**

Replace the L1 client block (currently lines 380–391, the `{expanded.has(m.userId) && m.clients.map(...)}`) with:

```tsx
                    {expanded.has(m.userId) &&
                      m.clients.map((c) => {
                        const dayKey = `${m.userId}|${c.clientIdCode}`;
                        const open = expandedDays.has(dayKey);
                        return (
                          <Fragment key={dayKey}>
                            <TableRow className="cursor-pointer bg-muted/40" onClick={() => toggleDay(dayKey)}>
                              <TableCell />
                              <TableCell className="pl-8 text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  <span className={c.clientIdCode === "INTERNAL" ? "font-medium text-brand" : undefined}>
                                    {clientLabel(c.clientIdCode)}
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">{fmtNum(c.hours)}h</TableCell>
                            </TableRow>
                            {open && <DayDrillRows from={from} to={to} userId={m.userId} clientIdCode={c.clientIdCode} />}
                          </Fragment>
                        );
                      })}
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/hours-dashboard.tsx
git commit -m "feat(hours): per-day Layer-2 drill in the summary table (both pivots)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the hours unit tests**

Run: `npx vitest run src/lib/hours/`
Expected: PASS (validation + dashboard-utils, including the two new cases).

- [ ] **Step 2: Run the TS/build gate**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Manual dogfood (dev server on PORT 3000, super-admin logged in)**

Verify:
- pivot = **client**: expand a client → expand a member → per-day rows appear, dates read correctly (no off-by-one), day hours sum to the member row's total.
- pivot = **member**: expand a member → expand a client → per-day rows appear identically.
- Collapse and re-expand the same cell → no second network request (React Query cache).
- A plain admin (non-super) hitting `/api/hours/drill?...` gets `403`.

- [ ] **Step 4: Report** results (PASS/FAIL with evidence). No commit — verification only.
</content>
</invoke>
