# Team Calendar — Requests UI & Holiday Admin (Tasks 8–9)

## 1. Problem

The team time-off backend (schema, API routes, holiday engine, email, audit
log) has been live since `37c453b4`. Zero UI calls any of it: `/calendar`
still only renders the legacy `calendar_events` calendar, and nothing lets a
user submit a request, an approver act on one, or an admin manage the holiday
calendar without hand-writing API calls.

This spec covers the remaining UI work. It builds on
`2026-08-03-team-calendar-pto-holidays-design.md` §4.4, which already designed
most of the shape (a request dialog on `/calendar`, a `/calendar/requests`
page, a Jake-only nav badge). It does **not** re-litigate that shape. The one
piece §4.4 left genuinely open — a holiday admin UI — is designed here for
the first time.

## 2. Decisions locked in this round

- **Holiday admin UI**: a dedicated `/admin/holidays` page (not a table
  bolted onto `/admin/users`, not left as raw API/seed-script access). Any
  admin can use it, matching the already-locked "holiday list editable by any
  admin."
- **Holiday page layout**: country tabs (US/PK/ES/PT/PH/FI), each with a
  2026/2027 year toggle. Chosen over a flat filtered table or an accordion
  because holidays are reviewed one country at a time, and each country's
  list is short once split out — measured live: ES 10, US 11, PH 12, PK 12,
  PT 13, FI 14 rows per year (144 total across 6 countries × 2 years).
- **`getDaysTakenByUser(year)` surfacing**: both — every user sees their own
  running total on `/calendar/requests`; Jake additionally sees a per-person
  breakdown for the year. Other admins do not get the aggregated breakdown
  table (see the note in §4.3 — this is a UI convenience boundary, not a data
  boundary, since they can already see every individual request).
- **422 (no `country_code`) UX**: block before the user starts. The "Request
  time off" button on `/calendar` is disabled with the API's own message as a
  tooltip when the viewer has no `country_code`. The dialog never opens in
  that state.
- **US over-seeding (11 federal holidays, trim deferred)**: stays invisible
  in this UI. No flag, no note. Manu revisits the trim decision separately.

## 3. Architecture

No schema changes. No new tables. Five additive surfaces:

| Surface | New files |
|---|---|
| `/calendar` dialog + overlays | `src/app/calendar/_components/RequestTimeOffDialog.tsx`, `ApprovedTimeOffOverlay.tsx`, `HolidayOverlay.tsx` |
| `/calendar/requests` page | `src/app/calendar/requests/page.tsx`, `_components/RequestsList.tsx`, `_components/ApproverQueue.tsx` |
| Nav badge | edit `src/components/layout/top-nav.tsx` only |
| `/admin/holidays` page | `src/app/admin/holidays/page.tsx`, `_components/HolidayCountryTab.tsx` |
| Backend additions | `getDaysTakenByUser` in `src/lib/time-off/queries.ts`; new `GET /api/time-off/days-taken` route; `GET /api/time-off` response reshaped to include live `countryCode`; one-line error-string fix in `src/app/api/holidays/route.ts` |

`CalendarView.tsx` (already 537 lines) is not modified beyond the minimal
prop wiring needed to render the two new overlays inside it — no new logic
is added to that file, matching §4.4's instruction to keep new pieces in
sibling files.

### 3.1 Pre-existing bug fixed in passing

`GET`/`POST /api/holidays` validate correctly against all six country codes
(`isCountryCode` checks the full `VALID_COUNTRY_CODES`), but their error
*message* text is stale — `"country must be one of US, PK, ES"` and
`"countryCode must be one of US, PK, ES"` — left over from before the
PT/PH/FI expansion (`59f0e1cf`). Since `/admin/holidays` will surface these
exact strings to admins, they're corrected to list all six codes as part of
this work. This is a one-line string change in a file already being read for
this feature, not a scope expansion.

## 4. Components

### 4.1 `/calendar` page

- **"Request time off" button**: disabled with a tooltip (the exact 422
  message) when the viewer's `country_code` is null. Enabled otherwise.
  `country_code` must be read live from the DB, not from the session/JWT —
  session data doesn't refresh until re-login, so a user whose profile an
  admin just fixed would keep seeing a stale disabled button (the same class
  of staleness already flagged elsewhere for `isSuperAdmin`). `country_code`
  is also needed to know which country's holidays to request for the
  overlay below, so it isn't optional plumbing either way. Source: `GET
  /api/time-off`'s response shape changes from a bare array to
  `{ requests: RequestRow[], countryCode: string | null }` — one extra
  cheap self-lookup (`users` by `session.user.id`, the same query the `POST`
  handler already does at `route.ts:127-131`), added because this route
  currently has zero callers and its shape is free to set for the first one.
- **`RequestTimeOffDialog`**: start date, end date, required free-text
  reason. Submits `POST /api/time-off`. Renders the 409 (overlap, with the
  conflicting date range from the response body) and 400 (bad dates / empty
  reason) errors inline. On success, closes and invalidates the calendar and
  requests-list queries.
- **`ApprovedTimeOffOverlay`**: renders `getApprovedInRange` rows — name and
  "Time off" only, never the reason (D8; the query itself omits `reason`, so
  there is no reason data in this component even transiently).
- **`HolidayOverlay`**: the viewer's own country's public holidays for the
  visible month range, via the existing `GET /api/holidays?country=&year=`.
  A user with no `country_code` sees no holiday rows — existing, correct
  `getHolidayDates` behavior, nothing new required.
- The 48 legacy `calendar_events` `holiday` rows keep rendering unchanged;
  only their display label changes to **Observance** (D12 — no schema/row
  change, a label-string change only).

### 4.2 `/calendar/requests` page

- **Everyone** (any role that can submit time off) sees their own requests
  via `GET /api/time-off` (already branches: non-admin gets `getMyRequests`;
  its response is reshaped per §4.1 to `{ requests, countryCode }`, but only
  `requests` is used on this page). Above the list: "You've taken N days
  this year," from the new `getDaysTakenByUser`.
- **Jake** additionally sees the pending queue (`getPendingRequests`) with
  approve/deny actions, a note field, the requester's reason, and a
  per-person days-taken breakdown table for the year.
- **Other admins** see all requests read-only (existing `getAllRequests`,
  which already includes reasons for the admin branch) — no approve/deny
  controls, no aggregated breakdown table.

### 4.3 Days-taken: query and route

- **`getDaysTakenByUser(userId, year)`** in `queries.ts`: sums `workingDays`
  over that user's `approved` requests. **A request is bucketed by its
  `startDate`'s year, not split across a year boundary** — `workingDays` is
  already a frozen single number per request (not a per-day ledger), so a
  request spanning New Year's would count entirely toward the year its start
  date falls in. This is a deliberate simplification consistent with "raw
  count, not a balance."
- **`GET /api/time-off/days-taken?year=2026`**: follows the exact
  `pending-count` route pattern (session → `canSubmitTimeOff` gate → role
  check). Returns `{ year, ownDays }` for every caller; adds
  `breakdown: [{ userId, userName, days }]` only when
  `isApprover(session.user.email)` is true.

### 4.4 Nav badge

`top-nav.tsx` already has the pattern to copy: the existing pending-users
badge query (`/api/admin/pending-users`, ~line 131). A matching query hits
`/api/time-off/pending-count`; the Calendar nav item's badge is shown only
when `isApprover(session.user.email)` client-side (mirroring how other items
gate on `isAdmin`/`isSuperAdmin`). The route already returns `{count: 0}` for
non-Jake callers as defense-in-depth, so a client-side gating mistake cannot
leak the number to anyone else.

### 4.5 `/admin/holidays` page

- New nav entry, `visible: isAdmin`.
- Country tabs: US, PK, ES, PT, PH, FI. Each tab has a 2026/2027 year toggle
  (the two years actually seeded).
- Each tab+year shows a table (date, name, delete button) of that
  country/year's holidays, plus an add-row form pre-filled with the active
  tab's country (date picker, name text) that calls `POST /api/holidays`.
- Delete asks for confirmation, then calls `DELETE /api/holidays/[id]`.
- The 409 (duplicate country+date) and 400 (bad date/name) errors render
  inline on the add form.
- Component structure mirrors `src/app/admin/hour-categories/page.tsx`
  (same table/mutation/toast pattern) rather than inventing a new one — the
  two pages are structurally the same kind of admin reference-table CRUD.

## 5. Data flow

```
Viewer opens /calendar
  → GET /api/time-off → { requests, countryCode }   (live countryCode, not session/JWT)
  → GET /api/holidays?country=<countryCode>&year=<visible>   (holiday overlay, skipped if countryCode is null)
  → button disabled if countryCode is null

Viewer submits    → POST /api/time-off → 201 | 400 | 409 | 422
Jake decides      → PATCH /api/time-off/[id] → 200 | 403 | 409
Any admin manages → POST/DELETE /api/holidays → 201/200 | 400 | 403 | 409
Any caller checks → GET /api/time-off/days-taken?year= → { ownDays, breakdown? }
```

No new write paths beyond what already exists; this design only adds read
surfaces (`days-taken`) and UI over existing writes.

## 6. Error handling

No new error *behavior*. Every path in this design routes through existing,
already-implemented and already-tested server logic:

| Condition | Response | Where |
|---|---|---|
| No `country_code` | 422 | existing, `POST /api/time-off` — now also pre-empted client-side by the disabled button |
| Overlaps own pending/approved request | 409 + conflict dates | existing |
| Bad dates / empty reason | 400 | existing |
| Non-Jake calls `PATCH` | 403 | existing |
| Duplicate holiday (country+date) | 409 | existing |
| Bad holiday date/name/country | 400 | existing (error string fixed, see §3.1) |
| Unauthenticated / role can't submit time off | 401 / 403 | existing, reused by the new `days-taken` route |

The only backend addition, `days-taken`, is read-only and cannot fail beyond
the standard DB-down 500 every other route already handles the same way.

## 7. Testing

Following this branch's existing convention — pure logic and role-branching
routes get dedicated tests; UI components with real conditional logic get
component tests (e.g. `user-timeoff-cell.test.tsx` already covers this
feature's admin UI):

- `src/app/api/time-off/days-taken/route.test.ts` — own-days shape for a
  regular user, `breakdown` present only for Jake's email, 401/403 cases.
  Mirrors `src/app/api/time-off/route.test.ts`'s mocking style. The
  year-bucketing rule (§4.3) is exercised here rather than in a separate
  `queries.test.ts`, matching that no such file exists for any other query
  function today.
- `src/app/api/time-off/route.test.ts` gains its first `GET` test cases
  (only `POST` is currently tested in that file) — the reshaped
  `{ requests, countryCode }` response, both role branches, and a null
  `countryCode` case.
- Component test for the disabled-button/tooltip state on `/calendar`
  (has vs. lacks `country_code`).
- Component test for `/calendar/requests`' three-way role rendering (own
  list / Jake's queue / other-admin read-only).
- `/admin/holidays` gets lighter coverage — add-row happy path and the 409
  duplicate case — matching that `hour-categories`, the page it mirrors, has
  no dedicated test file either.

## 8. Explicitly out of scope

Everything already out of scope per the original spec §8 still holds
(entitlements/accrual/carryover, leave-type taxonomy, half-days, approver
delegation, `calendar_events` schema/row changes, Spanish regional holidays,
Google Calendar/Asana sync). Additionally out of scope for this round:

- Any UI surfacing of the deferred US-holiday trim decision (§2).
- Editing a holiday in place — the API only supports add/delete, so
  "editing" in the UI is delete-then-re-add, not a form-based edit action.
- Any change to `hour-categories` or other unrelated admin pages beyond
  using them as a structural reference.

## 9. Open questions

None — all four items queued from session 8 are resolved in §2.
