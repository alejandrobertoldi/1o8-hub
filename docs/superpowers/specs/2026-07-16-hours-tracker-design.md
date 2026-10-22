# Team Hours Tracker — Design Spec

**Date:** 2026-07-16
**Status:** Approved (brainstorming session)
**Goal:** Track where the team's working hours go, per client, to measure resources used for each client.

## Summary

A native time-tracking domain inside MFHub. Team members log daily time entries
(time range against a client) on a dedicated `/hours` page; admins see a
team-wide per-member and per-client breakdown in a new **Hours** tab on the
Users admin page (`/admin/users`). No payroll, approval workflow, billing rates,
or work categories — this is resource attribution only.

## Decisions (locked during brainstorming)

- **Purpose:** per-client resource attribution. Not payroll, not billing.
- **Entry model:** manual per-day entries as a **time range**. Two entry modes
  in the UI: start/end times, or start time + duration (duration is converted
  to an end time before submit — the DB only stores ranges).
- **Overlap handling:** overlapping entries for the same user on the same day
  are **allowed but warned** — the API saves and returns the conflicting
  entries; the UI shows a warning toast and badges overlapping entries.
- **Access:** every team member (`admin`, `editor`, `viewer`) logs their own
  hours; admins see everyone's. `client` and `pending` roles have no access.
- **Fields:** client + time range + optional note. No category dimension.
  Internal (non-client) time is logged under the literal client code
  `INTERNAL`.
- **Approach:** native Postgres table + `/api/hours` routes + two UI surfaces
  (rejected: weekly aggregates; Asana time pull).

## 1. Data model

New table `time_entries`, created **additively** via a `scripts/_apply-00NN.ts`
script (never `drizzle-kit migrate` — DEV DB is PROD Supabase, shared with
1o8Hub). Drizzle schema added to `src/lib/db/schema.ts`.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | uuid | NOT NULL, FK → `users.id`, **no cascade** — deleting a user with logged hours must fail rather than erase attribution history |
| `client_id_code` | text | NOT NULL — matches `aac.client_id_code`, or literal `INTERNAL` |
| `entry_date` | date | NOT NULL |
| `start_time` | time | NOT NULL |
| `end_time` | time | NOT NULL, CHECK `end_time > start_time` (entries cannot cross midnight; log two entries) |
| `hours` | numeric(4,2) | NOT NULL — computed by the app as `end − start` on every write; stored so aggregation is a plain SUM |
| `note` | text | nullable |
| `created_at` | timestamptz | NOT NULL, default now |
| `updated_at` | timestamptz | nullable |

Indexes: `(user_id, entry_date)` and `(client_id_code, entry_date)`.
Multiple entries per user/client/day are allowed.

## 2. API — `/api/hours`

All routes require an authenticated session; `client`/`pending` roles get 403.
Follows existing API route patterns (session via NextAuth, Drizzle queries,
JSON responses, sonner-toast-friendly error bodies).

- `GET /api/hours?from=YYYY-MM-DD&to=YYYY-MM-DD`
  — the session user's entries in range. Admins may pass `userId=` to read
  another member's entries.
- `POST /api/hours`
  — body `{ entryDate, startTime, endTime?, durationHours?, clientIdCode, note? }`.
  Exactly one of `endTime` / `durationHours` required; duration is normalized
  to `endTime` server-side. Validates: `end > start`, `clientIdCode` exists in
  `aac` or equals `INTERNAL`, resulting hours ≤ 24.
  **Overlap check:** queries the user's other entries on `entryDate`; if any
  time-overlap exists (touching edges — e.g. 09:00–10:00 vs 10:00–11:00 — do
  NOT count as overlap), the entry is **still saved** and the response includes
  `overlaps: [{ id, clientIdCode, startTime, endTime }]`.
- `PATCH /api/hours/[id]` — same body/validation/overlap semantics. Owner only;
  admins can edit anyone's.
- `DELETE /api/hours/[id]` — owner only; admins can delete anyone's.
- `GET /api/hours/summary?from=&to=` — **admin-only.** Returns totals pivoted
  user × client for the range: per-member total with per-client breakdown, and
  per-client total with per-member breakdown (one payload, both pivots).

## 3. Team-facing page — `/hours`

Gated by role (`admin` | `editor` | `viewer`) — **no new `allowedSections`
entry**; that machinery is for client-facing portal sections. Sidebar nav link
added for team roles.

Content:
1. **Quick-add form** with a mode toggle:
   - *Start/End*: date (defaults today), client select (from `/api/clients`
     plus an "Internal" option), start time, end time, note.
   - *Start + Duration*: start time + hours; computed end time shown live.
2. **Current week's entries** below the form: rows like
   `Mon 14 · CLIENTX · 09:00–11:30 · 2.5h · note`, with edit/delete, and a
   week total. Entries that overlap another entry on the same day get a small
   warning badge (client-side check, same rule as the server).
3. On save, if the API response contains `overlaps`, show a warning toast
   naming the conflicting entry. The save is not blocked.

Stack: React Query + shadcn/ui, matching existing pages.

## 4. Admin view — Hours tab in Users section

A new **Hours** tab on `/admin/users`, implemented as a separate component
`src/components/admin/hours-overview.tsx` (the page file is already oversized —
do not grow it further).

- Date-range filter, defaulting to the current month.
- **By member** view: table of team members with total hours, expandable to a
  per-client breakdown.
- **By client** toggle: inverse pivot — each client's total hours, expandable
  to per-member contributions (the primary "resources per client" answer).
- Data from `GET /api/hours/summary`. No CSV/export in v1.

## 5. Error handling

- API: 401 unauthenticated, 403 wrong role / not owner, 400 validation
  failures with a message the UI can toast directly.
- UI: sonner toasts for errors and overlap warnings, inline field errors on
  the form.

## 6. Testing (Vitest)

- **Validation:** rejects 0-length ranges, end ≤ start, hours > 24, unknown
  client code; accepts `INTERNAL`.
- **Ownership:** user A cannot PATCH/DELETE user B's entry; admin can.
- **Overlap:** detects true overlaps; touching edges are not overlaps;
  duration→endTime conversion is exact; response carries `overlaps` while
  still persisting.
- **Summary:** aggregation totals correct across users/clients/range bounds;
  non-admin gets 403.
- Known pre-existing issue: the `@/lib/api-auth` test mock lacks
  `getEffectiveAccountId` and fails ~36 report-route tests. New tests must use
  whatever mocking pattern the currently-passing route tests use.

## Out of scope (explicitly rejected for v1)

- ~~Edit affordance in the /hours week list~~ — **superseded 2026-07-20**:
  inline row editing was added to the day-grouped detail rows (Client,
  Start/End time, Note), wired to the existing `PATCH /api/hours/[id]`.
  The entry's date/day-group membership is NOT editable inline — moving
  an entry to a different day is still a delete-and-recreate.

- Work categories / task types on entries
- Timers, approval workflows, billing rates, payroll
- CSV/PDF export of hours
- Asana time import
- Editing other members' entries by non-admins

## Risks

- **Adoption is the failure mode, not code.** If the team doesn't log daily,
  per-client numbers become fiction. The design's only lever is minimal entry
  friction (one row, 4 fields, duration shortcut).
- `client_id_code` is a soft reference to `aac` (no FK) — consistent with how
  the rest of the codebase treats client codes, but renamed client codes would
  orphan history.
