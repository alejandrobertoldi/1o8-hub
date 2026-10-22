# Team Member Dashboard (`/me`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal `/me` dashboard per MF staff member: Asana + Hub tasks grouped by due date, alerts on their accounts, account health cards, and a 14-day due strip.

**Architecture:** A 15-minute cron copies open tasks from one Asana project (which multi-homes every task) into a new `asana_tasks` table. `/api/me/dashboard` assembles independent sections (tasks, alerts, accounts, due strip) from Postgres only — Asana tasks, onboarding steps, `aac.rawData` roles, `ppc_alerts`, and the already-warmed sales cache. `/me` renders them with React Query.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres.js, Vitest, Tailwind 4 + shadcn/ui, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-07-team-member-dashboard-design.md` (approved 2026-10-07). Read it first.

## Global Constraints

- Asana project gid: `1216052535915202`. Read-only — **no POST/PUT/DELETE to Asana anywhere in this plan.**
- Asana custom field gids: Task Status `1216388146560076`, Priority Levels `1216388146560065`.
- Reuse `asanaFetch` from `src/lib/onboarding/create-asana-project.ts` (tries `ASANA_ACCESS_TOKEN_MF` first).
- Dates cross module boundaries as `YYYY-MM-DD` strings, never `Date`.
- Sales numbers come ONLY from `getCachedData` (`src/lib/sales-cache.ts`). **Never call Redshift or `/api/sales-summary` from this feature.**
- Page access: `isHubStaff(role)`. Viewing another person: `hasAdminPowers(role)` (both in `src/lib/roles.ts`).
- Unassigned Asana tasks never shown. Overdue group collapsed by default. No login-redirect change.
- Migration is additive only; applying it to prod needs Manu's explicit per-action OK. Never `next build`, never `npm run db:generate`.
- `git add` / `git commit` with explicit pathspecs only; `-m` before `--`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit locally; do not push (standing instruction).
- Check `git rev-parse --abbrev-ref HEAD` before every commit — other sessions share this checkout. Prefer a worktree under `.worktrees/`.
- vitest does not typecheck: after each task run `node_modules/.bin/tsc --noEmit` and judge by filename (no errors in files this plan touches).
- Read `DESIGN.md` before Task 7. Hub accent = `--brand`; text on orange fills uses `bg-brand-solid text-white`.

## Spec deltas discovered while planning (already applied below)

1. **SEO S6 approvals are dropped from v1.** The schema has `s6ApprovedAt` but no "waiting on" assignee column, and the spec says not to guess an assignee.
2. **Sales comparison = last full week vs the week before**, not "last 7 days vs prior 7". The cron (`src/lib/sales-warm.ts`) warms `summary` cache only for whole Sun–Sat weeks (`recentWeekRanges(now, 3)`); the current week is partial, so comparing it would always look like a drop. `weeks[1]` (last complete week) carries both `current` and `previous` rows.
3. **Sync state lives in a new one-row table `asana_sync_state`.** No reusable generic sync-state table exists (`review_sync_runs` is reviews-specific).

## Review Focus

1. **An Asana outage or a paging bug returns zero tasks** → the sync must NOT mark every row completed (people would see an empty task list that looks true). Pinned in Task 3 (`refuses to close out when the run fetched nothing`).
2. **"Today" depends on the viewer's timezone** (team spans Pakistan, Spain, US). A UTC server date makes evening tasks jump to "overdue" early. The browser sends `today`; the API validates it. Pinned in Task 6 (`resolveToday`).
3. **A non-admin passing `?user=<someone else>`** must get 403, never another person's data. Pinned in Task 6 (`resolveTargetUser`).
4. **Rebrand duplicate names / odd spacing** ("Jo C." vs "Jo  C.", case differences) must still match `aac.rawData`. Pinned in Task 5 (`accountsForUser` normalisation test).
5. **Internal Asana projects** (`MarketfoundryHub`, `IDS - Tracker`, `AAA_SC_US | …`) must give `clientIdCode = null`, not a fake code. Pinned in Task 2.

## File map

| File | Responsibility |
|---|---|
| `drizzle/migrations/<NNNN>_asana_tasks.sql` | DDL for `asana_tasks` + `asana_sync_state` |
| `scripts/_apply-<NNNN>.ts` | Bespoke apply script (house pattern, copy of `_apply-0113.ts`) |
| `src/lib/db/schema.ts` (append) | Drizzle tables `asanaTasks`, `asanaSyncState` |
| `src/lib/my-dashboard/types.ts` | Shared types (`DashTask`, `DashAlert`, `MyDashboardPayload`, …) |
| `src/lib/my-dashboard/asana-map.ts` (+test) | Asana JSON → row (pure) |
| `src/lib/my-dashboard/asana-sync.ts` (+test) | Paged fetch, upsert, close-out (deps injected) |
| `src/app/api/cron/asana-tasks-sync/route.ts` | Cron entry |
| `src/lib/my-dashboard/group-tasks.ts` (+test) | Grouping, sorting, due strip (pure) |
| `src/lib/my-dashboard/my-accounts.ts` (+test) | Name → client roles (pure) |
| `src/lib/my-dashboard/alerts.ts` (+test) | Alert builders + ranking (pure) |
| `src/lib/my-dashboard/access.ts` (+test) | `resolveTargetUser`, `resolveToday` (pure) |
| `src/lib/my-dashboard/load.ts` | DB reads → payload |
| `src/app/api/me/dashboard/route.ts` | Auth + JSON |
| `src/app/me/page.tsx`, `src/components/my-dashboard/*.tsx` | UI |
| `src/components/layout/app-sidebar.tsx` | "My Dashboard" nav item |
| `src/lib/sales-summary-header.ts` | Export the existing `norm` helper as `normName` |
| `scripts/_tmp-asana-dashboard-probe.ts` | Read-only verification probe (Task 8) |

---

### Task 1: Tables, migration, apply script

**Files:**
- Create: `drizzle/migrations/<NNNN>_asana_tasks.sql`, `scripts/_apply-<NNNN>.ts`
- Modify: `src/lib/db/schema.ts` (append at end of file)

**Interfaces:**
- Produces: `asanaTasks`, `asanaSyncState` Drizzle tables; types `AsanaTaskDbRow = typeof asanaTasks.$inferSelect`.

- [ ] **Step 1: Pick the migration number.** Run:
```bash
ls /Users/manu/MFHub/drizzle/migrations | sort | tail -3
git -C /Users/manu/MFHub branch -a --format='%(refname:short)' | xargs -I{} git -C /Users/manu/MFHub ls-tree --name-only {} drizzle/migrations/ 2>/dev/null | sort -u | tail -5
```
`<NNNN>` = 1 + the highest number seen in EITHER list (Thread AB holds 0123 on a branch ⇒ expect ≥ 0124). Use that number everywhere below.

- [ ] **Step 2: Write the migration** `drizzle/migrations/<NNNN>_asana_tasks.sql`:
```sql
CREATE TABLE IF NOT EXISTS asana_tasks (
  gid varchar(32) PRIMARY KEY,
  name text NOT NULL,
  assignee_email varchar(255),
  assignee_name varchar(255),
  due_on date,
  completed boolean NOT NULL DEFAULT false,
  client_id_code varchar(100),
  origin_project_name text,
  task_status varchar(100),
  priority varchar(100),
  permalink_url text NOT NULL,
  asana_modified_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asana_tasks_assignee_open ON asana_tasks (lower(assignee_email)) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_asana_tasks_client ON asana_tasks (client_id_code);

CREATE TABLE IF NOT EXISTS asana_sync_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  open_count integer
);
```

- [ ] **Step 3: Append the Drizzle tables** to the end of `src/lib/db/schema.ts` (imports `pgTable, varchar, text, date, boolean, timestamp, integer, index` already exist in that file — verify with `grep -n "^import" src/lib/db/schema.ts`):
```ts
// ─── Team member dashboard: Asana task mirror (read-only copy of project 1216052535915202) ───
export const asanaTasks = pgTable(
  "asana_tasks",
  {
    gid: varchar("gid", { length: 32 }).primaryKey(),
    name: text("name").notNull(),
    assigneeEmail: varchar("assignee_email", { length: 255 }),
    assigneeName: varchar("assignee_name", { length: 255 }),
    dueOn: date("due_on", { mode: "string" }),
    completed: boolean("completed").notNull().default(false),
    clientIdCode: varchar("client_id_code", { length: 100 }),
    originProjectName: text("origin_project_name"),
    taskStatus: varchar("task_status", { length: 100 }),
    priority: varchar("priority", { length: 100 }),
    permalinkUrl: text("permalink_url").notNull(),
    asanaModifiedAt: timestamp("asana_modified_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_asana_tasks_client").on(t.clientIdCode)]
);

export const asanaSyncState = pgTable("asana_sync_state", {
  id: integer("id").primaryKey().default(1),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  openCount: integer("open_count"),
});

export type AsanaTaskDbRow = typeof asanaTasks.$inferSelect;
```
(The partial lower() index lives only in SQL; Drizzle doesn't need to know it.)

- [ ] **Step 4: Create the apply script.** Copy `scripts/_apply-0113.ts` to `scripts/_apply-<NNNN>.ts` and change only `const MIGRATION = "<NNNN>_asana_tasks.sql";`. Read the whole copied file and update any 0113-specific post-checks so they verify `asana_tasks` and `asana_sync_state` exist (`select to_regclass('public.asana_tasks')`).

- [ ] **Step 5: Typecheck.** Run `node_modules/.bin/tsc --noEmit` (background, ~2 min). Expected: no errors in `schema.ts`.

- [ ] **Step 6: Commit** (do NOT run the apply script — that needs Manu's OK, see Task 8):
```bash
git add -- drizzle/migrations/<NNNN>_asana_tasks.sql scripts/_apply-<NNNN>.ts src/lib/db/schema.ts
git commit -m "feat(me): asana_tasks + asana_sync_state tables (migration <NNNN>)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- drizzle/migrations/<NNNN>_asana_tasks.sql scripts/_apply-<NNNN>.ts src/lib/db/schema.ts
```

---

### Task 2: Shared types + Asana task mapper

**Files:**
- Create: `src/lib/my-dashboard/types.ts`, `src/lib/my-dashboard/asana-map.ts`, `src/lib/my-dashboard/asana-map.test.ts`

**Interfaces:**
- Produces: `AsanaApiTask`, `AsanaTaskRow`, `parseClientCode(projectName: string): string | null`, `mapAsanaTask(t: AsanaApiTask): AsanaTaskRow`, constants `ASANA_REPORTING_PROJECT_GID`, `ASANA_STATUS_FIELD_GID`, `ASANA_PRIORITY_FIELD_GID`, `ASANA_OPT_FIELDS`.

- [ ] **Step 1: Write `types.ts`** (used by every later task):
```ts
export type TaskGroupKey = "overdue" | "today" | "week" | "later" | "nodate";

export interface DashTask {
  id: string;
  source: "asana" | "hub";
  title: string;
  clientIdCode: string | null;
  dueOn: string | null; // YYYY-MM-DD
  status: string | null;
  priority: string | null;
  url: string;
}

export interface DashAlert {
  kind: "ppc" | "stale" | "blocked";
  severity: "critical" | "warning" | "info";
  clientIdCode: string | null;
  message: string;
  url: string;
  at: string | null; // ISO timestamp or YYYY-MM-DD, for tie-break ordering
}

export interface MyAccount {
  clientIdCode: string;
  clientName: string;
  clientLogoUrl: string | null;
  roles: string[];
}

export interface AccountCard extends MyAccount {
  salesLastWeek: number | null;
  salesWeekBefore: number | null;
  changePct: number | null;
  spark: number[]; // daily product_sales for last full week, oldest first
  openTasks: number;
  overdueTasks: number;
  alertCount: number;
}

export interface Section<T> { data: T | null; error: string | null }

export interface MyDashboardPayload {
  viewer: { id: string; canPickPerson: boolean };
  person: { id: string; name: string | null; email: string; image: string | null };
  today: string;
  sync: { lastSuccessAt: string | null; lastError: string | null; connected: boolean };
  tasks: Section<Record<TaskGroupKey, DashTask[]>>;
  dueStrip: Section<{ date: string; count: number }[]>;
  alerts: Section<DashAlert[]>;
  accounts: Section<{ cards: AccountCard[]; matchedName: string | null; salesWeek: { start: string; end: string } | null }>;
  staff: { id: string; name: string | null }[] | null; // only for admins
}
```

- [ ] **Step 2: Write the failing test** `asana-map.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mapAsanaTask, parseClientCode, ASANA_REPORTING_PROJECT_GID, type AsanaApiTask } from "./asana-map";

const base: AsanaApiTask = {
  gid: "1219163788881638",
  name: "SOP - Listing 24 Pack on AMZ US",
  completed: false,
  due_on: "2026-10-05",
  permalink_url: "https://app.asana.com/x",
  modified_at: "2026-10-06T10:00:00.000Z",
  assignee: { gid: "1", name: "Jo C.", email: "Jo@MarketFoundry.agency" },
  memberships: [
    { project: { gid: "1216016941185454", name: "SOP_SC_US | Sopreme" } },
    { project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA_SC_US | Market Foundry Reporting" } },
  ],
  custom_fields: [
    { gid: "1216388146560076", enum_value: { name: "🚫Blocked" } },
    { gid: "1216388146560065", enum_value: { name: "P1 - High" } },
    { gid: "999", enum_value: { name: "ignored" } },
  ],
};

describe("parseClientCode", () => {
  it.each([
    ["SOP_SC_US | Sopreme", "SOP_SC_US"],
    ["WHI_SC_US | Whitney Jordan", "WHI_SC_US"],
    ["CFX_SC_US - Culture Fix", "CFX_SC_US"],
    ["GOO_WFM | Goodles Whole Foods", "GOO_WFM"],
    ["AAA_SC_US | Market Foundry Recurring Tasks", null],
    ["MarketfoundryHub", null],
    ["IDS - Tracker", null],
    ["Market Foundry | Research", null],
  ])("%s → %s", (name, expected) => {
    expect(parseClientCode(name)).toBe(expected);
  });
});

describe("mapAsanaTask", () => {
  it("maps a client task with status and priority", () => {
    expect(mapAsanaTask(base)).toEqual({
      gid: "1219163788881638",
      name: "SOP - Listing 24 Pack on AMZ US",
      assigneeEmail: "jo@marketfoundry.agency",
      assigneeName: "Jo C.",
      dueOn: "2026-10-05",
      completed: false,
      clientIdCode: "SOP_SC_US",
      originProjectName: "SOP_SC_US | Sopreme",
      taskStatus: "🚫Blocked",
      priority: "P1 - High",
      permalinkUrl: "https://app.asana.com/x",
      asanaModifiedAt: new Date("2026-10-06T10:00:00.000Z"),
    });
  });

  it("handles unassigned, no due date, internal project, missing custom fields", () => {
    const row = mapAsanaTask({
      ...base,
      assignee: null,
      due_on: null,
      modified_at: undefined,
      memberships: [
        { project: { gid: "1216828913264010", name: "MarketfoundryHub" } },
        { project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA_SC_US | Market Foundry Reporting" } },
      ],
      custom_fields: undefined,
    });
    expect(row).toMatchObject({
      assigneeEmail: null, assigneeName: null, dueOn: null, clientIdCode: null,
      originProjectName: "MarketfoundryHub", taskStatus: null, priority: null, asanaModifiedAt: null,
    });
  });

  it("uses the reporting project only when it is the sole membership", () => {
    const row = mapAsanaTask({
      ...base,
      memberships: [{ project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA_SC_US | Market Foundry Reporting" } }],
    });
    expect(row.originProjectName).toBe("AAA_SC_US | Market Foundry Reporting");
    expect(row.clientIdCode).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails.** `npx vitest run src/lib/my-dashboard/asana-map.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `asana-map.ts`:**
```ts
export const ASANA_REPORTING_PROJECT_GID = "1216052535915202";
export const ASANA_STATUS_FIELD_GID = "1216388146560076";
export const ASANA_PRIORITY_FIELD_GID = "1216388146560065";
export const ASANA_OPT_FIELDS = [
  "name", "completed", "due_on", "permalink_url", "modified_at",
  "assignee.name", "assignee.email",
  "memberships.project.name",
  "custom_fields.gid", "custom_fields.enum_value.name",
].join(",");

export interface AsanaApiTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  permalink_url: string;
  modified_at?: string;
  assignee: { gid: string; name?: string; email?: string } | null;
  memberships: { project: { gid: string; name: string } }[];
  custom_fields?: { gid: string; enum_value: { name: string } | null }[];
}

export interface AsanaTaskRow {
  gid: string;
  name: string;
  assigneeEmail: string | null;
  assigneeName: string | null;
  dueOn: string | null;
  completed: boolean;
  clientIdCode: string | null;
  originProjectName: string | null;
  taskStatus: string | null;
  priority: string | null;
  permalinkUrl: string;
  asanaModifiedAt: Date | null;
}

/** "SOP_SC_US | Sopreme" / "CFX_SC_US - Culture Fix" → code. AAA_* is MarketFoundry's own internal prefix. */
const CODE_RE = /^([A-Z0-9]+(?:_[A-Z0-9]+){1,2})\s*[|\-–]/;
export function parseClientCode(projectName: string): string | null {
  const m = CODE_RE.exec(projectName.trim());
  if (!m || m[1].startsWith("AAA_")) return null;
  return m[1];
}

function enumField(t: AsanaApiTask, gid: string): string | null {
  return t.custom_fields?.find((f) => f.gid === gid)?.enum_value?.name ?? null;
}

export function mapAsanaTask(t: AsanaApiTask): AsanaTaskRow {
  const origin = t.memberships.find((m) => m.project.gid !== ASANA_REPORTING_PROJECT_GID) ?? t.memberships[0];
  const originName = origin?.project.name ?? null;
  return {
    gid: t.gid,
    name: t.name,
    assigneeEmail: t.assignee?.email ? t.assignee.email.trim().toLowerCase() : null,
    assigneeName: t.assignee?.name ?? null,
    dueOn: t.due_on ?? null,
    completed: t.completed,
    clientIdCode: originName ? parseClientCode(originName) : null,
    originProjectName: originName,
    taskStatus: enumField(t, ASANA_STATUS_FIELD_GID),
    priority: enumField(t, ASANA_PRIORITY_FIELD_GID),
    permalinkUrl: t.permalink_url,
    asanaModifiedAt: t.modified_at ? new Date(t.modified_at) : null,
  };
}
```

- [ ] **Step 5: Run tests.** `npx vitest run src/lib/my-dashboard/asana-map.test.ts` → PASS (11 tests: 8 parse + 3 map).

- [ ] **Step 6: Commit** `types.ts`, `asana-map.ts`, `asana-map.test.ts` with message `feat(me): asana task mapper + dashboard types`.

---

### Task 3: Asana sync + cron route

**Files:**
- Create: `src/lib/my-dashboard/asana-sync.ts`, `src/lib/my-dashboard/asana-sync.test.ts`, `src/app/api/cron/asana-tasks-sync/route.ts`
- Modify: `vercel.json` (append to `crons`)

**Interfaces:**
- Consumes: `mapAsanaTask`, `AsanaApiTask`, `AsanaTaskRow`, `ASANA_REPORTING_PROJECT_GID`, `ASANA_OPT_FIELDS` (Task 2); `asanaTasks`, `asanaSyncState` (Task 1); `asanaFetch` (existing).
- Produces: `runAsanaSync(deps: AsanaSyncDeps): Promise<{ open: number; pages: number; closed: number }>`, `dbAsanaSyncDeps(): AsanaSyncDeps`.

- [ ] **Step 1: Write the failing test** `asana-sync.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/onboarding/create-asana-project", () => ({ asanaFetch: vi.fn() }));
import { runAsanaSync, type AsanaSyncDeps } from "./asana-sync";
import type { AsanaApiTask } from "./asana-map";

const task = (gid: string, assigneeEmail: string | null = "a@marketfoundry.agency"): AsanaApiTask => ({
  gid, name: `t${gid}`, completed: false, due_on: null, permalink_url: `u${gid}`,
  assignee: assigneeEmail ? { gid: "1", name: "A", email: assigneeEmail } : null,
  memberships: [{ project: { gid: "p", name: "SOP_SC_US | Sopreme" } }],
});

function deps(pages: { data: AsanaApiTask[]; next: string | null }[]): AsanaSyncDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { fetchPage: [], upsert: [], closeMissing: [] };
  let i = 0;
  return {
    calls,
    fetchPage: vi.fn(async (offset: string | null) => { calls.fetchPage.push(offset); const p = pages[i++]; return { data: p.data, nextOffset: p.next }; }),
    upsert: vi.fn(async (rows) => { calls.upsert.push(rows.map((r) => r.gid)); }),
    closeMissing: vi.fn(async (gids) => { calls.closeMissing.push(gids); return 2; }),
  };
}

describe("runAsanaSync", () => {
  it("follows pagination, upserts every page, closes rows not seen", async () => {
    const d = deps([{ data: [task("1"), task("2")], next: "off1" }, { data: [task("3")], next: null }]);
    const res = await runAsanaSync(d);
    expect(d.calls.fetchPage).toEqual([null, "off1"]);
    expect(d.calls.upsert).toEqual([["1", "2"], ["3"]]);
    expect(d.calls.closeMissing).toEqual([["1", "2", "3"]]);
    expect(res).toEqual({ open: 3, pages: 2, closed: 2 });
  });

  it("stores unassigned tasks too (filtering happens at read time)", async () => {
    const d = deps([{ data: [task("1", null)], next: null }]);
    await runAsanaSync(d);
    expect(d.calls.upsert).toEqual([["1"]]);
  });

  it("refuses to close out when the run fetched nothing", async () => {
    const d = deps([{ data: [], next: null }]);
    await expect(runAsanaSync(d)).rejects.toThrow(/zero open tasks/i);
    expect(d.closeMissing).not.toHaveBeenCalled();
  });

  it("does not close out when a later page fails", async () => {
    const d = deps([{ data: [task("1")], next: "off1" }]);
    (d.fetchPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ data: [task("1")], nextOffset: "off1" }))
      .mockImplementationOnce(async () => { throw new Error("Asana API 429"); });
    await expect(runAsanaSync(d)).rejects.toThrow("429");
    expect(d.closeMissing).not.toHaveBeenCalled();
  });

  it("stops after the page safety cap", async () => {
    const d = deps(Array.from({ length: 60 }, (_, k) => ({ data: [task(String(k))], next: `o${k}` })));
    await expect(runAsanaSync(d)).rejects.toThrow(/page cap/i);
    expect(d.closeMissing).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run src/lib/my-dashboard/asana-sync.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `asana-sync.ts`:**
```ts
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { asanaTasks, asanaSyncState } from "@/lib/db/schema";
import { asanaFetch } from "@/lib/onboarding/create-asana-project";
import { mapAsanaTask, ASANA_OPT_FIELDS, ASANA_REPORTING_PROJECT_GID, type AsanaApiTask, type AsanaTaskRow } from "./asana-map";

/** 393 open tasks on 2026-10-07 ⇒ 4 pages. 50 pages = 5,000 open tasks: past that, something is wrong. */
const MAX_PAGES = 50;

export interface AsanaSyncDeps {
  fetchPage(offset: string | null): Promise<{ data: AsanaApiTask[]; nextOffset: string | null }>;
  upsert(rows: AsanaTaskRow[]): Promise<void>;
  /** Mark every stored open row whose gid is NOT in `openGids` as completed. Returns rows changed. */
  closeMissing(openGids: string[]): Promise<number>;
}

export async function runAsanaSync(deps: AsanaSyncDeps): Promise<{ open: number; pages: number; closed: number }> {
  const seen: string[] = [];
  let offset: string | null = null;
  let pages = 0;
  do {
    if (pages >= MAX_PAGES) throw new Error(`Asana sync hit the page cap (${MAX_PAGES}); refusing to close out`);
    const page = await deps.fetchPage(offset);
    pages++;
    const rows = page.data.map(mapAsanaTask);
    if (rows.length) await deps.upsert(rows);
    seen.push(...rows.map((r) => r.gid));
    offset = page.nextOffset;
  } while (offset);

  // An empty run is far more likely an outage/permission change than a team with zero open tasks.
  if (seen.length === 0) throw new Error("Asana returned zero open tasks; refusing to mark everything completed");
  const closed = await deps.closeMissing(seen);
  return { open: seen.length, pages, closed };
}

export function dbAsanaSyncDeps(): AsanaSyncDeps {
  return {
    async fetchPage(offset) {
      const params = new URLSearchParams({
        project: ASANA_REPORTING_PROJECT_GID,
        completed_since: "now", // Asana: only incomplete tasks
        limit: "100",
        opt_fields: ASANA_OPT_FIELDS,
      });
      if (offset) params.set("offset", offset);
      const json = (await asanaFetch(`/tasks?${params}`)) as { data: AsanaApiTask[]; next_page: { offset: string } | null };
      return { data: json.data, nextOffset: json.next_page?.offset ?? null };
    },
    async upsert(rows) {
      const now = new Date();
      await db
        .insert(asanaTasks)
        .values(rows.map((r) => ({ ...r, syncedAt: now })))
        .onConflictDoUpdate({
          target: asanaTasks.gid,
          set: {
            name: sql`excluded.name`, assigneeEmail: sql`excluded.assignee_email`, assigneeName: sql`excluded.assignee_name`,
            dueOn: sql`excluded.due_on`, completed: sql`excluded.completed`, clientIdCode: sql`excluded.client_id_code`,
            originProjectName: sql`excluded.origin_project_name`, taskStatus: sql`excluded.task_status`,
            priority: sql`excluded.priority`, permalinkUrl: sql`excluded.permalink_url`,
            asanaModifiedAt: sql`excluded.asana_modified_at`, syncedAt: sql`excluded.synced_at`,
          },
        });
    },
    async closeMissing(openGids) {
      const res = await db
        .update(asanaTasks)
        .set({ completed: true, syncedAt: new Date() })
        .where(and(eq(asanaTasks.completed, false), notInArray(asanaTasks.gid, openGids)))
        .returning({ gid: asanaTasks.gid });
      return res.length;
    },
  };
}

export async function recordSyncState(result: { ok: true; open: number } | { ok: false; error: string }): Promise<void> {
  const now = new Date();
  const values = result.ok
    ? { id: 1, lastAttemptAt: now, lastSuccessAt: now, lastError: null, openCount: result.open }
    : { id: 1, lastAttemptAt: now, lastError: result.error.slice(0, 2000) };
  await db.insert(asanaSyncState).values(values).onConflictDoUpdate({ target: asanaSyncState.id, set: values });
}
```

- [ ] **Step 4: Run tests.** → PASS (5 tests).

- [ ] **Step 5: Write the cron route** `src/app/api/cron/asana-tasks-sync/route.ts`:
```ts
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
// Every 15 min: mirror open tasks of Asana project 1216052535915202 (which multi-homes every
// task in the workspace) into asana_tasks for the /me dashboard. Read-only towards Asana.
import { NextRequest, NextResponse } from "next/server";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { dbAsanaSyncDeps, recordSyncState, runAsanaSync } from "@/lib/my-dashboard/asana-sync";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAsanaToken()) return NextResponse.json({ skipped: true, reason: "No Asana token" });
  try {
    const result = await runAsanaSync(dbAsanaSyncDeps());
    await recordSyncState({ ok: true, open: result.open });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncState({ ok: false, error: message }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Register the cron.** In `vercel.json`, after the `reviews-sync` entry inside `"crons"`, add:
```json
    {
      "path": "/api/cron/asana-tasks-sync",
      "schedule": "*/15 * * * *"
    }
```
Validate: `node -e "JSON.parse(require('fs').readFileSync('/Users/manu/MFHub/vercel.json','utf8'))"` → no output.

- [ ] **Step 7: tsc** (judge by filename) **and commit** the four files: `feat(me): Asana task mirror sync + 15-min cron`.

---

### Task 4: Task grouping + due strip

**Files:**
- Create: `src/lib/my-dashboard/group-tasks.ts`, `src/lib/my-dashboard/group-tasks.test.ts`

**Interfaces:**
- Consumes: `DashTask`, `TaskGroupKey` (Task 2).
- Produces: `endOfWeek(today: string): string`, `addDays(ymd: string, n: number): string`, `isHighPriority(p: string | null): boolean`, `groupTasks(tasks: DashTask[], today: string): Record<TaskGroupKey, DashTask[]>`, `dueStrip(tasks: DashTask[], today: string, days?: number): { date: string; count: number }[]`.

- [ ] **Step 1: Write the failing test:**
```ts
import { describe, expect, it } from "vitest";
import { addDays, dueStrip, endOfWeek, groupTasks, isHighPriority } from "./group-tasks";
import type { DashTask } from "./types";

const t = (id: string, dueOn: string | null, extra: Partial<DashTask> = {}): DashTask => ({
  id, source: "asana", title: id, clientIdCode: null, dueOn, status: null, priority: null, url: "", ...extra,
});

describe("date helpers", () => {
  it("addDays crosses month ends", () => expect(addDays("2026-09-30", 1)).toBe("2026-10-01"));
  it("endOfWeek is the coming Sunday (Wed 2026-10-07 → Sun 2026-10-11)", () => expect(endOfWeek("2026-10-07")).toBe("2026-10-11"));
  it("endOfWeek on a Sunday is that Sunday", () => expect(endOfWeek("2026-10-11")).toBe("2026-10-11"));
});

describe("isHighPriority", () => {
  it.each([["P0 - Critical", true], ["P1 - High", true], ["P2 - Medium", false], ["⏳Waiting Client Approval", false], [null, false]])(
    "%s → %s", (p, e) => expect(isHighPriority(p as string | null)).toBe(e));
});

describe("groupTasks (today = Wed 2026-10-07)", () => {
  const today = "2026-10-07";
  it("puts each task in exactly one group by due date", () => {
    const g = groupTasks([
      t("over", "2026-10-06"), t("today", "2026-10-07"), t("sun", "2026-10-11"),
      t("mon", "2026-10-12"), t("none", null),
    ], today);
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((x) => x.id)]))).toEqual({
      overdue: ["over"], today: ["today"], week: ["sun"], later: ["mon"], nodate: ["none"],
    });
  });
  it("sorts P0/P1 first, then due date, then client", () => {
    const g = groupTasks([
      t("late-low", "2026-10-20"), t("early-low", "2026-10-13", { clientIdCode: "ZZZ_SC_US" }),
      t("early-low-a", "2026-10-13", { clientIdCode: "AAB_SC_US" }), t("late-high", "2026-10-25", { priority: "P1 - High" }),
    ], today);
    expect(g.later.map((x) => x.id)).toEqual(["late-high", "early-low-a", "early-low", "late-low"]);
  });
  it("overdue is oldest first", () => {
    const g = groupTasks([t("b", "2026-09-30"), t("a", "2026-07-31")], today);
    expect(g.overdue.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("dueStrip", () => {
  it("counts tasks per day for the next N days starting today, ignoring overdue and undated", () => {
    const s = dueStrip([t("a", "2026-10-07"), t("b", "2026-10-07"), t("c", "2026-10-09"), t("d", "2026-10-01"), t("e", null), t("f", "2026-10-30")], "2026-10-07", 3);
    expect(s).toEqual([{ date: "2026-10-07", count: 2 }, { date: "2026-10-08", count: 0 }, { date: "2026-10-09", count: 1 }]);
  });
  it("defaults to 14 days", () => expect(dueStrip([], "2026-10-07")).toHaveLength(14));
});
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement:**
```ts
import type { DashTask, TaskGroupKey } from "./types";

const toDay = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string { return fromDay(toDay(ymd) + n * 86_400_000); }

/** Weeks end on Sunday (matches the Sun-based weeks used across the Hub's sales views). */
export function endOfWeek(today: string): string {
  const dow = new Date(toDay(today)).getUTCDay(); // 0 = Sunday
  return addDays(today, dow === 0 ? 0 : 7 - dow);
}

export function isHighPriority(p: string | null): boolean { return !!p && /^P[01]\b/.test(p); }

function compare(a: DashTask, b: DashTask): number {
  const hp = Number(isHighPriority(b.priority)) - Number(isHighPriority(a.priority));
  if (hp) return hp;
  if (a.dueOn !== b.dueOn) return (a.dueOn ?? "9999") < (b.dueOn ?? "9999") ? -1 : 1;
  return (a.clientIdCode ?? "~").localeCompare(b.clientIdCode ?? "~");
}

export function groupTasks(tasks: DashTask[], today: string): Record<TaskGroupKey, DashTask[]> {
  const weekEnd = endOfWeek(today);
  const g: Record<TaskGroupKey, DashTask[]> = { overdue: [], today: [], week: [], later: [], nodate: [] };
  for (const t of tasks) {
    if (!t.dueOn) g.nodate.push(t);
    else if (t.dueOn < today) g.overdue.push(t);
    else if (t.dueOn === today) g.today.push(t);
    else if (t.dueOn <= weekEnd) g.week.push(t);
    else g.later.push(t);
  }
  g.overdue.sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : a.dueOn! > b.dueOn! ? 1 : compare(a, b)));
  for (const k of ["today", "week", "later", "nodate"] as const) g[k].sort(compare);
  return g;
}

export function dueStrip(tasks: DashTask[], today: string, days = 14): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) if (t.dueOn) counts.set(t.dueOn, (counts.get(t.dueOn) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => { const date = addDays(today, i); return { date, count: counts.get(date) ?? 0 }; });
}
```

- [ ] **Step 4: Run tests** → PASS (14 tests). **Step 5: Commit** `feat(me): task grouping + 14-day due strip`.

---

### Task 5: My accounts + alerts

**Files:**
- Modify: `src/lib/sales-summary-header.ts` (export `norm` as `normName`)
- Create: `src/lib/my-dashboard/my-accounts.ts`, `my-accounts.test.ts`, `src/lib/my-dashboard/alerts.ts`, `alerts.test.ts`

**Interfaces:**
- Consumes: `CLIENT_TEAM_ROLES`, `isDataStale`, `dataLagDays` (existing); `DashAlert`, `DashTask`, `MyAccount` (Task 2).
- Produces: `normName(s: string): string`; `accountsForUser(name: string | null, rows: AacRoleRow[]): MyAccount[]` with `AacRoleRow = { clientIdCode: string; clientName: string | null; clientLogoUrl: string | null; raw: Record<string, string> }`; `ppcAlerts(rows: PpcAlertRow[]): DashAlert[]`, `staleAlerts(clients: { clientIdCode: string; latestSalesDate: string | null }[], referenceDate: string | null): DashAlert[]`, `blockedAlerts(tasks: DashTask[]): DashAlert[]`, `rankAlerts(a: DashAlert[]): DashAlert[]`.

- [ ] **Step 1: Export the normaliser.** In `src/lib/sales-summary-header.ts` change `const norm = (s: string) => …` to:
```ts
export const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const norm = normName;
```
Run `npx vitest run src/lib/sales-summary-header.test.ts` → still PASS (no behaviour change).

- [ ] **Step 2: Write failing tests** `my-accounts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { accountsForUser } from "./my-accounts";

const row = (code: string, raw: Record<string, string>) => ({ clientIdCode: code, clientName: `${code} name`, clientLogoUrl: null, raw });

describe("accountsForUser", () => {
  it("returns every client where the name holds a role, with all its roles in display order", () => {
    const res = accountsForUser("Jo C.", [
      row("SOP_SC_US", { AccountManager_MF: "Jo C.", PPCManager_MF: "jo  c." }),
      row("WHI_SC_US", { ProjectManager_MF: "Someone Else" }),
      row("CFX_SC_US", { CatalogManager_MF: " JO C. " }),
    ]);
    expect(res).toEqual([
      { clientIdCode: "CFX_SC_US", clientName: "CFX_SC_US name", clientLogoUrl: null, roles: ["Catalog"] },
      { clientIdCode: "SOP_SC_US", clientName: "SOP_SC_US name", clientLogoUrl: null, roles: ["Account Manager", "PPC"] },
    ]);
  });
  it("returns [] for a null or blank name", () => {
    expect(accountsForUser(null, [row("SOP_SC_US", { AccountManager_MF: "" })])).toEqual([]);
    expect(accountsForUser("  ", [row("SOP_SC_US", { AccountManager_MF: "" })])).toEqual([]);
  });
});
```
`alerts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { blockedAlerts, ppcAlerts, rankAlerts, staleAlerts } from "./alerts";
import type { DashTask } from "./types";

describe("ppcAlerts", () => {
  it("maps severity and links to /ppc", () => {
    expect(ppcAlerts([{ id: "x", clientIdCode: "SOP_SC_US", severity: "critical", message: "Budget capped", createdAt: new Date("2026-10-06T00:00:00Z") }]))
      .toEqual([{ kind: "ppc", severity: "critical", clientIdCode: "SOP_SC_US", message: "Budget capped", url: "/ppc", at: "2026-10-06T00:00:00.000Z" }]);
  });
});

describe("staleAlerts", () => {
  it("flags clients ≥2 days behind the newest date, and clients with no data", () => {
    const a = staleAlerts([
      { clientIdCode: "OK_SC_US", latestSalesDate: "2026-10-05" },
      { clientIdCode: "TRT_SC_US", latestSalesDate: "2026-09-19" },
      { clientIdCode: "NEW_SC_US", latestSalesDate: null },
    ], "2026-10-06");
    expect(a.map((x) => [x.clientIdCode, x.message])).toEqual([
      ["TRT_SC_US", "Sales data ends 2026-09-19 (17 days behind)"],
      ["NEW_SC_US", "No sales data"],
    ]);
    expect(a[0].url).toBe("/sales-summary?client=TRT_SC_US");
  });
  it("returns [] without a reference date", () => expect(staleAlerts([{ clientIdCode: "A", latestSalesDate: null }], null)).toEqual([]));
});

describe("blockedAlerts", () => {
  const t = (status: string | null): DashTask => ({ id: status ?? "n", source: "asana", title: "Fix listing", clientIdCode: "SOP_SC_US", dueOn: null, status, priority: null, url: "https://asana/x" });
  it("only Blocked and On Hold", () => {
    expect(blockedAlerts([t("🚫Blocked"), t("⏸️On Hold"), t("🧑🏽‍💻In Progress"), t(null)]).map((a) => a.message))
      .toEqual(["Blocked: Fix listing", "On hold: Fix listing"]);
  });
});

describe("rankAlerts", () => {
  it("critical > warning > info, then ppc > stale > blocked, then newest first", () => {
    const mk = (kind: "ppc" | "stale" | "blocked", severity: "critical" | "warning" | "info", at: string | null) =>
      ({ kind, severity, clientIdCode: null, message: `${kind}-${severity}-${at}`, url: "", at });
    const r = rankAlerts([mk("blocked", "warning", null), mk("ppc", "info", "2026-10-01"), mk("stale", "warning", "2026-09-19"),
      mk("ppc", "warning", "2026-10-01"), mk("ppc", "warning", "2026-10-05"), mk("ppc", "critical", "2026-09-01")]);
    expect(r.map((a) => a.message)).toEqual([
      "ppc-critical-2026-09-01", "ppc-warning-2026-10-05", "ppc-warning-2026-10-01",
      "stale-warning-2026-09-19", "blocked-warning-null", "ppc-info-2026-10-01",
    ]);
  });
});
```

- [ ] **Step 3: Run to verify fail.**

- [ ] **Step 4: Implement `my-accounts.ts`:**
```ts
import { CLIENT_TEAM_ROLES, normName } from "@/lib/sales-summary-header";
import type { MyAccount } from "./types";

export interface AacRoleRow { clientIdCode: string; clientName: string | null; clientLogoUrl: string | null; raw: Record<string, string> }

/** aac.rawData stores team members by NAME (not user id) — match on the normalised name. */
export function accountsForUser(name: string | null, rows: AacRoleRow[]): MyAccount[] {
  const me = name ? normName(name) : "";
  if (!me) return [];
  const out: MyAccount[] = [];
  for (const r of rows) {
    const roles = CLIENT_TEAM_ROLES.filter(([key]) => r.raw[key] && normName(r.raw[key]) === me).map(([, label]) => label);
    if (roles.length) out.push({ clientIdCode: r.clientIdCode, clientName: r.clientName || r.clientIdCode, clientLogoUrl: r.clientLogoUrl, roles });
  }
  return out.sort((a, b) => a.clientIdCode.localeCompare(b.clientIdCode));
}
```
`alerts.ts`:
```ts
import { dataLagDays, isDataStale } from "@/lib/sales-summary-header";
import type { DashAlert, DashTask } from "./types";

export interface PpcAlertRow { id: string; clientIdCode: string; severity: "info" | "warning" | "critical"; message: string; createdAt: Date }

export function ppcAlerts(rows: PpcAlertRow[]): DashAlert[] {
  return rows.map((r) => ({ kind: "ppc", severity: r.severity, clientIdCode: r.clientIdCode, message: r.message, url: "/ppc", at: r.createdAt.toISOString() }));
}

export function staleAlerts(clients: { clientIdCode: string; latestSalesDate: string | null }[], referenceDate: string | null): DashAlert[] {
  if (!referenceDate) return [];
  return clients.filter((c) => isDataStale(c.latestSalesDate, referenceDate)).map((c) => ({
    kind: "stale", severity: "warning", clientIdCode: c.clientIdCode,
    message: c.latestSalesDate ? `Sales data ends ${c.latestSalesDate} (${dataLagDays(c.latestSalesDate, referenceDate)} days behind)` : "No sales data",
    url: `/sales-summary?client=${encodeURIComponent(c.clientIdCode)}`, at: c.latestSalesDate,
  }));
}

export function blockedAlerts(tasks: DashTask[]): DashAlert[] {
  const out: DashAlert[] = [];
  for (const t of tasks) {
    const s = t.status ?? "";
    const label = /blocked/i.test(s) ? "Blocked" : /on hold/i.test(s) ? "On hold" : null;
    if (label) out.push({ kind: "blocked", severity: "warning", clientIdCode: t.clientIdCode, message: `${label}: ${t.title}`, url: t.url, at: t.dueOn });
  }
  return out;
}

const SEV = { critical: 0, warning: 1, info: 2 } as const;
const KIND = { ppc: 0, stale: 1, blocked: 2 } as const;
export function rankAlerts(alerts: DashAlert[]): DashAlert[] {
  return [...alerts].sort((a, b) =>
    SEV[a.severity] - SEV[b.severity] || KIND[a.kind] - KIND[b.kind] || (b.at ?? "").localeCompare(a.at ?? ""));
}
```

- [ ] **Step 5: Run tests** → PASS (my-accounts 2, alerts 6). **Step 6: Commit** the five files: `feat(me): my-accounts matcher + alert builders`.

---

### Task 6: Access rules, data loader, API route

**Files:**
- Create: `src/lib/my-dashboard/access.ts`, `access.test.ts`, `src/lib/my-dashboard/load.ts`, `src/app/api/me/dashboard/route.ts`

**Interfaces:**
- Consumes: everything above; `getAuthSession` (`src/lib/auth-db.ts`), `isHubStaff`, `hasAdminPowers`, `getCachedData`, `buildSummaryCacheKey`, `buildDailyCacheKey`, `recentWeekRanges` (`src/lib/iso-week.ts`), `getStepDef` (`src/lib/onboarding/steps.ts`).
- Produces: `GET /api/me/dashboard?user=<uuid>&today=<YYYY-MM-DD>` → `MyDashboardPayload`.

- [ ] **Step 0: Verify session shape.** Read `src/lib/auth-db.ts:40-100` and confirm the returned session exposes `user.id` (the users-table uuid) and `user.role`. If the id field has another name, use that name everywhere `session.user.id` appears below.

- [ ] **Step 1: Write failing test** `access.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolveTargetUser, resolveToday } from "./access";

describe("resolveTargetUser", () => {
  it("staff without ?user sees themselves", () => expect(resolveTargetUser({ id: "me", role: "editor" }, null)).toEqual({ ok: true, id: "me", canPick: false }));
  it("staff asking for themselves is fine", () => expect(resolveTargetUser({ id: "me", role: "viewer" }, "me")).toEqual({ ok: true, id: "me", canPick: false }));
  it("non-admin asking for someone else gets 403", () => expect(resolveTargetUser({ id: "me", role: "editor" }, "other")).toEqual({ ok: false, status: 403 }));
  it.each(["admin", "super_admin", "owner"])("%s may view others", (role) =>
    expect(resolveTargetUser({ id: "me", role }, "other")).toEqual({ ok: true, id: "other", canPick: true }));
  it.each(["client", "pending", "prospect", null])("%s is refused", (role) =>
    expect(resolveTargetUser({ id: "me", role }, null)).toEqual({ ok: false, status: 403 }));
});

describe("resolveToday", () => {
  const now = new Date("2026-10-07T23:30:00Z");
  it("accepts a browser date within ±1 day of server UTC", () => {
    expect(resolveToday("2026-10-08", now)).toBe("2026-10-08"); // Pakistan, already tomorrow
    expect(resolveToday("2026-10-06", now)).toBe("2026-10-06");
  });
  it("falls back to UTC for missing, malformed or far-off values", () => {
    for (const v of [null, "", "2026-13-01", "yesterday", "2026-10-20"]) expect(resolveToday(v, now)).toBe("2026-10-07");
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement `access.ts`:**
```ts
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import { addDays } from "./group-tasks";

export function resolveTargetUser(viewer: { id: string; role: string | null }, requested: string | null):
  { ok: true; id: string; canPick: boolean } | { ok: false; status: 403 } {
  if (!isHubStaff(viewer.role)) return { ok: false, status: 403 };
  const canPick = hasAdminPowers(viewer.role);
  if (!requested || requested === viewer.id) return { ok: true, id: viewer.id, canPick };
  return canPick ? { ok: true, id: requested, canPick } : { ok: false, status: 403 };
}

/** The browser's local date (team spans PK/ES/US). Only trusted within ±1 day of server UTC. */
export function resolveToday(param: string | null, now: Date = new Date()): string {
  const utc = now.toISOString().slice(0, 10);
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return utc;
  const d = new Date(`${param}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== param) return utc;
  return param === utc || param === addDays(utc, 1) || param === addDays(utc, -1) ? param : utc;
}
```

- [ ] **Step 4: Run → PASS (11 tests).**

- [ ] **Step 5: Implement `load.ts`** (DB glue; covered by Task 8's real-data run, not unit tests):
```ts
import { and, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, asanaSyncState, asanaTasks, clientOnboardingSteps, ppcAlerts as ppcAlertsTable, users } from "@/lib/db/schema";
import { buildDailyCacheKey, buildSummaryCacheKey, getCachedData } from "@/lib/sales-cache";
import { recentWeekRanges } from "@/lib/iso-week";
import { getStepDef } from "@/lib/onboarding/steps";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { isHubStaff } from "@/lib/roles";
import { dueStrip, groupTasks } from "./group-tasks";
import { accountsForUser } from "./my-accounts";
import { blockedAlerts, ppcAlerts, rankAlerts, staleAlerts } from "./alerts";
import type { AccountCard, DashAlert, DashTask, MyDashboardPayload, Section } from "./types";

async function section<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try { return { data: await fn(), error: null }; }
  catch (e) { console.error("[me/dashboard]", e); return { data: null, error: e instanceof Error ? e.message : String(e) }; }
}

function parseRaw(raw: unknown): Record<string, string> {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}

type CachedClient = { clientIdCode: string; accountIds: string[]; latestSalesDate: string | null; current?: { product_sales: number }; previous?: { product_sales: number } | null };

export async function loadMyDashboard(personId: string, viewer: { id: string; canPick: boolean }, today: string): Promise<MyDashboardPayload | null> {
  const [person] = await db.select({ id: users.id, name: users.name, email: users.email, image: users.image }).from(users).where(eq(users.id, personId)).limit(1);
  if (!person?.email) return null;

  const [syncRow] = await db.select().from(asanaSyncState).where(eq(asanaSyncState.id, 1)).limit(1);

  const taskList = await section(async () => {
    const asana = await db.select().from(asanaTasks)
      .where(and(eq(asanaTasks.completed, false), sql`lower(${asanaTasks.assigneeEmail}) = ${person.email.toLowerCase()}`));
    const steps = await db.select().from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.assigneeId, person.id), ne(clientOnboardingSteps.status, "completed")));
    const tasks: DashTask[] = [
      ...asana.map((r) => ({ id: r.gid, source: "asana" as const, title: r.name, clientIdCode: r.clientIdCode, dueOn: r.dueOn, status: r.taskStatus, priority: r.priority, url: r.permalinkUrl })),
      ...steps.map((s) => ({ id: s.id, source: "hub" as const, title: getStepDef(s.stepKey)?.label ?? s.stepKey, clientIdCode: s.clientIdCode, dueOn: null, status: s.status, priority: null, url: "/onboarding" })),
    ];
    return tasks;
  });

  // Last COMPLETE Sun–Sat week: the only whole week the sales cron warms (weeks[0] is partial).
  const week = recentWeekRanges(new Date(`${today}T12:00:00Z`), 2)[1];
  const summary = await section(async () => {
    const cached = await getCachedData<{ clients: CachedClient[] }>("summary", buildSummaryCacheKey(week.start, week.end));
    return cached?.clients ?? null;
  });

  const accounts = await section(async () => {
    const rows = await db.select({ clientIdCode: aac.clientIdCode, clientName: aac.clientName, clientLogoUrl: aac.clientLogoUrl, rawData: aac.rawData })
      .from(aac).where(ilike(aac.clientStatus, "active"));
    return accountsForUser(person.name, rows.map((r) => ({ clientIdCode: r.clientIdCode, clientName: r.clientName, clientLogoUrl: r.clientLogoUrl, raw: parseRaw(r.rawData) })));
  });
  const myCodes = (accounts.data ?? []).map((a) => a.clientIdCode);
  const tasks = taskList.data ?? [];

  const alerts = await section(async () => {
    const out: DashAlert[] = [...blockedAlerts(tasks)];
    if (myCodes.length) {
      const ppc = await db.select({ id: ppcAlertsTable.id, clientIdCode: ppcAlertsTable.clientIdCode, severity: ppcAlertsTable.severity, message: ppcAlertsTable.message, createdAt: ppcAlertsTable.createdAt })
        .from(ppcAlertsTable).where(and(isNull(ppcAlertsTable.acknowledgedAt), inArray(ppcAlertsTable.clientIdCode, myCodes)));
      out.push(...ppcAlerts(ppc));
    }
    const all = summary.data ?? [];
    const reference = all.reduce<string | null>((m, c) => (c.latestSalesDate && (!m || c.latestSalesDate > m) ? c.latestSalesDate : m), null);
    out.push(...staleAlerts(all.filter((c) => myCodes.includes(c.clientIdCode)), reference));
    return rankAlerts(out);
  });

  const cards = await section(async () => {
    const byCode = new Map((summary.data ?? []).map((c) => [c.clientIdCode, c]));
    const grouped = groupTasks(tasks, today);
    const overdueIds = new Set(grouped.overdue.map((t) => t.id));
    return Promise.all((accounts.data ?? []).map(async (a): Promise<AccountCard> => {
      const c = byCode.get(a.clientIdCode);
      const last = c?.current ? Number(c.current.product_sales) : null;
      const prev = c?.previous ? Number(c.previous.product_sales) : null;
      let spark: number[] = [];
      if (c?.accountIds?.length) {
        const daily = await getCachedData<{ days: { report_date: string; product_sales: number | string }[] }>("daily", buildDailyCacheKey(week.start, week.end, c.accountIds.join(",")));
        spark = (daily?.days ?? []).map((d) => Number(d.product_sales) || 0);
      }
      const mine = tasks.filter((t) => t.clientIdCode === a.clientIdCode);
      return {
        ...a, salesLastWeek: last, salesWeekBefore: prev,
        changePct: last != null && prev ? ((last - prev) / prev) * 100 : null,
        spark, openTasks: mine.length, overdueTasks: mine.filter((t) => overdueIds.has(t.id)).length,
        alertCount: (alerts.data ?? []).filter((x) => x.clientIdCode === a.clientIdCode).length,
      };
    }));
  });

  const staff = viewer.canPick
    ? (await db.select({ id: users.id, name: users.name, role: users.role, email: users.email }).from(users))
        .filter((u) => isHubStaff(u.role) && u.email?.toLowerCase().endsWith("@marketfoundry.agency"))
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    : null;

  return {
    viewer: { id: viewer.id, canPickPerson: viewer.canPick },
    person: { id: person.id, name: person.name, email: person.email, image: person.image },
    today,
    sync: { lastSuccessAt: syncRow?.lastSuccessAt?.toISOString() ?? null, lastError: syncRow?.lastError ?? null, connected: hasAsanaToken() },
    tasks: taskList.error ? { data: null, error: taskList.error } : { data: groupTasks(tasks, today), error: null },
    dueStrip: taskList.error ? { data: null, error: taskList.error } : { data: dueStrip(tasks, today), error: null },
    alerts,
    accounts: cards.error || accounts.error
      ? { data: null, error: cards.error ?? accounts.error }
      : { data: { cards: cards.data ?? [], matchedName: person.name, salesWeek: summary.data ? week : null }, error: null },
    staff,
  };
}
```
Note: verify `users.role` and `users.image` column names with `grep -n "export const users = pgTable" -A25 src/lib/db/schema.ts` and adjust if different.

- [ ] **Step 6: Implement the route** `src/app/api/me/dashboard/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { resolveTargetUser, resolveToday } from "@/lib/my-dashboard/access";
import { loadMyDashboard } from "@/lib/my-dashboard/load";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const viewer = { id: session.user.id as string, role: (session.user.role as string | undefined) ?? null };
  const target = resolveTargetUser(viewer, req.nextUrl.searchParams.get("user"));
  if (!target.ok) return NextResponse.json({ error: "Forbidden" }, { status: target.status });
  const today = resolveToday(req.nextUrl.searchParams.get("today"));
  const payload = await loadMyDashboard(target.id, { id: viewer.id, canPick: target.canPick }, today);
  if (!payload) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(payload);
}
```

- [ ] **Step 7: tsc** (judge by filename; fix any type error in `load.ts`/`route.ts`). **Step 8: Commit** the four files: `feat(me): dashboard API with per-section errors and admin person access`.

---

### Task 7: `/me` page + nav item

**Files:**
- Create: `src/app/me/page.tsx`, `src/components/my-dashboard/task-list.tsx`, `alerts-panel.tsx`, `account-cards.tsx`, `due-strip.tsx`, `header-strip.tsx`
- Modify: `src/components/layout/app-sidebar.tsx:58-61`

**Interfaces:**
- Consumes: `MyDashboardPayload`, `TaskGroupKey`, `DashTask`, `DashAlert`, `AccountCard` (Task 2); `GET /api/me/dashboard` (Task 6).

- [ ] **Step 0: Read `DESIGN.md`** (Typography, Color, Spacing sections) and one existing card page for idiom, e.g. `src/app/page.tsx` (uses `PageMetaSlot`, `EmptyState`, `LoadingPlaceholder`). Use those shared components; do not invent new tokens.

- [ ] **Step 1: Nav item.** In `src/components/layout/app-sidebar.tsx`, make "My Dashboard" the first entry of `topLevelItems` (import `LayoutDashboard` from `lucide-react` alongside the existing icon imports):
```ts
    { title: "My Dashboard", href: "/me", icon: LayoutDashboard, visible: isHubStaff(role) },
```

- [ ] **Step 2: `header-strip.tsx`:**
```tsx
"use client";
import type { MyDashboardPayload } from "@/lib/my-dashboard/types";

export type Focus = "overdue" | "today" | "week" | "alerts" | null;

function syncTone(lastSuccessAt: string | null): { label: string; cls: string } {
  if (!lastSuccessAt) return { label: "Asana never synced", cls: "text-brand-red" };
  const mins = Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 60_000);
  const label = mins < 60 ? `Asana synced ${mins} min ago` : `Asana synced ${Math.round(mins / 60)} h ago`;
  return { label, cls: mins > 360 ? "text-brand-red" : mins > 60 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground" };
}

export function HeaderStrip({ data, onFocus }: { data: MyDashboardPayload; onFocus: (f: Focus) => void }) {
  const g = data.tasks.data;
  const counters: { key: Exclude<Focus, null>; label: string; value: number | null }[] = [
    { key: "overdue", label: "Overdue", value: g ? g.overdue.length : null },
    { key: "today", label: "Due today", value: g ? g.today.length : null },
    { key: "week", label: "This week", value: g ? g.week.length : null },
    { key: "alerts", label: "Alerts", value: data.alerts.data ? data.alerts.data.length : null },
  ];
  const sync = data.sync.connected ? syncTone(data.sync.lastSuccessAt) : { label: "Asana not connected", cls: "text-brand-red" };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{data.person.name ?? data.person.email}</h1>
        <span className={`text-xs ${sync.cls}`} title={data.sync.lastError ?? undefined}>{sync.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map((c) => (
          <button key={c.key} type="button" onClick={() => onFocus(c.key)}
            className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-brand">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${c.key === "overdue" && c.value ? "text-brand-red" : ""}`}>{c.value ?? "—"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `task-list.tsx`** (Overdue collapsed by default; `forceOpen` lets the Overdue counter expand it; `filterDate` comes from the due strip):
```tsx
"use client";
import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { DashTask, Section, TaskGroupKey } from "@/lib/my-dashboard/types";
import { isHighPriority } from "@/lib/my-dashboard/group-tasks";

const LABELS: Record<TaskGroupKey, string> = { overdue: "Overdue", today: "Today", week: "This week", later: "Later", nodate: "No due date" };
const ORDER: TaskGroupKey[] = ["overdue", "today", "week", "later", "nodate"];
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Row({ t }: { t: DashTask }) {
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      {isHighPriority(t.priority) && <span className="size-2 shrink-0 rounded-full bg-brand-red" title={t.priority ?? ""} />}
      <a href={t.url} target={t.source === "asana" ? "_blank" : undefined} rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{t.title}</a>
      {t.source === "hub" && <span className="rounded bg-muted px-1.5 text-[11px]">Hub</span>}
      {t.clientIdCode && <span className="rounded border px-1.5 font-mono text-[11px]">{t.clientIdCode}</span>}
      {t.status && <span className="hidden max-w-40 truncate text-xs text-muted-foreground md:inline">{t.status}</span>}
      {t.dueOn && <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{fmt(t.dueOn)}</span>}
      {t.source === "asana" && <ExternalLink className="size-3 text-muted-foreground" aria-hidden />}
    </li>
  );
}

export function TaskList({ tasks, syncFresh, forceOpen, filterDate, onClearFilter }: {
  tasks: Section<Record<TaskGroupKey, DashTask[]>>; syncFresh: boolean; forceOpen: boolean; filterDate: string | null; onClearFilter: () => void;
}) {
  const [overdueOpen, setOverdueOpen] = useState(false);
  if (tasks.error) return <p className="text-sm text-brand-red">Couldn&apos;t load tasks: {tasks.error}</p>;
  const g = tasks.data!;
  const total = ORDER.reduce((n, k) => n + g[k].length, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">{syncFresh ? "No tasks assigned to you in Asana." : "Asana sync is stale — tasks may be missing."}</p>;
  if (filterDate) {
    const list = ORDER.flatMap((k) => g[k]).filter((t) => t.dueOn === filterDate);
    return (
      <div>
        <button type="button" onClick={onClearFilter} className="mb-2 text-xs text-brand hover:underline">Showing {fmt(filterDate)} — clear</button>
        <ul className="divide-y">{list.map((t) => <Row key={t.id} t={t} />)}</ul>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {ORDER.map((k) => {
        if (!g[k].length) return null;
        if (k === "overdue") {
          const open = overdueOpen || forceOpen;
          return (
            <section key={k} id="tasks-overdue">
              <button type="button" onClick={() => setOverdueOpen(!open)} className="flex items-center gap-1 text-sm font-medium text-brand-red" aria-expanded={open}>
                <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
                {g.overdue.length} overdue — oldest {fmt(g.overdue[0].dueOn!)}
              </button>
              {open && <ul className="divide-y pl-5">{g.overdue.map((t) => <Row key={t.id} t={t} />)}</ul>}
            </section>
          );
        }
        return (
          <section key={k} id={`tasks-${k}`}>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{LABELS[k]} · {g[k].length}</h3>
            <ul className="divide-y">{g[k].map((t) => <Row key={t.id} t={t} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: `alerts-panel.tsx`:**
```tsx
"use client";
import type { DashAlert, Section } from "@/lib/my-dashboard/types";
const DOT = { critical: "bg-brand-red", warning: "bg-amber-500", info: "bg-muted-foreground" } as const;

export function AlertsPanel({ alerts }: { alerts: Section<DashAlert[]> }) {
  if (alerts.error) return <p className="text-sm text-brand-red">Couldn&apos;t load alerts: {alerts.error}</p>;
  if (!alerts.data!.length) return <p className="text-sm text-muted-foreground">No alerts on your accounts.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.data!.map((a, i) => (
        <li key={`${a.kind}-${a.clientIdCode}-${i}`} className="flex gap-2 text-sm">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[a.severity]}`} />
          <a href={a.url} className="hover:underline">
            {a.clientIdCode && <span className="mr-1 font-mono text-xs">{a.clientIdCode}</span>}{a.message}
          </a>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: `account-cards.tsx`** (sparkline as inline SVG polyline — no new chart dependency):
```tsx
"use client";
import type { AccountCard, MyDashboardPayload } from "@/lib/my-dashboard/types";

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ");
  return <svg viewBox="0 0 100 30" className="h-8 w-full" aria-hidden><polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}
const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Card({ c }: { c: AccountCard }) {
  return (
    <a href={`/sales-summary?client=${encodeURIComponent(c.clientIdCode)}`} className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-brand">
      <div className="flex items-center gap-2">
        {c.clientLogoUrl && <img src={c.clientLogoUrl} alt="" className="size-6 rounded object-contain" />}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{c.clientName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{c.clientIdCode} · {c.roles.join(", ")}</div>
        </div>
      </div>
      {c.salesLastWeek == null ? <div className="text-xs text-muted-foreground">Sales unavailable</div> : (
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold tabular-nums">{money(c.salesLastWeek)}</span>
          {c.changePct != null && <span className={`text-xs tabular-nums ${c.changePct >= 0 ? "text-brand-green" : "text-brand-red"}`}>{c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(1)}%</span>}
        </div>
      )}
      <Spark values={c.spark} />
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{c.openTasks} open</span>
        {c.overdueTasks > 0 && <span className="text-brand-red">{c.overdueTasks} overdue</span>}
        {c.alertCount > 0 && <span>{c.alertCount} alert{c.alertCount > 1 ? "s" : ""}</span>}
      </div>
    </a>
  );
}

export function AccountCards({ accounts }: { accounts: MyDashboardPayload["accounts"] }) {
  if (accounts.error) return <p className="text-sm text-brand-red">Couldn&apos;t load accounts: {accounts.error}</p>;
  const d = accounts.data!;
  if (!d.cards.length) return <p className="text-sm text-muted-foreground">No accounts linked to your name. Matched on “{d.matchedName ?? "(no name)"}” in the client team fields.</p>;
  return (
    <div className="flex flex-col gap-2">
      {d.salesWeek && <p className="text-xs text-muted-foreground">Sales: week {d.salesWeek.start} → {d.salesWeek.end} vs the week before</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{d.cards.map((c) => <Card key={c.clientIdCode} c={c} />)}</div>
    </div>
  );
}
```

- [ ] **Step 6: `due-strip.tsx`:**
```tsx
"use client";
import type { Section } from "@/lib/my-dashboard/types";

export function DueStrip({ strip, today, selected, onSelect }: { strip: Section<{ date: string; count: number }[]>; today: string; selected: string | null; onSelect: (d: string | null) => void }) {
  if (strip.error || !strip.data) return null;
  const max = Math.max(...strip.data.map((d) => d.count), 1);
  return (
    <div className="grid grid-cols-7 gap-1 sm:grid-cols-14">
      {strip.data.map((d) => {
        const day = new Date(`${d.date}T12:00:00Z`);
        return (
          <button key={d.date} type="button" onClick={() => onSelect(selected === d.date ? null : d.date)} disabled={!d.count}
            className={`flex flex-col items-center rounded-md border p-1 text-[11px] ${d.date === today ? "border-brand" : ""} ${selected === d.date ? "bg-muted" : ""} disabled:opacity-50`}>
            <span className="text-muted-foreground">{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <span>{day.getUTCDate()}</span>
            <span className="mt-1 h-6 w-2 rounded-sm bg-muted"><span className="block w-full rounded-sm bg-brand" style={{ height: `${(d.count / max) * 100}%`, marginTop: `${100 - (d.count / max) * 100}%` }} /></span>
            <span className="tabular-nums">{d.count || ""}</span>
          </button>
        );
      })}
    </div>
  );
}
```
Note: `sm:grid-cols-14` needs Tailwind 4's arbitrary support — if it doesn't render 14 columns, use `sm:grid-cols-[repeat(14,minmax(0,1fr))]`.

- [ ] **Step 7: `src/app/me/page.tsx`:**
```tsx
"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import type { MyDashboardPayload } from "@/lib/my-dashboard/types";
import { HeaderStrip, type Focus } from "@/components/my-dashboard/header-strip";
import { TaskList } from "@/components/my-dashboard/task-list";
import { AlertsPanel } from "@/components/my-dashboard/alerts-panel";
import { AccountCards } from "@/components/my-dashboard/account-cards";
import { DueStrip } from "@/components/my-dashboard/due-strip";

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function MyDashboardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const user = params.get("user");
  const [focus, setFocus] = useState<Focus>(null);
  const [filterDate, setFilterDate] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["me-dashboard", user],
    queryFn: async (): Promise<MyDashboardPayload> => {
      const qs = new URLSearchParams({ today: localToday() });
      if (user) qs.set("user", user);
      const res = await fetch(`/api/me/dashboard?${qs}`, { signal: AbortSignal.timeout(25_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return <LoadingPlaceholder />;
  if (error || !data) return <p className="p-6 text-sm text-brand-red">Couldn&apos;t load your dashboard ({(error as Error)?.message ?? "no data"}).</p>;

  const syncFresh = !!data.sync.lastSuccessAt && Date.now() - new Date(data.sync.lastSuccessAt).getTime() < 3_600_000;
  const onFocus = (f: Focus) => {
    setFocus(f);
    setFilterDate(null);
    document.getElementById(f === "alerts" ? "alerts" : `tasks-${f}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <PageMetaSlot title="My Dashboard" />
      {data.staff && (
        <select value={data.person.id} onChange={(e) => router.push(e.target.value === data.viewer.id ? "/me" : `/me?user=${e.target.value}`)}
          className="w-64 rounded-md border bg-background px-2 py-1 text-sm" aria-label="View dashboard for">
          {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
        </select>
      )}
      <HeaderStrip data={data} onFocus={onFocus} />
      <DueStrip strip={data.dueStrip} today={data.today} selected={filterDate} onSelect={setFilterDate} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border bg-card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">My tasks</h2>
          <TaskList tasks={data.tasks} syncFresh={syncFresh} forceOpen={focus === "overdue"} filterDate={filterDate} onClearFilter={() => setFilterDate(null)} />
        </section>
        <section id="alerts" className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Alerts</h2>
          <AlertsPanel alerts={data.alerts} />
        </section>
      </div>
      <section>
        <h2 className="mb-3 text-sm font-semibold">My accounts</h2>
        <AccountCards accounts={data.accounts} />
      </section>
    </div>
  );
}
```
Verify `PageMetaSlot`'s prop names in `src/components/layout/page-header-slot.tsx` and `LoadingPlaceholder`'s import path before relying on them; adjust to the real API. Never mount `PageMetaSlot` inside a `.map()` (memory: last-writer-wins). `useSearchParams` in a client page may need a `<Suspense>` wrapper under Next 16 — if the dev server warns, wrap the default export's body in `<Suspense fallback={<LoadingPlaceholder />}>`.

- [ ] **Step 8: Lint + tsc.** `npx eslint src/app/me src/components/my-dashboard src/components/layout/app-sidebar.tsx` → 0 errors; tsc by filename.

- [ ] **Step 9: Commit** the seven files: `feat(me): /me dashboard page + My Dashboard nav item`.

---

### Task 8: Real-data verification (needs Manu's OKs)

**Files:**
- Create: `scripts/_tmp-asana-dashboard-probe.ts`

- [ ] **Step 1: Read-only Asana probe** (no DB writes). Write `scripts/_tmp-asana-dashboard-probe.ts`:
```ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { asanaFetch } = await import("@/lib/onboarding/create-asana-project");
  const { mapAsanaTask, ASANA_OPT_FIELDS, ASANA_REPORTING_PROJECT_GID } = await import("@/lib/my-dashboard/asana-map");
  const rows = [];
  let offset: string | null = null;
  do {
    const p = new URLSearchParams({ project: ASANA_REPORTING_PROJECT_GID, completed_since: "now", limit: "100", opt_fields: ASANA_OPT_FIELDS });
    if (offset) p.set("offset", offset);
    const j = await asanaFetch(`/tasks?${p}`);
    rows.push(...j.data.map(mapAsanaTask));
    offset = j.next_page?.offset ?? null;
  } while (offset);
  const assigned = rows.filter((r) => r.assigneeEmail);
  const byEmail = new Map<string, number>();
  for (const r of assigned) byEmail.set(r.assigneeEmail!, (byEmail.get(r.assigneeEmail!) ?? 0) + 1);
  console.log({ open: rows.length, assigned: assigned.length, withClientCode: rows.filter((r) => r.clientIdCode).length, withDue: rows.filter((r) => r.dueOn).length });
  console.log("per assignee:", Object.fromEntries([...byEmail].sort((a, b) => b[1] - a[1])));
  console.log("client codes:", [...new Set(rows.map((r) => r.clientIdCode).filter(Boolean))].sort().join(" "));

  // Subtask gap: open subtasks of the first 25 assigned parents that are NOT in the project list.
  const inProject = new Set(rows.map((r) => r.gid));
  let missing = 0;
  for (const r of assigned.slice(0, 25)) {
    const s = await asanaFetch(`/tasks/${r.gid}/subtasks?opt_fields=completed,assignee.email`);
    missing += s.data.filter((x: { gid: string; completed: boolean; assignee: unknown }) => !x.completed && x.assignee && !inProject.has(x.gid)).length;
  }
  console.log({ subtaskSampleParents: Math.min(25, assigned.length), openAssignedSubtasksMissing: missing });
}
main().catch((e) => { console.error(e); process.exit(1); });
```
Run: `npx tsx scripts/_tmp-asana-dashboard-probe.ts`. Expected: `open` ≈ 393 (± a day's drift); `withClientCode` well above half. **Report the numbers to Manu**, including `openAssignedSubtasksMissing`. If it is > 0, stop and ask whether subtasks are in scope before going further.

- [ ] **Step 2: Ask Manu for the OK to apply the migration**, naming the file and the two tables. Only on an explicit yes: `npx tsx scripts/_apply-<NNNN>.ts`.

- [ ] **Step 3: Seed one sync locally** — with Manu's OK (it writes to the prod DB `.env.local` points at): start the dev server on PORT=3100 and call the cron route with the bearer secret, or run `npx tsx -e` importing `runAsanaSync(dbAsanaSyncDeps())` + `recordSyncState`. Confirm `select count(*) from asana_tasks where not completed` equals the probe's `open`.

- [ ] **Step 4: Run the whole new test set + tsc.**
```bash
npx vitest run src/lib/my-dashboard src/lib/sales-summary-header.test.ts
```
Expected: asana-map 11 + asana-sync 5 + group-tasks 14 + my-accounts 2 + alerts 6 + access 11 = **49 new tests passing**, plus the existing header tests unchanged. Then `node_modules/.bin/tsc --noEmit` → no errors in any file this plan created or modified.

- [ ] **Step 5: Browser pass on `PORT=3100`** (never 3000, never `next build`): as Manu → tasks grouped, Overdue collapsed with count + oldest date, counters scroll, due-strip day filter, alerts list, account cards (or the "No accounts linked" message showing the matched name); admin picker → open one non-admin staff member's page; then sign in as (or mint a session for) a non-admin staff user and confirm `/api/me/dashboard?user=<other id>` returns 403. Screenshot each.

- [ ] **Step 6: Delete the probe script** (Edit-tool or `git rm` is not applicable — it was never committed; leave it untracked and tell Manu, since `rm -f` is hook-blocked). Report results; do not push.

---

## Self-review (done while writing)

- **Spec coverage:** §4 units → Tasks 2–7; §5 tables → Task 1; §6.1 header → Task 7 Step 2; §6.2 tasks (+ S6 dropped, see deltas) → Tasks 4, 6, 7; §6.3 alerts → Tasks 5, 6; §6.4 accounts → Tasks 5, 6, 7 (sales week delta); §6.5 strip → Tasks 4, 7; §7 access/nav → Tasks 6, 7; §8 failures → Task 3 (refuse empty close-out, sync state), Task 6 (per-section errors), Task 7 (stale stamp colours, "not connected", "Sales unavailable", "No accounts linked … matched on"); §9 testing → Tasks 2–6 unit, Task 8 real run + browser. Optional `/team/[userId]` link is left out (spec marked it optional; YAGNI).
- **Names checked across tasks:** `mapAsanaTask`, `runAsanaSync`, `dbAsanaSyncDeps`, `recordSyncState`, `groupTasks`, `dueStrip`, `addDays`, `endOfWeek`, `isHighPriority`, `accountsForUser`, `normName`, `ppcAlerts`/`staleAlerts`/`blockedAlerts`/`rankAlerts`, `resolveTargetUser`, `resolveToday`, `loadMyDashboard` — each defined once and used with the same signature. `ppcAlerts` (builder) vs `ppcAlertsTable` (schema import alias) is deliberate in `load.ts`.
