# Team Member Dashboard (`/me`) — Design

**Date:** 2026-10-07 · **Status:** approved in conversation, awaiting written-spec review · **Path:** architectural

## 1. Intent

Each MarketFoundry staff member gets a personal dashboard answering "what needs me today?":
pending tasks, alerts on the accounts they manage, account health, and upcoming due dates.

- **Primary audience:** the team member themselves (their own page).
- **Secondary:** admins/owners can open anyone's dashboard to see workload.
- **Success:** a team member can open one page and know (a) what is overdue / due today / due this week,
  (b) which of their accounts has a problem, (c) when their next crunch is — without opening Asana first.

## 2. Locked decisions (do not re-ask)

| # | Decision |
|---|---|
| D1 | Audience = personal home page; admins/owners may view any staff member's page. |
| D2 | Task source = **Asana + Hub**. |
| D3 | Approach A = **background sync** into a Hub table; page never calls Asana live. |
| D4 | Asana source = single project **`1216052535915202`** ("AAA_SC_US \| Market Foundry Reporting"), which multi-homes every task created in any project. Token `ASANA_ACCESS_TOKEN_MF` (owner manu@marketfoundry.agency, a member). |
| D5 | Overdue group is **collapsed by default**. |
| D6 | **Unassigned tasks are excluded.** |
| D7 | Rollout = **nav item first, login redirect later.** `/` (client list) stays as-is. |
| D8 | Sync is **read-only** to Asana. No write-back in v1. |

## 3. Facts verified 2026-10-07 (read-only Asana probe)

- Tasks in project `1216052535915202` are **multi-homed, not copies**: each task's `memberships` lists both its
  origin project (e.g. `SOP_SC_US | Sopreme`) and the reporting project. Assignee / due / completion are one record.
- Counts: **5,209 tasks, 393 incomplete** ⇒ one full sync ≈ 4 pages of 100.
- Assignee emails are `@marketfoundry.agency` ⇒ match `users.email` directly (no name matching for tasks).
- Origin project names start with a client code (`SOP_SC_US | …`, `WHI_SC_US | …`). Internal projects
  (`MarketfoundryHub`, `IDS - Tracker`, `Market Foundry | Research`) have no client code.
- Useful enum custom fields on the project: **Task Status** (gid `1216388146560076`; e.g. 🚫Blocked, ⏸️On Hold,
  ☑️In Review by PM, ☑️In Review BY CLIENT), **Priority Levels** (gid `1216388146560065`; P0–P4 + waiting states).
- Overdue backlog is real: in a 20-task sample, 8 open tasks had due dates in the past (oldest 2026-07-16).
- **Unverified:** whether subtasks appear in the project. All sampled tasks had `parent = null`. Checked in the
  first real sync run (§9); v1 excludes subtasks unless that run shows they matter.

## 4. Architecture

```
Asana project 1216052535915202
        │  (cron, every 15 min, read-only, ~4 paged GETs)
        ▼
/api/cron/asana-tasks-sync ──► asana_tasks table (Hub Postgres)
                                        │
/me page ──► /api/me/dashboard?user=… ──┼── asana_tasks (by assignee email)
                                        ├── client_onboarding_steps (assignee_id)
                                        ├── aac.rawData role names → "my accounts"
                                        ├── ppc_alerts (unacknowledged, my accounts)
                                        └── sales-cache.ts (cached sales only, never live Redshift)
```

### 4.1 Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/lib/my-dashboard/asana-map.ts` (pure) | Asana task JSON → `asana_tasks` row: client code from origin-project name prefix, status/priority enum names, `due_on` as `YYYY-MM-DD` string. | — |
| `src/lib/my-dashboard/asana-sync.ts` | Page through open tasks of the project, upsert rows, mark rows not returned as `completed=true`. Reuses `asanaFetch` from `src/lib/onboarding/create-asana-project.ts`. | asana-map, db |
| `src/app/api/cron/asana-tasks-sync/route.ts` | Cron entry (CRON_SECRET guard, same pattern as other crons), `vercel.json` entry `*/15 * * * *`. | asana-sync |
| `src/lib/my-dashboard/group-tasks.ts` (pure) | Merge Asana + Hub items into groups: Overdue / Today / This week / Later / No due date; sort P0/P1 first, then due date, then client. Week = through Sunday of the current week. | — |
| `src/lib/my-dashboard/my-accounts.ts` (pure core) | Given a user's name(s) and `aac` rows, return `{clientIdCode, roles[]}`. Reuses `CLIENT_TEAM_ROLES` + normalisation from `src/lib/sales-summary-header.ts` (extract the shared `norm` helper rather than duplicate it). | — |
| `src/lib/my-dashboard/alerts.ts` (pure) | Rank alerts: ppc_alerts by severity, stale-data (≥ `STALE_LAG_DAYS` behind newest), Asana tasks with status Blocked/On Hold. | — |
| `src/app/api/me/dashboard/route.ts` | Auth + authorization, assemble payload. Each section returned independently with its own `error` field so one failure never blanks others. | all above |
| `src/app/me/page.tsx` + `src/components/my-dashboard/*` | UI. | API |

## 5. Data model — new table `asana_tasks`

Additive migration only. Number = next free at build time (check `drizzle/migrations/` AND open branches;
Thread AB holds 0123 ⇒ expect ≥ 0124). Applied with a bespoke `scripts/_apply-00NN.ts` (house pattern), and
only with Manu's explicit OK.

| Column | Type | Notes |
|---|---|---|
| `gid` | varchar(32) PK | Asana task gid |
| `name` | text | |
| `assignee_email` | varchar(255) null | lower-cased; index |
| `assignee_name` | varchar(255) null | display fallback |
| `due_on` | date null | |
| `completed` | boolean not null | |
| `client_id_code` | varchar(100) null | parsed from origin project; null for internal projects |
| `origin_project_name` | text null | |
| `task_status` | varchar(100) null | enum option name |
| `priority` | varchar(100) null | enum option name |
| `permalink_url` | text | |
| `asana_modified_at` | timestamptz null | |
| `synced_at` | timestamptz not null | |

Plus a one-row status record for the last sync (`asana_sync_state`: `last_success_at`, `last_error`, `open_count`)
— or a row in an existing sync-runs table if a suitable one exists (decide in the plan; prefer reuse).

## 6. Page content (top to bottom)

1. **Header strip** — greeting, date, Asana sync stamp; four clickable counters: **Overdue · Due today · Due this
   week · Alerts** (click scrolls to + filters the relevant box).
2. **My tasks** (main column). Groups: **Overdue (collapsed: "12 overdue — oldest Jul 31")** → Today → This week →
   Later → No due date. Row: name, client chip, due date, Task Status pill, priority dot (P0/P1 only), open-in-Asana
   link. Hub items (onboarding steps assigned to the user) mixed in with a "Hub" chip linking to the Hub page.
   Read-only. Unassigned tasks never shown (D6).
   - SEO S6 approvals are **included only if** the Hub records who an approval is waiting on — verify in the plan;
     otherwise drop from v1 (do not guess an assignee).
3. **Alerts** (side column), worst first, each linking to where it's fixed: unacknowledged `ppc_alerts` on my
   accounts; stale data on my accounts; my Asana tasks with status Blocked / On Hold.
4. **My accounts** (card grid): per client where my name holds an `aac.rawData` role — logo, code, my role(s),
   7-day sales vs prior 7 (% + sparkline, from `sales-cache.ts` only), open/overdue task counts for that client,
   alert count, link to `/sales-summary` for that client. Cache missing/stale ⇒ "Sales unavailable", never a spinner
   on a live scan.
5. **Next 14 days** strip — task count per day, today marked; click a day to filter My tasks.

Visual treatment follows `DESIGN.md` (read before building UI; no deviation without Manu's approval).

## 7. Access & rollout

- `/me` shows the signed-in user's own dashboard. Staff roles only; client-role users stay confined to `/portal`
  (existing proxy), pending users to `/auth/register`.
- `/me?user=<id>` and a person picker: admins/owners only (`hasAdminPowers` / `isEditorOrAbove` per `roles.ts` —
  pick the existing helper that means "admin or above"). Non-admins passing `?user=` get their own page (or 403 from
  the API), never another person's data.
- Nav gets a **"My Dashboard"** item at the top. **No login redirect change in v1** (D7).
- Optional, low-cost: a "Dashboard" link from `/team/[userId]` to `/me?user=<id>` for admins.

## 8. Failure handling

| Situation | Behaviour |
|---|---|
| Asana down / rate-limited | Cron logs error to sync state, keeps existing rows. Page stamp amber > 1h, red > 6h. |
| Token missing | Tasks box: "Asana not connected". Other boxes load. |
| One data section fails | That box shows its own error; others render (per-section `error` in payload). |
| Sales cache missing/stale | Account card shows "Sales unavailable". |
| No `aac` role matches the user's name | "No accounts linked to your name" + the exact Hub name used for matching (surfaces rebrand duplicate-name issues). |
| Fresh sync, zero tasks | "No tasks assigned to you in Asana." Only shown when sync is fresh; stale sync shows the stale warning instead. |

## 9. Testing & verification

- **Unit (vitest, TDD):** asana-map (client-code parse incl. internal projects, enum extraction, null due), sync
  close-out (rows absent from a run become completed), group-tasks (boundaries: today, end of week, overdue, no
  date; P0/P1 ordering), my-accounts (name normalisation, multi-role, duplicate users), alerts ranking, API
  authorization (non-admin cannot read another user).
- **tsc** after vitest (vitest does not typecheck), judged by filename against the current baseline.
- **One real read-only sync** before shipping: open count ≈ 393 (±drift); check for subtasks assigned to staff that
  are absent from the project — report the number, then decide.
- **Browser pass on PORT=3100:** as Manu, as one non-admin staff user, and the admin picker. Never `next build`.

## 10. Out of scope (v1)

Asana write-back (completing tasks from the Hub) · personal Hub reminders/to-dos · email/notifications · AI-written
insights · unassigned tasks · subtasks (unless §9's sync run shows they matter) · changing the post-login redirect.

## 11. Open items to resolve in the plan (not design questions)

- Does a reusable sync-runs/state table exist, or add `asana_sync_state`?
- Exact `sales-cache.ts` read for 7-day vs prior-7 per client.
- Does the Hub record an assignee for SEO S6 approvals? (include or drop per §6.2)
- Which role helper gates the admin picker.
