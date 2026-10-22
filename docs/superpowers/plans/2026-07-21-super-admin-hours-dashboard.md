# Super-admin Hours Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a super-admin capability flag, restrict the admin hours overview to super admins, and replace the plain hours table with a charted dashboard to navigate hours by member or client.

**Architecture:** "Super admin" is a boolean capability (`users.is_super_admin`) layered on top of `role === "admin"` — orthogonal, so the ~177 existing admin checks are untouched. The flag rides the NextAuth JWT into `session.user.isSuperAdmin`. The hours overview tab and `GET /api/hours/summary` re-gate to that flag. The dashboard reuses the existing summary payload; pure aggregation helpers are extracted for testability and rendered with recharts (already a dependency).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Drizzle ORM (Postgres/Supabase), NextAuth v5, Tailwind v4 + shadcn/ui, recharts ^3.8.1, Vitest 4.

## Global Constraints

- DEV DB **is** PROD Supabase. Schema changes are additive-only, run manually, never `drizzle-migrate`. Never drop the `end>start` CHECK.
- Two PROD writes require explicit per-action user OK before running: `ALTER TABLE users ADD COLUMN is_super_admin ...` and the bootstrap `UPDATE`. Code is written/built first; DB writes happen only on approval.
- `npm run build` is the TypeScript gate (vitest/esbuild does NOT typecheck). Run it before claiming TS compiles.
- Brand color is Burnt Orange `#FF751F` = `--brand`/`text-brand`. There is no "red". `INTERNAL` client code renders as "MarketFoundry".
- Stage explicit files only; never `git add .` (working tree has ~40 unrelated `.claude/` edits). Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch: `feat/super-admin-hours-dashboard`. Never push/PR/merge without explicit OK.

---

### Task 1: Add `is_super_admin` column to the users schema

**Files:**
- Modify: `src/lib/db/schema.ts` (users table, ~line 96-100)
- Create: `drizzle/manual/2026-07-21-add-is-super-admin.sql` (documented additive DDL — NOT auto-run)

**Interfaces:**
- Produces: `users.isSuperAdmin` Drizzle column (boolean, not null, default false).

- [ ] **Step 1: Add the column to the Drizzle table**

In `src/lib/db/schema.ts`, ensure `boolean` is imported from `drizzle-orm/pg-core` (add it to the existing import list if missing). In the `users` table definition, add after the `role` column:

```ts
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
```

- [ ] **Step 2: Write the manual DDL file (for approved manual run)**

Create `drizzle/manual/2026-07-21-add-is-super-admin.sql`:

```sql
-- Additive, non-destructive. Run manually against PROD ONLY after explicit approval.
-- Do NOT run via drizzle-migrate.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Bootstrap the first super admin (separate approval):
-- UPDATE users SET is_super_admin = true WHERE email = 'amazon.seo@1o8.agency';
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: exit 0 (schema type resolves; no drizzle-migrate invoked).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/manual/2026-07-21-add-is-super-admin.sql
git commit -m "feat(users): add is_super_admin column (schema + manual DDL)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Propagate `isSuperAdmin` through auth into the session

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/lib/auth.ts:26-53` (jwt callback) and `:56-95` (session callback)

**Interfaces:**
- Consumes: `users.isSuperAdmin` (Task 1).
- Produces: `session.user.isSuperAdmin: boolean` (defaults false).

- [ ] **Step 1: Extend the Session type**

In `src/types/next-auth.d.ts`, inside `interface Session { user: { ... } }`, add after the `role` line:

```ts
      isSuperAdmin: boolean;
```

- [ ] **Step 2: Select and store the flag in the jwt callback**

In `src/lib/auth.ts`, in the `jwt` callback's initial sign-in block, add `isSuperAdmin: users.isSuperAdmin` to the `.select({...})` object, and after `token.role = dbUser.role;` add:

```ts
          token.isSuperAdmin = dbUser.isSuperAdmin;
```

In the same block's `else` branch (no dbUser) add `token.isSuperAdmin = false;`. Also handle the update trigger — after the existing `trigger === "update"` blocks add:

```ts
      if (trigger === "update" && updateData?.isSuperAdmin !== undefined) {
        token.isSuperAdmin = updateData.isSuperAdmin;
      }
```

- [ ] **Step 3: Expose it on the session**

In the `session` callback, after the `session.user.clientIdCode = ...` line (or alongside the role assignment), add:

```ts
      session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: exit 0. `session.user.isSuperAdmin` is now typed and populated.

- [ ] **Step 5: Commit**

```bash
git add src/types/next-auth.d.ts src/lib/auth.ts
git commit -m "feat(auth): carry isSuperAdmin into JWT and session

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Re-gate `GET /api/hours/summary` to super admin

**Files:**
- Modify: `src/app/api/hours/summary/route.ts:11-13`
- Modify: `src/app/api/hours/summary/route.test.ts`

**Interfaces:**
- Consumes: `session.user.isSuperAdmin` (Task 2).

- [ ] **Step 1: Update the existing test expectations to super-admin gating**

In `src/app/api/hours/summary/route.test.ts`, change the "403 for non-admin" test and the two admin-authorized tests. Replace the `"403 for non-admin team member"` test and update the authorized tests' session mocks:

```ts
  it("403 for admin without super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    const res = await GET(req(RANGE));
    expect(res.status).toBe(403);
  });
```

In the `"400 with missing/invalid range"`, `"401 unauthenticated"` stays as-is, and the `"pivots rows..."` test, set the authorized session to `{ user: { id: "a1", role: "admin", isSuperAdmin: true } }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/hours/summary/route.test.ts`
Expected: FAIL — the "403 for admin without super-admin" case currently returns 200 (route still checks role only).

- [ ] **Step 3: Change the gate in the route**

In `src/app/api/hours/summary/route.ts`, replace:

```ts
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

with:

```ts
  if (!session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/hours/summary/route.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/hours/summary/route.ts src/app/api/hours/summary/route.test.ts
git commit -m "feat(hours): gate summary API to super admins only

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Allow super admins to grant/revoke the flag via `PUT /api/admin/users`

**Files:**
- Modify: `src/app/api/admin/users/route.ts` (PUT handler ~line 67-140)
- Create: `src/app/api/admin/users/route.test.ts`

**Interfaces:**
- Consumes: `session.user.isSuperAdmin` (Task 2).
- Produces: PUT accepts `isSuperAdmin?: boolean`; only a super admin may change it; a super admin cannot clear their own flag.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/users/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { update: vi.fn(), select: vi.fn(), insert: vi.fn(), delete: vi.fn() } }));

import { PUT } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function putReq(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function mockUpdateOk() {
  const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
  asMock(db.update).mockReturnValue(chain);
  return chain;
}

describe("PUT /api/admin/users — isSuperAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 when a non-super admin tries to set isSuperAdmin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    const res = await PUT(putReq({ userId: "u2", isSuperAdmin: true }));
    expect(res.status).toBe(403);
  });

  it("400 when a super admin tries to clear their own flag", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: true } });
    const res = await PUT(putReq({ userId: "a1", isSuperAdmin: false }));
    expect(res.status).toBe(400);
  });

  it("200 when a super admin grants the flag to another user", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: true } });
    mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", isSuperAdmin: true }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/admin/users/route.test.ts`
Expected: FAIL — PUT ignores `isSuperAdmin` (200 in the 403 case, or update never applies the field).

- [ ] **Step 3: Implement the guard and field in the PUT handler**

In `src/app/api/admin/users/route.ts` PUT handler: add `isSuperAdmin` to the destructured body type and value:

```ts
  const { userId, role, allowedSections, clientIdCode, name, asanaEmail, isSuperAdmin } = body as {
    userId: string;
    role?: "viewer" | "editor" | "admin" | "client" | "pending" | "prospect";
    allowedSections?: string[];
    clientIdCode?: string | null;
    name?: string | null;
    asanaEmail?: string | null;
    isSuperAdmin?: boolean;
  };
```

Add `isSuperAdmin?: boolean` to the `updates` Partial type. After the existing `if (userId === session.user.id && role ...)` guard, add the super-admin handling block:

```ts
  if (isSuperAdmin !== undefined) {
    if (!session.user.isSuperAdmin) {
      return NextResponse.json({ error: "Only a super admin can change super-admin status" }, { status: 403 });
    }
    if (userId === session.user.id && isSuperAdmin === false) {
      return NextResponse.json({ error: "Cannot revoke your own super-admin status" }, { status: 400 });
    }
    updates.isSuperAdmin = isSuperAdmin;
  }
```

(The existing `GET` uses `db.select().from(users)` which already returns the new column — no GET change needed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/admin/users/route.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts
git commit -m "feat(admin): super admins can grant/revoke is_super_admin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Extract testable dashboard aggregation helpers

**Files:**
- Create: `src/lib/hours/dashboard-utils.ts`
- Create: `src/lib/hours/dashboard-utils.test.ts`

**Interfaces:**
- Produces the following, consumed by Task 6:

```ts
export type Summary = {
  byMember: { userId: string; name: string | null; email: string; totalHours: number; clients: { clientIdCode: string; hours: number }[] }[];
  byClient: { clientIdCode: string; totalHours: number; members: { userId: string; name: string | null; hours: number }[] }[];
};
export type Kpis = { totalHours: number; activeMembers: number; activeClients: number; avgHoursPerMember: number };
export type Bar = { key: string; label: string; hours: number };
export type Heatmap = { members: { userId: string; label: string }[]; clients: { code: string; label: string }[]; cell: (userId: string, code: string) => number };
export function clientLabel(code: string): string;
export function computeKpis(s: Summary): Kpis;
export function topMembers(s: Summary, n: number): Bar[];
export function topClients(s: Summary, n: number): Bar[];
export function buildHeatmap(s: Summary): Heatmap;
export function filterSummary(s: Summary, memberIds: string[], clientCodes: string[]): Summary;
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hours/dashboard-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clientLabel, computeKpis, topMembers, topClients, buildHeatmap, filterSummary, type Summary } from "./dashboard-utils";

const S: Summary = {
  byMember: [
    { userId: "u1", name: "Ana", email: "ana@mf.io", totalHours: 12.5, clients: [{ clientIdCode: "PURA", hours: 10.5 }, { clientIdCode: "INTERNAL", hours: 2 }] },
    { userId: "u2", name: "Bo", email: "bo@mf.io", totalHours: 20, clients: [{ clientIdCode: "PURA", hours: 20 }] },
  ],
  byClient: [
    { clientIdCode: "PURA", totalHours: 30.5, members: [{ userId: "u2", name: "Bo", hours: 20 }, { userId: "u1", name: "Ana", hours: 10.5 }] },
    { clientIdCode: "INTERNAL", totalHours: 2, members: [{ userId: "u1", name: "Ana", hours: 2 }] },
  ],
};

it("clientLabel maps INTERNAL to MarketFoundry", () => {
  expect(clientLabel("INTERNAL")).toBe("MarketFoundry");
  expect(clientLabel("PURA")).toBe("PURA");
});

it("computeKpis totals members, clients and average", () => {
  expect(computeKpis(S)).toEqual({ totalHours: 32.5, activeMembers: 2, activeClients: 2, avgHoursPerMember: 16.25 });
});

it("topMembers/topClients sort by hours desc and cap at n", () => {
  expect(topMembers(S, 1)).toEqual([{ key: "u2", label: "Bo", hours: 20 }]);
  expect(topClients(S, 1)).toEqual([{ key: "PURA", label: "PURA", hours: 30.5 }]);
});

it("buildHeatmap exposes member/client axes and cell lookup", () => {
  const h = buildHeatmap(S);
  expect(h.members.map((m) => m.userId).sort()).toEqual(["u1", "u2"]);
  expect(h.clients.map((c) => c.code).sort()).toEqual(["INTERNAL", "PURA"]);
  expect(h.cell("u1", "PURA")).toBe(10.5);
  expect(h.cell("u2", "INTERNAL")).toBe(0);
});

it("filterSummary narrows to selected members and clients and re-pivots", () => {
  const f = filterSummary(S, ["u1"], []);
  expect(f.byMember.map((m) => m.userId)).toEqual(["u1"]);
  expect(f.byClient.find((c) => c.clientIdCode === "PURA")?.totalHours).toBe(10.5);

  const g = filterSummary(S, [], ["INTERNAL"]);
  expect(g.byClient.map((c) => c.clientIdCode)).toEqual(["INTERNAL"]);
  expect(g.byMember.map((m) => m.userId)).toEqual(["u1"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/hours/dashboard-utils.ts`:

```ts
export type Summary = {
  byMember: { userId: string; name: string | null; email: string; totalHours: number; clients: { clientIdCode: string; hours: number }[] }[];
  byClient: { clientIdCode: string; totalHours: number; members: { userId: string; name: string | null; hours: number }[] }[];
};
export type Kpis = { totalHours: number; activeMembers: number; activeClients: number; avgHoursPerMember: number };
export type Bar = { key: string; label: string; hours: number };
export type Heatmap = {
  members: { userId: string; label: string }[];
  clients: { code: string; label: string }[];
  cell: (userId: string, code: string) => number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function clientLabel(code: string): string {
  return code === "INTERNAL" ? "MarketFoundry" : code;
}

export function computeKpis(s: Summary): Kpis {
  const totalHours = round2(s.byMember.reduce((a, m) => a + m.totalHours, 0));
  const activeMembers = s.byMember.length;
  const activeClients = s.byClient.length;
  const avgHoursPerMember = activeMembers === 0 ? 0 : round2(totalHours / activeMembers);
  return { totalHours, activeMembers, activeClients, avgHoursPerMember };
}

export function topMembers(s: Summary, n: number): Bar[] {
  return s.byMember
    .map((m) => ({ key: m.userId, label: m.name ?? m.email, hours: m.totalHours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n);
}

export function topClients(s: Summary, n: number): Bar[] {
  return s.byClient
    .map((c) => ({ key: c.clientIdCode, label: clientLabel(c.clientIdCode), hours: c.totalHours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n);
}

export function buildHeatmap(s: Summary): Heatmap {
  const members = s.byMember.map((m) => ({ userId: m.userId, label: m.name ?? m.email }));
  const clients = s.byClient.map((c) => ({ code: c.clientIdCode, label: clientLabel(c.clientIdCode) }));
  const map = new Map<string, number>();
  for (const m of s.byMember) {
    for (const c of m.clients) map.set(`${m.userId}|${c.clientIdCode}`, c.hours);
  }
  return { members, clients, cell: (userId, code) => map.get(`${userId}|${code}`) ?? 0 };
}

type Row = { userId: string; name: string | null; email: string; clientCode: string; hours: number };

function flatten(s: Summary): Row[] {
  const rows: Row[] = [];
  for (const m of s.byMember) {
    for (const c of m.clients) {
      rows.push({ userId: m.userId, name: m.name, email: m.email, clientCode: c.clientIdCode, hours: c.hours });
    }
  }
  return rows;
}

function pivot(rows: Row[]): Summary {
  const byMemberMap = new Map<string, Summary["byMember"][number]>();
  const byClientMap = new Map<string, Summary["byClient"][number]>();
  for (const r of rows) {
    let m = byMemberMap.get(r.userId);
    if (!m) { m = { userId: r.userId, name: r.name, email: r.email, totalHours: 0, clients: [] }; byMemberMap.set(r.userId, m); }
    m.totalHours = round2(m.totalHours + r.hours);
    m.clients.push({ clientIdCode: r.clientCode, hours: r.hours });

    let c = byClientMap.get(r.clientCode);
    if (!c) { c = { clientIdCode: r.clientCode, totalHours: 0, members: [] }; byClientMap.set(r.clientCode, c); }
    c.totalHours = round2(c.totalHours + r.hours);
    c.members.push({ userId: r.userId, name: r.name, hours: r.hours });
  }
  const byMember = [...byMemberMap.values()].map((m) => ({ ...m, clients: m.clients.sort((a, b) => b.hours - a.hours) })).sort((a, b) => b.totalHours - a.totalHours);
  const byClient = [...byClientMap.values()].map((c) => ({ ...c, members: c.members.sort((a, b) => b.hours - a.hours) })).sort((a, b) => b.totalHours - a.totalHours);
  return { byMember, byClient };
}

export function filterSummary(s: Summary, memberIds: string[], clientCodes: string[]): Summary {
  const mSet = new Set(memberIds);
  const cSet = new Set(clientCodes);
  const rows = flatten(s).filter((r) => (mSet.size === 0 || mSet.has(r.userId)) && (cSet.size === 0 || cSet.has(r.clientCode)));
  return pivot(rows);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/hours/dashboard-utils.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/dashboard-utils.ts src/lib/hours/dashboard-utils.test.ts
git commit -m "feat(hours): add tested dashboard aggregation helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Build the charted HoursDashboard and wire it into the Hours tab

**Files:**
- Create: `src/components/admin/hours-dashboard.tsx`
- Modify: `src/app/admin/users/page.tsx` (import + `adminView === "hours"` branch; Hours tab gating)
- Reference (pattern): `src/components/reports/period-comparative-chart.tsx` (recharts + theme conventions), `src/components/admin/hours-overview.tsx` (existing controls + drill-down table to preserve)

**Interfaces:**
- Consumes: helpers from Task 5; `GET /api/hours/summary?from&to`; `session.user.isSuperAdmin` (Task 2).

- [ ] **Step 1: Load the dataviz skill FIRST**

Invoke the `dataviz` skill (Skill tool, `skill: "dataviz"`) before writing any chart code — it sets the palette, mark specs, and light/dark rules. Apply its palette to the recharts fills below (replace the placeholder `--brand` + neutral series with the skill's validated categorical palette). `INTERNAL` bars/cells use `text-brand`/`--brand`.

- [ ] **Step 2: Create the dashboard component**

Create `src/components/admin/hours-dashboard.tsx`. It reuses the existing controls + drill-down table from `hours-overview.tsx` (copy that structure) and adds KPI tiles, two recharts bar charts, and a CSS-grid heatmap driven by Task 5 helpers. Structure:

```tsx
"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  clientLabel, computeKpis, topMembers, topClients, buildHeatmap, filterSummary, type Summary,
} from "@/lib/hours/dashboard-utils";

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function currentMonthRange() {
  const now = new Date();
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

export function HoursDashboard() {
  const initial = useMemo(() => currentMonthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [pivot, setPivot] = useState<"member" | "client">("client");
  const [memberFilter, setMemberFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<Summary>({
    queryKey: ["hours-summary", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/hours/summary?from=${from}&to=${to}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load summary");
      return res.json();
    },
  });

  const filtered = useMemo<Summary>(
    () => (data ? filterSummary(data, memberFilter, clientFilter) : { byMember: [], byClient: [] }),
    [data, memberFilter, clientFilter],
  );
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const memberBars = useMemo(() => topMembers(filtered, 10), [filtered]);
  const clientBars = useMemo(() => topClients(filtered, 10), [filtered]);
  const heat = useMemo(() => buildHeatmap(filtered), [filtered]);
  const maxHeat = useMemo(
    () => Math.max(1, ...heat.members.flatMap((m) => heat.clients.map((c) => heat.cell(m.userId, c.code)))),
    [heat],
  );

  function toggle(key: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="space-y-6">
      {/* Controls: reuse the From/To + pivot bar from hours-overview.tsx, and add member/client multi-select
          chips sourced from data.byMember / data.byClient (toggle ids into memberFilter / clientFilter). */}
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total hours", value: `${kpis.totalHours}h` },
          { label: "Active members", value: kpis.activeMembers },
          { label: "Active clients", value: kpis.activeClients },
          { label: "Avg / member", value: `${kpis.avgHoursPerMember}h` },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Two bar charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[{ title: "Top members", bars: memberBars }, { title: "Top clients", bars: clientBars }].map((chart) => (
          <div key={chart.title} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-2 text-sm font-medium">{chart.title}</div>
            <ResponsiveContainer width="100%" height={Math.max(120, chart.bars.length * 34)}>
              <BarChart layout="vertical" data={chart.bars} margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}h`, "Hours"]} />
                <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                  {chart.bars.map((b) => (
                    <Cell key={b.key} fill={b.key === "INTERNAL" ? "var(--brand)" : "var(--chart-1, var(--brand))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* Heatmap: CSS grid — rows = heat.members, cols = heat.clients, cell opacity = hours / maxHeat.
          Render clientLabel(code) headers; INTERNAL column tinted with --brand. */}

      {/* Drill-down table: copy the pivot === "client" / "member" expandable tables verbatim from
          hours-overview.tsx, driven by `filtered` instead of `data`. */}

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}
```

Fill the three commented regions (controls with member/client chips, heatmap grid, drill-down table) using the exact markup from `hours-overview.tsx` for the controls + table, and a simple `grid` of divs for the heatmap where each cell's `style={{ backgroundColor: \`color-mix(in srgb, var(--brand) ${Math.round((heat.cell(m.userId,c.code)/maxHeat)*100)}%, transparent)\` }}`. Apply the dataviz palette from Step 1.

- [ ] **Step 3: Gate the Hours tab and swap the component in the users page**

In `src/app/admin/users/page.tsx`:
- Replace the import `import { HoursOverview } from "@/components/admin/hours-overview";` with `import { HoursDashboard } from "@/components/admin/hours-dashboard";`.
- Derive `const isSuperAdmin = session?.user?.isSuperAdmin ?? false;`.
- Wrap the Hours toggle button so it only renders when `isSuperAdmin`.
- In the render branch, change `{adminView === "hours" ? (<HoursOverview />)` to `{adminView === "hours" && isSuperAdmin ? (<HoursDashboard />)` and ensure the fallback shows the users view (e.g. guard `adminView` so a non-super-admin never lands on hours).

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/hours-dashboard.tsx src/app/admin/users/page.tsx
git commit -m "feat(hours): charted super-admin hours dashboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Add the super-admin toggle to the user management grid

**Files:**
- Modify: `src/app/admin/users/page.tsx` (`User` type, a `superAdminMutation`, a per-row control rendered only for super-admin viewers)

**Interfaces:**
- Consumes: `PUT /api/admin/users` `isSuperAdmin` field (Task 4); `session.user.isSuperAdmin` (Task 2).

- [ ] **Step 1: Extend the `User` type and add the mutation**

In `src/app/admin/users/page.tsx`, add `isSuperAdmin: boolean;` to the `User` type. Add a mutation mirroring `roleMutation`:

```tsx
  const superAdminMutation = useMutation({
    mutationFn: async ({ userId, isSuperAdmin }: { userId: string; isSuperAdmin: boolean }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isSuperAdmin }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update super-admin");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Super-admin updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
```

- [ ] **Step 2: Render the control for super-admin viewers only**

In `renderUserRow`, for `admin`-role rows, when the current viewer `isSuperAdmin`, render a shield toggle (use the imported `Shield` icon, already imported) bound to `superAdminMutation`, disabled for `isSelf` when it would clear the own flag. Example inline control next to the role cells:

```tsx
{isSuperAdmin && user.role === "admin" && (
  <button
    type="button"
    title={user.isSuperAdmin ? "Revoke super admin" : "Grant super admin"}
    disabled={superAdminMutation.isPending || (isSelf && user.isSuperAdmin)}
    onClick={() => superAdminMutation.mutate({ userId: user.id, isSuperAdmin: !user.isSuperAdmin })}
    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${user.isSuperAdmin ? "border-brand/40 bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-muted/50"} disabled:opacity-50`}
  >
    <Shield className="size-3" />{user.isSuperAdmin ? "Super" : "Make super"}
  </button>
)}
```

Place it in a dedicated cell within the row (add a matching `<th>` header "Super" rendered only when `isSuperAdmin`, keeping `totalCols` correct), or append to the existing user/name cell if adding a column is disruptive — choose whichever keeps the table header/body column counts consistent.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Run the full test suite for touched areas**

Run: `npx vitest run src/app/api/hours/summary/route.test.ts src/app/api/admin/users/route.test.ts src/lib/hours/dashboard-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/users/page.tsx
git commit -m "feat(admin): super-admin toggle in user management grid

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification + PROD DB approval gate

**Files:** none (verification + approvals)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 2: Full targeted test run**

Run: `npx vitest run src/app/api/hours src/app/api/admin/users src/lib/hours`
Expected: PASS.

- [ ] **Step 3: Delete `HoursOverview` if fully unused**

Run: `rg -n "HoursOverview" src` — if the only remaining hits are its own definition, delete `src/components/admin/hours-overview.tsx` and commit. Otherwise leave it.

- [ ] **Step 4: Request the two PROD DB approvals (do NOT run without explicit OK)**

Present to the user, each as a separate ask:
1. `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;`
2. `UPDATE users SET is_super_admin = true WHERE email = 'amazon.seo@1o8.agency';`

Run via the project's node+dotenv DB script pattern (no shell command may contain `.env`). Until (1) runs, the column is missing in PROD and the app's summary queries/flag reads will fail at runtime — so the code must not be relied upon in PROD before the ALTER is applied.

- [ ] **Step 5: Dogfood verification (after DB writes approved & applied)**

Sign in as the bootstrapped super admin, open `/admin/users`, confirm the Hours tab appears and the dashboard renders; sign in as a plain admin (or flip the flag off a test user) and confirm the Hours tab is hidden and `GET /api/hours/summary` returns 403.

- [ ] **Step 6: Offer PR (requires explicit OK to push)**

Do not push or open a PR without explicit user approval.
