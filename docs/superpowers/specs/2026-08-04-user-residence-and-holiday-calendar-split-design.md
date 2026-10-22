# Design — split `users.country_code` into residence timezone + holiday calendar

**Date:** 2026-08-04
**Thread:** E (team calendar time-off + public holidays)
**Branch:** `feat/team-calendar-time-off` (worktree `.worktrees/team-calendar-time-off`)
**Base HEAD at design time:** `2427bffd`
**Supersedes:** the locked decision "`country_code` OPTIONAL on `users` with US/PK/ES seeded" (spec §2, D6). No other locked decision is reopened.

---

## 1. Problem

One column, `users.country_code`, currently drives two unrelated things:

- **The day boundary.** `todayInCountry()` in `src/lib/time-off/guards.ts` decides whether a
  request is retroactive and whether an approved request is still cancellable. This depends on
  where the person physically is.
- **The deduction.** `getHolidayDates()` in `src/lib/time-off/queries.ts` decides which dates
  `countWorkingDays()` skips. This depends on which calendar of days off they observe.

Overloading one field on two axes causes a real, present defect: the one-zone-per-country map
(`US → America/New_York`) cannot serve both a New Yorker and a Californian. A Pacific-coast
user's "tomorrow" currently begins at 21:00 their own time, so an approved request stops being
cancellable roughly three hours before their real midnight.

### Verified code footprint

Exactly **two** call sites read `users.country_code`, and they happen to be one per axis:

| File | Line | Axis |
|---|---|---|
| `src/app/api/time-off/route.ts` | 128–135 | deduction (`getHolidayDates`) |
| `src/app/api/time-off/[id]/route.ts` | 150–155 | day boundary (`todayInCountry`) |

## 2. Decisions

All decisions below were ruled on by Manu. Do not re-litigate them.

| # | Decision |
|---|---|
| D-A | The holiday calendar is **admin-set**, not user-chosen. Every seeded holiday is a day *not* deducted, so a free choice would let each person set their own effective leave allowance. |
| D-B | Residence is stored as an **IANA timezone string** (`America/Los_Angeles`, `Asia/Karachi`), not a country code. Handles any country and any US coast with no lookup map to extend. |
| D-C | A submission by someone with **no holiday calendar is refused**, not silently computed against an empty holiday set. |
| D-D | Migration 0088 **reuses `country_code`** as the holiday-calendar key and adds only one new column. No dead column is left behind. |
| D-E | Both fields are set through an **admin UI** on the existing `/admin/users` page, not by a script. |
| D-F | The **whole** `PUT /api/admin/users` is audited, all fields — not only the calendar change. |
| D-G | The holiday calendar is a **policy assignment, not geography**: "which set of days off this person gets." A Manila-based person working US hours may be assigned the US calendar. The value set stays `US`/`PK`/`ES`. |

### Rationale for D-D

`country_code` is not badly named — it was badly *overloaded*. The comment already above it in
`schema.ts:113-115` reads *"'US' | 'PK' | 'ES' | null. Null means no country-specific public
holidays apply to this user's time-off day counts (spec D6)"* — purely holiday-framed, never
mentioning timezones. The day-boundary job was the interloper. Removing that job makes the name
*more* accurate. Reuse is safe because the column is **100% NULL** (0 of 81 rows), so no data's
meaning changes. It also keeps `constants.ts`, `scripts/seed-public-holidays.ts`, the holidays API,
and the `public_holidays` join completely unchanged.

## 3. Data model

### Migration 0088

```sql
ALTER TABLE users ADD COLUMN residence_timezone text;
```

`country_code` is untouched: `char(2)`, nullable, values `US | PK | ES` matching
`public_holidays.country_code`. Its schema comment is rewritten to state that it is the
**holiday calendar** and that it is a **policy assignment, not geography** (per D-G), so a future
reader does not "fix" a Manila-based person onto a PH calendar that has never been seeded.

`residence_timezone`: nullable `text`, an IANA zone string.

No CHECK constraint on either column, consistent with the locked M1 rejection — guards live at the
API boundary plus a runtime check in any script that writes them.

### Nullability is deliberately asymmetric

| Column | NULL means | Consequence |
|---|---|---|
| `residence_timezone` | fall back to UTC | **Soft.** A day boundary a few hours off. Self-corrects the instant it is set. Writes no permanent data. |
| `country_code` | no calendar assigned | **Hard.** Submission refused (D-C). Never writes a wrong frozen `working_days` integer. |

This asymmetry is the core of the design. `working_days` is a frozen snapshot that is never
recomputed, so a missing calendar is not a recoverable state — it is a permanently wrong number.
A missing timezone is recoverable.

### Applying 0088

`scripts/_apply-0088.ts`, copying the guard pattern committed at `2427bffd` verbatim:

- `SET LOCAL lock_timeout = '3s'` prepended to the batch
- 6 × 4s retry on SQLSTATE `55P03` (lock_not_available) and `57014` (query_canceled)
- `pgError()` unwrapping `e.cause` — drizzle wraps driver errors, so the SQLSTATE is at
  `e.cause.code`, **not** `e.code`
- an error printer that does not echo the whole migration

Pre-flight `pg_locks` with `scripts/_diag2.ts` and run into a window with no lock holders. Ignore
that script's naive "PARTIAL STATE — DO NOT RERUN" verdict line; it is meaningless post-0087.

The migration is a single statement, so `ACCESS EXCLUSIVE` on `users` is held for microseconds
*once acquired*. The entire risk is the wait, which the 3-second `lock_timeout` caps. Never raise
`statement_timeout` to "fix" a lock wait — that lengthens the production stall.

`DATABASE_URL` points at the Supavisor transaction pooler (port 6543), which is the wrong endpoint
for DDL. Ask Manu for the direct connection string (Supabase dashboard → Project Settings →
Database → Direct connection) and add it as a separate env var before applying.

Thread C must be told it loses 0088 as well as 0087.

## 4. Code changes

### 4.1 `src/lib/db/schema.ts`

Add `residenceTimezone: text("residence_timezone")` to the `users` table. Rewrite the
`country_code` comment per §3.

### 4.2 `src/lib/time-off/guards.ts`

`todayInCountry(country: string | null, now: Date)` becomes
**`todayInZone(timeZone: string | null, now: Date)`**.

The `COUNTRY_TIME_ZONES` map and the `isCountryCode` / `CountryCode` imports leave this file
entirely — that is the point of D-B.

**A stored zone must be validated before use.** Verified on Node v24.13.1:
`new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angles" })` throws
`RangeError: Invalid time zone specified`. Today's code is only accidentally safe because it looks
up from a typed map; passing a raw database string through would 500 the cancel route. On a NULL or
unrecognised zone, `todayInZone` falls back to `"UTC"` and never throws — one person's typo must not
break the cancel button for everyone.

The existing throw on a missing `formatToParts` part **stays**. That is a genuine internal-invariant
failure, a different class from bad stored input.

### 4.3 `src/lib/time-off/queries.ts`, `working-days.ts`, `constants.ts`

**No changes.** `getHolidayDates()` already takes a plain string, and because `country_code` is
reused, its calling code is unchanged too.

### 4.4 `src/app/api/time-off/[id]/route.ts` (~150–155)

Select `residenceTimezone` instead of `countryCode`; call `todayInZone`.

### 4.5 `src/app/api/time-off/route.ts` (POST, ~128–135)

Between the existing conflict check and the day count, refuse when the submitter has no calendar:

- No `country_code`, **or no `users` row at all** (today's silent `?? null`) → **HTTP 422** with
  a message naming the fix: *"Your holiday calendar isn't set. Ask an admin to set it on your
  profile before booking time off."*
- 422 rather than 409 or 400: the body is well-formed and it is the account state that blocks
  processing. The route already uses 409 for overlaps and 400 for bad input, so 422 stays
  distinguishable for the UI.

**Only POST is gated.** PATCH (approve/deny) and DELETE (cancel) stay ungated — otherwise an admin
clearing someone's calendar would strand their existing requests in an unapprovable,
uncancellable state.

### 4.6 `src/app/api/admin/users/route.ts` (PUT)

Two optional fields added to the existing `updates` partial-update pattern:

- `countryCode` — accepted if `isCountryCode()` passes, or explicit `null` to clear. Else 400.
- `residenceTimezone` — accepted if a `DateTimeFormat` construction with that zone succeeds, or
  explicit `null` to clear. Else 400.

**The timezone validator must be try/catch, not list membership.** Verified on Node v24.13.1:
`Intl.supportedValuesOf("timeZone")` returns 418 *canonical* zones and **excludes** `UTC`,
`Etc/UTC`, `Europe/Kyiv`, and `Asia/Kolkata` — all four of which `DateTimeFormat` accepts. A
membership check would reject three legitimate values including the UTC fallback itself, and would
reject `Europe/Kyiv` for a Ukraine-based team member. A try/catch accepts exactly what the runtime
accepts and never drifts as ICU updates.

### 4.7 Audit log (D-F)

One `logAdminEvent` call at the end of a successful `PUT`, using the existing
`src/lib/event-logger.ts` helper and `admin_event_log` table:

- `section: "admin"`, `action: "user:update"`, `status: "success"`
- `resourceType: "user"`, `resourceId: userId`, `resourceLabel`: the target's email
- `detail`: only the field names that changed, with their new values

This covers `role`, `allowedSections`, `isSuperAdmin`, `clientIdCode`, `name`, `asanaEmail` and the
two new fields. That handler writes **no** audit log today, so role and super-admin grants are
currently untracked; auditing only the calendar change would have been theatre.

### 4.8 `src/app/admin/users/page.tsx`

Two controls added (purely additive; no existing control changes):

- holiday calendar `<select>`: US / PK / ES / "— none —"
- timezone `<select>` populated from `Intl.supportedValuesOf("timeZone")`

The dropdown's canonical list contains `Europe/Kiev`, functionally identical to `Europe/Kyiv`
(same zone, deprecated alias), so there is no functional gap; the permissive API of §4.6 still
accepts either if set by script.

## 5. Rollout order — the ordering gate

`working_days` is an integer snapshot computed at submission and never recomputed. Therefore:

1. Apply 0088.
2. Manu sets **both** fields for the 14 MF staff in the admin UI.
3. Seed the **corrected** holiday list (blocked on the open data question in §7).
4. Only then ship any submit UI.

D-C is what makes step 2 self-enforcing rather than a thing someone has to remember: a person with
no calendar simply cannot submit.

Changing someone's calendar later never recomputes past requests. That is correct and deliberate
(snapshot semantics are locked), and it does mean an admin can change the deduction basis for
future requests — which is why D-F audits it.

## 6. Testing

- `src/lib/time-off/guards.test.ts` is currently **32 tests** with 12 `todayInCountry` references;
  those re-key to zones. Expect **+3**:
  1. an unrecognised zone falls back to UTC without throwing
  2. a Pacific-vs-Eastern boundary case the old one-zone-per-country map provably could not express
  3. the NULL case
- Scoped run `node_modules/.bin/vitest run src/lib/time-off/ src/lib/email.test.ts`:
  **72 → ~75**. Predict the exact count before running it.
- vitest does not typecheck. Always follow with `node_modules/.bin/tsc --noEmit`, unfiltered,
  judged **by filename**. Baseline in this worktree is exactly **one** pre-existing error
  (`scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46` TS2349).
- Route-level tests for the 422 refusal and for both new PUT validators are **requirements for the
  plan**, not built by this design. Every authorization claim in every review of this branch so far
  is a code-reading result; nothing has been executed.

## 7. Out of scope

- The four data questions Manu still owes: residences of the 14; **which days MarketFoundry
  actually does not work, per country** (the seeded US list is the federal list and over-credits;
  the ES list is national-only and under-credits ~4 days/yr); the Pakistan lunar dates and whether
  Ashura needs a second row; the `#F8BF1D` vs `#FAC800` email palette question.
- Running `scripts/seed-public-holidays.ts`. Blocked until the above is answered.
- The Tasks 8–9 calendar UI.
- The hardcoded Sat/Sun weekend in `countWorkingDays`. It is correct for US, PK and ES and would
  only break on a Gulf hire (Fri/Sat weekend). Recorded as a known limit; not built.
- The admin user-deletion 500 (tracked, not fixed — `timeEntries.userId` is notNull with NO ACTION
  over ~15,300 rows, so it already 500s on `main` today).

## 8. Constraints carried in

- Additive only: no column drops, renames or row deletions. `calendar_events` gets zero changes.
- Per-action OK from Manu for every DB write and every schema change.
- Never `next build`.
- Never `npm run db:generate` on this branch — 0084–0086 are absent and `_journal.json` is stale at
  `0004`, so it emits huge drift. The house pattern is one bespoke `scripts/_apply-00NN.ts`.
- Never `git add .` — explicit pathspec on add **and** commit, `-m` before `--`, one task per
  commit. Keep `graphify-out/*`, `.claude/*`, `.superpowers/*`, `redshift-client-exports/*` out.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Dates are `YYYY-MM-DD` strings across module boundaries, never `Date` objects.
- The SQL↔Drizzle divergence is exactly one deliberate item: `time_off_no_overlap_per_user` exists
  in SQL only, because drizzle-orm 0.45 has no exclusion-constraint primitive. Do not let a
  reviewer "fix" it as drift.
