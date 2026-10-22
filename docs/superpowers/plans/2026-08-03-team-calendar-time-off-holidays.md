# Team Calendar — Time Off & Public Holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a request→approve time-off workflow and a country-scoped public-holiday calendar to the existing `/calendar` section.

**Architecture:** Two new tables (`time_off_requests`, `public_holidays`) plus a nullable `users.country_code`. `calendar_events` is not modified — its 48 existing `holiday` rows are relabelled *observances* in the UI. All day-count arithmetic lives in one pure, fully-tested module; every I/O boundary stays thin.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + PostgreSQL (Supabase), NextAuth v5, Vitest, Resend (via `src/lib/email.ts`), Tailwind 4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-03-team-calendar-pto-holidays-design.md` (committed `93d73475`). Read its §2 locked-decisions table before starting. Do not re-litigate D1–D12.

## Global Constraints

- **Branch:** create `feat/team-calendar-time-off` off `main` before Task 1. Do NOT work on `feat/redshift-archival-phase-0` (that is unrelated Thread C work; only the spec doc landed there).
- **Additive only.** No column drops, no renames, no row deletions. `calendar_events` gets zero schema changes and zero row changes (spec D12).
- **Next migration number is `0087`.** `0086_redshift_archive_runs.sql` is the latest and is already applied to production.
- **Every DB write against production needs Manu's explicit per-action approval.** DEV DB *is* PROD Supabase. Never run a migration or seed script without asking.
- **Tests:** `node_modules/.bin/vitest run <path>`. Vitest does NOT typecheck — always follow with `node_modules/.bin/tsc --noEmit` (~2 min, run in background) before claiming a task is done.
- **NEVER run `npm run build`** or `next build`.
- **tsc baseline is dev-server-dependent and drifts (2–4 errors).** Run tsc UNFILTERED (`node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"`) and identify every error BY FILENAME, confirming none sit in files you changed. A count alone proves nothing.
- **Lint:** repo-wide `npm run lint` exits 1 from pre-existing errors. Scope eslint to touched paths only.
- **Git:** NEVER `git add .`. Explicit pathspec on both add and commit. `git commit -m "msg" -- <pathspec>` (`-m` BEFORE `--`). One task per commit. Keep `graphify-out/*`, `.claude/*`, `.superpowers/*`, `redshift-client-exports/*` out of every commit.
- **Commit trailer, every commit:** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Approver constant:** Jake is the sole permanent approver. His email lives in exactly one place — `TIME_OFF_APPROVER_EMAIL` in `src/lib/constants.ts`. Never hardcode it elsewhere.
- **Valid `country_code` values:** exactly `'US'`, `'PK'`, `'ES'`, or `NULL`. Reject anything else at the API boundary.
- **Date format:** `YYYY-MM-DD` strings everywhere, matching the existing `calendar_events` convention. Never pass `Date` objects across module boundaries.
- **Roles:** "team member" = `role` of `admin` or `editor`. `client`, `viewer` and `pending` get 403 on every time-off route.
- **Reason text is admin-only** (spec D8). The shared calendar shows the member's name and "Time off" — never the reason.
- **Email failure must never fail a request.** `sendEmail` returns `false` rather than throwing; log and continue.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/time-off/working-days.ts` | **Pure.** Date-string arithmetic: working-day counting, range overlap. No DB, no `Date.now()`. |
| `src/lib/time-off/working-days.test.ts` | Unit tests for the above — the only genuinely tricky logic in the feature. |
| `src/lib/db/schema.ts` (modify) | Drizzle definitions for the two new tables + `users.country_code`. |
| `drizzle/migrations/0087_team_calendar_time_off.sql` | The migration. |
| `src/lib/time-off/queries.ts` | All database reads for the feature. Thin — no logic. |
| `src/lib/email.ts` (modify) | Two new builders + a local `escapeHtml`. |
| `src/lib/email.test.ts` | Tests proving the new builders escape HTML. |
| `src/lib/constants.ts` (modify) | `TIME_OFF_APPROVER_EMAIL`, `VALID_COUNTRY_CODES`. |
| `src/app/api/time-off/route.ts` | `GET` list, `POST` create. |
| `src/app/api/time-off/[id]/route.ts` | `PATCH` decide, `DELETE` cancel. |
| `src/app/api/time-off/pending-count/route.ts` | `GET` badge count (Jake only). |
| `src/app/api/holidays/route.ts` | `GET` list, `POST` create (admin). |
| `src/app/api/holidays/[id]/route.ts` | `DELETE` (admin). |
| `scripts/seed-public-holidays.ts` | Idempotent USA/PK/ES seed for 2026–2027. |
| `src/app/calendar/_components/RequestTimeOffDialog.tsx` | The submission form. |
| `src/app/calendar/requests/page.tsx` | My requests + Jake's review queue. |
| `src/app/calendar/requests/_components/RequestsTable.tsx` | Table + approve/deny actions. |
| `src/app/calendar/page.tsx` (modify) | Fetch approved time off + holidays alongside events. |
| `src/app/calendar/_components/CalendarView.tsx` (modify) | Accept and render the two new overlays. |
| `src/app/calendar/_components/types.ts` (modify) | Types for the overlays; relabel `holiday` → "Observance". |
| `src/components/layout/top-nav.tsx` (modify) | Pending-count badge on the Calendar item. |

`CalendarView.tsx` is already 537 lines. New UI goes in sibling files, not into it.

---

## Task 1: Pure working-days module

**Files:**
- Create: `src/lib/time-off/working-days.ts`
- Test: `src/lib/time-off/working-days.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `countWorkingDays(startDate: string, endDate: string, holidays: Set<string>): number`
  - `overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean`
  - `assertDateString(value: unknown, label: string): asserts value is string`
  - `isDateString(value: unknown): value is string`

- [ ] **Step 1: Create the branch**

```bash
git fetch origin && git switch -c feat/team-calendar-time-off origin/main
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/time-off/working-days.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  countWorkingDays,
  overlaps,
  isDateString,
  assertDateString,
} from "./working-days";

const NO_HOLIDAYS = new Set<string>();

describe("countWorkingDays", () => {
  it("counts a single weekday as 1", () => {
    // 2026-08-03 is a Monday
    expect(countWorkingDays("2026-08-03", "2026-08-03", NO_HOLIDAYS)).toBe(1);
  });

  it("counts a single Saturday as 0", () => {
    // 2026-08-01 is a Saturday
    expect(countWorkingDays("2026-08-01", "2026-08-01", NO_HOLIDAYS)).toBe(0);
  });

  it("counts a single Sunday as 0", () => {
    // 2026-08-02 is a Sunday
    expect(countWorkingDays("2026-08-02", "2026-08-02", NO_HOLIDAYS)).toBe(0);
  });

  it("counts Monday through Friday as 5", () => {
    expect(countWorkingDays("2026-08-03", "2026-08-07", NO_HOLIDAYS)).toBe(5);
  });

  it("excludes the weekend from a Monday-to-Sunday range", () => {
    expect(countWorkingDays("2026-08-03", "2026-08-09", NO_HOLIDAYS)).toBe(5);
  });

  it("counts two full weeks as 10", () => {
    expect(countWorkingDays("2026-08-03", "2026-08-14", NO_HOLIDAYS)).toBe(10);
  });

  it("spans a month boundary", () => {
    // Mon 2026-08-31 .. Fri 2026-09-04
    expect(countWorkingDays("2026-08-31", "2026-09-04", NO_HOLIDAYS)).toBe(5);
  });

  it("spans a year boundary", () => {
    // Mon 2026-12-28 .. Fri 2027-01-01
    expect(countWorkingDays("2026-12-28", "2027-01-01", NO_HOLIDAYS)).toBe(5);
  });

  it("subtracts a holiday inside the range", () => {
    const holidays = new Set(["2026-08-05"]); // Wednesday
    expect(countWorkingDays("2026-08-03", "2026-08-07", holidays)).toBe(4);
  });

  it("does not double-subtract a holiday that falls on a Saturday", () => {
    const holidays = new Set(["2026-08-08"]); // Saturday
    expect(countWorkingDays("2026-08-03", "2026-08-09", holidays)).toBe(5);
  });

  it("returns 0 when the only day requested is a holiday", () => {
    const holidays = new Set(["2026-08-03"]);
    expect(countWorkingDays("2026-08-03", "2026-08-03", holidays)).toBe(0);
  });

  it("ignores holidays outside the range", () => {
    const holidays = new Set(["2026-09-01"]);
    expect(countWorkingDays("2026-08-03", "2026-08-07", holidays)).toBe(5);
  });

  it("throws when endDate precedes startDate", () => {
    expect(() => countWorkingDays("2026-08-07", "2026-08-03", NO_HOLIDAYS)).toThrow(
      /on or after/
    );
  });

  it("throws on a malformed date", () => {
    expect(() => countWorkingDays("03-08-2026", "2026-08-07", NO_HOLIDAYS)).toThrow(
      /YYYY-MM-DD/
    );
  });
});

describe("overlaps", () => {
  // Reference range: 2026-08-10 .. 2026-08-14
  const A_START = "2026-08-10";
  const A_END = "2026-08-14";

  it("is false when B ends strictly before A starts", () => {
    expect(overlaps(A_START, A_END, "2026-08-03", "2026-08-07")).toBe(false);
  });

  it("is true when B ends exactly on A's start", () => {
    expect(overlaps(A_START, A_END, "2026-08-03", "2026-08-10")).toBe(true);
  });

  it("is true on partial overlap at the front", () => {
    expect(overlaps(A_START, A_END, "2026-08-07", "2026-08-11")).toBe(true);
  });

  it("is true when B is contained in A", () => {
    expect(overlaps(A_START, A_END, "2026-08-11", "2026-08-12")).toBe(true);
  });

  it("is true when B contains A", () => {
    expect(overlaps(A_START, A_END, "2026-08-01", "2026-08-31")).toBe(true);
  });

  it("is true when B starts exactly on A's end", () => {
    expect(overlaps(A_START, A_END, "2026-08-14", "2026-08-20")).toBe(true);
  });

  it("is false when B starts strictly after A ends", () => {
    expect(overlaps(A_START, A_END, "2026-08-17", "2026-08-21")).toBe(false);
  });

  it("is true for two identical ranges", () => {
    expect(overlaps(A_START, A_END, A_START, A_END)).toBe(true);
  });
});

describe("isDateString", () => {
  it("accepts a well-formed date", () => {
    expect(isDateString("2026-08-03")).toBe(true);
  });

  it("rejects a non-string", () => {
    expect(isDateString(20260803)).toBe(false);
  });

  it("rejects the wrong shape", () => {
    expect(isDateString("2026-8-3")).toBe(false);
  });

  it("rejects a calendar-impossible date", () => {
    expect(isDateString("2026-02-30")).toBe(false);
  });
});

describe("assertDateString", () => {
  it("names the offending field in the error", () => {
    expect(() => assertDateString("nope", "startDate")).toThrow(/startDate/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
node_modules/.bin/vitest run src/lib/time-off/working-days.test.ts
```

Expected: FAIL — `Failed to resolve import "./working-days"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/time-off/working-days.ts`:

```ts
/**
 * Pure date arithmetic for the team time-off feature.
 *
 * Everything here operates on `YYYY-MM-DD` strings, matching the convention
 * already used by `calendar_events` and the existing calendar components.
 * There is deliberately no database access, no `Date.now()`, and no local
 * timezone involvement: all internal Date objects are constructed in UTC so
 * that a day never shifts under a server in a different zone.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a `YYYY-MM-DD` string naming a real calendar day. */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  // Round-trip guard: rejects 2026-02-30, 2026-13-01, etc.
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Throws a message naming `label` unless `value` is a valid date string. */
export function assertDateString(
  value: unknown,
  label: string
): asserts value is string {
  if (!isDateString(value)) {
    throw new Error(`${label} must be a valid date in YYYY-MM-DD format`);
  }
}

function toUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Inclusive count of working days between two dates.
 *
 * Excludes Saturdays, Sundays, and any date present in `holidays`. A holiday
 * landing on a weekend is already excluded by the weekend rule and is never
 * subtracted twice.
 *
 * `holidays` holds `YYYY-MM-DD` strings for ONE country — resolving which
 * country is the caller's job, so this function stays country-agnostic. Pass
 * an empty set for a user with no country assigned.
 */
export function countWorkingDays(
  startDate: string,
  endDate: string,
  holidays: Set<string>
): number {
  assertDateString(startDate, "startDate");
  assertDateString(endDate, "endDate");
  if (endDate < startDate) {
    throw new Error("endDate must be on or after startDate");
  }

  const last = toUtcDate(endDate);
  let cursor = toUtcDate(startDate);
  let count = 0;

  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const key = toKey(cursor);
    if (day !== 0 && day !== 6 && !holidays.has(key)) count++;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  return count;
}

/**
 * True when two inclusive date ranges share at least one day.
 *
 * Lexicographic comparison is valid here because `YYYY-MM-DD` sorts
 * identically to chronological order.
 */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  assertDateString(aStart, "aStart");
  assertDateString(aEnd, "aEnd");
  assertDateString(bStart, "bStart");
  assertDateString(bEnd, "bEnd");
  return aStart <= bEnd && bStart <= aEnd;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node_modules/.bin/vitest run src/lib/time-off/working-days.test.ts
```

Expected: PASS, 27 tests.

- [ ] **Step 6: Typecheck**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
```

Expected: only pre-existing errors. Confirm BY FILENAME that none are in `src/lib/time-off/`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/time-off/working-days.ts src/lib/time-off/working-days.test.ts
git commit -m "feat(time-off): add pure working-day and overlap helpers

Date-string arithmetic for the team time-off feature. Weekend and holiday
exclusion, with no double-subtraction when a holiday lands on a weekend.
UTC-only internally so a day never shifts under the server timezone.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/time-off/working-days.ts src/lib/time-off/working-days.test.ts
```

---

## Task 2: Schema and migration 0087

**Files:**
- Modify: `src/lib/db/schema.ts` (insert after the `calendarEvents` block, which ends ~line 3383; and add `countryCode` to `users`, ~line 90-112)
- Create: `drizzle/migrations/0087_team_calendar_time_off.sql`
- Modify: `src/lib/constants.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `timeOffRequests`, `publicHolidays` Drizzle tables; `timeOffStatusEnum`; types `TimeOffRequest`, `NewTimeOffRequest`, `PublicHoliday`, `NewPublicHoliday`; `users.countryCode`; constants `TIME_OFF_APPROVER_EMAIL`, `VALID_COUNTRY_CODES`, `CountryCode`.

- [ ] **Step 1: Add the status enum**

In `src/lib/db/schema.ts`, immediately after `calendarEventTypeEnum` (~line 86):

```ts
export const timeOffStatusEnum = pgEnum("time_off_status", [
  "pending",
  "approved",
  "denied",
  "cancelled",
]);
```

- [ ] **Step 2: Add `countryCode` to `users`**

In the `users` table definition, after `clientIdCode: text("client_id_code"),`:

```ts
    // 'US' | 'PK' | 'ES' | null. Null means no country-specific public
    // holidays apply to this user's time-off day counts (spec D6).
    countryCode: char("country_code", { length: 2 }),
```

Add `char` to the `drizzle-orm/pg-core` import list at the top of the file if it is not already imported.

- [ ] **Step 3: Add the two tables**

After the `calendarEvents` type exports (~line 3383):

```ts
// ─── Time Off Requests ───────────────────────────────────────────────
// One row per request. Jake (see TIME_OFF_APPROVER_EMAIL) is the sole
// approver. `workingDays` is a SNAPSHOT taken at submission: correcting a
// holiday date later must not silently rewrite an already-decided request,
// and it makes days-taken a cheap SUM. Whole days only — no half days.
export const timeOffRequests = pgTable(
  "time_off_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason").notNull(),
    status: timeOffStatusEnum("status").notNull().default("pending"),
    workingDays: integer("working_days").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_time_off_user_start").on(t.userId, t.startDate),
    index("idx_time_off_status").on(t.status),
    index("idx_time_off_range").on(t.startDate, t.endDate),
    check("time_off_dates_ordered", sql`${t.endDate} >= ${t.startDate}`),
  ]
);

export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type NewTimeOffRequest = typeof timeOffRequests.$inferInsert;

// ─── Public Holidays ─────────────────────────────────────────────────
// Country-scoped reference data and the ONLY source of truth for "is this
// a non-working day". Distinct from calendar_events rows of type
// 'holiday', which are observances (Valentine's, Halloween) kept for
// content planning and which never affect day counts (spec D12).
export const publicHolidays = pgTable(
  "public_holidays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    holidayDate: date("holiday_date").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("public_holidays_unique").on(t.countryCode, t.holidayDate),
    index("idx_public_holidays_date").on(t.holidayDate),
  ]
);

export type PublicHoliday = typeof publicHolidays.$inferSelect;
export type NewPublicHoliday = typeof publicHolidays.$inferInsert;
```

Ensure `char`, `integer`, `check`, `unique`, and `sql` are imported at the top of the file (`sql` comes from `drizzle-orm`, the rest from `drizzle-orm/pg-core`).

- [ ] **Step 4: Add the constants**

Append to `src/lib/constants.ts`:

```ts
/**
 * Sole approver of team time-off requests (spec D2 — permanent, no
 * delegation and no timeout escalation). Deliberately the single place this
 * email appears, so changing the approver is a one-line edit.
 */
export const TIME_OFF_APPROVER_EMAIL = "jake@marketfoundry.agency";

/** The only country codes the time-off system recognises (spec D6). */
export const VALID_COUNTRY_CODES = ["US", "PK", "ES"] as const;
export type CountryCode = (typeof VALID_COUNTRY_CODES)[number];

export function isCountryCode(value: unknown): value is CountryCode {
  return (
    typeof value === "string" &&
    (VALID_COUNTRY_CODES as readonly string[]).includes(value)
  );
}
```

- [ ] **Step 5: Write the migration**

Create `drizzle/migrations/0087_team_calendar_time_off.sql`:

```sql
CREATE TYPE "public"."time_off_status" AS ENUM('pending', 'approved', 'denied', 'cancelled');
--> statement-breakpoint
CREATE TABLE "time_off_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" "time_off_status" DEFAULT 'pending' NOT NULL,
	"working_days" integer NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "time_off_dates_ordered" CHECK ("time_off_requests"."end_date" >= "time_off_requests"."start_date")
);
--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" char(2) NOT NULL,
	"holiday_date" date NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_holidays_unique" UNIQUE("country_code","holiday_date")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country_code" char(2);
--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_time_off_user_start" ON "time_off_requests" USING btree ("user_id","start_date");
--> statement-breakpoint
CREATE INDEX "idx_time_off_status" ON "time_off_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_time_off_range" ON "time_off_requests" USING btree ("start_date","end_date");
--> statement-breakpoint
CREATE INDEX "idx_public_holidays_date" ON "public_holidays" USING btree ("holiday_date");
```

Optionally run `npm run db:generate` to cross-check that Drizzle produces equivalent SQL. If it emits unrelated drift from other schema work, discard its output and keep the hand-written file above.

- [ ] **Step 6: Typecheck**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
```

Expected: only pre-existing errors, none in `src/lib/db/schema.ts` or `src/lib/constants.ts`.

- [ ] **Step 7: STOP — ask Manu before applying the migration**

Do NOT run `npm run db:migrate`. DEV DB is PROD Supabase. Report that 0087 is written and ask for explicit approval to apply it. Record his answer before continuing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/lib/constants.ts drizzle/migrations/0087_team_calendar_time_off.sql
git commit -m "feat(time-off): add time_off_requests and public_holidays tables

Migration 0087, additive only: two new tables, one new enum, and a nullable
users.country_code. calendar_events is untouched.

working_days is an integer snapshot taken at submission so that correcting a
holiday date later cannot rewrite an already-decided request.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/db/schema.ts src/lib/constants.ts drizzle/migrations/0087_team_calendar_time_off.sql
```

---

## Task 3: Query module

**Files:**
- Create: `src/lib/time-off/queries.ts`

**Interfaces:**
- Consumes: Task 1 (`isDateString`), Task 2 (`timeOffRequests`, `publicHolidays`, `users.countryCode`, `isCountryCode`).
- Produces:
  - `getHolidayDates(countryCode: string | null, from: string, to: string): Promise<Set<string>>`
  - `getMyRequests(userId: string): Promise<RequestRow[]>`
  - `getPendingRequests(): Promise<RequestRow[]>`
  - `getAllRequests(): Promise<RequestRow[]>`
  - `getApprovedInRange(from: string, to: string): Promise<ApprovedRow[]>`
  - `getOwnActiveRequests(userId: string): Promise<{ id, startDate, endDate }[]>`
  - `getDaysTakenByUser(year: number): Promise<{ userId: string; days: number }[]>`
  - exported types `RequestRow`, `ApprovedRow`

- [ ] **Step 1: Write the module**

Create `src/lib/time-off/queries.ts`:

```ts
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { publicHolidays, timeOffRequests, users } from "@/lib/db/schema";

/** A request joined to its requester, for list and queue views. */
export interface RequestRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  workingDays: number;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

/** An approved request as rendered on the shared calendar — NO reason (D8). */
export interface ApprovedRow {
  id: string;
  userId: string;
  userName: string | null;
  startDate: string;
  endDate: string;
}

/**
 * Public-holiday dates for one country within an inclusive range.
 *
 * Returns an EMPTY set when `countryCode` is null, which is the documented
 * behaviour for a user with no country assigned (spec D6): weekends are still
 * excluded from their day count, public holidays are not.
 */
export async function getHolidayDates(
  countryCode: string | null,
  from: string,
  to: string
): Promise<Set<string>> {
  if (!countryCode) return new Set<string>();

  const rows = await db
    .select({ holidayDate: publicHolidays.holidayDate })
    .from(publicHolidays)
    .where(
      and(
        eq(publicHolidays.countryCode, countryCode),
        gte(publicHolidays.holidayDate, from),
        lte(publicHolidays.holidayDate, to)
      )
    );

  return new Set(rows.map((r) => r.holidayDate));
}

const REQUEST_COLUMNS = {
  id: timeOffRequests.id,
  userId: timeOffRequests.userId,
  userName: users.name,
  userEmail: users.email,
  startDate: timeOffRequests.startDate,
  endDate: timeOffRequests.endDate,
  reason: timeOffRequests.reason,
  status: timeOffRequests.status,
  workingDays: timeOffRequests.workingDays,
  decidedAt: timeOffRequests.decidedAt,
  decisionNote: timeOffRequests.decisionNote,
  createdAt: timeOffRequests.createdAt,
} as const;

function toRequestRow(r: {
  decidedAt: Date | null;
  createdAt: Date;
  [k: string]: unknown;
}): RequestRow {
  return {
    ...(r as unknown as Omit<RequestRow, "decidedAt" | "createdAt">),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Every request belonging to one user, newest first, all statuses. */
export async function getMyRequests(userId: string): Promise<RequestRow[]> {
  const rows = await db
    .select(REQUEST_COLUMNS)
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(eq(timeOffRequests.userId, userId))
    .orderBy(desc(timeOffRequests.startDate));
  return rows.map(toRequestRow);
}

/** Jake's review queue: pending only, oldest first so nothing rots. */
export async function getPendingRequests(): Promise<RequestRow[]> {
  const rows = await db
    .select(REQUEST_COLUMNS)
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(eq(timeOffRequests.status, "pending"))
    .orderBy(asc(timeOffRequests.createdAt));
  return rows.map(toRequestRow);
}

/** Every request, newest first. Admin-only — includes reason text (D8). */
export async function getAllRequests(): Promise<RequestRow[]> {
  const rows = await db
    .select(REQUEST_COLUMNS)
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .orderBy(desc(timeOffRequests.startDate));
  return rows.map(toRequestRow);
}

/**
 * Approved requests overlapping an inclusive range, for calendar rendering.
 * Deliberately omits `reason` — the shared calendar must never show it (D8).
 */
export async function getApprovedInRange(
  from: string,
  to: string
): Promise<ApprovedRow[]> {
  return db
    .select({
      id: timeOffRequests.id,
      userId: timeOffRequests.userId,
      userName: users.name,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
    })
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        lte(timeOffRequests.startDate, to),
        gte(timeOffRequests.endDate, from)
      )
    )
    .orderBy(asc(timeOffRequests.startDate));
}

/**
 * A user's pending and approved ranges — the set a new submission must not
 * overlap. Cancelled and denied requests are free to be superseded.
 */
export async function getOwnActiveRequests(
  userId: string
): Promise<{ id: string; startDate: string; endDate: string }[]> {
  return db
    .select({
      id: timeOffRequests.id,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
    })
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.userId, userId),
        inArray(timeOffRequests.status, ["pending", "approved"])
      )
    );
}

/**
 * Days taken per user in a calendar year, approved requests only.
 *
 * Attributed by `start_date`, so a request spanning New Year counts wholly
 * in the year it began. With no allowances to enforce (spec D4) this is a
 * reporting figure for Jake's judgement, not an accounting balance, and the
 * simpler attribution is the honest one.
 */
export async function getDaysTakenByUser(
  year: number
): Promise<{ userId: string; days: number }[]> {
  const rows = await db
    .select({
      userId: timeOffRequests.userId,
      days: sql<number>`coalesce(sum(${timeOffRequests.workingDays}), 0)::int`,
    })
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        gte(timeOffRequests.startDate, `${year}-01-01`),
        lte(timeOffRequests.startDate, `${year}-12-31`)
      )
    )
    .groupBy(timeOffRequests.userId);
  return rows;
}
```

- [ ] **Step 2: Typecheck**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
```

Expected: only pre-existing errors, none in `src/lib/time-off/queries.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/time-off/queries.ts
git commit -m "feat(time-off): add query module for requests and holidays

Thin read layer. getApprovedInRange deliberately omits reason text so the
shared calendar cannot leak it (spec D8). getHolidayDates returns an empty
set for a user with no country, per D6.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/time-off/queries.ts
```

---

## Task 4: Email builders with HTML escaping

**Files:**
- Modify: `src/lib/email.ts` (append)
- Create: `src/lib/email.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `escapeHtml(value: string): string`
  - `buildTimeOffRequestEmail(r: TimeOffEmailRequest): { subject: string; html: string }`
  - `buildTimeOffDecisionEmail(r: TimeOffEmailDecision): { subject: string; html: string }`
  - exported interfaces `TimeOffEmailRequest`, `TimeOffEmailDecision`

**Context:** the existing builders in this file interpolate user text into HTML unescaped. Do NOT copy that. Escape in the two new builders. Fixing the existing ones is out of scope.

- [ ] **Step 1: Write the failing test**

Create `src/lib/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  buildTimeOffRequestEmail,
  buildTimeOffDecisionEmail,
} from "./email";

describe("escapeHtml", () => {
  it("escapes all five dangerous characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Family trip to Madrid")).toBe("Family trip to Madrid");
  });

  it("escapes ampersands before angle brackets, not after", () => {
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });
});

describe("buildTimeOffRequestEmail", () => {
  const base = {
    requesterName: "Babar Ahmad",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    workingDays: 5,
    reason: "Family wedding",
  };

  it("names the requester in the subject", () => {
    expect(buildTimeOffRequestEmail(base).subject).toContain("Babar Ahmad");
  });

  it("includes the dates and the working-day count", () => {
    const { html } = buildTimeOffRequestEmail(base);
    expect(html).toContain("2026-08-10");
    expect(html).toContain("2026-08-14");
    expect(html).toContain("5");
  });

  it("escapes HTML in the reason", () => {
    const { html } = buildTimeOffRequestEmail({
      ...base,
      reason: `<script>alert('x')</script>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in the requester name", () => {
    const { html } = buildTimeOffRequestEmail({
      ...base,
      requesterName: "<img src=x onerror=1>",
    });
    expect(html).not.toContain("<img");
  });

  it("links to the review queue", () => {
    expect(buildTimeOffRequestEmail(base).html).toContain("/calendar/requests");
  });
});

describe("buildTimeOffDecisionEmail", () => {
  const base = {
    status: "approved" as const,
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    workingDays: 5,
    decisionNote: null,
  };

  it("says approved in the subject when approved", () => {
    expect(buildTimeOffDecisionEmail(base).subject).toMatch(/approved/i);
  });

  it("says denied in the subject when denied", () => {
    const email = buildTimeOffDecisionEmail({ ...base, status: "denied" });
    expect(email.subject).toMatch(/denied/i);
  });

  it("omits the note block when there is no note", () => {
    expect(buildTimeOffDecisionEmail(base).html).not.toContain("Note from");
  });

  it("includes and escapes the note when present", () => {
    const { html } = buildTimeOffDecisionEmail({
      ...base,
      decisionNote: "<b>enjoy</b>",
    });
    expect(html).toContain("Note from");
    expect(html).toContain("&lt;b&gt;enjoy&lt;/b&gt;");
    expect(html).not.toContain("<b>enjoy</b>");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node_modules/.bin/vitest run src/lib/email.test.ts
```

Expected: FAIL — `escapeHtml` is not exported.

- [ ] **Step 3: Append the implementation to `src/lib/email.ts`**

```ts
/**
 * Escape text for safe interpolation into an HTML email body.
 *
 * NOTE: the older builders in this file interpolate user text unescaped.
 * New builders must use this. Ampersand is replaced first so that the
 * entities introduced by later replacements are not double-escaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface TimeOffEmailRequest {
  requesterName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
}

export interface TimeOffEmailDecision {
  status: "approved" | "denied";
  startDate: string;
  endDate: string;
  workingDays: number;
  decisionNote: string | null;
}

const HUB_URL = "https://www.marketfoundryhub.com";

/** Sent to the approver when a team member submits a request. */
export function buildTimeOffRequestEmail(r: TimeOffEmailRequest) {
  const name = escapeHtml(r.requesterName);
  const reason = escapeHtml(r.reason);
  const dayLabel = r.workingDays === 1 ? "working day" : "working days";

  return {
    subject: `[MarketFoundry Hub] Time-off request from ${r.requesterName} — ${r.startDate} to ${r.endDate}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 20px; color: #F8BF1D;">Time-Off Request</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px 0; color: #999; width: 110px;">From</td><td style="padding: 6px 0; font-weight: 600;">${name}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Dates</td><td style="padding: 6px 0;">${r.startDate} &rarr; ${r.endDate}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Length</td><td style="padding: 6px 0;">${r.workingDays} ${dayLabel}</td></tr>
          </table>
          <div style="background: #252525; border-radius: 8px; padding: 16px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Reason</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${reason}</p>
          </div>
          <p style="margin: 20px 0 0; font-size: 13px;">
            <a href="${HUB_URL}/calendar/requests" style="color: #F8BF1D;">Review this request &rarr;</a>
          </p>
        </div>
      </div>
    `,
  };
}

/** Sent to the requester once the approver decides. */
export function buildTimeOffDecisionEmail(r: TimeOffEmailDecision) {
  const approved = r.status === "approved";
  const label = approved ? "Approved" : "Denied";
  const color = approved ? "#10b981" : "#ef4444";
  const dayLabel = r.workingDays === 1 ? "working day" : "working days";
  const noteBlock = r.decisionNote
    ? `<div style="background: #252525; border-radius: 8px; padding: 16px; margin-top: 12px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Note from Jake</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${escapeHtml(r.decisionNote)}</p>
          </div>`
    : "";

  return {
    subject: `[MarketFoundry Hub] Your time off was ${approved ? "approved" : "denied"} — ${r.startDate} to ${r.endDate}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 20px; color: #F8BF1D;">Time Off ${label}</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px 0; color: #999; width: 110px;">Outcome</td><td style="padding: 6px 0;"><span style="background: ${color}22; color: ${color}; padding: 3px 10px; border-radius: 6px; font-size: 13px; font-weight: 600;">${label}</span></td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Dates</td><td style="padding: 6px 0;">${r.startDate} &rarr; ${r.endDate}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Length</td><td style="padding: 6px 0;">${r.workingDays} ${dayLabel}</td></tr>
          </table>
          ${noteBlock}
          <p style="margin: 20px 0 0; font-size: 13px;">
            <a href="${HUB_URL}/calendar/requests" style="color: #F8BF1D;">View your requests &rarr;</a>
          </p>
        </div>
      </div>
    `,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node_modules/.bin/vitest run src/lib/email.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck, then commit**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat(time-off): add request and decision email builders

Two builders following the existing sendEmail/buildXEmail house pattern,
plus an escapeHtml helper. The pre-existing builders in this file
interpolate user text unescaped; these do not. Tests assert escaping of
both the reason and the decision note.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/email.ts src/lib/email.test.ts
```

---

## Task 5: Time-off API routes

**Files:**
- Create: `src/app/api/time-off/route.ts`
- Create: `src/app/api/time-off/[id]/route.ts`
- Create: `src/app/api/time-off/pending-count/route.ts`
- Create: `src/lib/time-off/guards.ts`
- Test: `src/lib/time-off/guards.test.ts`

**Interfaces:**
- Consumes: Task 1 (`countWorkingDays`, `overlaps`, `isDateString`), Task 2 (`timeOffRequests`, `TIME_OFF_APPROVER_EMAIL`), Task 3 (all queries), Task 4 (both builders).
- Produces:
  - `canSubmitTimeOff(role: string): boolean`
  - `isApprover(email: string | null | undefined): boolean`
  - `findConflict(newStart, newEnd, existing): { id, startDate, endDate } | null`
  - `canCancel(status, startDate, today): boolean`

Follow the existing house pattern for routes: `getAuthSession()` from `@/lib/auth-db`, `NextResponse.json`, guard clauses first. See `src/app/api/calendar/events/route.ts` for the shape.

- [ ] **Step 1: Write the failing guard test**

Create `src/lib/time-off/guards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canSubmitTimeOff, isApprover, findConflict, canCancel } from "./guards";

describe("canSubmitTimeOff", () => {
  it("allows admin", () => expect(canSubmitTimeOff("admin")).toBe(true));
  it("allows editor", () => expect(canSubmitTimeOff("editor")).toBe(true));
  it("rejects viewer", () => expect(canSubmitTimeOff("viewer")).toBe(false));
  it("rejects client", () => expect(canSubmitTimeOff("client")).toBe(false));
  it("rejects pending", () => expect(canSubmitTimeOff("pending")).toBe(false));
  it("rejects an unknown role", () => expect(canSubmitTimeOff("robot")).toBe(false));
});

describe("isApprover", () => {
  it("accepts Jake", () =>
    expect(isApprover("jake@marketfoundry.agency")).toBe(true));
  it("is case-insensitive", () =>
    expect(isApprover("Jake@MarketFoundry.Agency")).toBe(true));
  it("rejects another admin", () =>
    expect(isApprover("manu@marketfoundry.agency")).toBe(false));
  it("rejects null", () => expect(isApprover(null)).toBe(false));
  it("rejects undefined", () => expect(isApprover(undefined)).toBe(false));
});

describe("findConflict", () => {
  const existing = [
    { id: "a", startDate: "2026-08-10", endDate: "2026-08-14" },
    { id: "b", startDate: "2026-09-01", endDate: "2026-09-02" },
  ];

  it("returns null when nothing overlaps", () => {
    expect(findConflict("2026-08-17", "2026-08-21", existing)).toBeNull();
  });

  it("finds the overlapping row", () => {
    expect(findConflict("2026-08-12", "2026-08-18", existing)?.id).toBe("a");
  });

  it("treats a shared boundary day as a conflict", () => {
    expect(findConflict("2026-08-14", "2026-08-20", existing)?.id).toBe("a");
  });

  it("returns null against an empty list", () => {
    expect(findConflict("2026-08-12", "2026-08-18", [])).toBeNull();
  });
});

describe("canCancel", () => {
  const TODAY = "2026-08-03";

  it("allows cancelling a pending request", () => {
    expect(canCancel("pending", "2026-07-01", TODAY)).toBe(true);
  });

  it("allows cancelling an approved future request", () => {
    expect(canCancel("approved", "2026-08-10", TODAY)).toBe(true);
  });

  it("rejects cancelling an approved request already started", () => {
    expect(canCancel("approved", "2026-08-03", TODAY)).toBe(false);
  });

  it("rejects cancelling an approved past request", () => {
    expect(canCancel("approved", "2026-07-01", TODAY)).toBe(false);
  });

  it("rejects cancelling a denied request", () => {
    expect(canCancel("denied", "2026-09-01", TODAY)).toBe(false);
  });

  it("rejects cancelling an already-cancelled request", () => {
    expect(canCancel("cancelled", "2026-09-01", TODAY)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run src/lib/time-off/guards.test.ts
```

Expected: FAIL — cannot resolve `./guards`.

- [ ] **Step 3: Write `src/lib/time-off/guards.ts`**

```ts
import { TIME_OFF_APPROVER_EMAIL } from "@/lib/constants";
import { overlaps } from "./working-days";

/** Roles that may submit a time-off request. See spec §4.3. */
const SUBMITTER_ROLES = new Set(["admin", "editor"]);

/**
 * Only real team members book time off. `viewer`, `client` and `pending` are
 * rejected explicitly so that adding a read-only account later cannot
 * accidentally grant it the ability to book days off.
 */
export function canSubmitTimeOff(role: string): boolean {
  return SUBMITTER_ROLES.has(role);
}

/** True only for the single permanent approver (spec D2). */
export function isApprover(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === TIME_OFF_APPROVER_EMAIL.toLowerCase();
}

/**
 * The first of the user's own active requests that overlaps a proposed range,
 * or null. Callers pass only pending and approved rows — a denied or
 * cancelled request is free to be superseded.
 */
export function findConflict(
  newStart: string,
  newEnd: string,
  existing: { id: string; startDate: string; endDate: string }[]
): { id: string; startDate: string; endDate: string } | null {
  for (const row of existing) {
    if (overlaps(newStart, newEnd, row.startDate, row.endDate)) return row;
  }
  return null;
}

/**
 * Whether the owner may still cancel.
 *
 * Pending is always cancellable. Approved is cancellable only while the start
 * date is still in the future (spec D10) — once time off has begun, undoing it
 * is a conversation, not a button. Denied and cancelled are terminal.
 *
 * `today` is passed in rather than read from the clock so this stays pure.
 */
export function canCancel(
  status: string,
  startDate: string,
  today: string
): boolean {
  if (status === "pending") return true;
  if (status === "approved") return startDate > today;
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node_modules/.bin/vitest run src/lib/time-off/guards.test.ts
```

Expected: PASS, 21 tests.

- [ ] **Step 5: Write `src/app/api/time-off/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { timeOffRequests, users } from "@/lib/db/schema";
import { sendEmail, buildTimeOffRequestEmail } from "@/lib/email";
import { TIME_OFF_APPROVER_EMAIL } from "@/lib/constants";
import { countWorkingDays, isDateString } from "@/lib/time-off/working-days";
import { canSubmitTimeOff, findConflict } from "@/lib/time-off/guards";
import {
  getAllRequests,
  getHolidayDates,
  getMyRequests,
  getOwnActiveRequests,
} from "@/lib/time-off/queries";

export const dynamic = "force-dynamic";

// GET /api/time-off — own requests; admins get all (including reason).
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!canSubmitTimeOff(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows =
    role === "admin"
      ? await getAllRequests()
      : await getMyRequests(session.user.id);

  return NextResponse.json(rows);
}

// POST /api/time-off — create own request as `pending`.
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { startDate, endDate, reason } = body as {
    startDate?: unknown;
    endDate?: unknown;
    reason?: unknown;
  };

  if (!isDateString(startDate) || !isDateString(endDate)) {
    return NextResponse.json(
      { error: "startDate and endDate must be valid YYYY-MM-DD dates" },
      { status: 400 }
    );
  }
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "endDate must be on or after startDate" },
      { status: 400 }
    );
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  // Reject overlap with the requester's own pending/approved requests.
  const active = await getOwnActiveRequests(session.user.id);
  const conflict = findConflict(startDate, endDate, active);
  if (conflict) {
    return NextResponse.json(
      {
        error: "You already have a request covering those dates",
        conflict: { startDate: conflict.startDate, endDate: conflict.endDate },
      },
      { status: 409 }
    );
  }

  const [me] = await db
    .select({ name: users.name, countryCode: users.countryCode })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const holidays = await getHolidayDates(
    me?.countryCode ?? null,
    startDate,
    endDate
  );
  const workingDays = countWorkingDays(startDate, endDate, holidays);

  const [inserted] = await db
    .insert(timeOffRequests)
    .values({
      userId: session.user.id,
      startDate,
      endDate,
      reason: reason.trim(),
      status: "pending",
      workingDays,
    })
    .returning();

  // Notification is best-effort: a Resend outage must never block someone
  // from booking time off. The nav badge is the fallback path.
  const email = buildTimeOffRequestEmail({
    requesterName: me?.name || session.user.email || "A team member",
    startDate,
    endDate,
    workingDays,
    reason: reason.trim(),
  });
  const sent = await sendEmail({
    to: TIME_OFF_APPROVER_EMAIL,
    subject: email.subject,
    html: email.html,
  });
  if (!sent) {
    console.warn(
      `[time-off] approver email not sent for request ${inserted.id}`
    );
  }

  return NextResponse.json(inserted, { status: 201 });
}
```

- [ ] **Step 6: Write `src/app/api/time-off/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { timeOffRequests, users } from "@/lib/db/schema";
import { sendEmail, buildTimeOffDecisionEmail } from "@/lib/email";
import { canCancel, canSubmitTimeOff, isApprover } from "@/lib/time-off/guards";

export const dynamic = "force-dynamic";

/** Today in UTC as YYYY-MM-DD. Only the route reads the clock. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// PATCH /api/time-off/[id] — approve or deny. Jake only (spec D2).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isApprover(session.user.email)) {
    return NextResponse.json(
      { error: "Only the designated approver can decide time-off requests" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = (body as { status?: unknown } | null)?.status;
  const noteRaw = (body as { decisionNote?: unknown } | null)?.decisionNote;

  if (status !== "approved" && status !== "denied") {
    return NextResponse.json(
      { error: "status must be 'approved' or 'denied'" },
      { status: 400 }
    );
  }
  const decisionNote =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null;

  const [existing] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Guards double-clicks and stale links out of an old notification email.
  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: `Request is already ${existing.status}` },
      { status: 409 }
    );
  }

  const [updated] = await db
    .update(timeOffRequests)
    .set({
      status,
      decidedBy: session.user.id,
      decidedAt: new Date(),
      decisionNote,
      updatedAt: new Date(),
    })
    .where(
      and(eq(timeOffRequests.id, id), eq(timeOffRequests.status, "pending"))
    )
    .returning();

  // Lost the race to a concurrent decision.
  if (!updated) {
    return NextResponse.json(
      { error: "Request was decided by someone else" },
      { status: 409 }
    );
  }

  const [requester] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, updated.userId))
    .limit(1);

  if (requester?.email) {
    const email = buildTimeOffDecisionEmail({
      status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      workingDays: updated.workingDays,
      decisionNote,
    });
    const sent = await sendEmail({
      to: requester.email,
      subject: email.subject,
      html: email.html,
    });
    if (!sent) {
      console.warn(`[time-off] decision email not sent for request ${id}`);
    }
  }

  return NextResponse.json(updated);
}

// DELETE /api/time-off/[id] — owner cancels their own request.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only cancel your own requests" },
      { status: 403 }
    );
  }
  if (!canCancel(existing.status, existing.startDate, todayKey())) {
    return NextResponse.json(
      { error: `A ${existing.status} request starting ${existing.startDate} cannot be cancelled` },
      { status: 409 }
    );
  }

  const [updated] = await db
    .update(timeOffRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(timeOffRequests.id, id))
    .returning();

  return NextResponse.json(updated);
}
```

- [ ] **Step 7: Write `src/app/api/time-off/pending-count/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isApprover } from "@/lib/time-off/guards";
import { getPendingRequests } from "@/lib/time-off/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/time-off/pending-count — nav badge source.
 *
 * Jake-only: he is the only person who can act on a pending request
 * (spec D2), so a badge on any other admin's screen would be noise. Other
 * admins still see the full queue read-only at /calendar/requests.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isApprover(session.user.email)) {
    return NextResponse.json({ count: 0 });
  }

  const pending = await getPendingRequests();
  return NextResponse.json({ count: pending.length });
}
```

- [ ] **Step 8: Verify session shape**

Read `src/lib/auth-db.ts` and confirm `session.user` exposes `id`, `email` and `role`. If a field is named differently, adjust the three route files — do not change `auth-db.ts`.

- [ ] **Step 9: Test and typecheck**

```bash
node_modules/.bin/vitest run src/lib/time-off/
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
node_modules/.bin/eslint src/lib/time-off src/app/api/time-off
```

Expected: tests PASS; no tsc errors in the files you touched; eslint clean on those paths.

- [ ] **Step 10: Commit**

```bash
git add src/lib/time-off/guards.ts src/lib/time-off/guards.test.ts src/app/api/time-off
git commit -m "feat(time-off): add request, decide and cancel API routes

Pure guards (role gate, approver check, conflict finder, cancel window)
extracted and unit tested; routes stay thin. Deciding a non-pending request
returns 409, and the UPDATE is conditioned on status='pending' so a
concurrent decision cannot double-apply. Email failure is logged, never
fatal.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/time-off/guards.ts src/lib/time-off/guards.test.ts src/app/api/time-off
```

---

## Task 6: Holidays API routes

**Files:**
- Create: `src/app/api/holidays/route.ts`
- Create: `src/app/api/holidays/[id]/route.ts`

**Interfaces:**
- Consumes: Task 1 (`isDateString`), Task 2 (`publicHolidays`, `isCountryCode`).
- Produces: `GET /api/holidays?country=US&year=2026`, `POST /api/holidays`, `DELETE /api/holidays/[id]`.

- [ ] **Step 1: Write `src/app/api/holidays/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { publicHolidays } from "@/lib/db/schema";
import { isCountryCode } from "@/lib/constants";
import { isDateString } from "@/lib/time-off/working-days";
import { canSubmitTimeOff } from "@/lib/time-off/guards";

export const dynamic = "force-dynamic";

// GET /api/holidays?country=US&year=2026 — both filters optional.
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const country = req.nextUrl.searchParams.get("country");
  const yearRaw = req.nextUrl.searchParams.get("year");

  if (country !== null && !isCountryCode(country)) {
    return NextResponse.json(
      { error: "country must be one of US, PK, ES" },
      { status: 400 }
    );
  }

  const filters = [];
  if (country) filters.push(eq(publicHolidays.countryCode, country));
  if (yearRaw !== null) {
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "year is out of range" }, { status: 400 });
    }
    filters.push(gte(publicHolidays.holidayDate, `${year}-01-01`));
    filters.push(lte(publicHolidays.holidayDate, `${year}-12-31`));
  }

  const rows = await db
    .select()
    .from(publicHolidays)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(publicHolidays.holidayDate));

  return NextResponse.json(rows);
}

// POST /api/holidays — admin only (spec D11: any admin, not Jake-only).
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { countryCode, holidayDate, name } = body as {
    countryCode?: unknown;
    holidayDate?: unknown;
    name?: unknown;
  };

  if (!isCountryCode(countryCode)) {
    return NextResponse.json(
      { error: "countryCode must be one of US, PK, ES" },
      { status: 400 }
    );
  }
  if (!isDateString(holidayDate)) {
    return NextResponse.json(
      { error: "holidayDate must be a valid YYYY-MM-DD date" },
      { status: 400 }
    );
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const [inserted] = await db
      .insert(publicHolidays)
      .values({ countryCode, holidayDate, name: name.trim().slice(0, 120) })
      .returning();
    return NextResponse.json(inserted, { status: 201 });
  } catch {
    // Violates public_holidays_unique (country_code, holiday_date).
    return NextResponse.json(
      { error: "That country already has a holiday on that date" },
      { status: 409 }
    );
  }
}
```

- [ ] **Step 2: Write `src/app/api/holidays/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { publicHolidays } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// DELETE /api/holidays/[id] — admin only. Reference data, safe to remove.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [deleted] = await db
    .delete(publicHolidays)
    .where(eq(publicHolidays.id, id))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: deleted.id });
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
node_modules/.bin/eslint src/app/api/holidays
git add src/app/api/holidays
git commit -m "feat(time-off): add public holiday admin API

GET is readable by any team member (the calendar needs it); POST and DELETE
are admin-only per spec D11. Unique-constraint violations surface as 409
rather than a 500.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/api/holidays
```

---

## Task 7: Holiday seed script

**Files:**
- Create: `scripts/seed-public-holidays.ts`
- Modify: `package.json` (add `seed-holidays` script)

**Interfaces:**
- Consumes: Task 2 (`publicHolidays`).
- Produces: `npm run seed-holidays` — idempotent insert for US/PK/ES, 2026–2027.

- [ ] **Step 1: Read an existing script for the house pattern**

Read `scripts/seed-team.ts` (or `scripts/import-aac.ts` if that is absent) to match how scripts bootstrap the DB connection and load env.

- [ ] **Step 2: Write the script**

Create `scripts/seed-public-holidays.ts`. Use the connection bootstrap you just read; the data and insert logic are:

```ts
/**
 * Seed public_holidays for the three countries the team spans.
 *
 * Idempotent: relies on the (country_code, holiday_date) unique constraint
 * plus onConflictDoNothing, so re-running is safe and adds only what is new.
 *
 * ⚠ PAKISTAN — Eid al-Fitr and Eid al-Adha are lunar and shift roughly 11
 * days earlier each year. They CANNOT be derived from a rule, and the
 * government confirms exact dates only weeks in advance. The dates below are
 * best-known estimates and REQUIRE HUMAN REVIEW EVERY YEAR. Correct them via
 * the admin holiday UI when the official announcement lands.
 *
 * ⚠ SPAIN — national holidays only. Spain's autonomous communities and
 * municipalities add their own; Manu did not specify a region, so national-
 * only is the deliberate default (spec §4.6). Add regional days via the UI.
 */

interface SeedHoliday {
  countryCode: "US" | "PK" | "ES";
  holidayDate: string;
  name: string;
}

const HOLIDAYS: SeedHoliday[] = [
  // ── United States — federal holidays ──────────────────────────────
  { countryCode: "US", holidayDate: "2026-01-01", name: "New Year's Day" },
  { countryCode: "US", holidayDate: "2026-01-19", name: "Martin Luther King Jr. Day" },
  { countryCode: "US", holidayDate: "2026-02-16", name: "Presidents' Day" },
  { countryCode: "US", holidayDate: "2026-05-25", name: "Memorial Day" },
  { countryCode: "US", holidayDate: "2026-06-19", name: "Juneteenth" },
  { countryCode: "US", holidayDate: "2026-07-03", name: "Independence Day (observed)" },
  { countryCode: "US", holidayDate: "2026-09-07", name: "Labor Day" },
  { countryCode: "US", holidayDate: "2026-10-12", name: "Columbus Day" },
  { countryCode: "US", holidayDate: "2026-11-11", name: "Veterans Day" },
  { countryCode: "US", holidayDate: "2026-11-26", name: "Thanksgiving Day" },
  { countryCode: "US", holidayDate: "2026-12-25", name: "Christmas Day" },
  { countryCode: "US", holidayDate: "2027-01-01", name: "New Year's Day" },
  { countryCode: "US", holidayDate: "2027-01-18", name: "Martin Luther King Jr. Day" },
  { countryCode: "US", holidayDate: "2027-02-15", name: "Presidents' Day" },
  { countryCode: "US", holidayDate: "2027-05-31", name: "Memorial Day" },
  { countryCode: "US", holidayDate: "2027-06-18", name: "Juneteenth (observed)" },
  { countryCode: "US", holidayDate: "2027-07-05", name: "Independence Day (observed)" },
  { countryCode: "US", holidayDate: "2027-09-06", name: "Labor Day" },
  { countryCode: "US", holidayDate: "2027-10-11", name: "Columbus Day" },
  { countryCode: "US", holidayDate: "2027-11-11", name: "Veterans Day" },
  { countryCode: "US", holidayDate: "2027-11-25", name: "Thanksgiving Day" },
  { countryCode: "US", holidayDate: "2027-12-24", name: "Christmas Day (observed)" },

  // ── Pakistan — public holidays. Eid dates are ESTIMATES. ───────────
  { countryCode: "PK", holidayDate: "2026-02-05", name: "Kashmir Day" },
  { countryCode: "PK", holidayDate: "2026-03-19", name: "Eid al-Fitr (estimated)" },
  { countryCode: "PK", holidayDate: "2026-03-20", name: "Eid al-Fitr (estimated)" },
  { countryCode: "PK", holidayDate: "2026-03-23", name: "Pakistan Day" },
  { countryCode: "PK", holidayDate: "2026-05-01", name: "Labour Day" },
  { countryCode: "PK", holidayDate: "2026-05-27", name: "Eid al-Adha (estimated)" },
  { countryCode: "PK", holidayDate: "2026-05-28", name: "Eid al-Adha (estimated)" },
  { countryCode: "PK", holidayDate: "2026-06-26", name: "Ashura (estimated)" },
  { countryCode: "PK", holidayDate: "2026-08-14", name: "Independence Day" },
  { countryCode: "PK", holidayDate: "2026-08-26", name: "Eid Milad un-Nabi (estimated)" },
  { countryCode: "PK", holidayDate: "2026-11-09", name: "Iqbal Day" },
  { countryCode: "PK", holidayDate: "2026-12-25", name: "Quaid-e-Azam Day / Christmas" },
  { countryCode: "PK", holidayDate: "2027-02-05", name: "Kashmir Day" },
  { countryCode: "PK", holidayDate: "2027-03-09", name: "Eid al-Fitr (estimated)" },
  { countryCode: "PK", holidayDate: "2027-03-10", name: "Eid al-Fitr (estimated)" },
  { countryCode: "PK", holidayDate: "2027-03-23", name: "Pakistan Day" },
  { countryCode: "PK", holidayDate: "2027-05-01", name: "Labour Day" },
  { countryCode: "PK", holidayDate: "2027-05-17", name: "Eid al-Adha (estimated)" },
  { countryCode: "PK", holidayDate: "2027-05-18", name: "Eid al-Adha (estimated)" },
  { countryCode: "PK", holidayDate: "2027-06-16", name: "Ashura (estimated)" },
  { countryCode: "PK", holidayDate: "2027-08-14", name: "Independence Day" },
  { countryCode: "PK", holidayDate: "2027-08-16", name: "Eid Milad un-Nabi (estimated)" },
  { countryCode: "PK", holidayDate: "2027-11-09", name: "Iqbal Day" },
  { countryCode: "PK", holidayDate: "2027-12-25", name: "Quaid-e-Azam Day / Christmas" },

  // ── Spain — national holidays only ────────────────────────────────
  { countryCode: "ES", holidayDate: "2026-01-01", name: "Año Nuevo" },
  { countryCode: "ES", holidayDate: "2026-01-06", name: "Epifanía del Señor" },
  { countryCode: "ES", holidayDate: "2026-04-03", name: "Viernes Santo" },
  { countryCode: "ES", holidayDate: "2026-05-01", name: "Fiesta del Trabajo" },
  { countryCode: "ES", holidayDate: "2026-08-15", name: "Asunción de la Virgen" },
  { countryCode: "ES", holidayDate: "2026-10-12", name: "Fiesta Nacional de España" },
  { countryCode: "ES", holidayDate: "2026-11-02", name: "Todos los Santos (trasladado)" },
  { countryCode: "ES", holidayDate: "2026-12-07", name: "Día de la Constitución (trasladado)" },
  { countryCode: "ES", holidayDate: "2026-12-08", name: "Inmaculada Concepción" },
  { countryCode: "ES", holidayDate: "2026-12-25", name: "Navidad" },
  { countryCode: "ES", holidayDate: "2027-01-01", name: "Año Nuevo" },
  { countryCode: "ES", holidayDate: "2027-01-06", name: "Epifanía del Señor" },
  { countryCode: "ES", holidayDate: "2027-03-26", name: "Viernes Santo" },
  { countryCode: "ES", holidayDate: "2027-05-01", name: "Fiesta del Trabajo" },
  { countryCode: "ES", holidayDate: "2027-08-16", name: "Asunción de la Virgen (trasladado)" },
  { countryCode: "ES", holidayDate: "2027-10-12", name: "Fiesta Nacional de España" },
  { countryCode: "ES", holidayDate: "2027-11-01", name: "Todos los Santos" },
  { countryCode: "ES", holidayDate: "2027-12-06", name: "Día de la Constitución" },
  { countryCode: "ES", holidayDate: "2027-12-08", name: "Inmaculada Concepción" },
  { countryCode: "ES", holidayDate: "2027-12-25", name: "Navidad" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[seed-holidays] ${HOLIDAYS.length} rows prepared`);
  for (const cc of ["US", "PK", "ES"] as const) {
    const n = HOLIDAYS.filter((h) => h.countryCode === cc).length;
    console.log(`  ${cc}: ${n}`);
  }

  if (dryRun) {
    console.log("[seed-holidays] --dry-run: nothing written");
    return;
  }

  const inserted = await db
    .insert(publicHolidays)
    .values(HOLIDAYS)
    .onConflictDoNothing()
    .returning({ id: publicHolidays.id });

  console.log(
    `[seed-holidays] inserted ${inserted.length}, skipped ${HOLIDAYS.length - inserted.length} already present`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-holidays] failed:", err);
    process.exit(1);
  });
```

Add the `db` and `publicHolidays` imports to match the bootstrap pattern from Step 1.

- [ ] **Step 3: Add the npm script**

In `package.json`, in `"scripts"`, alongside the other `tsx`-run scripts:

```json
"seed-holidays": "tsx scripts/seed-public-holidays.ts"
```

Match the exact runner (`tsx`, `ts-node`, etc.) that the neighbouring data scripts use.

- [ ] **Step 4: Dry-run only**

```bash
npm run seed-holidays -- --dry-run
```

Expected: prints 66 rows (22 US, 24 PK, 20 ES) and writes nothing.

- [ ] **Step 5: STOP — ask Manu before the real run**

The real run writes to PROD Supabase. Report the dry-run counts and ask for explicit approval. Also flag that the Pakistan Eid dates are estimates needing his confirmation.

- [ ] **Step 6: Typecheck and commit**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
git add scripts/seed-public-holidays.ts package.json
git commit -m "feat(time-off): add public holiday seed script for US, PK, ES

66 rows across 2026-2027, idempotent via onConflictDoNothing. Supports
--dry-run. Pakistan's Eid dates are lunar estimates flagged in the file
header as requiring annual human review; Spain is national-only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- scripts/seed-public-holidays.ts package.json
```

---

## Task 8: Request submission dialog and requests page

**Files:**
- Create: `src/app/calendar/_components/RequestTimeOffDialog.tsx`
- Create: `src/app/calendar/requests/page.tsx`
- Create: `src/app/calendar/requests/_components/RequestsTable.tsx`

**Interfaces:**
- Consumes: Task 3 (`RequestRow`, `getMyRequests`, `getPendingRequests`, `getAllRequests`), Task 5 (all three routes), Task 2 (`TIME_OFF_APPROVER_EMAIL`).
- Produces: `<RequestTimeOffDialog />` (client component, no props), the `/calendar/requests` page.

- [ ] **Step 1: Read the existing patterns first**

Read these before writing anything, and follow their conventions exactly:
- `src/app/calendar/_components/EventPopover.tsx` (268 lines) — the existing form/dialog pattern in this section: which shadcn primitives it imports, how it posts, how it handles errors and loading.
- `src/app/calendar/page.tsx` (27 lines) — the server-component + `force-dynamic` pattern.
- `DESIGN.md` — mandatory before any visual decision. Do not invent colours or spacing.

- [ ] **Step 2: Write `RequestTimeOffDialog.tsx`**

A client component (`"use server"` is wrong here — use `"use client"`) with:
- Trigger button labelled "Request time off".
- Fields: start date, end date (both `<input type="date">`, `YYYY-MM-DD`), and a required `reason` textarea.
- Client-side guard: end date defaults to the start date when start changes and end is empty or earlier.
- Submit `POST /api/time-off` with `{ startDate, endDate, reason }`.
- On `409`, surface the server's `error` string verbatim plus the returned `conflict` range — the user needs to know which existing request blocks them.
- On `201`, close and `router.refresh()`.
- Disable the submit button while in flight.
- Show a plain hint under the field: *"Whole days only. Weekends and your country's public holidays are not counted."*

Use the same shadcn imports `EventPopover.tsx` uses (`Dialog`/`Popover`, `Button`, `Input`, `Textarea`, `Label`) rather than introducing new primitives.

- [ ] **Step 3: Write `src/app/calendar/requests/page.tsx`**

Server component, `export const dynamic = "force-dynamic"`:
- `getAuthSession()`; redirect to `/` if absent.
- If `role` is not `admin` or `editor`, render a plain "Not available" message — do not 500.
- Fetch `getMyRequests(session.user.id)` always.
- If `role === "admin"`, also fetch `getAllRequests()`.
- Compute `isJake = session.user.email?.toLowerCase() === TIME_OFF_APPROVER_EMAIL.toLowerCase()`.
- Render `<RequestsTable mine={...} all={...} isApprover={isJake} />`.

- [ ] **Step 4: Write `RequestsTable.tsx`**

Client component. Two sections:
- **"My requests"** — every user. Columns: dates, working days, status badge, reason, decision note. A "Cancel" button appears only when the row is `pending`, or `approved` with a future start date; it calls `DELETE /api/time-off/[id]` then `router.refresh()`.
- **"All requests"** — rendered only when `all` is provided (admins). Same columns plus requester name. Approve and Deny buttons appear **only when `isApprover` is true and the row is `pending`**; they `PATCH` with `{ status, decisionNote }` from an optional note input, then `router.refresh()`. When `isApprover` is false, render the rows read-only with a one-line caption: *"Only Jake can approve time-off requests."*

Status badge colours: reuse the palette already in `EVENT_STYLES` (`src/app/calendar/_components/types.ts`) rather than new ones — emerald for approved, red for denied, amber for pending, zinc for cancelled.

- [ ] **Step 5: Verify in the browser**

```bash
PORT=3000 npm run dev
```

Visit `/calendar/requests`. Confirm: the page renders, submitting a request returns 201 and the row appears as `pending`, submitting an overlapping range shows the 409 message, and the approve/deny buttons are absent for your own non-Jake admin account.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
node_modules/.bin/eslint src/app/calendar
git add src/app/calendar/_components/RequestTimeOffDialog.tsx src/app/calendar/requests
git commit -m "feat(time-off): add request dialog and requests page

Submission dialog with 409 conflict surfacing, plus a requests page showing
every user their own history and admins the full list. Approve/deny controls
render only for the designated approver; other admins see read-only rows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/calendar/_components/RequestTimeOffDialog.tsx src/app/calendar/requests
```

---

## Task 9: Calendar overlays and nav badge

**Files:**
- Modify: `src/app/calendar/page.tsx`
- Modify: `src/app/calendar/_components/types.ts`
- Modify: `src/app/calendar/_components/CalendarView.tsx`
- Modify: `src/app/calendar/_components/MonthGrid.tsx`
- Modify: `src/components/layout/top-nav.tsx:162`

**Interfaces:**
- Consumes: Task 3 (`getApprovedInRange`, `getHolidayDates`, `ApprovedRow`), Task 5 (`/api/time-off/pending-count`).
- Produces: no new exports consumed downstream — this is the final integration task.

- [ ] **Step 1: Read the three calendar components in full**

`types.ts` (109 lines), `CalendarView.tsx` (537 lines), `MonthGrid.tsx` (365 lines). You must understand how `CalendarEvent` flows from page → view → grid before adding a parallel data source. Do not guess at prop shapes.

- [ ] **Step 2: Relabel the legacy holiday type**

In `src/app/calendar/_components/types.ts`, in `EVENT_STYLES.holiday`, change only the label:

```ts
    label: "Observance",
```

Everything else about that entry stays. Rationale (spec D12): the 48 existing `calendar_events` `holiday` rows mix real holidays with observances like Valentine's Day and Halloween. Real non-working days now live in `public_holidays`; these rows are content-planning dates. The enum value stays `holiday` — renaming it would be a non-additive schema change.

- [ ] **Step 3: Add the overlay types**

Append to `types.ts`:

```ts
/** An approved time-off block on the shared calendar. Never carries a reason (spec D8). */
export interface TimeOffBlock {
  id: string;
  userId: string;
  userName: string | null;
  startDate: string;
  endDate: string;
}

/** A public holiday for the viewer's country — a real non-working day. */
export interface HolidayBlock {
  id: string;
  countryCode: string;
  holidayDate: string;
  name: string;
}
```

- [ ] **Step 4: Extend the page query**

In `src/app/calendar/page.tsx`, alongside the existing `calendarEvents` select, add the viewer's country holidays and approved time off. Use a wide window so month navigation has data without a refetch:

```ts
const session = await getAuthSession();
const [me] = session
  ? await db
      .select({ countryCode: users.countryCode })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
  : [undefined];

const WINDOW_FROM = "2025-01-01";
const WINDOW_TO = "2027-12-31";

const timeOff = await getApprovedInRange(WINDOW_FROM, WINDOW_TO);

// A viewer with no country sees NO public holidays rather than another
// country's — silently defaulting to US would show wrong non-working days
// to the Pakistan- and Spain-based team (spec D6).
const holidays = me?.countryCode
  ? await db
      .select()
      .from(publicHolidays)
      .where(
        and(
          eq(publicHolidays.countryCode, me.countryCode),
          gte(publicHolidays.holidayDate, WINDOW_FROM),
          lte(publicHolidays.holidayDate, WINDOW_TO)
        )
      )
  : [];
```

Pass both arrays into `<CalendarView initialEvents={events} timeOff={timeOff} holidays={holidays} />`.

- [ ] **Step 5: Render the overlays**

In `CalendarView.tsx`, accept the two new props (both defaulting to `[]` so any other call site keeps compiling) and thread them to `MonthGrid`. In `MonthGrid.tsx`, for each day cell:
- Render holidays as a distinct full-width chip using the existing amber holiday styling, labelled with the holiday `name`.
- Render time-off blocks using the existing `pto` violet styling from `EVENT_STYLES`, labelled `"{userName} — Time off"`. **Never render a reason.**
- Reuse the existing `eventCoversDate` / `dateRangeRole` helpers for the multi-day time-off bars rather than writing new range logic.

Add a legend entry for each so the colours are self-explanatory.

- [ ] **Step 6: Add the nav badge**

In `src/components/layout/top-nav.tsx`, line 162 currently reads:

```ts
    { title: "Calendar", href: "/calendar", icon: CalendarDays, visible: checkAccess("calendar") },
```

Fetch `/api/time-off/pending-count` in the nav's existing client-side data flow (follow whatever pattern the file already uses for dynamic counts; if there is none, use a small `useEffect` + `useState` fetch) and render a count badge on the Calendar item when `count > 0`. The route already returns `{ count: 0 }` for anyone who is not the approver, so no role check is needed in the component.

- [ ] **Step 7: Verify in the browser**

```bash
PORT=3000 npm run dev
```

Confirm on `/calendar`: approved time off appears with a name and no reason; your country's public holidays appear; the 48 legacy rows now read "Observance"; the badge shows only for Jake's account.

- [ ] **Step 8: Full test run, typecheck, lint**

```bash
node_modules/.bin/vitest run src/lib/time-off/ src/lib/email.test.ts
node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS"
node_modules/.bin/eslint src/app/calendar src/components/layout/top-nav.tsx
```

Expected: all tests PASS. Every tsc error accounted for BY FILENAME as pre-existing.

- [ ] **Step 9: Commit**

```bash
git add src/app/calendar/page.tsx src/app/calendar/_components/types.ts src/app/calendar/_components/CalendarView.tsx src/app/calendar/_components/MonthGrid.tsx src/components/layout/top-nav.tsx
git commit -m "feat(time-off): render time off and public holidays on the calendar

Approved time off and the viewer's country public holidays overlay the
existing calendar. Legacy calendar_events 'holiday' rows are relabelled
Observance, since real non-working days now live in public_holidays. Time-off
blocks show the member's name only, never the reason. Pending-count badge on
the Calendar nav item for the approver.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/calendar/page.tsx src/app/calendar/_components/types.ts src/app/calendar/_components/CalendarView.tsx src/app/calendar/_components/MonthGrid.tsx src/components/layout/top-nav.tsx
```

---

## Post-implementation: open items for Manu

Neither blocks the code; both block the feature being correct in production.

1. **Assign `country_code` to the 14 team members.** Deliberately not inferred from names. Until supplied, everyone is `NULL` and day counts exclude weekends only (spec D6).
2. **Confirm the Pakistan Eid dates** seeded in Task 7 — they are lunar estimates.
3. **Optional later tidy-up:** real US holidays now exist in both `public_holidays` and among the 48 legacy `calendar_events` rows, so days like Thanksgiving render twice (once as a holiday, once as an observance). Only `public_holidays` affects arithmetic. Cleaning the legacy rows is an approval-gated production write, deliberately out of scope (spec §9 risk 4).

## Spec coverage check

| Spec section | Task |
|---|---|
| §3.1 migration 0087 | Task 2 |
| §3.2 `working_days` snapshot | Task 2 (column), Task 5 (computed at submit) |
| §3.3 country codes | Task 2 (constants), Task 6 (validation) |
| §4.1 pure working-days module | Task 1 |
| §4.2 query module | Task 3 |
| §4.3 API routes + role gates | Tasks 5, 6 |
| §4.4 UI | Tasks 8, 9 |
| §4.5 email + escaping | Task 4 |
| §4.6 seed script | Task 7 |
| §5 data flow | Tasks 5, 8, 9 |
| §6 error handling | Task 5 (guards + routes), Task 6 (409 on unique violation) |
| §7 testing | Tasks 1, 4, 5 |
| §9 risks | Documented in Task 7 header and post-implementation items |
