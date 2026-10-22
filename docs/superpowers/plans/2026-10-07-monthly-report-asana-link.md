# Monthly Report ↔ Asana Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Hub creates each monthly-report period's Asana task (one subtask per actual PM/AM/CEO reviewer, working-day deadlines), ticks/unticks each person's subtask as their review queue empties/refills, caps failing report generation at 3 tries, and links Asana from `/me` and `/reports/monthly`.

**Architecture:** Pure planners (`deadlines`, `reviewers`, `plan`) decide everything; a thin Asana adapter executes; an orchestrator (`ensurePeriodTask`, `syncPeriodSubtasks`) reads/writes one new table and never throws. Hooks fire after generate (cron + manual POST) and after every review status change (PATCH, via `after()` so responses are never delayed). Pages read links from the DB only.

**Tech Stack:** Next.js 16 route handlers (`after` from `next/server`), Drizzle + postgres.js, Asana REST via existing `asanaFetch`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-monthly-report-asana-link-design.md` (approved 2026-10-07). Read it first — §2 locked decisions L1–L10 are binding.

## Global Constraints

- Branch/worktree: `thread-af/me-dashboard` in `/Users/manu/MFHub/.worktrees/thread-af-me-dashboard`. Commit locally only, never push.
- Asana project `1219237652232682` ("MarketFoundry | Agency recurring Tasks"), section `1219237652232685` ("Data & Reporting"), workspace `1216006599656808`.
- Template custom fields (copy values onto the parent): Recurrence Frequency `1219237652232690` = Monthly `1219237652232694`; Priority `1219237652232697` = High `1219237652232699`; Data Source (multi-enum) `1219237599617929` = [MfHub `1219237599617958`]; Task Type `1219237599617938` = Reporting `1219237599617939`; Delivery Format `1219237599617946` = Internal Only `1219237599617952`.
- Names: parent `MarketFoundry | Monthly Reports | <Mon YYYY>` (period label, e.g. "Sep 2026"); subtasks `MarketFoundry | Monthly Reports | PM Review — <Name>`, `… | AM Review — <Name>`, `… | CEO Review, Approve and Send`.
- Hub link in notes: `https://www.marketfoundryhub.com/reports/monthly`.
- Deadlines (L9): generation day = 4th of the month after the period; PM = that day or next Monday if Sat/Sun; AM = next working day after PM; CEO = next working day after AM; parent due = CEO day. No holiday calendar.
- Cap (L10): 3 generation errors per client+period → cron skips (`failed_capped`); success clears it.
- Subtask rule: a reviewer's subtask is DONE when every one of their reports has moved past their stage (order generated/pm_review < am_review < jake_review/ready/failed < sent; `blocked` ignored). Not-yet-reached ≠ done. (The /me "waiting on you" list is a different question and keeps its own rule.)
- Asana writes never block or fail a Hub request (L5); every write idempotent; pages never call Asana live (L6). The `/me` Asana mirror sync stays read-only (L3).
- Dates as `YYYY-MM-DD` strings across modules. Migration additive; applying it and any real Asana write need Manu's per-action OK. Never `next build`.
- Commits: explicit pathspecs, `-m` before `--`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. vitest then tsc (judge by filename; worktree baseline = pre-existing test-globals errors only).

## Review Focus

1. **Send-back moves work backwards** (CEO → AM): the AM's ticked subtask must re-open and the CEO's stays open. Pinned in Task 3 (`reopens AM subtask after a send-back`).
2. **Repeated runs** (cron fires 40× on the 4th; every PATCH re-syncs): no duplicate parent/subtasks, no Asana call when nothing changed. Pinned in Task 4 (`second ensure is a no-op`, `no writes when state already matches`).
3. **Reviewer whose name doesn't resolve to an email** (rebrand duplicates, typos): no subtask, a warning naming person + clients, nothing else breaks. Pinned in Task 3 (`unresolved names are reported, not dropped silently`).
4. **Asana down during a PATCH**: the review succeeds with the same response body; error recorded in `last_error`. Pinned in Task 5 (route test with the sync mocked to throw).
5. **4th on a weekend / Thu / Fri**: deadlines shift per L9. Pinned in Task 2 (one test per weekday).

## File map

| File | Responsibility |
|---|---|
| `drizzle/migrations/0127_monthly_report_asana.sql`, `scripts/_apply-0127.ts`, `src/lib/db/schema.ts` (append) | Tables `monthly_report_asana_links`, `monthly_report_generate_failures` |
| `src/lib/monthly-report/asana-link/deadlines.ts` (+test) | `reviewDeadlines(period)` |
| `src/lib/monthly-report/asana-link/reviewers.ts` (+test) | `reviewersForPeriod(...)` |
| `src/lib/monthly-report/asana-link/plan.ts` (+test) | `planNewSubtasks`, `planSubtaskSync` |
| `src/lib/monthly-report/asana-link/asana.ts` | thin Asana calls |
| `src/lib/monthly-report/asana-link/index.ts` (+test) | `ensurePeriodTask`, `syncPeriodSubtasks` |
| `src/lib/monthly-report/generate-failures.ts` (+test) | cap helpers |
| `src/app/api/cron/monthly-reports/route.ts`, `src/app/api/reports/monthly/route.ts` | hooks + cap |
| `src/lib/my-dashboard/load.ts`, `reviews.ts`, `types.ts`, `src/components/my-dashboard/reviews-box.tsx`, `src/app/reports/monthly/page.tsx` | links + surfacing |

---

### Task 1: Tables (migration 0127)

**Files:** Create `drizzle/migrations/0127_monthly_report_asana.sql`, `scripts/_apply-0127.ts`; Modify `src/lib/db/schema.ts` (append after `monthlyReports`).

**Interfaces — Produces:** `monthlyReportAsanaLinks`, `monthlyReportGenerateFailures` tables; type `AsanaLinkSubtask`.

- [ ] **Step 1: Confirm 0127 is free** — `git branch -a --format='%(refname:short)' | while read b; do git ls-tree --name-only "$b" drizzle/migrations/ 2>/dev/null; done | grep -E '/01(2[6-9]|3)' | sort -u`. Expected: 0126 (thread-ag) only. If 0127 is taken, use the next free number everywhere in this task.

- [ ] **Step 2: Migration SQL**
```sql
CREATE TABLE IF NOT EXISTS monthly_report_asana_links (
  period varchar(7) PRIMARY KEY,
  parent_gid varchar(32) NOT NULL,
  parent_url text NOT NULL,
  parent_completed boolean NOT NULL DEFAULT false,
  subtasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_report_generate_failures (
  client_id_code varchar(100) NOT NULL,
  period varchar(7) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id_code, period)
);
```

- [ ] **Step 3: Drizzle tables** (append right after `export type NewMonthlyReportRow …`; reuse existing imports, add `primaryKey` only if missing):
```ts
// ─── Monthly report ↔ Asana (Hub creates + drives the period task; see spec 2026-10-07) ───
export type AsanaLinkSubtask = {
  gid: string;
  url: string;
  stage: "pm" | "am" | "ceo";
  email: string;
  name: string;
  dueOn: string; // YYYY-MM-DD
  completed: boolean;
};

export const monthlyReportAsanaLinks = pgTable("monthly_report_asana_links", {
  period: varchar("period", { length: 7 }).primaryKey(),
  parentGid: varchar("parent_gid", { length: 32 }).notNull(),
  parentUrl: text("parent_url").notNull(),
  parentCompleted: boolean("parent_completed").notNull().default(false),
  subtasks: jsonb("subtasks").$type<AsanaLinkSubtask[]>().notNull().default([]),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monthlyReportGenerateFailures = pgTable(
  "monthly_report_generate_failures",
  {
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clientIdCode, t.period] })],
);
```

- [ ] **Step 4: Apply script** — copy `scripts/_apply-0125.ts` to `scripts/_apply-0127.ts`; change only `MIGRATION` and the post-checks to verify both tables with `to_regclass`. Do NOT run it.

- [ ] **Step 5: tsc (by filename) + commit** `feat(reports): tables for monthly-report Asana links + generation-failure cap (migration 0127)`.

---

### Task 2: Working-day deadlines

**Files:** Create `src/lib/monthly-report/asana-link/deadlines.ts`, `deadlines.test.ts`.

**Interfaces — Produces:** `reviewDeadlines(period: string): { generatedOn: string; pm: string; am: string; ceo: string }`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import { reviewDeadlines } from "./deadlines";

describe("reviewDeadlines (period → 4th of the next month, working-day chain)", () => {
  it.each([
    // period,    4th weekday, pm,           am,           ceo
    ["2026-08", "Fri", "2026-09-04", "2026-09-07", "2026-09-08"],
    ["2026-09", "Sun", "2026-10-05", "2026-10-06", "2026-10-07"],
    ["2026-10", "Wed", "2026-11-04", "2026-11-05", "2026-11-06"],
    ["2026-11", "Fri", "2026-12-04", "2026-12-07", "2026-12-08"],
    ["2026-12", "Mon", "2027-01-04", "2027-01-05", "2027-01-06"],
    ["2027-01", "Thu", "2027-02-04", "2027-02-05", "2027-02-08"],
    ["2027-02", "Thu", "2027-03-04", "2027-03-05", "2027-03-08"],
    ["2027-03", "Sun", "2027-04-05", "2027-04-06", "2027-04-07"],
    ["2027-08", "Sat", "2027-09-06", "2027-09-07", "2027-09-08"],
    ["2027-05", "Fri", "2027-06-04", "2027-06-07", "2027-06-08"],
    ["2027-07", "Wed", "2027-08-04", "2027-08-05", "2027-08-06"],
    ["2026-06", "Sat", "2026-07-06", "2026-07-07", "2026-07-08"],
    ["2026-04", "Mon", "2026-05-04", "2026-05-05", "2026-05-06"],
    ["2026-05", "Thu", "2026-06-04", "2026-06-05", "2026-06-08"],
    ["2026-02", "Wed", "2026-03-04", "2026-03-05", "2026-03-06"],
    ["2026-03", "Sat", "2026-04-06", "2026-04-07", "2026-04-08"],
    ["2026-07", "Tue", "2026-08-04", "2026-08-05", "2026-08-06"],
  ])("%s (4th is %s) → PM %s, AM %s, CEO %s", (period, _dow, pm, am, ceo) => {
    const d = reviewDeadlines(period);
    expect([d.pm, d.am, d.ceo]).toEqual([pm, am, ceo]);
  });
  it("generatedOn is always the 4th, even on weekends", () => {
    expect(reviewDeadlines("2026-09").generatedOn).toBe("2026-10-04");
  });
  it("rolls the year", () => expect(reviewDeadlines("2026-12").generatedOn).toBe("2027-01-04"));
});
```
Before relying on the table, verify each "4th weekday" with `node -e 'for (const d of ["2026-09-04","2026-10-04","2026-11-04","2026-12-04","2027-01-04","2027-02-04","2027-03-04","2027-04-04","2027-09-04","2027-06-04","2027-08-04","2026-07-04","2026-05-04","2026-06-04","2026-03-04","2026-04-04","2026-08-04"]) console.log(d, new Date(d+"T12:00:00Z").toUTCString().slice(0,3))'`. If any row's weekday is wrong, fix that row's expected dates by the L9 rule (not the implementation) and note it in the report.

- [ ] **Step 2: Run → FAIL (module not found).**

- [ ] **Step 3: Implement**
```ts
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T12:00:00Z`);
const isWeekend = (s: string) => [0, 6].includes(at(s).getUTCDay());
const plusDays = (s: string, n: number) => { const d = at(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const onOrNextWorkday = (s: string) => { let d = s; while (isWeekend(d)) d = plusDays(d, 1); return d; };
const nextWorkday = (s: string) => onOrNextWorkday(plusDays(s, 1));

/** Spec L9: reports generate on the 4th of the month after `period`; PM/AM/CEO due on chained working days. */
export function reviewDeadlines(period: string): { generatedOn: string; pm: string; am: string; ceo: string } {
  const [y, m] = period.split("-").map(Number);
  const generatedOn = ymd(new Date(Date.UTC(y, m, 4, 12))); // month index m = the month after `period`
  const pm = onOrNextWorkday(generatedOn);
  const am = nextWorkday(pm);
  const ceo = nextWorkday(am);
  return { generatedOn, pm, am, ceo };
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(reports): working-day review deadlines for monthly reports`.

---

### Task 3: Reviewers + sync planner (pure)

**Files:** Create `src/lib/monthly-report/asana-link/reviewers.ts`, `reviewers.test.ts`, `plan.ts`, `plan.test.ts`.

**Interfaces:**
- Consumes: `projectManagerFromRaw`, `accountManagerFromRaw` (`@/lib/monthly-report/resolve-client`), `emailForAccountManager` (`@/lib/monthly-report/recipients` — generic name→email over a staff directory), `MONTHLY_REPORT_FINAL_REVIEWER_EMAIL` (`@/lib/constants`), `AsanaLinkSubtask` (Task 1).
- Produces:
  - `type PeriodReport = { clientIdCode: string; status: string; rawData: unknown }`
  - `type Reviewer = { stage: "pm" | "am" | "ceo"; email: string; name: string; clientIdCodes: string[] }`
  - `reviewersForPeriod(reports: PeriodReport[], directory: { name: string | null; email: string }[]): { reviewers: Reviewer[]; unresolved: { stage: "pm" | "am"; name: string; clientIdCodes: string[] }[] }`
  - `stageDone(stage, email, reports, directory): boolean` — true when every one of this reviewer's reports has moved PAST their stage (a report not yet reaching the stage means NOT done)
  - `planNewSubtasks(stored: AsanaLinkSubtask[], reviewers: Reviewer[]): Reviewer[]` (reviewers lacking a stored subtask for the same stage+email)
  - `planSubtaskSync(stored: AsanaLinkSubtask[], reports: PeriodReport[], directory, parentCompleted: boolean): { complete: string[]; reopen: string[]; parent: "complete" | "reopen" | null }` (gids)

- [ ] **Step 1: Failing tests** — `reviewers.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { reviewersForPeriod, stageDone } from "./reviewers";

const dir = [
  { name: "Hamid Zeb", email: "hamid@marketfoundry.agency" },
  { name: "Amir Zeb", email: "amir@marketfoundry.agency" },
  { name: "Jake Kosten", email: "jake@marketfoundry.agency" },
];
const rep = (code: string, status: string, pm: string | null, am: string | null) =>
  ({ clientIdCode: code, status, rawData: { ProjectManager_MF: pm, AccountManager_MF: am } });

describe("reviewersForPeriod", () => {
  it("one reviewer per distinct PM/AM email plus the CEO, with their clients", () => {
    const { reviewers } = reviewersForPeriod([rep("A", "pm_review", "Hamid Zeb", "Amir Zeb"), rep("B", "generated", "hamid zeb", "Amir Zeb")], dir);
    expect(reviewers).toEqual([
      { stage: "pm", email: "hamid@marketfoundry.agency", name: "Hamid Zeb", clientIdCodes: ["A", "B"] },
      { stage: "am", email: "amir@marketfoundry.agency", name: "Amir Zeb", clientIdCodes: ["A", "B"] },
      { stage: "ceo", email: "jake@marketfoundry.agency", name: "Jake Kosten", clientIdCodes: ["A", "B"] },
    ]);
  });
  it("unresolved names are reported, not dropped silently", () => {
    const { reviewers, unresolved } = reviewersForPeriod([rep("A", "pm_review", "Ghost Person", "Amir Zeb")], dir);
    expect(reviewers.map((r) => r.stage)).toEqual(["am", "ceo"]);
    expect(unresolved).toEqual([{ stage: "pm", name: "Ghost Person", clientIdCodes: ["A"] }]);
  });
  it("blank PM/AM fields are ignored (no unresolved entry)", () => {
    expect(reviewersForPeriod([rep("A", "pm_review", null, "")], dir).unresolved).toEqual([]);
  });
});

describe("stageDone (done = all of this reviewer's reports are PAST their stage)", () => {
  const reports = [rep("A", "am_review", "Hamid Zeb", "Amir Zeb"), rep("B", "sent", "Hamid Zeb", "Amir Zeb")];
  it("PM done once all their reports moved past PM", () => expect(stageDone("pm", "hamid@marketfoundry.agency", reports, dir)).toBe(true));
  it("AM not done while a client of theirs is at am_review", () => expect(stageDone("am", "amir@marketfoundry.agency", reports, dir)).toBe(false));
  it("AM not done while a report hasn't reached AM yet", () => expect(stageDone("am", "amir@marketfoundry.agency", [rep("C", "pm_review", "Hamid Zeb", "Amir Zeb")], dir)).toBe(false));
  it("CEO not done until every report is sent", () => {
    for (const s of ["generated", "pm_review", "am_review", "jake_review", "ready", "failed"]) expect(stageDone("ceo", "jake@marketfoundry.agency", [rep("C", s, null, null)], dir)).toBe(false);
    expect(stageDone("ceo", "jake@marketfoundry.agency", [rep("C", "sent", null, null)], dir)).toBe(true);
  });
  it("blocked reports are ignored (never hold a subtask open)", () => expect(stageDone("pm", "hamid@marketfoundry.agency", [rep("D", "blocked", "Hamid Zeb", null), rep("E", "sent", "Hamid Zeb", null)], dir)).toBe(true));
});
```
`plan.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { planNewSubtasks, planSubtaskSync } from "./plan";
import type { AsanaLinkSubtask } from "@/lib/db/schema";

const dir = [
  { name: "Hamid Zeb", email: "hamid@marketfoundry.agency" },
  { name: "Amir Zeb", email: "amir@marketfoundry.agency" },
  { name: "Jake Kosten", email: "jake@marketfoundry.agency" },
];
const rep = (code: string, status: string) => ({ clientIdCode: code, status, rawData: { ProjectManager_MF: "Hamid Zeb", AccountManager_MF: "Amir Zeb" } });
const sub = (gid: string, stage: "pm" | "am" | "ceo", email: string, completed: boolean): AsanaLinkSubtask =>
  ({ gid, url: `u${gid}`, stage, email, name: email, dueOn: "2026-10-05", completed });
const stored = [sub("p", "pm", "hamid@marketfoundry.agency", false), sub("a", "am", "amir@marketfoundry.agency", false), sub("c", "ceo", "jake@marketfoundry.agency", false)];

describe("planSubtaskSync", () => {
  it("completes the PM subtask once no report waits on the PM", () => {
    expect(planSubtaskSync(stored, [rep("A", "am_review")], dir, false)).toEqual({ complete: ["p"], reopen: [], parent: null });
  });
  it("reopens AM subtask after a send-back (CEO → AM) and keeps CEO open", () => {
    const s = [sub("p", "pm", "hamid@marketfoundry.agency", true), sub("a", "am", "amir@marketfoundry.agency", true), sub("c", "ceo", "jake@marketfoundry.agency", false)];
    expect(planSubtaskSync(s, [rep("A", "am_review"), rep("B", "jake_review")], dir, false)).toEqual({ complete: [], reopen: ["a"], parent: null });
  });
  it("completes everything and the parent when all reports are sent", () => {
    expect(planSubtaskSync(stored, [rep("A", "sent"), rep("B", "sent")], dir, false)).toEqual({ complete: ["p", "a", "c"], reopen: [], parent: "complete" });
  });
  it("no writes when state already matches", () => {
    const done = stored.map((s) => ({ ...s, completed: true }));
    expect(planSubtaskSync(done, [rep("A", "sent")], dir, true)).toEqual({ complete: [], reopen: [], parent: null });
  });
  it("reopens the parent if a report leaves sent", () => {
    const done = stored.map((s) => ({ ...s, completed: true }));
    expect(planSubtaskSync(done, [rep("A", "failed")], dir, true).parent).toBe("reopen");
  });
});

describe("planNewSubtasks", () => {
  it("returns only reviewers without a stored subtask for the same stage+email", () => {
    const reviewers = [
      { stage: "pm" as const, email: "hamid@marketfoundry.agency", name: "Hamid Zeb", clientIdCodes: ["A"] },
      { stage: "pm" as const, email: "sohail@marketfoundry.agency", name: "Sohail Asghar", clientIdCodes: ["B"] },
    ];
    expect(planNewSubtasks(stored, reviewers).map((r) => r.email)).toEqual(["sohail@marketfoundry.agency"]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `reviewers.ts`:
```ts
import { MONTHLY_REPORT_FINAL_REVIEWER_EMAIL } from "@/lib/constants";
import { accountManagerFromRaw, projectManagerFromRaw } from "@/lib/monthly-report/resolve-client";
import { emailForAccountManager } from "@/lib/monthly-report/recipients";

export type Stage = "pm" | "am" | "ceo";
export type PeriodReport = { clientIdCode: string; status: string; rawData: unknown };
export type Reviewer = { stage: Stage; email: string; name: string; clientIdCodes: string[] };
type Directory = { name: string | null; email: string }[];

// Review order. A reviewer's stage is DONE when none of their reports sits at their stage or any earlier one.
const STAGE_ORDER: Record<string, number> = { generated: 0, pm_review: 0, am_review: 1, jake_review: 2, ready: 2, failed: 2, sent: 3 };
const STAGE_INDEX: Record<Stage, number> = { pm: 0, am: 1, ceo: 2 };

function nameFor(stage: "pm" | "am", raw: unknown): string | null {
  return stage === "pm" ? projectManagerFromRaw(raw) : accountManagerFromRaw(raw);
}

export function reviewersForPeriod(reports: PeriodReport[], directory: Directory) {
  const byKey = new Map<string, Reviewer>();
  const unresolvedByName = new Map<string, { stage: "pm" | "am"; name: string; clientIdCodes: string[] }>();
  for (const stage of ["pm", "am"] as const) {
    for (const r of reports) {
      const name = nameFor(stage, r.rawData);
      if (!name) continue;
      const email = emailForAccountManager(directory, name);
      if (!email) {
        const k = `${stage}|${name.trim().toLowerCase()}`;
        const u = unresolvedByName.get(k) ?? { stage, name: name.trim(), clientIdCodes: [] };
        u.clientIdCodes.push(r.clientIdCode);
        unresolvedByName.set(k, u);
        continue;
      }
      const k = `${stage}|${email.toLowerCase()}`;
      const rv = byKey.get(k) ?? { stage, email: email.toLowerCase(), name: directory.find((d) => d.email.toLowerCase() === email.toLowerCase())?.name ?? name, clientIdCodes: [] };
      rv.clientIdCodes.push(r.clientIdCode);
      byKey.set(k, rv);
    }
  }
  const ceoEmail = MONTHLY_REPORT_FINAL_REVIEWER_EMAIL.toLowerCase();
  const reviewers = [...byKey.values()];
  if (reports.length) {
    reviewers.push({ stage: "ceo", email: ceoEmail, name: directory.find((d) => d.email.toLowerCase() === ceoEmail)?.name ?? "CEO", clientIdCodes: reports.map((r) => r.clientIdCode) });
  }
  return { reviewers, unresolved: [...unresolvedByName.values()] };
}

/** True when every one of this reviewer's (non-blocked) reports has moved past their stage. */
export function stageDone(stage: Stage, email: string, reports: PeriodReport[], directory: Directory): boolean {
  const target = email.toLowerCase();
  const mine = reports.filter((r) => {
    if (!(r.status in STAGE_ORDER)) return false; // blocked / unknown statuses never hold a subtask open
    if (stage === "ceo") return target === MONTHLY_REPORT_FINAL_REVIEWER_EMAIL.toLowerCase();
    const name = nameFor(stage, r.rawData);
    return !!name && emailForAccountManager(directory, name)?.toLowerCase() === target;
  });
  return mine.every((r) => STAGE_ORDER[r.status] > STAGE_INDEX[stage]);
}
```
`plan.ts`:
```ts
import type { AsanaLinkSubtask } from "@/lib/db/schema";
import { stageDone, type PeriodReport, type Reviewer } from "./reviewers";

type Directory = { name: string | null; email: string }[];

export function planNewSubtasks(stored: AsanaLinkSubtask[], reviewers: Reviewer[]): Reviewer[] {
  const have = new Set(stored.map((s) => `${s.stage}|${s.email.toLowerCase()}`));
  return reviewers.filter((r) => !have.has(`${r.stage}|${r.email.toLowerCase()}`));
}

export function planSubtaskSync(stored: AsanaLinkSubtask[], reports: PeriodReport[], directory: Directory, parentCompleted: boolean) {
  const complete: string[] = [];
  const reopen: string[] = [];
  for (const s of stored) {
    const done = stageDone(s.stage, s.email, reports, directory);
    if (done && !s.completed) complete.push(s.gid);
    if (!done && s.completed) reopen.push(s.gid);
  }
  const allSent = reports.length > 0 && reports.every((r) => r.status === "sent");
  const parent: "complete" | "reopen" | null = allSent && !parentCompleted ? "complete" : !allSent && parentCompleted ? "reopen" : null;
  return { complete, reopen, parent };
}
```

- [ ] **Step 4: Run → PASS (reviewers 8, plan 6). Step 5: Commit** `feat(reports): reviewer resolution + Asana subtask sync planner (pure)`.

---

### Task 4: Asana adapter + orchestrator

**Files:** Create `src/lib/monthly-report/asana-link/asana.ts`, `index.ts`, `index.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–3; `asanaFetch`, `hasAsanaToken` (`@/lib/onboarding/create-asana-project`); `resolvePeriod` (`@/lib/monthly-report/period`, `.label` e.g. "Sep 2026" — verify the label format and adapt the name builder if it differs).
- Produces: `ensurePeriodTask(period: string, deps?: LinkDeps): Promise<void>`, `syncPeriodSubtasks(period: string, deps?: LinkDeps): Promise<void>` — both NEVER throw. `type LinkDeps` (injectable for tests): `{ loadReports(period): Promise<PeriodReport[]>; loadDirectory(): Promise<Directory>; getLink(period); saveLink(row); asana: { createParent(input): Promise<{gid,url}>; createSubtask(parentGid, input): Promise<{gid,url}>; setCompleted(gid, completed): Promise<void> } }`.

- [ ] **Step 1: Failing test** `index.test.ts` with an in-memory fake `LinkDeps`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/onboarding/create-asana-project", () => ({ hasAsanaToken: () => true, asanaFetch: vi.fn() }));
import { ensurePeriodTask, syncPeriodSubtasks, type LinkDeps } from "./index";

const dir = [{ name: "Hamid Zeb", email: "hamid@marketfoundry.agency" }, { name: "Amir Zeb", email: "amir@marketfoundry.agency" }, { name: "Jake Kosten", email: "jake@marketfoundry.agency" }];
const rep = (code: string, status: string) => ({ clientIdCode: code, status, rawData: { ProjectManager_MF: "Hamid Zeb", AccountManager_MF: "Amir Zeb" } });

function fake(reports: ReturnType<typeof rep>[]) {
  let link: Awaited<ReturnType<LinkDeps["getLink"]>> = null;
  let n = 0;
  const calls = { parent: 0, sub: [] as string[], completed: [] as [string, boolean][] };
  const deps: LinkDeps = {
    loadReports: async () => reports,
    loadDirectory: async () => dir,
    getLink: async () => link,
    saveLink: async (row) => { link = row; },
    asana: {
      createParent: async () => { calls.parent++; return { gid: "P", url: "uP" }; },
      createSubtask: async (_p, input) => { calls.sub.push(input.name); n++; return { gid: `S${n}`, url: `uS${n}` }; },
      setCompleted: async (gid, c) => { calls.completed.push([gid, c]); },
    },
  };
  return { deps, calls, getLink: () => link };
}

describe("ensurePeriodTask", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  it("creates parent + PM/AM/CEO subtasks with L9 deadlines", async () => {
    const f = fake([rep("A", "generated")]);
    await ensurePeriodTask("2026-09", f.deps);
    expect(f.calls.parent).toBe(1);
    expect(f.calls.sub).toEqual([
      "MarketFoundry | Monthly Reports | PM Review — Hamid Zeb",
      "MarketFoundry | Monthly Reports | AM Review — Amir Zeb",
      "MarketFoundry | Monthly Reports | CEO Review, Approve and Send",
    ]);
    expect(f.getLink()!.subtasks.map((s) => [s.stage, s.dueOn])).toEqual([["pm", "2026-10-05"], ["am", "2026-10-06"], ["ceo", "2026-10-07"]]);
  });
  it("second ensure is a no-op", async () => {
    const f = fake([rep("A", "generated")]);
    await ensurePeriodTask("2026-09", f.deps);
    await ensurePeriodTask("2026-09", f.deps);
    expect(f.calls.parent).toBe(1);
    expect(f.calls.sub).toHaveLength(3);
  });
  it("records the error and never throws when Asana fails", async () => {
    const f = fake([rep("A", "generated")]);
    f.deps.asana.createParent = async () => { throw new Error("Asana API 503"); };
    await expect(ensurePeriodTask("2026-09", f.deps)).resolves.toBeUndefined();
  });
});

describe("syncPeriodSubtasks", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  it("ticks the PM subtask once the report moved to AM, then no writes when nothing changed", async () => {
    const reports = [rep("A", "generated")];
    const f = fake(reports);
    await ensurePeriodTask("2026-09", f.deps);
    reports[0].status = "am_review";
    await syncPeriodSubtasks("2026-09", f.deps);
    expect(f.calls.completed).toEqual([["S1", true]]);
    await syncPeriodSubtasks("2026-09", f.deps);
    expect(f.calls.completed).toEqual([["S1", true]]);
  });
  it("does nothing (and never throws) for a period without a link row", async () => {
    const f = fake([rep("A", "am_review")]);
    await expect(syncPeriodSubtasks("2026-09", f.deps)).resolves.toBeUndefined();
    expect(f.calls.completed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `asana.ts`** (thin; all calls through `asanaFetch`; subtasks via the gid-scoped `/tasks/{parent}/subtasks` endpoint):
```ts
import { asanaFetch } from "@/lib/onboarding/create-asana-project";

export const MR_ASANA = {
  project: "1219237652232682",
  section: "1219237652232685",
  customFields: {
    "1219237652232690": "1219237652232694",
    "1219237652232697": "1219237652232699",
    "1219237599617929": ["1219237599617958"],
    "1219237599617938": "1219237599617939",
    "1219237599617946": "1219237599617952",
  },
  hubUrl: "https://www.marketfoundryhub.com/reports/monthly",
} as const;

type TaskInput = { name: string; notes: string; assignee: string; dueOn: string };

export async function createParent(input: TaskInput): Promise<{ gid: string; url: string }> {
  const json = await asanaFetch(`/tasks?opt_fields=permalink_url`, {
    method: "POST",
    body: JSON.stringify({ data: {
      name: input.name, notes: input.notes, assignee: input.assignee, due_on: input.dueOn,
      projects: [MR_ASANA.project],
      memberships: [{ project: MR_ASANA.project, section: MR_ASANA.section }],
      custom_fields: MR_ASANA.customFields,
    } }),
  });
  return { gid: json.data.gid, url: json.data.permalink_url };
}

export async function createSubtask(parentGid: string, input: TaskInput): Promise<{ gid: string; url: string }> {
  const json = await asanaFetch(`/tasks/${parentGid}/subtasks?opt_fields=permalink_url`, {
    method: "POST",
    body: JSON.stringify({ data: { name: input.name, notes: input.notes, assignee: input.assignee, due_on: input.dueOn } }),
  });
  return { gid: json.data.gid, url: json.data.permalink_url };
}

export async function setCompleted(gid: string, completed: boolean): Promise<void> {
  await asanaFetch(`/tasks/${gid}`, { method: "PUT", body: JSON.stringify({ data: { completed } }) });
}
```
(`setCompleted` throws on failure on purpose — the orchestrator must NOT mark it done in the DB when Asana failed. Do not reuse `setAsanaTaskCompleted`, which swallows errors.)

- [ ] **Step 4: Implement `index.ts`**:
```ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, monthlyReportAsanaLinks, monthlyReports, users, type AsanaLinkSubtask } from "@/lib/db/schema";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { resolvePeriod } from "@/lib/monthly-report/period";
import { reviewDeadlines } from "./deadlines";
import { reviewersForPeriod, type PeriodReport, type Reviewer } from "./reviewers";
import { planNewSubtasks, planSubtaskSync } from "./plan";
import * as asana from "./asana";
import { MR_ASANA } from "./asana";

type Directory = { name: string | null; email: string }[];
type LinkRow = typeof monthlyReportAsanaLinks.$inferSelect;
type LinkInsert = Omit<LinkRow, "updatedAt">;
export interface LinkDeps {
  loadReports(period: string): Promise<PeriodReport[]>;
  loadDirectory(): Promise<Directory>;
  getLink(period: string): Promise<LinkInsert | null>;
  saveLink(row: LinkInsert): Promise<void>;
  asana: {
    createParent: typeof asana.createParent;
    createSubtask: typeof asana.createSubtask;
    setCompleted: typeof asana.setCompleted;
  };
}

const PREFIX = "MarketFoundry | Monthly Reports";
const notes = (period: string) =>
  `Monthly client reports for ${resolvePeriod(period).label}. Review and approve in the Hub: ${MR_ASANA.hubUrl}\n` +
  `This task and its subtasks are created and ticked automatically by the Hub — please act in the Hub, not here.`;

function subtaskName(r: Reviewer): string {
  if (r.stage === "pm") return `${PREFIX} | PM Review — ${r.name}`;
  if (r.stage === "am") return `${PREFIX} | AM Review — ${r.name}`;
  return `${PREFIX} | CEO Review, Approve and Send`;
}

export function dbLinkDeps(): LinkDeps {
  return {
    async loadReports(period) {
      const rows = await db.select({ clientIdCode: monthlyReports.clientIdCode, status: monthlyReports.status, rawData: aac.rawData })
        .from(monthlyReports).innerJoin(aac, eq(aac.clientIdCode, monthlyReports.clientIdCode))
        .where(eq(monthlyReports.period, period));
      return rows;
    },
    loadDirectory: () => db.select({ name: users.name, email: users.email }).from(users),
    async getLink(period) {
      const [row] = await db.select().from(monthlyReportAsanaLinks).where(eq(monthlyReportAsanaLinks.period, period)).limit(1);
      return row ?? null;
    },
    async saveLink(row) {
      await db.insert(monthlyReportAsanaLinks).values({ ...row, updatedAt: new Date() })
        .onConflictDoUpdate({ target: monthlyReportAsanaLinks.period, set: { ...row, updatedAt: new Date() } });
    },
    asana: { createParent: asana.createParent, createSubtask: asana.createSubtask, setCompleted: asana.setCompleted },
  };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Create the period's Asana parent (once) and any missing reviewer subtasks. Never throws. */
export async function ensurePeriodTask(period: string, deps: LinkDeps = dbLinkDeps()): Promise<void> {
  if (!hasAsanaToken()) return;
  let link: LinkInsert | null = null;
  try {
    const [reports, directory] = await Promise.all([deps.loadReports(period), deps.loadDirectory()]);
    if (!reports.length) return;
    const d = reviewDeadlines(period);
    link = await deps.getLink(period);
    if (!link) {
      const ceo = reviewersForPeriod(reports, directory).reviewers.find((r) => r.stage === "ceo")!;
      const parent = await deps.asana.createParent({ name: `${PREFIX} | ${resolvePeriod(period).label}`, notes: notes(period), assignee: ceo.email, dueOn: d.ceo });
      link = { period, parentGid: parent.gid, parentUrl: parent.url, parentCompleted: false, subtasks: [], lastError: null };
      await deps.saveLink(link);
    }
    const { reviewers, unresolved } = reviewersForPeriod(reports, directory);
    for (const u of unresolved) console.error(`[monthly-asana] no email for ${u.stage} "${u.name}" on ${u.clientIdCodes.join(", ")}`);
    for (const r of planNewSubtasks(link.subtasks, reviewers)) {
      const dueOn = r.stage === "pm" ? d.pm : r.stage === "am" ? d.am : d.ceo;
      const created = await deps.asana.createSubtask(link.parentGid, { name: subtaskName(r), notes: notes(period), assignee: r.email, dueOn });
      const entry: AsanaLinkSubtask = { gid: created.gid, url: created.url, stage: r.stage, email: r.email, name: r.name, dueOn, completed: false };
      link = { ...link, subtasks: [...link.subtasks, entry], lastError: null };
      await deps.saveLink(link); // persist after each create so a crash never duplicates a subtask
    }
  } catch (e) {
    console.error("[monthly-asana] ensure failed", period, e);
    if (link) await deps.saveLink({ ...link, lastError: errMsg(e) }).catch(() => {});
  }
}

/** Tick/untick reviewer subtasks + parent to match Hub review state. Never throws. */
export async function syncPeriodSubtasks(period: string, deps: LinkDeps = dbLinkDeps()): Promise<void> {
  if (!hasAsanaToken()) return;
  let link: LinkInsert | null = null;
  try {
    link = await deps.getLink(period);
    if (!link) return;
    const [reports, directory] = await Promise.all([deps.loadReports(period), deps.loadDirectory()]);
    const plan = planSubtaskSync(link.subtasks, reports, directory, link.parentCompleted);
    for (const [gids, value] of [[plan.complete, true], [plan.reopen, false]] as const) {
      for (const gid of gids) {
        await deps.asana.setCompleted(gid, value);
        link = { ...link, subtasks: link.subtasks.map((s) => (s.gid === gid ? { ...s, completed: value } : s)) };
        await deps.saveLink(link);
      }
    }
    if (plan.parent) {
      await deps.asana.setCompleted(link.parentGid, plan.parent === "complete");
      link = { ...link, parentCompleted: plan.parent === "complete", lastError: null };
      await deps.saveLink(link);
    }
  } catch (e) {
    console.error("[monthly-asana] sync failed", period, e);
    if (link) await deps.saveLink({ ...link, lastError: errMsg(e) }).catch(() => {});
  }
}
```
Note: `and`/`inArray` imports only if used — remove unused imports so eslint passes. Verify `resolvePeriod(period).label` returns "Sep 2026"; if not, use the same `toLocaleDateString("en-US", {month:"short", year:"numeric", timeZone:"UTC"})` as `src/lib/my-dashboard/reviews.ts` and update the test name expectation accordingly.

- [ ] **Step 5: Run → PASS (5). tsc by filename. Commit** `feat(reports): Hub creates and drives the monthly-report Asana task`.

---

### Task 5: Hooks (generate + review)

**Files:** Modify `src/app/api/cron/monthly-reports/route.ts`, `src/app/api/reports/monthly/route.ts`; Test: add a case to an existing route test file for `src/app/api/reports/monthly/route.ts` if one exists (find with `ls src/app/api/reports/monthly/*.test.ts`), else create `src/app/api/reports/monthly/asana-hook.test.ts`.

**Interfaces — Consumes:** `ensurePeriodTask`, `syncPeriodSubtasks` (Task 4); `after` from `next/server` (used elsewhere, e.g. `src/app/api/sales-summary/daily/route.ts` — copy that import style).

- [ ] **Step 1: Cron** — in the main (non-`clientIdCode`) branch, after the `notifyPmReportsReady` block and before the final `return`, add `after(() => ensurePeriodTask(periodKey));`. Run it on EVERY main run (not only when something generated), so a period whose task failed to create gets retried by the next 30-min run; it is a no-op when complete.
- [ ] **Step 2: Manual generate (POST)** — after each `notifyPmReportsReady(...)` call in `src/app/api/reports/monthly/route.ts` (lines ~233 and ~307), add `after(() => ensurePeriodTask(<that call's period key>));` (use the YYYY-MM variable in scope there — read the surrounding code; it is the period that was just generated).
- [ ] **Step 3: Review (PATCH)** — register `after(() => syncPeriodSubtasks(rawPeriod));` immediately AFTER the `await updateMonthlyReportReview(...)` call (so it runs for approve, send_back, and the approve→ready→send path, whose final status is written inside `persistClientLetter` before the response — `after` runs after the response, by which time the send has finished). Also add the same line in the `action === "send"` branch (~line 409) after its status write. Do not add it to the `comment` branch.
- [ ] **Step 4: Isolation test** — mock `@/lib/monthly-report/asana-link` so `syncPeriodSubtasks` rejects (`vi.fn().mockRejectedValue(new Error("asana down"))`) and `after` from `next/server` invokes its callback synchronously-and-swallows (`vi.mock("next/server", async (orig) => ({ ...(await orig()), after: (fn: () => unknown) => { void Promise.resolve().then(fn).catch(() => {}); } }))`). Assert the PATCH response status/body for an approve is unchanged versus the same call with the mock resolving. If the existing route has no test harness and building one needs >60 lines of mocks, instead extract a tiny `scheduleAsanaSync(period)` helper in `src/lib/monthly-report/asana-link/index.ts` that wraps `after(() => syncPeriodSubtasks(period).catch(() => {}))`, unit-test that it never throws when the sync rejects, and call the helper from the routes. Record which option you took.
- [ ] **Step 5: vitest (route/helper + asana-link dir) + tsc by filename + commit** `feat(reports): create/sync the Asana task after generate and every review action`.

---

### Task 6: Generation-failure cap

**Files:** Create `src/lib/monthly-report/generate-failures.ts`, `generate-failures.test.ts`; Modify cron route, `src/lib/monthly-report/report-store.ts` (`upsertGeneratedMonthlyReport`), `src/lib/my-dashboard/load.ts`, `src/lib/my-dashboard/reviews.ts`.

**Interfaces — Produces:** `GENERATE_FAILURE_CAP = 3`; `isCapped(attempts: number): boolean`; `recordGenerateFailure(clientIdCode, period, error)`, `clearGenerateFailure(clientIdCode, period)`, `cappedClients(period): Promise<{clientIdCode; attempts; lastError}[]>`.

- [ ] **Step 1: Failing test** (`generate-failures.test.ts`) for the pure part:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { GENERATE_FAILURE_CAP, isCapped } from "./generate-failures";
describe("generation failure cap", () => {
  it("caps at 3", () => {
    expect(GENERATE_FAILURE_CAP).toBe(3);
    expect([0, 1, 2, 3, 4].map(isCapped)).toEqual([false, false, false, true, true]);
  });
});
```
- [ ] **Step 2: Implement**:
```ts
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monthlyReportGenerateFailures as t } from "@/lib/db/schema";

/** Spec L10: after this many generation ERRORS for a client+period the cron stops retrying it. */
export const GENERATE_FAILURE_CAP = 3;
export const isCapped = (attempts: number) => attempts >= GENERATE_FAILURE_CAP;

export async function recordGenerateFailure(clientIdCode: string, period: string, error: string): Promise<void> {
  await db.insert(t).values({ clientIdCode, period, attempts: 1, lastError: error.slice(0, 2000) })
    .onConflictDoUpdate({ target: [t.clientIdCode, t.period], set: { attempts: sql`${t.attempts} + 1`, lastError: error.slice(0, 2000), updatedAt: new Date() } });
}
export async function clearGenerateFailure(clientIdCode: string, period: string): Promise<void> {
  await db.delete(t).where(and(eq(t.clientIdCode, clientIdCode), eq(t.period, period)));
}
export async function cappedClients(period: string) {
  return db.select({ clientIdCode: t.clientIdCode, attempts: t.attempts, lastError: t.lastError })
    .from(t).where(and(eq(t.period, period), gte(t.attempts, GENERATE_FAILURE_CAP)));
}
```
- [ ] **Step 3: Wire the cron** — (a) single-client branch `catch (err)`: `await recordGenerateFailure(row.clientIdCode, periodKey, getErrorMessage(err)).catch(() => {});` before returning the 500; (b) main loop: load `const capped = new Set((await cappedClients(periodKey).catch(() => [])).map((c) => c.clientIdCode));` once, and before `pending.push(row)` add `if (capped.has(row.clientIdCode)) { results.push({ client: row.name, status: "failed_capped" }); continue; }`.
- [ ] **Step 4: Clear on success** — at the end of `upsertGeneratedMonthlyReport` (report-store.ts) call `await clearGenerateFailure(opts.clientIdCode, opts.period).catch(() => {});` (covers cron and manual POST).
- [ ] **Step 5: Surface on /me** — in `src/lib/my-dashboard/reviews.ts` export `generationFailedItems(person, capped: {clientIdCode; clientName; rawData; period}[], today): ReviewItem[]` returning items with `stageLabel: "Generation failed (3×)"`, `waitingDays: 0`, `url: "/reports/monthly"`, `id: \`fail-${clientIdCode}-${period}\``, for rows where the person is the client's PM (use `reviewPermissions(...).pm` with `projectManagerFromRaw`). Add a test case to `reviews.test.ts` (PM sees it; AM doesn't). In `load.ts`, add a `section(() => db.select().from(monthlyReportGenerateFailures).where(gte(monthlyReportGenerateFailures.attempts, 3)))` to the first `Promise.all`, join to `activeAac` rows in memory, and append `generationFailedItems(...)` to the `reviews` section data. Add `results.set(monthlyReportGenerateFailures, [])` in `load.test.ts` `beforeEach`.
- [ ] **Step 6: vitest (generate-failures, reviews, load) + tsc + commit** `feat(reports): cap failing report generation at 3 tries per period and flag it to the PM`.

---

### Task 7: Links in the Hub

**Files:** Modify `src/lib/my-dashboard/load.ts`, `types.ts`, `src/components/my-dashboard/reviews-box.tsx`, `src/app/me/page.tsx`, `src/app/reports/monthly/page.tsx`, and the GET handler of `src/app/api/reports/monthly/route.ts`.

- [ ] **Step 1: Payload** — `MyDashboardPayload.reviews` stays `Section<ReviewItem[]>`; add `reviewsAsanaUrl: string | null` (latest period's `parentUrl`). In `load.ts` add to the first `Promise.all`: `section(() => db.select().from(monthlyReportAsanaLinks).orderBy(desc(monthlyReportAsanaLinks.period)).limit(1))` — NOTE the `load.test.ts` db mock chain has no `orderBy`; add `orderBy: () => c` to the mock chain object.
- [ ] **Step 2: My Tasks** — from the same link row, if a subtask's `email` equals the person's email (case-insensitive) and `completed` is false, add a `DashTask` `{ id: gid, source: "asana", title: <subtask name built as in Task 4 for that stage, e.g. "Monthly Reports — PM Review">, clientIdCode: null, dueOn: dueOn, status: null, priority: null, url }` to the tasks list (dedupe by id against `asana_tasks` rows). Test in `load.test.ts`: a link row with a subtask for the person shows up in `tasks.data` with its due date; one for another email doesn't.
- [ ] **Step 3: Reviews box** — accept `asanaUrl?: string | null`; render `<a href={asanaUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-brand hover:underline">Open in Asana</a>` in the header row when set. Page passes `data.reviewsAsanaUrl`.
- [ ] **Step 4: /reports/monthly** — GET handler: include `asanaUrl` (the selected period's `parentUrl` or null) in its JSON; page header shows an "Asana task" link next to the period selector when present. Read the page's existing header JSX first and match its link style.
- [ ] **Step 5: eslint + vitest (my-dashboard) + tsc + commit** `feat(reports): link the monthly-report Asana task from /me and /reports/monthly`.

---

### Task 8: Real run (each step needs Manu's explicit OK)

- [ ] **Step 1:** Ask Manu to apply 0127 (he runs it — Claude's prod writes are classifier-blocked): `cd /Users/manu/MFHub/.worktrees/thread-af-me-dashboard && npx tsx scripts/_apply-0127.ts` (the worktree now has its env file).
- [ ] **Step 2: Sandbox run** — with OK, run a scratch script calling `ensurePeriodTask("2026-09")` with `deps.asana.createParent`/`createSubtask` wrapped to prefix names with `[TEST] ` and a `saveLink` that writes to a throwaway period key `"9999-09"` (so the real 2026-09 row stays empty). Verify in Asana: one parent in Data & Reporting with the 5 custom fields, subtasks per reviewer with the 2026-10-05/06/07 deadlines and correct assignees. Then Manu deletes the [TEST] task by hand and the `9999-09` row is deleted with OK.
- [ ] **Step 3:** Browser pass on :3000: Reports to review shows "Open in Asana" only when a link row exists; `/reports/monthly` header link; a PM approval (test client, with OK) ticks that PM's subtask within seconds.
- [ ] **Step 4:** Recommend Manu archive the hand-made template task `1219237599617954`.

---

## Self-review (done)

- Spec coverage: §4.1 → Tasks 2,3,4,5 · §4.2 → Tasks 3,4,5 · §4.3 → Task 7 · §5 → Task 1 · §6a cap → Task 6 · §7 failures → Task 4 (never-throw, lastError, no DB tick on Asana failure) + Task 5 · §8 → tests in 2–7 + Task 8 · L5/L6 → Tasks 4,5,7 · cron schedule already committed (`0fca7ae16`).
- Names consistent: `reviewDeadlines`, `reviewersForPeriod`, `stageDone`, `planNewSubtasks`, `planSubtaskSync`, `ensurePeriodTask`, `syncPeriodSubtasks`, `LinkDeps`, `AsanaLinkSubtask`, `GENERATE_FAILURE_CAP`, `generationFailedItems`.
- Known judgment calls left to implementers (explicit in steps): Task 2 weekday table verification; Task 4 period label format; Task 5 test harness vs helper; Task 7 page header placement.
