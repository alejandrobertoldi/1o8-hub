# Monthly Report ↔ Asana link — Design

**Date:** 2026-10-07 · **Status:** design approved in chat ("yes A"), awaiting written-spec review · **Path:** architectural
**Builds on:** `docs/superpowers/specs/2026-10-07-team-member-dashboard-design.md` (branch `thread-af/me-dashboard`)

## 1. Intent

The monthly client report moves through a review chain in the Hub — PM review → AM review → CEO review → sent
(`monthly_reports.status`: `generated`/`pm_review` → `am_review` → `jake_review` → `ready` → `sent`/`failed`).
The team also tracks that work in Asana ("MarketFoundry | Monthly Reports" with PM / AM / CEO subtasks). Today the two
are disconnected: the Asana task is created and ticked by hand, its subtasks are invisible to the Hub, and the Hub's own
"who is waiting" view (`/me` → Reports to review, `/reports/monthly` → Waiting for me) never reaches Asana.

**Goal:** the Hub stays the single source of truth for review state and **drives** Asana: it creates each period's Asana
task with one subtask per actual reviewer, ticks/unticks each person's subtask as their queue empties/refills, and both
Hub pages link to the task.

**Success:** for a newly generated period, with no human touching Asana, the Asana task shows exactly who still owes a
review, and becomes complete when every report for that period has been sent.

## 2. Locked decisions (do not re-ask)

| # | Decision |
|---|---|
| L1 | **Approach A — the Hub creates the period's Asana task.** Asana's native repeat is NOT relied on. |
| L2 | **Hub is the source of truth.** Asana is a mirror; nothing read back from Asana changes Hub review state. |
| L3 | **Reverses the earlier "read-only to Asana" rule (D8 of the dashboard spec) for this feature only.** The Asana mirror sync of project `1216052535915202` stays read-only. |
| L4 | Writes use the existing shared token via `asanaFetch` (`src/lib/onboarding/create-asana-project.ts`) — they appear in Asana as **manu@marketfoundry.agency**. Accepted. |
| L5 | **Asana failures never block a Hub review action.** Logged, retried on the next action. Every Asana write is idempotent. |
| L6 | Pages never call Asana live — they read links from the Hub DB. |
| L7 | **No backfill**: periods generated before this ships (Jul/Aug/Sep 2026 backlog) get no Asana task. |
| L9 | **Deadlines (ruled by Manu 2026-10-07):** reports auto-generate on the **4th** (cron every 30 min 04:00–23:30 UTC, retrying late-data clients all day). Due dates chain over **working days (Mon–Fri)**: PM = the 4th, or the following Monday if the 4th is Sat/Sun; AM = next working day after PM; CEO = next working day after AM; parent due = CEO day. Examples: 4th Tue → Tue/Wed/Thu · Thu → Thu/Fri/Mon · Fri → Fri/Mon/Tue · Sat or Sun → Mon/Tue/Wed. No public-holiday calendar. Pure helper `reviewDeadlines(period)` with a test per weekday of the 4th. |
| L10 | **Generation-failure cap (ruled by Manu 2026-10-07):** a client whose report generation ERRORS (not `data_not_settled`) is retried at most **3 times per period**; from the 3rd failure on, the cron skips it (`failed_capped`) and the client's PM sees it in **/me → Reports to review** as "Generation failed (3×)" linking to `/reports/monthly`, where a manual generate still works and clears the counter. |
| L8 | Period naming follows the Hub: the task for report period `2026-09` (generated 2026-10-04) is "MarketFoundry \| Monthly Reports \| Sep 2026". |

## 3. Facts verified 2026-10-07 (read-only Asana probe)

- Template task `1219237599617954` "MarketFoundry | Monthly Reports" lives ONLY in project **`1219237652232682`**
  ("MarketFoundry | Agency recurring Tasks"), section **`1219237652232685`** ("Data & Reporting"); workspace `1216006599656808`.
  It is NOT multi-homed into the mirrored reporting project, so `/me`'s Asana sync never sees it.
- "Monthly" is only a custom-field value (Recurrence Frequency `1219237652232690` = Monthly `1219237652232694`); Asana's
  native repeat is off — the parent was completed 2026-10-07 15:35Z and no next instance was created.
- Its 6 subtasks belong to no project (`memberships: []`): PM Review ×2, AM Review ×3, "CEO Review, Approve and Send" ×1,
  each assigned to one person (e.g. PM Review → hamid@marketfoundry.agency, due 2026-10-04, open while the parent is complete).
- Custom fields on the template: Recurrence Frequency, Priority (`1219237652232697`), Client Name (text), Data Source
  (multi-enum, MfHub `1219237599617958`), Task Type (Reporting `1219237599617939`), Delivery Format (Internal Only `1219237599617952`).
- Hub side: reviewer resolution already exists — `projectManagerFromRaw` / `accountManagerFromRaw`
  (`src/lib/monthly-report/resolve-client.ts`), `isWaitingForReviewer` / `canSend` / `reviewPermissions`
  (`src/lib/monthly-report/review.ts`), CEO = `MONTHLY_REPORT_FINAL_REVIEWER_EMAIL` (jake@marketfoundry.agency),
  name→email via `emailForStaffName` (`src/lib/monthly-report/review-notify.ts`).
- Hooks: generation — `src/app/api/cron/monthly-reports/route.ts` (cron `*/30 4-23 4 * *` — every 30 min 04:00–23:30 UTC on the 4th only, ruled by Manu 2026-10-07: each run skips clients that already have a report (`already_exists`) and retries only those still `data_not_settled`; runs ≤300s so they never overlap. A client still unsettled at the end of the 4th gets no automatic report — manual generate on /reports/monthly) and `POST /api/reports/monthly`
  (manual generate), both already call `notifyPmReportsReady`; review/send — `PATCH /api/reports/monthly`
  (calls `notifyMonthlyReportStage` / `notifyCeoFirstQueue`).
- Next free migration: **0127** (0125 = this branch, 0126 = Thread AG).

## 4. Behaviour

### 4.1 Ensure the period's task exists (on generate)
After a generate wave (cron or manual POST) for period P:
1. Look up `monthly_report_asana_links` for P. If a parent gid exists → reuse (idempotent; repeated cron runs at 08/10/12 are no-ops).
2. Otherwise create the parent in project `1219237652232682`, section `1219237652232685`:
   name `MarketFoundry | Monthly Reports | <Mon YYYY>`, assignee = CEO, due = the CEO deadline (L9),
   notes = what to do + the Hub link `https://www.marketfoundryhub.com/reports/monthly`, custom fields copied from the
   template's values (Recurrence Frequency=Monthly, Priority=High, Data Source=MfHub, Task Type=Reporting, Delivery Format=Internal Only).
3. Compute reviewers from P's reports (active clients): distinct PM emails, distinct AM emails, CEO email.
   Create one subtask per reviewer: `… | PM Review — <Name>` (PM deadline), `… | AM Review — <Name>` (AM deadline),
   `… | CEO Review, Approve and Send` (CEO deadline) — deadlines per L9. Store each subtask gid with its stage + reviewer email.
4. A PM/AM whose name can't be resolved to an email gets no subtask; log one warning per unresolved name
   (`[monthly-asana] no email for <role> "<name>" on <clients>`).
5. Reviewers that appear later in the same period (a client whose data lands on a later run that day) get their subtask
   added on that run (diff against stored subtasks); its due dates stay the period's L9 deadlines even if already past.

### 4.2 Keep subtasks in step (on every review action)
After any `PATCH /api/reports/monthly` that changes a report's status for period P (approve, send back, send, failed→retry):
1. Load all P reports + their PM/AM names; for each stored subtask compute **owes = any report in P is waiting on this
   reviewer at this subtask's stage** (same rule as Reports to review: PM stage = `generated`/`pm_review`, AM = `am_review`,
   CEO = `jake_review`/`ready`/`failed`).
2. owes = false and subtask open → complete it. owes = true and subtask complete → reopen it.
3. Parent: complete when every P report is `sent` (and all subtasks complete); reopen if any report leaves `sent`
   (not expected, but symmetric).
4. Writes only when the desired state differs from the stored state (stored `completed` flag per subtask), so a normal
   action costs 0–2 Asana calls.

### 4.3 Links in the Hub
- `/me` → Reports to review box: "Open in Asana" link to the current period's parent (latest period with a link row).
- `/me` → My Tasks: the person's own monthly-report subtask appears as an Asana row with its due date
  (read from the link table, merged into the task list; `source: "asana"`, client chip none).
- `/reports/monthly` header: "Asana task" link for the selected period, when a link row exists.

## 5. Data — migration 0127 (additive)

`monthly_report_asana_links`
| column | type | notes |
|---|---|---|
| `period` | varchar(7) PK | `YYYY-MM` report period |
| `parent_gid` | varchar(32) not null | |
| `parent_url` | text not null | permalink |
| `parent_completed` | boolean not null default false | |
| `subtasks` | jsonb not null default `[]` | `[{gid, url, stage: "pm"\|"am"\|"ceo", email, name, dueOn, completed}]` |
| `last_error` | text null | last Asana failure for this period |
| `updated_at` | timestamptz not null default now() | |

(JSON array, not a child table: ≤ ~8 subtasks per period, always read/written together.)

`monthly_report_generate_failures` (L10)
| column | type | notes |
|---|---|---|
| `client_id_code` | varchar(100) | PK part |
| `period` | varchar(7) | PK part |
| `attempts` | integer not null default 0 | incremented on each generation error |
| `last_error` | text null | |
| `updated_at` | timestamptz not null default now() | |

Cleared (row deleted) when a report for that client+period is saved by any path.

## 6. Units

| Unit | Responsibility |
|---|---|
| `src/lib/monthly-report/asana-link/reviewers.ts` (pure) | From P's reports + aac rawData + staff directory → `{stage, email, name}[]` + unresolved names. |
| `src/lib/monthly-report/asana-link/plan.ts` (pure) | `planSubtaskSync(stored, reports) → {complete[], reopen[], parent: "complete"\|"reopen"\|null}` and `planNewSubtasks(stored, reviewers)`. All the logic, fully unit-tested. |
| `src/lib/monthly-report/asana-link/asana.ts` | Thin Asana calls via `asanaFetch`: create parent, create subtask, set completed. No logic. |
| `src/lib/monthly-report/asana-link/index.ts` | `ensurePeriodTask(period)` and `syncPeriodSubtasks(period)` — read DB, call plan, call Asana, write DB, catch+log everything (never throws). |
| Hooks | one call in the cron + POST generate path (after `notifyPmReportsReady`), one in PATCH after the status write (beside `notifyMonthlyReportStage`). Awaited with a short timeout or fire-and-forget — must not delay/fail the response. |
| `/me` + `/reports/monthly` | read `monthly_report_asana_links` for links and the person's subtask. |

### 6a. Generation-failure cap (L10)
- Cron single-client branch (`?clientIdCode=`): on a thrown generation error, upsert `attempts + 1`, `last_error`.
- Cron main loop: before fan-out, skip pending clients whose row has `attempts >= 3` → result `failed_capped`.
- Successful save (cron or manual POST) deletes the client+period row.
- `/me` loader: rows with `attempts >= 3` for the current period are added to Reports to review for the client's PM
  (same name match as the reviews box), stageLabel `Generation failed (3×)`.

## 7. Failure handling

| Situation | Behaviour |
|---|---|
| Asana down / 4xx on create | Review/generate succeeds; `last_error` set; next generate run or review action retries `ensurePeriodTask`. |
| Asana error on tick | Stored `completed` not changed, so the next action re-plans the same write. |
| Someone ticks/unticks a subtask manually in Asana | Not read back (L2); next Hub action re-asserts the Hub state. |
| Subtask deleted in Asana | Write returns 404 → drop it from `subtasks`, log; the next generate diff recreates it. |
| Unresolvable reviewer name | No subtask; warning log naming person + clients. |
| No token | All Asana steps skipped silently; links absent. |

## 8. Testing

- Unit (TDD): `reviewers.ts` (dedupe, unresolved names, CEO always present), `plan.ts` (every status × stage
  combination; send-back reopens; parent completes only when all sent; no-op when already in desired state;
  new reviewer mid-period).
- Hook isolation: an Asana throw inside `syncPeriodSubtasks` does not change the PATCH response (route test with the
  module mocked to throw).
- Real run, with Manu's per-action OK: apply 0127; run `ensurePeriodTask("2026-09")` once against Asana in a **sandbox
  copy** first — create in a throwaway section or with a `[TEST]` name prefix, verify, then delete the test task by hand.
- Browser: links on `/me` and `/reports/monthly`; a PM approval ticks that PM's subtask in Asana.

## 9. Out of scope

Reading Asana changes back into the Hub · backfilling Jul/Aug/Sep 2026 · per-client subtasks · comments/@mentions in
Asana · retiring the hand-made template task `1219237599617954` (Manu's call; recommend archiving it once this ships).

## 10. Open items for the plan (code facts, not design questions)

- Exact place in `PATCH /api/reports/monthly` where the new status is known for all actions (incl. send / failed).
- Whether `emailForStaffName` covers PMs (it's named for AMs; verify it resolves any staff name).
- Asana custom-field write format for enum/multi-enum on create.
