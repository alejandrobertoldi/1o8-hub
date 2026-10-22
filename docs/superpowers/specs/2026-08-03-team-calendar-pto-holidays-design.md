# Team Calendar — Time Off & Public Holidays

**Date:** 2026-08-03
**Status:** Approved by Manu (design phase complete)
**Author:** Claude (brainstorming session with Manu)

## 1. Problem

The team has no controlled way to record or approve days off, and no shared view of
who is unavailable when.

Four findings from the existing `/calendar` section shaped this design:

1. **Permission is not the gap.** `POST /api/calendar/events` already allows both
   `admin` and `editor` to create events, and all 14 `@marketfoundry.agency`
   accounts hold one of those roles. Every team member can already post their own
   PTO today. `calendar_events` contains exactly **one** `pto` row (2026-06-26 →
   2026-07-05). The missing piece is a required flow with visibility and
   notification, not a new capability.
2. **The existing holiday data is not holiday data.** All 48 `holiday` rows are
   US-only and mix genuine non-working days (MLK Day, Memorial Day, Thanksgiving,
   Christmas) with observances nobody takes off (Valentine's Day, St. Patrick's
   Day, Mother's Day, Father's Day, Halloween, New Year's Eve). If `holiday` ever
   drives day-count arithmetic, those observances become fake days off.
3. **No reliable person on a PTO row.** `calendar_events.member_name` is a
   free-text `varchar(100)`, not a foreign key. Per-person totals cannot be
   computed from a field anyone can typo.
4. **Country coverage is unverifiable from the database.** `users` has no country
   column. Of the 14 accounts, at least three names do not obviously map to USA,
   Pakistan, or Spain.

## 2. Locked decisions

Decided with Manu during brainstorming. Do not re-litigate these.

| # | Decision |
|---|---|
| D1 | **Request → approve/deny workflow**, not inform-only. Requests carry a status lifecycle. |
| D2 | **Jake Kosten (`jake@marketfoundry.agency`) is the sole approver, permanently.** No delegation, no timeout escalation, no fallback approver. Manu was shown the single-point-of-failure risk and reaffirmed the decision. |
| D3 | **One leave type.** No enum of vacation/sick/unpaid. Every request is "Time off" plus a required free-text reason. |
| D4 | **No balances or entitlements.** No allowance, no accrual, no carryover. The system reports days taken per person per year; Jake applies judgement. |
| D5 | **Badge and email, both directions.** Nav badge showing the pending count (Jake only — see §4.3), plus email to Jake on submission and to the requester on decision. |
| D6 | **Country is optional on `users`.** USA, Pakistan and Spain public-holiday sets are seeded. A user with no country still sees the holiday sets but gets no country-specific non-working days in their day count. |
| D7 | **Architecture: two new tables, `calendar_events` untouched** (Approach A of three presented). |
| D8 | **Reason text is admin-only.** The shared team calendar shows only that a member is OOO — never why. |
| D9 | **Retroactive requests are allowed** (a start date in the past), so illness can be recorded after the fact. |
| D10 | **Cancelling an approved request is allowed** while the start date is still in the future. |
| D11 | **The public-holiday list is editable by any admin**, not Jake-only. It is reference data, not a request. |
| D12 | **`calendar_events` receives no schema change and no row deletion.** Its 48 existing `holiday` rows are relabelled *observances* in the UI and retained for content planning. |

## 3. Architecture

Two new tables plus one new nullable column. `calendar_events` is not modified —
this honours the project's additive-only rule literally and requires no
destructive production step.

The design separates three concepts that the current single table conflates:

- **Time-off requests** — a workflow entity with a state machine, an owner and an
  approver. Gets its own table.
- **Public holidays** — country-scoped reference data. The only source of truth
  for "is this a non-working day". Gets its own table.
- **Observances and content dates** — Valentine's Day, Halloween, Mother's Day.
  Genuinely useful to an agency for content planning, but not days off. These stay
  in `calendar_events` exactly as they are.

### 3.1 Migration 0087

`0086_redshift_archive_runs.sql` is the latest applied migration, so this is
`0087`. Additive only: two `CREATE TABLE`, one `CREATE TYPE`, one `ADD COLUMN`.

```sql
CREATE TYPE time_off_status AS ENUM ('pending','approved','denied','cancelled');

CREATE TABLE time_off_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  reason        text NOT NULL,
  status        time_off_status NOT NULL DEFAULT 'pending',
  working_days  integer NOT NULL,
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  CONSTRAINT time_off_dates_ordered CHECK (end_date >= start_date)
);
CREATE INDEX idx_time_off_user_start  ON time_off_requests (user_id, start_date);
CREATE INDEX idx_time_off_status      ON time_off_requests (status);
CREATE INDEX idx_time_off_range       ON time_off_requests (start_date, end_date);

CREATE TABLE public_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL,
  holiday_date date NOT NULL,
  name         varchar(120) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_holidays_unique UNIQUE (country_code, holiday_date)
);
CREATE INDEX idx_public_holidays_date ON public_holidays (holiday_date);

ALTER TABLE users ADD COLUMN country_code char(2);
```

Drizzle definitions go in `src/lib/db/schema.ts` alongside `calendarEvents`
(~line 3361), following the existing `pgEnum` + `pgTable` + inferred-type pattern.

`working_days` is `integer`, not `numeric` — every request is whole days (§8), and
widening an `integer` to `numeric` later is an additive-safe alter if half-days are
ever added.

### 3.2 Why `working_days` is stored, not computed

A request approved in 2026 must keep its day count even if a holiday date is
corrected in 2027. Storing the snapshot prevents history from silently rewriting
itself, and turns the days-taken figure into a `SUM` rather than a per-row
recompute against a mutable holiday table.

The value is computed once, at submission, from the requester's country holidays
as they stand at that moment.

### 3.3 The `country_code` values

Exactly three values are valid: `'US'`, `'PK'`, `'ES'`. Anything else is rejected
at the API boundary. `NULL` is valid and means "no country-specific holidays
apply" (D6).

Assigning a country to each of the 14 team members is a **data task requiring
Manu's input**, not something to infer from names. Until Manu supplies the
mapping, every user's `country_code` stays `NULL` and the system behaves per D6.

## 4. Components

Each unit has one purpose and can be understood without reading the others.

### 4.1 `src/lib/time-off/working-days.ts` — pure, fully tested

No database access, no `Date.now()`, no timezone handling. Dates are `YYYY-MM-DD`
strings throughout, matching the existing `calendar_events` convention.

```ts
countWorkingDays(startDate: string, endDate: string, holidays: Set<string>): number
overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean
```

`countWorkingDays` counts inclusive calendar days from `startDate` to `endDate`,
excluding Saturdays, Sundays, and any date present in `holidays`. A holiday that
falls on a weekend is already excluded and must not be subtracted twice.

`holidays` is a set of `YYYY-MM-DD` strings for one country, supplied by the
caller. The pure function never knows about countries.

### 4.2 `src/lib/time-off/queries.ts` — database reads

- `getMyRequests(userId)` — all statuses, newest first
- `getPendingRequests()` — the review queue, oldest first
- `getApprovedInRange(from, to)` — for calendar rendering
- `getHolidayDates(countryCode, from, to)` — returns `Set<string>`; empty set when
  `countryCode` is `null`
- `getDaysTakenByUser(year)` — `SUM(working_days)` grouped by user, `status='approved'`

### 4.3 API routes

All routes require an authenticated session. `role=client` is rejected with **403
on every time-off route** — portal users must never see internal team PTO.

"Team member" means **`role=admin` or `role=editor`**, which is what all 14
`@marketfoundry.agency` accounts currently hold. `viewer` and `pending` roles
cannot submit requests and get **403**; being explicit here avoids a future
read-only `viewer` account accidentally gaining the ability to book time off.

| Route | Method | Who | Behaviour |
|---|---|---|---|
| `/api/time-off` | `POST` | `admin` or `editor`, own request only | Validates dates, resolves requester's country holidays, computes `working_days`, rejects overlap with own `pending`/`approved` rows, inserts as `pending`, emails Jake |
| `/api/time-off` | `GET` | `admin` or `editor` | Own requests; admins get all requests including `reason` |
| `/api/time-off/[id]` | `PATCH` | **Jake only** | `approved` or `denied` + optional `decision_note`; sets `decided_by`, `decided_at`; emails requester |
| `/api/time-off/[id]` | `DELETE` | owner only | Sets `status='cancelled'`. Allowed while `pending`, or while `approved` with a future `start_date` (D10) |
| `/api/time-off/pending-count` | `GET` | **Jake only** | `{ count: n }` for the nav badge. Jake-only because he is the only person who can act on it (D2) — a badge shown to admins who cannot approve is pure noise. |
| `/api/holidays` | `GET` | all | List, filterable by `country_code` and year |
| `/api/holidays` | `POST` | admins | Create one holiday |
| `/api/holidays/[id]` | `DELETE` | admins | Remove one holiday |

Jake-only enforcement compares the session email to a single constant in
`src/lib/constants.ts` (`TIME_OFF_APPROVER_EMAIL = "jake@marketfoundry.agency"`),
so changing the approver later is a one-line edit rather than a schema change.

### 4.4 UI

- **`/calendar`** — the existing `CalendarView` gains two overlays: approved time
  off (rendered per person, showing name and "Time off" only, never the reason,
  per D8) and the viewer's country public holidays. A "Request time off" button
  opens a dialog with start date, end date and reason. The 48 legacy
  `calendar_events` `holiday` rows keep rendering, relabelled **Observance** (D12).
- **`/calendar/requests`** — every user sees their own requests with status. Jake
  additionally sees the pending review queue with approve and deny actions, a
  note field, and the requester's reason. Other admins see all requests read-only
  including reasons, but no approve/deny controls (D2).
- **Nav badge** — the Calendar item in `src/components/layout/top-nav.tsx` shows
  the pending count **for Jake only** (§4.3).

`CalendarView.tsx` is already 537 lines. The two overlays and the request dialog
go in new sibling files under `src/app/calendar/_components/` rather than growing
that file further.

### 4.5 Email

Two new builders in `src/lib/email.ts`, following the existing
`sendEmail()` + `buildXEmail()` house pattern:

- `buildTimeOffRequestEmail` → Jake, on submission. Requester name, dates,
  working-day count, reason, link to `/calendar/requests`.
- `buildTimeOffDecisionEmail` → requester, on decision. Outcome, dates, and the
  decision note if present.

**The existing builders in that file interpolate user text into HTML without
escaping.** The two new builders must HTML-escape `reason` and `decision_note`.
Do not copy the unescaped pattern. Fixing the pre-existing builders is out of
scope for this work.

### 4.6 Seed script — `scripts/seed-public-holidays.ts`

Idempotent insert of USA, Pakistan and Spain public holidays for 2026 and 2027,
relying on the `(country_code, holiday_date)` unique constraint to make re-runs
safe. Running it against production requires Manu's explicit per-action approval.

Two seeding constraints that must be honoured:

- **Pakistan's Eid al-Fitr and Eid al-Adha are lunar** and shift roughly 11 days
  earlier each year. They cannot be derived from a rule, and the government
  confirms exact dates only weeks in advance. Seed best-known dates, and record in
  the script's header comment that they need annual human review.
- **Spain has regional holidays** on top of the ~10 national ones. Manu did not
  specify a region, so **national-only is the deliberate default**. Add regional
  days later via the admin holiday UI if needed.

## 5. Data flow

```
Member submits  →  status=pending
                   ├─ email to Jake
                   └─ nav badge count +1 (Jake)

Jake decides    →  status=approved | denied
                   ├─ decided_by / decided_at / decision_note recorded
                   ├─ email to requester
                   └─ badge count −1

Approved only   →  renders on the shared /calendar
```

`pending` and `denied` requests never appear on the shared calendar. They are
visible only in `/calendar/requests` — to their owner, and to admins.

## 6. Error handling

| Condition | Response |
|---|---|
| Overlaps requester's own `pending` or `approved` request | **409** with the conflicting date range |
| `end_date < start_date` | **400** (also enforced by a DB check constraint) |
| Malformed date (not `YYYY-MM-DD`) | **400** |
| Empty or whitespace-only `reason` | **400** |
| Non-Jake user calls `PATCH` | **403** |
| `role=client`, `viewer` or `pending` on any time-off route | **403** |
| `PATCH` on a request already `approved`/`denied`/`cancelled` | **409** — guards double-clicks and stale email links |
| `DELETE` on an approved request whose `start_date` has passed | **409** |
| `country_code` not in `US`/`PK`/`ES` | **400** |
| Requester has no `country_code` | Not an error. Weekends excluded, holidays not (D6). |
| Email send fails | **Never fails the request.** `sendEmail` returns `false` rather than throwing; log and continue. The nav badge is the fallback notification path. |

The email rule matters most: a Resend outage or an unset `RESEND_API_KEY` must not
prevent someone from booking time off.

## 7. Testing

**Pure-function tests** (`src/lib/time-off/working-days.test.ts`) — the only unit
with genuinely tricky logic, so it carries the test weight:

- Single weekday → 1
- Single Saturday → 0
- Mon–Fri → 5
- Mon–Sun → 5 (weekend excluded)
- Range spanning a month boundary
- Range spanning a year boundary
- One holiday inside the range → count reduced by 1
- A holiday falling on a Saturday → count unchanged (no double subtraction)
- Empty holiday set → weekends-only behaviour
- `start === end` on a holiday → 0
- `overlaps`: all six boundary arrangements (before, touching-before, partial
  overlap, contained, containing, after)

**Route tests** — validation and authorization guards: the 403 for `role=client`,
the 403 for a non-Jake `PATCH`, the 409 for overlapping requests, the 409 for
re-deciding, and confirmation that a failed email still returns 201.

No database or Resend mocks, consistent with the project's existing practice of
leaving I/O boundaries untested and pushing logic into pure helpers.

Per project rules: `vitest` does not typecheck, so every test run is followed by
`node_modules/.bin/tsc --noEmit` before any completion claim.

## 8. Explicitly out of scope

- Entitlements, allowances, accrual, carryover (D4)
- Leave-type taxonomy (D3)
- Half-days — every request is whole days
- Approver delegation or escalation on Jake's absence (D2)
- Any change to `calendar_events` schema or rows (D12)
- Escaping the pre-existing unescaped email builders
- Client-portal visibility of team PTO
- Spanish regional holidays (national-only default, §4.6)
- Google Calendar or Asana synchronisation

## 9. Known risks

1. **Single approver, no escalation** (D2). A request submitted while Jake is
   unavailable sits at `pending` indefinitely. Nothing in the system escalates it.
   Accepted by Manu.
2. **Pakistan Eid dates drift** and require manual correction each year (§4.6). If
   nobody corrects them, day counts for Pakistan-based staff will be slightly
   wrong in a way the system cannot detect.
3. **Adoption.** The current calendar has one PTO row despite everyone already
   having write access (§1.1). Approval plus email plus badge is the mitigation,
   but nothing here technically prevents someone from simply not filing.
4. **Duplicate US holidays across two tables.** After seeding, real US holidays
   exist both in `public_holidays` and among the 48 legacy `calendar_events`
   rows. Only `public_holidays` affects arithmetic, but the calendar will show
   some days twice (once as a holiday, once as an observance) until the legacy
   rows are hand-tidied. That tidy-up is a later, optional, approval-gated data
   task — not part of this work.

## 10. Open data tasks requiring Manu

Neither blocks implementation; both block the feature being *correct* in
production.

1. **Assign `country_code` to the 14 team members.** Default `NULL` until
   supplied.
2. **Approve the production run** of migration 0087 and the holiday seed script.
