# Residence Timezone + Holiday Calendar Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the two unrelated jobs currently overloaded onto `users.country_code` — the day boundary and the leave deduction — so residence is an IANA timezone string and `country_code` becomes purely the holiday-calendar key.

**Architecture:** Migration 0088 adds one nullable column, `users.residence_timezone`, and `country_code` is reused unchanged as the holiday-calendar key (it is 100% NULL today, so no data's meaning changes). `todayInCountry()` is re-keyed to `todayInZone()` reading the new column; `getHolidayDates()` and its call site are untouched. A submitter with no holiday calendar is refused with a 422 rather than silently counted against an empty holiday set. Both fields are set through an admin UI on `/admin/users`, and the whole `PUT /api/admin/users` becomes audited.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19, drizzle-orm 0.45 + `postgres` driver, PostgreSQL (Supabase), Vitest + Testing Library, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-04-user-residence-and-holiday-calendar-split-design.md` (committed `d2e1327c`). The spec is the source of truth for every decision; this plan is the source of truth for every line of code.

**Worktree:** `/Users/manu/MFHub/.worktrees/team-calendar-time-off`, branch `feat/team-calendar-time-off`, base HEAD `d2e1327c`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Additive only.** No column drops, renames or row deletions. `calendar_events` gets zero changes.
- **Per-action OK from Manu for every DB write and every schema change.** Task 3 commits migration *files*; **applying** 0088 is a separate gated action described in "Rollout" below, not a plan step.
- **Never** `next build`. **Never** `npm run db:generate` on this branch — 0084–0086 are absent and `_journal.json` is stale at `0004`, so it emits huge drift. The house pattern is one bespoke `scripts/_apply-00NN.ts` per migration.
- **Never** `git add .` — explicit pathspec on add **and** commit, `-m` **before** `--`, one task per commit. Keep `graphify-out/*`, `.claude/*`, `.superpowers/*`, `redshift-client-exports/*` and every `scripts/_tmp-*` / `scripts/_diag*` / `scripts/_probe*` / `scripts/_preflight*` / `scripts/_verify*` out of every commit (7 such untracked probes exist and must stay untracked).
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- `git checkout -- <path>` is blocked — use Edit to revert. `rm -r` / `rm -f` are blocked.
- Dates are `YYYY-MM-DD` **strings** across module boundaries, never `Date` objects.
- **tsc baseline in this worktree is exactly ONE pre-existing error:** `scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46` TS2349. Run `node_modules/.bin/tsc --noEmit` **unfiltered**, in the background (~2 min), and judge **by filename**. vitest does **not** typecheck — always follow a test run with tsc.
- **Never run the full vitest suite.** It has 21 pre-existing failing files / 41 tests, entirely environmental. Always scope.
- Repo-wide `npm run lint` exits 1 pre-existing — scope eslint to touched paths.
- The SQL↔Drizzle divergence is exactly **one** deliberate item: `time_off_no_overlap_per_user` exists in SQL only, because drizzle-orm 0.45 has no exclusion-constraint primitive. Do not "fix" it as drift.
- Read `DESIGN.md` before any visual decision. Hub accent is Burnt Orange `#FF751F` (`--brand`); Charcoal Blue `#2A5059` is portal-only and the two never mix. `/admin/users` is a hub page, so `focus:border-brand` is correct there.
- A line number is trustworthy only if it came from grepping the **committed** file. Every fix diff invalidates its own file's line numbers below it.

### Two approved amendments to the spec

Manu approved both on 2026-08-04. They do not touch any of the seven locked decisions (D-A…D-G).

1. **§4.7 names a function that does not exist.** The spec says `logAdminEvent`; the real export in `src/lib/event-logger.ts:22` is `logEvent`. Furthermore `logEvent` is a **fire-and-forget un-awaited Postgres write** (`db.insert(...).execute().catch(...)`, returns `void`) — the exact shape Thread G proved on 2026-08-04 causes a production outage: the handler returns, Vercel freezes the sandbox mid-protocol (Parse/Bind/Execute sent, Sync never sent), and Postgres holds an open transaction in `state=active` / `wait_event=Client:ClientRead`, pinning a Supavisor pool slot that neither `statement_timeout` nor `idle_in_transaction_session_timeout` reaps. **Wrapping the void call in `after()` would not fix it** — the inner insert would still be un-awaited. So Task 1 adds a genuinely awaitable `logEventAsync()` and Task 6 calls `after(logEventAsync({...}))`. The 11 existing `logEvent` call sites are **not** retrofitted (out of scope; Thread G deliberately left them).
2. **§5's rollout order is swapped.** The spec ordered: apply 0088 → assign calendars → seed holidays. That window is a live bug: `country_code='ES'` with zero seeded ES rows makes `getHolidayDates` return an empty set (`queries.ts:42` short-circuits only on a *falsy* code), so the 422 does not fire and `working_days` freezes un-deducted. Seeding **before** assigning makes both steps self-enforcing at zero code cost. See "Rollout" below.

### Two empirically proven traps — do not let a reviewer undo either

Both verified on Node v24.13.1.

1. `new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angles" })` **throws** `RangeError: Invalid time zone specified`. Today's code is only accidentally safe because it looks up from a typed map. A raw DB string passed through would 500 the cancel route. `todayInZone` must fall back to `"UTC"` and never throw.
2. `Intl.supportedValuesOf("timeZone")` returns 418 **canonical** zones and **excludes** `UTC`, `Etc/UTC`, `Europe/Kyiv` and `Asia/Kolkata` — all four of which `DateTimeFormat` accepts. The validator MUST be a try/catch around a `DateTimeFormat` construction, **not** list membership. Membership would reject the UTC fallback itself and reject `Europe/Kyiv` for a Ukraine-based team member (Ruslan Makarenko is on the roster).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/event-logger.ts` | Modify | Add `logEventAsync()` (awaitable). `logEvent()` stays void and delegates. |
| `src/lib/event-logger.test.ts` | Create | Prove `logEventAsync` awaits, never rejects, and maps params to the row. |
| `src/lib/timezones.ts` | Create | `isValidTimeZone()` (try/catch, never membership) + `SUPPORTED_TIME_ZONES` for the picker. |
| `src/lib/timezones.test.ts` | Create | Pin both proven ICU traps. |
| `src/lib/time-off/guards.ts` | Modify | `todayInCountry` → `todayInZone`. `COUNTRY_TIME_ZONES` and the `isCountryCode`/`CountryCode` imports leave. |
| `src/lib/time-off/guards.test.ts` | Modify | Re-key 12 references; 32 → 35 tests. |
| `drizzle/migrations/0088_user_residence_timezone.sql` | Create | One `ALTER TABLE users ADD COLUMN`. |
| `scripts/_apply-0088.ts` | Create | Guarded applier (lock_timeout + retry), on the **direct** connection. |
| `src/lib/db/schema.ts` | Modify | Add `residenceTimezone`; rewrite the `country_code` comment. |
| `src/app/api/time-off/[id]/route.ts` | Modify | Select `residenceTimezone`, call `todayInZone`. |
| `src/app/api/time-off/[id]/route.test.ts` | Create | Prove the day boundary follows the stored zone, and that a bad stored zone does not 500. |
| `src/app/api/time-off/route.ts` | Modify | 422 when the submitter has no holiday calendar. |
| `src/app/api/time-off/route.test.ts` | Create | Prove the 422 fires, blocks the insert, and sits *after* the 409. |
| `src/app/api/admin/users/route.ts` | Modify | Two optional fields + validators; audit the whole PUT via `after(logEventAsync(...))`. |
| `src/app/api/admin/users/route.test.ts` | Modify | 3 → 12 tests. |
| `src/components/admin/user-timeoff-cell.tsx` | Create | The two controls, extracted so they are testable and `page.tsx`'s diff stays small. |
| `src/components/admin/user-timeoff-cell.test.tsx` | Create | 8 render/interaction tests. |
| `src/app/admin/users/page.tsx` | Modify | `User` type +2 fields, one new column, two mutations, header cell, colSpan/totalCols arithmetic. |

### Two deliberate deviations from the spec's letter (substance preserved)

- **§4.6/§4.8 imply the timezone validator and list live wherever is convenient.** They go in a new `src/lib/timezones.ts` rather than `src/lib/constants.ts`, so §4.3's "`constants.ts` unchanged" stays literally true and `todayInZone` and the API share **one** implementation of the check.
- **§4.8 says "two controls" on `/admin/users`.** They land as **one new table column containing both controls stacked**, inside a new `UserTimeOffCell` component. Reason: that table already carries ~25 columns (email + 6 role columns + super-admin + client + "All" + ~14 section columns + last login + joined + actions); two more would wreck it, and the page is 1074 lines. One column means one `<th>`, one `<td>`, `colSpan` +1 and `totalCols` +1. Both controls, both fields, same page — §4.8's substance intact.
- **The timezone control is an `<input list>` + `<datalist>`, not a 418-option `<select>` and not a Command/Popover combobox.** The page hand-rolls its dropdowns with `createPortal` and imports neither `Popover` nor `Command`, so a combobox would be ~40 lines of new-to-this-page machinery; a datalist gets native type-to-filter over all 418 zones in ~6 lines, matches the page's existing input styling, and free text is safely rejected by §4.6's server validator (plus a client-side hint).

---

## Task 1: `logEventAsync` — an awaitable audit-log writer

**Files:**
- Modify: `src/lib/event-logger.ts` (43 lines today)
- Create: `src/lib/event-logger.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `logEventAsync(params: LogEventParams): Promise<void>` — never rejects. `logEvent(params: LogEventParams): void` keeps its exact current signature and fire-and-forget behaviour, so all 11 existing call sites are unaffected. `LogEventParams` is unchanged and stays un-exported.

- [ ] **Step 1: Write the failing test**

Create `src/lib/event-logger.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { insert: vi.fn() } }));

import { logEvent, logEventAsync } from "./event-logger";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/** Mocks `db.insert(t).values(row).execute()` and exposes the captured row. */
function mockInsert(result: Promise<unknown>) {
  const values = vi.fn().mockReturnValue({ execute: vi.fn().mockReturnValue(result) });
  asMock(db.insert).mockReturnValue({ values });
  return values;
}

describe("logEventAsync", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("does not resolve until the insert settles", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => { release = r; });
    mockInsert(pending);

    let settled = false;
    const p = logEventAsync({ section: "admin", action: "user:update" }).then(() => {
      settled = true;
    });

    // Give the microtask queue a turn. If the insert were fire-and-forget the
    // promise would already be settled here — which is the whole bug this
    // function exists to avoid.
    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    await p;
    expect(settled).toBe(true);
  });

  it("resolves rather than rejecting when the insert fails", async () => {
    mockInsert(Promise.reject(new Error("connection terminated")));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logEventAsync({ section: "admin", action: "user:update" })
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith(
      "[event-logger] Failed to write event:",
      "connection terminated"
    );
  });

  it("defaults status to success and every optional field to null", async () => {
    const values = mockInsert(Promise.resolve());
    await logEventAsync({ section: "admin", action: "user:update" });

    expect(values).toHaveBeenCalledWith({
      userEmail: null,
      userName: null,
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      message: null,
      detail: null,
      durationMs: null,
    });
  });

  it("passes explicit values through unchanged", async () => {
    const values = mockInsert(Promise.resolve());
    await logEventAsync({
      userEmail: "manu@marketfoundry.agency",
      userName: "Manu Lancharro",
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: "user",
      resourceId: "u2",
      resourceLabel: "jake@marketfoundry.agency",
      detail: { countryCode: "PK" },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "manu@marketfoundry.agency",
        resourceId: "u2",
        resourceLabel: "jake@marketfoundry.agency",
        detail: { countryCode: "PK" },
      })
    );
  });
});

describe("logEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("still returns void and still triggers the insert", () => {
    const values = mockInsert(Promise.resolve());
    expect(logEvent({ section: "admin", action: "user:update" })).toBeUndefined();
    expect(values).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node_modules/.bin/vitest run src/lib/event-logger.test.ts
```
Expected: FAIL — `logEventAsync` is not exported (`does not provide an export named 'logEventAsync'`). All 5 tests fail at import time.

- [ ] **Step 3: Write the implementation**

Replace the whole body of `src/lib/event-logger.ts` below the `LogEventParams` type (keep lines 1–16 exactly as they are) with:

```ts
function toRow(params: LogEventParams) {
  return {
    userEmail: params.userEmail ?? null,
    userName: params.userName ?? null,
    section: params.section,
    action: params.action,
    status: params.status ?? "success",
    resourceType: params.resourceType ?? null,
    resourceId: params.resourceId ?? null,
    resourceLabel: params.resourceLabel ?? null,
    message: params.message ?? null,
    detail: params.detail ?? null,
    durationMs: params.durationMs ?? null,
  };
}

/**
 * Awaitable event write. Never rejects — a failed audit write must not fail
 * the action being audited.
 *
 * Prefer this over `logEvent` in any route the platform can freeze the moment
 * it returns. An un-awaited Postgres write is abandoned mid-protocol (Parse/
 * Bind/Execute sent, Sync never sent), leaving the backend in `state=active` /
 * `wait_event=Client:ClientRead` holding a Supavisor pool slot that neither
 * `statement_timeout` nor `idle_in_transaction_session_timeout` reaps. That is
 * what caused the 2026-08-04 production outage.
 *
 * Wrap the returned promise in `after()` from `next/server` at the call site:
 * response latency is unchanged, and the invocation stays alive to finish it.
 */
export async function logEventAsync(params: LogEventParams): Promise<void> {
  try {
    await db.insert(adminEventLog).values(toRow(params)).execute();
  } catch (err) {
    console.error(
      "[event-logger] Failed to write event:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Fire-and-forget event logger. Writes to admin_event_log.
 * Never throws — errors are silently logged to console.
 *
 * Retained unchanged for its 11 existing call sites. New call sites in request
 * handlers should use `logEventAsync` inside `after()` instead — see above.
 */
export function logEvent(params: LogEventParams): void {
  void logEventAsync(params);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node_modules/.bin/vitest run src/lib/event-logger.test.ts
```
Expected: PASS — `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 5: Verify the 11 existing call sites still typecheck**

```bash
node_modules/.bin/tsc --noEmit > /tmp/tsc-task1.txt 2>&1; echo "exit=$?"; cat /tmp/tsc-task1.txt
```
Expected: exactly ONE error, `scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46`. Zero errors in any file touched by this task. Judge **by filename**, not by count.

- [ ] **Step 6: Commit**

```bash
git add src/lib/event-logger.ts src/lib/event-logger.test.ts
git commit -m "feat(audit): add awaitable logEventAsync alongside fire-and-forget logEvent

An un-awaited Postgres write is abandoned when the platform freezes the
sandbox after the handler returns, pinning a pooler slot. New request-handler
call sites need a promise they can hand to after(); logEvent keeps its exact
void signature so its 11 existing call sites are untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `isValidTimeZone` + re-key `todayInCountry` → `todayInZone`

**Files:**
- Create: `src/lib/timezones.ts`
- Create: `src/lib/timezones.test.ts`
- Modify: `src/lib/time-off/guards.ts` (105 lines today; `COUNTRY_TIME_ZONES` at 68–72, `todayInCountry` at 82–104)
- Modify: `src/lib/time-off/guards.test.ts` (174 lines, 32 tests; the `todayInCountry` describe block is 90–174)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `isValidTimeZone(value: unknown): value is string` — true only if `Intl.DateTimeFormat` accepts it. Empty/whitespace-only strings and non-strings are false.
  - `SUPPORTED_TIME_ZONES: readonly string[]` — the canonical picker list (418 entries on Node v24.13.1). **Never** used for validation.
  - `todayInZone(timeZone: string | null, now: Date): string` — replaces `todayInCountry`. `"YYYY-MM-DD"` in `timeZone`, falling back to UTC on null/invalid. `canSubmitTimeOff`, `isApprover`, `findConflict`, `canCancel` are unchanged.

- [ ] **Step 1: Write the failing tests for `timezones.ts`**

Create `src/lib/timezones.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidTimeZone, SUPPORTED_TIME_ZONES } from "./timezones";

describe("isValidTimeZone", () => {
  it("accepts a canonical zone", () => {
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
  });

  // The three zones below are the whole reason validation is a try/catch and
  // not a membership test against SUPPORTED_TIME_ZONES — that list excludes
  // all of them while DateTimeFormat accepts all of them.
  it("accepts UTC, which is NOT in the canonical list", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("accepts Europe/Kyiv, which is NOT in the canonical list", () => {
    expect(isValidTimeZone("Europe/Kyiv")).toBe(true);
  });

  it("accepts Asia/Kolkata, which is NOT in the canonical list", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
  });

  it("rejects the typo that makes DateTimeFormat throw", () => {
    // Proven on Node v24.13.1: constructing with this string throws
    // RangeError. Reaching DateTimeFormat with an unvalidated DB value is
    // what would 500 the cancel route.
    expect(isValidTimeZone("America/Los_Angles")).toBe(false);
  });

  it("rejects a bare country code, an empty string and non-strings", () => {
    expect(isValidTimeZone("UK")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("SUPPORTED_TIME_ZONES", () => {
  it("is a large list that omits UTC — an ICU-behaviour canary, not a bug", () => {
    // If this ever fails, ICU changed what supportedValuesOf returns. That
    // does not break anything (validation never consults this list) but the
    // comments justifying try/catch validation would need rewording.
    expect(SUPPORTED_TIME_ZONES.length).toBeGreaterThan(300);
    expect(SUPPORTED_TIME_ZONES).not.toContain("UTC");
    expect(SUPPORTED_TIME_ZONES).toContain("America/Los_Angeles");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run src/lib/timezones.test.ts
```
Expected: FAIL — cannot resolve `./timezones`.

- [ ] **Step 3: Write `src/lib/timezones.ts`**

```ts
/**
 * IANA timezone helpers.
 *
 * `users.residence_timezone` holds a raw IANA zone string, so it must be
 * validated before it reaches `Intl.DateTimeFormat` — verified on Node
 * v24.13.1, `new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angles" })`
 * throws `RangeError: Invalid time zone specified`.
 */

/**
 * True only for a string the runtime's `Intl.DateTimeFormat` actually accepts.
 *
 * This is deliberately a try/catch and NOT a membership test against
 * `SUPPORTED_TIME_ZONES`. Verified on Node v24.13.1:
 * `Intl.supportedValuesOf("timeZone")` returns 418 CANONICAL zones and
 * EXCLUDES `UTC`, `Etc/UTC`, `Europe/Kyiv` and `Asia/Kolkata` — all four of
 * which `DateTimeFormat` accepts. A membership check would reject the UTC
 * fallback itself and would reject `Europe/Kyiv` for a Ukraine-based team
 * member. A try/catch accepts exactly what the runtime accepts, and never
 * drifts as ICU updates.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    void new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The runtime's canonical zone list, for populating a picker. 418 entries on
 * Node v24.13.1. NEVER use this to validate — see `isValidTimeZone`.
 */
export const SUPPORTED_TIME_ZONES: readonly string[] =
  Intl.supportedValuesOf("timeZone");
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run src/lib/timezones.test.ts
```
Expected: PASS — `Tests 7 passed (7)`.

- [ ] **Step 5: Re-key `guards.test.ts` — expect 32 → 35**

In `src/lib/time-off/guards.test.ts`:

Change the import (line 7) from `todayInCountry,` to `todayInZone,`.

Replace the **entire** `describe("todayInCountry", ...)` block (lines 90–174) with:

```ts
// Ruling P3: "today" must be the requester's own today, never UTC. `now` is
// injected so this is pure and the boundary cases are actually testable.
// Keyed on the stored IANA zone from `users.residence_timezone` — there is no
// country→zone map any more, which is the point of the split.
describe("todayInZone", () => {
  it("rolls Karachi into the next day before UTC does", () => {
    // 21:00Z is 02:00 the NEXT day in Karachi (UTC+5, no DST). This is the
    // exact case that let a PK user cancel leave that had already started.
    expect(todayInZone("Asia/Karachi", new Date("2026-08-03T21:00:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("rolls Madrid into the next day before UTC does", () => {
    // 23:30Z is 01:30 the next day in Madrid (CEST, UTC+2, in August).
    expect(todayInZone("Europe/Madrid", new Date("2026-08-03T23:30:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("keeps New York on the previous day after UTC midnight", () => {
    // 02:00Z is 22:00 the PREVIOUS day in New York (EDT, UTC-4, in August).
    expect(
      todayInZone("America/New_York", new Date("2026-08-04T02:00:00Z"))
    ).toBe("2026-08-03");
  });

  it("falls back to UTC when the zone is null", () => {
    expect(todayInZone(null, new Date("2026-08-04T02:00:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("falls back to UTC for a string that is not a zone at all", () => {
    expect(todayInZone("UK", new Date("2026-08-04T02:00:00Z"))).toBe(
      "2026-08-04"
    );
  });

  // NEW. `Intl.DateTimeFormat` THROWS RangeError on this exact string
  // (verified on Node v24.13.1). One person's typo in the admin UI must not
  // break the cancel button for everyone, so this must return a date rather
  // than propagate.
  it("falls back to UTC for a typo'd zone instead of throwing", () => {
    expect(() =>
      todayInZone("America/Los_Angles", new Date("2026-08-04T02:00:00Z"))
    ).not.toThrow();
    expect(
      todayInZone("America/Los_Angles", new Date("2026-08-04T02:00:00Z"))
    ).toBe("2026-08-04");
  });

  // NEW. Falsy-but-not-null takes the fallback branch, not the try/catch —
  // a cleared field that round-trips as "" rather than NULL.
  it("falls back to UTC for an empty string", () => {
    expect(todayInZone("", new Date("2026-08-04T02:00:00Z"))).toBe("2026-08-04");
  });

  // NEW, AND THE POINT OF THE WHOLE CHANGE. The old one-zone-per-country map
  // (US → America/New_York) could not express this: at this single instant a
  // New Yorker and a Californian are on DIFFERENT dates, so under the old
  // code a Pacific-coast user's approved request stopped being cancellable
  // ~3h before their own midnight.
  it("distinguishes Pacific from Eastern at the same instant", () => {
    const instant = new Date("2026-08-04T04:30:00Z");
    expect(todayInZone("America/Los_Angeles", instant)).toBe("2026-08-03");
    expect(todayInZone("America/New_York", instant)).toBe("2026-08-04");
  });

  // The cases above pin the SIGN of each offset; these bracket each zone
  // against its real-world neighbours, so a wrong (but same-sign) zone fails.

  it("pins Eastern, not Central or Pacific", () => {
    // 04:30Z is 00:30 Aug 4 in New York (EDT, UTC-4) but still 23:30 Aug 3
    // in Chicago (UTC-5) and Los Angeles (UTC-7).
    expect(
      todayInZone("America/New_York", new Date("2026-08-04T04:30:00Z"))
    ).toBe("2026-08-04");
  });

  it("pins Karachi, not Dhaka, on the early side of the boundary", () => {
    // 18:30Z is 23:30 Aug 3 in Karachi (UTC+5) but already 00:30 Aug 4 in
    // Dhaka (UTC+6).
    expect(todayInZone("Asia/Karachi", new Date("2026-08-03T18:30:00Z"))).toBe(
      "2026-08-03"
    );
  });

  it("pins Karachi, not Dubai, on the late side of the boundary", () => {
    // 19:30Z is 00:30 Aug 4 in Karachi (UTC+5) but still 23:30 Aug 3 in
    // Dubai (UTC+4). With the previous case this brackets UTC+5 exactly.
    expect(todayInZone("Asia/Karachi", new Date("2026-08-03T19:30:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("pins Madrid, not Karachi or Dubai, on the early side of the boundary", () => {
    // 21:30Z is 23:30 Aug 3 in Madrid (CEST, UTC+2) but already Aug 4 in both
    // Karachi (02:30) and Dubai (01:30).
    expect(todayInZone("Europe/Madrid", new Date("2026-08-03T21:30:00Z"))).toBe(
      "2026-08-03"
    );
  });

  it("pins Madrid, not London, on the late side of the boundary", () => {
    // 22:30Z is 00:30 Aug 4 in Madrid (CEST, UTC+2) but still 23:30 Aug 3 in
    // London (BST, UTC+1). With the previous case this brackets UTC+2 exactly.
    expect(todayInZone("Europe/Madrid", new Date("2026-08-03T22:30:00Z"))).toBe(
      "2026-08-04"
    );
  });
});
```

That block holds 13 `it()` calls where the old one held 10, so the file goes **32 → 35**.

- [ ] **Step 6: Run it to verify it fails**

```bash
node_modules/.bin/vitest run src/lib/time-off/guards.test.ts
```
Expected: FAIL — `guards.ts` does not export `todayInZone`; the whole file fails at import.

- [ ] **Step 7: Re-key `guards.ts`**

In `src/lib/time-off/guards.ts`:

Replace the import block (lines 1–5) with:

```ts
import { TIME_OFF_APPROVER_EMAIL } from "@/lib/constants";
import { isValidTimeZone } from "@/lib/timezones";
import { overlaps } from "./working-days";
```

Delete the `COUNTRY_TIME_ZONES` const and its doc comment entirely (lines 61–72), and replace `todayInCountry` (lines 74–104) with:

```ts
/**
 * "Today" as YYYY-MM-DD in the given IANA timezone.
 *
 * `now` is injected rather than read from the clock, so the cancel window is
 * pure and its timezone boundaries are testable (ruling P3). Built from
 * `formatToParts` rather than a locale format string so the output is
 * deterministic regardless of the host's ICU locale data.
 *
 * The zone comes straight from `users.residence_timezone`, so it is validated
 * first: `Intl.DateTimeFormat` throws `RangeError` on a typo'd zone, and one
 * person's typo must not break the cancel button for everyone. NULL, empty and
 * unrecognised all fall back to UTC — a day boundary a few hours off, which
 * self-corrects the moment the field is set and writes no permanent data.
 */
export function todayInZone(timeZone: string | null, now: Date): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) {
      // Practically unreachable with these fixed `formatToParts` options,
      // but a malformed key like "2026-08-" from a silently-missing part
      // is exactly the kind of swallowed failure `canCancel` would then
      // string-compare instead of failing loudly on. This is an internal
      // invariant, a different class from bad stored input — it still throws.
      throw new Error(
        `Intl.DateTimeFormat produced no "${type}" part for time zone "${zone}"`
      );
    }
    return value;
  };
  return `${part("year")}-${part("month")}-${part("day")}`;
}
```

- [ ] **Step 8: Run the scoped feature suite — predict 75 before you run it**

```bash
node_modules/.bin/vitest run src/lib/time-off/ src/lib/email.test.ts
```
Expected: PASS — `Test Files 3 passed (3)`, `Tests 75 passed (75)` (27 working-days + **35** guards + 13 email). Anything other than 75 means a test was silently dropped or duplicated — investigate before continuing.

Note: `src/app/api/time-off/[id]/route.ts` still imports `todayInCountry` at this point, so **tsc will report an error there**. That is expected and Task 4 fixes it; vitest does not typecheck, so the run above still passes. Do not "fix" it here.

- [ ] **Step 9: Commit**

```bash
git add src/lib/timezones.ts src/lib/timezones.test.ts src/lib/time-off/guards.ts src/lib/time-off/guards.test.ts
git commit -m "feat(time-off): key the day boundary on an IANA zone, not a country

todayInCountry becomes todayInZone and the one-zone-per-country map leaves.
That map could not serve both a New Yorker and a Californian, so a Pacific
user's approved request stopped being cancellable ~3h before their midnight.

Zone strings now come from the database, so isValidTimeZone gates them:
Intl.DateTimeFormat throws RangeError on a typo. Validation is a try/catch,
never membership of Intl.supportedValuesOf, which omits UTC and Europe/Kyiv.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migration 0088 — `users.residence_timezone`

**Files:**
- Create: `drizzle/migrations/0088_user_residence_timezone.sql`
- Create: `scripts/_apply-0088.ts`
- Modify: `src/lib/db/schema.ts` (`users` table at 99–125; `countryCode` and its comment at 113–115)

**Interfaces:**
- Consumes: nothing.
- Produces: `users.residenceTimezone` (drizzle `text("residence_timezone")`, nullable) — read by Tasks 4 and 6, selected by Task 7's page query via `SELECT *`.

**⚠️ This task commits FILES ONLY. Do not run `_apply-0088.ts`.** Applying is a production schema change and needs its own explicit per-action OK from Manu, plus the direct connection string. See "Rollout".

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/migrations/0088_user_residence_timezone.sql` (double-quoted identifiers and the `--> statement-breakpoint` convention match 0087; a single statement needs no breakpoint):

```sql
ALTER TABLE "users" ADD COLUMN "residence_timezone" text;
```

- [ ] **Step 2: Add the column to the drizzle schema and rewrite the `country_code` comment**

In `src/lib/db/schema.ts`, replace the `countryCode` line and the two comment lines above it (currently 113–115) with:

```ts
    // The user's HOLIDAY CALENDAR: 'US' | 'PK' | 'ES' | null, matching
    // public_holidays.country_code. This is a POLICY ASSIGNMENT, not
    // geography (design D-G) — "which set of days off this person gets" —
    // so a Manila-based person working US hours is assigned 'US'. Do not
    // "correct" it to their country of residence: only US/PK/ES calendars
    // are seeded, and every seeded holiday is a day NOT deducted from a
    // time-off request, so the value decides their leave allowance.
    // NULL means no calendar assigned, and a submission is REFUSED (D-C)
    // rather than silently counted against an empty holiday set — the
    // working_days snapshot is never recomputed, so a wrong count is
    // permanent. Set via PUT /api/admin/users.
    countryCode: char("country_code", { length: 2 }),
    // Where the person physically is, as an IANA zone string
    // ("America/Los_Angeles", "Asia/Karachi"). Drives ONLY the day boundary
    // (todayInZone in src/lib/time-off/guards.ts): is a request retroactive,
    // is an approved request still cancellable. Deliberately unconstrained —
    // any zone the runtime accepts. NULL falls back to UTC, which is a soft
    // failure that self-corrects the moment it is set.
    residenceTimezone: text("residence_timezone"),
```

`char` and `text` are both already imported by this file. No CHECK constraint on either column, consistent with the locked M1 rejection — guards live at the API boundary.

- [ ] **Step 3: Write the guarded applier**

Create `scripts/_apply-0088.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

// Set once the DDL has actually committed, so the catch handler can tell
// "the migration failed" apart from "the migration succeeded and a
// verification query afterwards failed".
let ddlCommitted = false;

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Unwraps a driver error's SQLSTATE. Kept from _apply-0087.ts: drizzle wraps
 * driver errors in a DrizzleQueryError whose `cause` holds the real
 * PostgresError, so reading `.code` off the top level silently yields
 * undefined — which defeated an entire retry build. This script talks to
 * `postgres` directly (see below) so the code is usually top-level, but the
 * unwrap is harmless and survives a future refactor back to drizzle.
 */
function pgError(e: unknown): { code?: string; message: string } {
  const cause = (e as { cause?: unknown })?.cause;
  const src = (cause ?? e) as { code?: string; message?: string };
  return { code: src?.code, message: src?.message ?? String(e) };
}

async function main() {
  const postgres = (await import("postgres")).default;
  const fs = await import("fs");

  // DATABASE_URL is the Supavisor TRANSACTION pooler (port 6543), which is
  // the wrong endpoint for DDL — it has no stable session and it dropped one
  // 0087 attempt mid-run with CONNECTION_CLOSED. Prefer the direct
  // connection (Supabase dashboard -> Project Settings -> Database ->
  // Direct connection). This is why the script uses `postgres` directly
  // instead of importing @/lib/db, which is hardwired to DATABASE_URL.
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither DIRECT_DATABASE_URL nor DATABASE_URL is set");
  if (!process.env.DIRECT_DATABASE_URL) {
    console.warn(
      "WARNING: DIRECT_DATABASE_URL is not set — falling back to DATABASE_URL, " +
        "which is the transaction pooler. DDL over the pooler is what dropped " +
        "an 0087 attempt with CONNECTION_CLOSED. Ask Manu for the direct string."
    );
  }

  const sql = postgres(url, { max: 1 });

  try {
    const migSql = fs.default.readFileSync(
      "./drizzle/migrations/0088_user_residence_timezone.sql",
      "utf8"
    );

    // `ALTER TABLE users ADD COLUMN` needs an ACCESS EXCLUSIVE lock, which
    // conflicts with the ACCESS SHARE locks every auth/session read of
    // `users` holds. Without a lock_timeout the ALTER sits in the lock queue
    // — and every read arriving AFTER it queues behind it, so production auth
    // stalls until the server's 2min statement_timeout kills us. That is
    // exactly what 0087's first attempt did.
    //
    // With lock_timeout the failure mode inverts: we either win a quiet
    // moment and finish in microseconds (adding a nullable column is
    // metadata-only), or we abort in 3s having blocked nothing, and retry.
    // NEVER a raised statement_timeout — that lengthens the stall.
    //
    // SET LOCAL is scoped to the implicit transaction, so it reverts on its
    // own and leaves no session state behind.
    const guardedSql = `SET LOCAL lock_timeout = '3s';\n${migSql}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(
        `Applying 0088_user_residence_timezone.sql (attempt ${attempt}/${MAX_ATTEMPTS}) ...`
      );
      try {
        // Zero bind params -> simple query protocol -> the whole
        // multi-statement string runs in ONE implicit transaction, so by the
        // time this resolves the migration has committed. Everything below
        // is verification only.
        await sql.unsafe(guardedSql);
        ddlCommitted = true;
        console.log(`DDL committed on attempt ${attempt}.`);
        break;
      } catch (e) {
        // 55P03 lock_not_available — our lock_timeout fired. Nothing was
        // committed (single implicit transaction), nothing was blocked.
        // 57014 statement_timeout — belt and braces; same clean-rollback shape.
        const { code, message } = pgError(e);
        const retryable = code === "55P03" || code === "57014";
        if (!retryable || attempt === MAX_ATTEMPTS) {
          console.error(
            `\nAttempt ${attempt} failed${code ? ` (SQLSTATE ${code})` : ""}: ${message}`
          );
          if (retryable) {
            console.error(
              `\nAll ${MAX_ATTEMPTS} attempts lost the race for the lock on "users". ` +
                `Nothing was applied and nothing was blocked. Retry when traffic is ` +
                `lower, or stop any local dev server pointed at this database first.`
            );
          }
          throw e;
        }
        console.log(
          `  attempt ${attempt} could not get the lock on "users" within 3s ` +
            `(SQLSTATE ${code}) — rolled back, nothing blocked. Retrying in ${
              RETRY_DELAY_MS / 1000
            }s ...`
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    const col = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'residence_timezone'
    `;
    console.log("users.residence_timezone column:", col);
    if (col.length !== 1) {
      throw new Error("users.residence_timezone column missing");
    }
    if (col[0].is_nullable !== "YES") {
      throw new Error("users.residence_timezone must be nullable");
    }

    // country_code must be untouched — the design REUSES it (D-D).
    const cc = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'country_code'
    `;
    if (cc.length !== 1) {
      throw new Error("users.country_code went missing — 0088 must be additive");
    }

    console.log("0088 applied OK.");
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.exit(0);
}

main().catch((e) => {
  // Print the message, NOT the whole error object — the postgres driver
  // attaches the failed statement to it, which buries the one line that
  // matters.
  const { code, message } = pgError(e);
  console.error(`\nFAILED${code ? ` (SQLSTATE ${code})` : ""}: ${message}`);
  if (ddlCommitted) {
    console.error(
      "\nDDL COMMITTED SUCCESSFULLY. A verification query then failed. " +
        "Do NOT rerun this script. Check whether the column already exists first."
    );
  }
  process.exit(1);
});
```

Note the deliberate difference from `_apply-0087.ts`: that script did `await import("@/lib/db")` inside the function (correct for ESM hoisting — `config()` must run before the module reads `process.env`), but `@/lib/db` is hardwired to `DATABASE_URL`, the pooler. This script keeps the same dynamic-import discipline while creating its own `max: 1` client so the direct URL can be used. **`SET LOCAL lock_timeout` still applies**, because zero bind params means the simple query protocol wraps the whole string in one implicit transaction.

- [ ] **Step 4: Typecheck (there is nothing to unit-test here)**

```bash
node_modules/.bin/tsc --noEmit > /tmp/tsc-task3.txt 2>&1; echo "exit=$?"; cat /tmp/tsc-task3.txt
```
Expected: the one pre-existing `rename-1o8m-keys-to-mf.ts:46` error, **plus** an error in `src/app/api/time-off/[id]/route.ts` (still importing `todayInCountry`, removed in Task 2). No errors in `schema.ts` or `scripts/_apply-0088.ts`. Task 4 clears the route error.

- [ ] **Step 5: Confirm the SQL parses without touching production**

```bash
grep -c "" drizzle/migrations/0088_user_residence_timezone.sql
```
Expected: `1`. A one-statement migration; there is no safe way to dry-run DDL against this database, and the applier's own verification queries are the check. **Do not run the applier.**

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0088_user_residence_timezone.sql scripts/_apply-0088.ts src/lib/db/schema.ts
git commit -m "feat(db): migration 0088 adds users.residence_timezone (NOT YET APPLIED)

country_code is REUSED as the holiday-calendar key (design D-D) — it is 100%
NULL today so no data's meaning changes, and its comment is rewritten to say
it is a policy assignment, not geography.

The applier prefers DIRECT_DATABASE_URL over the transaction pooler and keeps
0087's lock_timeout + retry guard: the real risk on this table was never the
DDL but the lock wait, which stalled production auth for 2 minutes once.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Cancel route reads the residence zone

**Files:**
- Modify: `src/app/api/time-off/[id]/route.ts` (the DELETE handler's `me` lookup and `todayInCountry` call, ~145–156)
- Create: `src/app/api/time-off/[id]/route.test.ts`

**Interfaces:**
- Consumes: `todayInZone` (Task 2), `users.residenceTimezone` (Task 3).
- Produces: no new exports. `DELETE` behaviour is unchanged except that the day boundary now follows the stored zone.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/time-off/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  buildTimeOffDecisionEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
}));

import { DELETE } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const REQ_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function delReq() {
  return new Request(`http://localhost/api/time-off/${REQ_ID}`, {
    method: "DELETE",
  }) as unknown as import("next/server").NextRequest;
}
const ctx = { params: Promise.resolve({ id: REQ_ID }) };

/**
 * The route issues two `db.select(...).from(...).where(...).limit(1)` reads in
 * order: the request row, then the user's own row. Queue their results.
 */
function mockSelects(...results: unknown[][]) {
  const queue = [...results];
  asMock(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(queue.shift() ?? []),
  }));
}

function mockUpdateOk() {
  asMock(db.update).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: REQ_ID, status: "cancelled" }]),
  });
}

/** An approved request starting 2026-08-04, owned by the session user. */
const APPROVED_TOMORROW = {
  id: REQ_ID,
  userId: USER_ID,
  status: "approved",
  startDate: "2026-08-04",
  endDate: "2026-08-05",
};

describe("DELETE /api/time-off/[id] — day boundary follows residence_timezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 04:30Z on Aug 4 is 21:30 Aug 3 in Los Angeles but 00:30 Aug 4 in New
    // York — the single instant where the old one-zone-per-country map was
    // provably wrong for half the US.
    vi.setSystemTime(new Date("2026-08-04T04:30:00Z"));
    asMock(getAuthSession).mockResolvedValue({
      user: { id: USER_ID, role: "editor", email: "jo@marketfoundry.agency" },
    });
  });
  afterEach(() => vi.useRealTimers());

  it("lets a Los Angeles user cancel a request starting 2026-08-04", async () => {
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: "America/Los_Angeles" }]);
    mockUpdateOk();
    const res = await DELETE(delReq(), ctx);
    // Today in LA is still 2026-08-03, so the start date is future.
    expect(res.status).toBe(200);
  });

  it("refuses the same request at the same instant for a New York user", async () => {
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: "America/New_York" }]);
    const res = await DELETE(delReq(), ctx);
    // Today in NY is already 2026-08-04, so the request has started.
    expect(res.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("falls back to UTC when no zone is stored", async () => {
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: null }]);
    const res = await DELETE(delReq(), ctx);
    // Today in UTC is 2026-08-04 — same verdict as New York here.
    expect(res.status).toBe(409);
  });

  it("does not 500 on a typo'd stored zone", async () => {
    // Intl.DateTimeFormat throws RangeError on this string. Unvalidated, this
    // request would be a 500 rather than a decision.
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: "America/Los_Angles" }]);
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run "src/app/api/time-off/[id]/route.test.ts"
```
Expected: FAIL at import — `guards.ts` no longer exports `todayInCountry`, which the route still imports.

- [ ] **Step 3: Re-key the route**

In `src/app/api/time-off/[id]/route.ts`, three edits.

First, the guards import (lines 7–12) — change `todayInCountry,` to `todayInZone,` and leave the other three names alone:

```ts
import {
  canCancel,
  canSubmitTimeOff,
  isApprover,
  todayInZone,
} from "@/lib/time-off/guards";
```

Second, the stale NOTE comment at lines 16–18 still names the old function. Task 8 greps for `todayInCountry` across `src/` and expects zero hits, so update it:

```ts
// NOTE: the plan had a UTC-only `todayKey()` here. It is REPLACED by
// `todayInZone()` in guards.ts — see Controller Amendment 1. The route reads
// the clock exactly once, at the call site, and passes it in.
```

Third, replace the `me` lookup and the `today` line in `DELETE` with:

```ts
  // "Today" must be the requester's OWN today, not UTC (ruling P3).
  // residence_timezone is not on the session — auth-db.ts copies only
  // id/role/clientIdCode/clientStatus onto session.user — so it is read here.
  const [me] = await db
    .select({ residenceTimezone: users.residenceTimezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const today = todayInZone(me?.residenceTimezone ?? null, new Date());
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run "src/app/api/time-off/[id]/route.test.ts"
```
Expected: PASS — `Tests 4 passed (4)`.

- [ ] **Step 5: Typecheck — this is the step that should clear the Task 3 residue**

```bash
node_modules/.bin/tsc --noEmit > /tmp/tsc-task4.txt 2>&1; echo "exit=$?"; cat /tmp/tsc-task4.txt
```
Expected: back to exactly ONE error, `rename-1o8m-keys-to-mf.ts:46`. If `[id]/route.ts` still errors, the import was not fully re-keyed.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/time-off/[id]/route.ts" "src/app/api/time-off/[id]/route.test.ts"
git commit -m "feat(time-off): cancel window follows the user's residence timezone

Reads users.residence_timezone and calls todayInZone. The tests pin the exact
instant (2026-08-04T04:30Z) where Los Angeles and New York are on different
dates, which the old one-zone-per-country map could not express, plus the
typo'd-zone case that would otherwise have been a 500 instead of a decision.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `POST /api/time-off` refuses a submitter with no holiday calendar

**Files:**
- Modify: `src/app/api/time-off/route.ts` (the `me` lookup + `getHolidayDates` call, ~127–136)
- Create: `src/app/api/time-off/route.test.ts`

**Interfaces:**
- Consumes: `users.countryCode` (unchanged by Task 3, reused as the calendar key).
- Produces: HTTP **422** from `POST /api/time-off` with body `{ error: string }` when the submitter has no calendar. Only POST is gated — PATCH and DELETE stay ungated, or an admin clearing someone's calendar would strand their existing requests in an unapprovable, uncancellable state.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/time-off/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  buildTimeOffRequestEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
}));
vi.mock("@/lib/time-off/queries", () => ({
  getAllRequests: vi.fn(),
  getMyRequests: vi.fn(),
  getOwnActiveRequests: vi.fn(),
  getHolidayDates: vi.fn(),
}));

import { POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { getHolidayDates, getOwnActiveRequests } from "@/lib/time-off/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const USER_ID = "22222222-2222-4222-8222-222222222222";

function postReq(body: unknown) {
  return new Request("http://localhost/api/time-off", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const VALID_BODY = {
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  reason: "Family trip",
};

/** Mocks the single `db.select({name, countryCode})...limit(1)` read. */
function mockMe(rows: unknown[]) {
  asMock(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  });
}

function mockInsertOk() {
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      { id: "req-1", workingDays: 3, status: "pending" },
    ]),
  });
}

describe("POST /api/time-off — holiday-calendar gate (design D-C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue({
      user: { id: USER_ID, role: "editor", email: "jo@marketfoundry.agency" },
    });
    asMock(getOwnActiveRequests).mockResolvedValue([]);
    asMock(getHolidayDates).mockResolvedValue(new Set<string>());
  });

  it("422s when the submitter has no holiday calendar", async () => {
    mockMe([{ name: "Jo Carticiano", countryCode: null }]);
    const res = await POST(postReq(VALID_BODY));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/holiday calendar isn't set/i);
    // The whole point: no working_days snapshot is ever frozen from an empty
    // holiday set, because the snapshot is never recomputed.
    expect(db.insert).not.toHaveBeenCalled();
    expect(getHolidayDates).not.toHaveBeenCalled();
  });

  it("422s when there is no users row at all", async () => {
    mockMe([]);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(422);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("201s and counts the days when a calendar is assigned", async () => {
    mockMe([{ name: "Amir Zeb", countryCode: "PK" }]);
    asMock(getHolidayDates).mockResolvedValue(new Set(["2026-09-02"]));
    mockInsertOk();

    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(201);
    expect(getHolidayDates).toHaveBeenCalledWith("PK", "2026-09-01", "2026-09-03");
  });

  it("still returns the friendly 409 for an overlap, calendar or not", async () => {
    // The gate must sit AFTER the conflict check, so the more specific error
    // wins for a user who has both problems.
    asMock(getOwnActiveRequests).mockResolvedValue([
      { id: "old", startDate: "2026-09-02", endDate: "2026-09-04" },
    ]);
    mockMe([{ name: "Jo Carticiano", countryCode: null }]);

    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run src/app/api/time-off/route.test.ts
```
Expected: FAIL — the first two tests get 201, not 422 (`expected 201 to be 422`). The third and fourth pass already.

- [ ] **Step 3: Add the gate**

In `src/app/api/time-off/route.ts`, immediately after the existing `const [me] = await db.select(...).limit(1);` and **before** the `getHolidayDates` call, insert:

```ts
  // Design D-C. A missing holiday calendar is NOT a recoverable state: this
  // route freezes `workingDays` as an integer snapshot that is never
  // recomputed, so counting against an empty holiday set writes a
  // permanently wrong number (a PK user's week spanning Eid would store 5
  // and stay 5 forever). 422 rather than 409 or 400 — the body is
  // well-formed and it is the account state that blocks processing, and this
  // route already uses 409 for overlaps and 400 for bad input, so 422 stays
  // distinguishable for the UI. A missing `users` row lands here too, which
  // is what the old silent `?? null` swallowed.
  //
  // Only POST is gated. PATCH (approve/deny) and DELETE (cancel) stay
  // ungated, or an admin clearing someone's calendar would strand their
  // existing requests in an unapprovable, uncancellable state.
  if (!me?.countryCode) {
    return NextResponse.json(
      {
        error:
          "Your holiday calendar isn't set. Ask an admin to set it on your profile before booking time off.",
      },
      { status: 422 }
    );
  }
```

Then change the `getHolidayDates` call from `me?.countryCode ?? null` to `me.countryCode` (the gate above has already narrowed it, and passing the narrowed value is what makes the 201 test's `toHaveBeenCalledWith("PK", ...)` assertion meaningful).

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run src/app/api/time-off/route.test.ts
```
Expected: PASS — `Tests 4 passed (4)`.

- [ ] **Step 5: Typecheck**

```bash
node_modules/.bin/tsc --noEmit > /tmp/tsc-task5.txt 2>&1; echo "exit=$?"; cat /tmp/tsc-task5.txt
```
Expected: exactly ONE error, `rename-1o8m-keys-to-mf.ts:46`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/time-off/route.ts src/app/api/time-off/route.test.ts
git commit -m "feat(time-off): refuse a submission with no holiday calendar (422)

working_days is a frozen snapshot that is never recomputed, so counting a
request against an empty holiday set writes a permanently wrong number rather
than a recoverable one. 422 because the body is well-formed and it is the
account state that blocks processing. Only POST is gated — gating PATCH or
DELETE would strand existing requests when an admin clears a calendar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `PUT /api/admin/users` — two new fields, and the whole handler audited

**Files:**
- Modify: `src/app/api/admin/users/route.ts` (177 lines; `PUT` at 67–152)
- Modify: `src/app/api/admin/users/route.test.ts` (47 lines, 3 tests → 12)

**Interfaces:**
- Consumes: `isValidTimeZone` (Task 2), `logEventAsync` (Task 1), `users.residenceTimezone` (Task 3), `isCountryCode` from `@/lib/constants` (existing).
- Produces: `PUT /api/admin/users` accepts two more optional body fields — `countryCode?: string | null` and `residenceTimezone?: string | null` — and writes one `admin_event_log` row per successful PUT with `section: "admin"`, `action: "user:update"`.

- [ ] **Step 1: Write the failing tests**

In `src/app/api/admin/users/route.test.ts`, add two mocks above the existing ones (order matters — `vi.mock` calls are hoisted, but keep them grouped at the top of the file):

```ts
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
// `after()` outside a real request scope is not something a unit test should
// depend on, so run the task immediately instead. This keeps NextResponse real.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: unknown) => { void task; }) };
});
```

Add the imports:

```ts
import { logEventAsync } from "@/lib/event-logger";
```

Replace `mockUpdateOk` with the version that supports `.returning()` (the route now needs the target's email for `resourceLabel`):

```ts
function mockUpdateOk(email = "jake@marketfoundry.agency") {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ email }]),
  };
  asMock(db.update).mockReturnValue(chain);
  return chain;
}
```

Then append these two describe blocks:

```ts
const SUPER = { user: { id: "a1", role: "admin", isSuperAdmin: true, email: "manu@marketfoundry.agency", name: "Manu Lancharro" } };

describe("PUT /api/admin/users — holiday calendar + residence timezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue(SUPER);
  });

  it("400s on a countryCode that is not a seeded calendar", async () => {
    const res = await PUT(putReq({ userId: "u2", countryCode: "UK" }));
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts a seeded calendar", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", countryCode: "PK" }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ countryCode: "PK" });
  });

  it("accepts an explicit null to clear the calendar", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", countryCode: null }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ countryCode: null });
  });

  it("400s on a typo'd timezone", async () => {
    const res = await PUT(
      putReq({ userId: "u2", residenceTimezone: "America/Los_Angles" })
    );
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  // UTC and Europe/Kyiv are both ABSENT from Intl.supportedValuesOf but both
  // accepted by DateTimeFormat. These two cases are what a membership-based
  // validator would wrongly reject.
  it("accepts UTC", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", residenceTimezone: "UTC" }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ residenceTimezone: "UTC" });
  });

  it("accepts Europe/Kyiv", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(
      putReq({ userId: "u2", residenceTimezone: "Europe/Kyiv" })
    );
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ residenceTimezone: "Europe/Kyiv" });
  });

  it("accepts an explicit null to clear the timezone", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", residenceTimezone: null }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ residenceTimezone: null });
  });
});

describe("PUT /api/admin/users — audit log (design D-F)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue(SUPER);
  });

  it("logs the actor, the target and only the fields that changed", async () => {
    mockUpdateOk("jake@marketfoundry.agency");
    await PUT(putReq({ userId: "u2", countryCode: "PK", role: "editor" }));

    expect(logEventAsync).toHaveBeenCalledTimes(1);
    expect(logEventAsync).toHaveBeenCalledWith({
      userEmail: "manu@marketfoundry.agency",
      userName: "Manu Lancharro",
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: "user",
      resourceId: "u2",
      resourceLabel: "jake@marketfoundry.agency",
      detail: { countryCode: "PK", role: "editor" },
    });
  });

  it("does not log when the request is rejected", async () => {
    const res = await PUT(putReq({ userId: "u2" }));
    expect(res.status).toBe(400); // "Nothing to update"
    expect(logEventAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run src/app/api/admin/users/route.test.ts
```
Expected: FAIL — 9 new tests fail. The calendar/timezone tests get 400 "Nothing to update" (the fields are not read yet) and the audit tests find `logEventAsync` never called. The 3 pre-existing tests must still PASS: `Tests 3 passed | 9 failed (12)`. If a pre-existing test broke, `mockUpdateOk` was changed wrongly.

- [ ] **Step 3: Extend the route**

In `src/app/api/admin/users/route.ts`:

Change the `next/server` import to `import { NextRequest, NextResponse, after } from "next/server";` and add:

```ts
import { isCountryCode } from "@/lib/constants";
import { isValidTimeZone } from "@/lib/timezones";
import { logEventAsync } from "@/lib/event-logger";
```

Add the two fields to the `PUT` destructure and its type annotation:

```ts
  const {
    userId, role, allowedSections, clientIdCode, name, asanaEmail, isSuperAdmin,
    countryCode, residenceTimezone,
  } = body as {
    userId: string;
    role?: "viewer" | "editor" | "admin" | "client" | "pending" | "prospect";
    allowedSections?: string[];
    clientIdCode?: string | null;
    name?: string | null;
    asanaEmail?: string | null;
    isSuperAdmin?: boolean;
    countryCode?: string | null;
    residenceTimezone?: string | null;
  };
```

Add the two fields to the `updates` type:

```ts
    countryCode: string | null;
    residenceTimezone: string | null;
```

Add the two validators immediately after the existing `asanaEmail` block and before the `Object.keys(updates).length === 0` check:

```ts
  // The holiday calendar. Only a calendar that has actually been seeded is
  // acceptable, and it is a POLICY assignment, not geography (design D-G):
  // a Manila-based person working US hours is legitimately 'US'.
  if (countryCode !== undefined) {
    if (countryCode !== null && !isCountryCode(countryCode)) {
      return NextResponse.json(
        { error: "countryCode must be US, PK, ES or null" },
        { status: 400 }
      );
    }
    updates.countryCode = countryCode;
  }

  // The residence zone. Validated with a try/catch around a real
  // DateTimeFormat construction, NOT membership of
  // Intl.supportedValuesOf("timeZone") — that list omits UTC, Etc/UTC,
  // Europe/Kyiv and Asia/Kolkata, all of which the runtime accepts, so a
  // membership check would reject the UTC fallback itself and would reject
  // Europe/Kyiv for a Ukraine-based team member.
  if (residenceTimezone !== undefined) {
    if (residenceTimezone !== null && !isValidTimeZone(residenceTimezone)) {
      return NextResponse.json(
        { error: "residenceTimezone must be a valid IANA time zone, or null" },
        { status: 400 }
      );
    }
    updates.residenceTimezone = residenceTimezone;
  }
```

Replace the final write and response (currently `await db.update(...); return NextResponse.json({ success: true });`) with:

```ts
  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({ email: users.email });

  // Design D-F: audit the WHOLE handler, every field. This route wrote no
  // audit log at all before, so role and super-admin grants were untracked —
  // auditing only the calendar change would have been theatre.
  //
  // Deferred with after() rather than fired-and-forgotten: this writes to
  // Postgres, and an un-awaited write is abandoned when the platform freezes
  // the sandbox, pinning a pooler slot (the 2026-08-04 outage). after() keeps
  // the invocation alive without adding response latency, and logEventAsync
  // never rejects, so a failed audit write cannot fail the update.
  after(
    logEventAsync({
      // `session.user.email` is typed `string` (non-nullable) in
      // src/types/next-auth.d.ts, so no `?? null` here. `name` IS
      // `string | null | undefined`, so it needs one.
      userEmail: session.user.email,
      userName: session.user.name ?? null,
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      resourceLabel: updated?.email,
      detail: updates,
    })
  );

  return NextResponse.json({ success: true });
```

`detail: updates` is exactly "only the field names that changed, with their new values" — `updates` is built by the partial-update pattern above and contains nothing else.

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run src/app/api/admin/users/route.test.ts
```
Expected: PASS — `Tests 12 passed (12)`.

- [ ] **Step 5: Typecheck and lint the touched paths**

```bash
node_modules/.bin/tsc --noEmit > /tmp/tsc-task6.txt 2>&1; echo "exit=$?"; cat /tmp/tsc-task6.txt
node_modules/.bin/eslint src/app/api/admin/users/route.ts src/app/api/time-off src/lib/timezones.ts src/lib/event-logger.ts src/lib/time-off/guards.ts
```
Expected: tsc = exactly ONE error (`rename-1o8m-keys-to-mf.ts:46`). eslint = clean, or only the pre-existing `react-doctor/... rule was not found` class from disable comments you did not write.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts
git commit -m "feat(admin): set holiday calendar + residence timezone, and audit the PUT

The timezone validator is a try/catch around DateTimeFormat, never membership
of Intl.supportedValuesOf — that list omits UTC and Europe/Kyiv, both of which
the runtime accepts.

Design D-F audits the whole handler, not just the calendar: it wrote no audit
log at all before, so role and super-admin grants were untracked. The write
goes through after(logEventAsync(...)) because an un-awaited Postgres write is
abandoned when the platform freezes the sandbox, pinning a pooler slot.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Admin UI — one column, both controls

**Files:**
- Create: `src/components/admin/user-timeoff-cell.tsx`
- Create: `src/components/admin/user-timeoff-cell.test.tsx`
- Modify: `src/app/admin/users/page.tsx` (1074 lines; `User` type at 122–134; the per-row `<TableCell>` block containing the client `<select>` ends ~line 450, and the client/prospect `colSpan` is on the `<TableCell>` immediately after it; `totalCols` is the `const totalCols = 6 + ALL_ROLES.length + ...` line in the `TableBody` IIFE; the `<th>` header cells are in the `<thead>` block, with the "Client" header carrying `<Building2 .../>` and the next header being `All`)

**Interfaces:**
- Consumes: `SUPPORTED_TIME_ZONES` and `isValidTimeZone` (Task 2), `users.residenceTimezone` (Task 3), the `PUT` fields (Task 6).
- Produces: `UserTimeOffCell` — a presentational component. Props:
  ```ts
  {
    countryCode: string | null;
    residenceTimezone: string | null;
    disabled?: boolean;
    onChangeCalendar: (next: string | null) => void;
    onChangeTimeZone: (next: string | null) => void;
  }
  ```
  It calls `onChangeTimeZone` only with `null` or a value `isValidTimeZone` accepts.

- [ ] **Step 1: Write the failing component test**

Create `src/components/admin/user-timeoff-cell.test.tsx`:

Note: `@testing-library/user-event` is **not** a dependency of this repo (only `@testing-library/react@^16.3.2` and `@testing-library/jest-dom@^6.9.1` are, and `jest-dom/vitest` is already wired in `src/test/setup.ts`). Drive the controls with `fireEvent`.

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserTimeOffCell } from "./user-timeoff-cell";

function setup(overrides: Partial<React.ComponentProps<typeof UserTimeOffCell>> = {}) {
  const onChangeCalendar = vi.fn();
  const onChangeTimeZone = vi.fn();
  render(
    <UserTimeOffCell
      countryCode={null}
      residenceTimezone={null}
      onChangeCalendar={onChangeCalendar}
      onChangeTimeZone={onChangeTimeZone}
      {...overrides}
    />
  );
  return { onChangeCalendar, onChangeTimeZone };
}

describe("UserTimeOffCell", () => {
  it("shows the assigned calendar and zone", () => {
    setup({ countryCode: "PK", residenceTimezone: "Asia/Karachi" });
    expect(screen.getByLabelText("Holiday calendar")).toHaveValue("PK");
    expect(screen.getByLabelText("Residence timezone")).toHaveValue("Asia/Karachi");
  });

  it("shows an empty calendar select when none is assigned", () => {
    setup();
    expect(screen.getByLabelText("Holiday calendar")).toHaveValue("");
  });

  it("reports a chosen calendar", () => {
    const { onChangeCalendar } = setup();
    fireEvent.change(screen.getByLabelText("Holiday calendar"), {
      target: { value: "PK" },
    });
    expect(onChangeCalendar).toHaveBeenCalledWith("PK");
  });

  it("reports null when the calendar is cleared", () => {
    const { onChangeCalendar } = setup({ countryCode: "PK" });
    fireEvent.change(screen.getByLabelText("Holiday calendar"), {
      target: { value: "" },
    });
    expect(onChangeCalendar).toHaveBeenCalledWith(null);
  });

  it("commits a valid zone on blur", () => {
    const { onChangeTimeZone } = setup();
    const input = screen.getByLabelText("Residence timezone");
    fireEvent.change(input, { target: { value: "Asia/Karachi" } });
    fireEvent.blur(input);
    expect(onChangeTimeZone).toHaveBeenCalledWith("Asia/Karachi");
  });

  it("commits null when the zone is cleared", () => {
    const { onChangeTimeZone } = setup({ residenceTimezone: "Asia/Karachi" });
    const input = screen.getByLabelText("Residence timezone");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChangeTimeZone).toHaveBeenCalledWith(null);
  });

  it("refuses a typo'd zone locally instead of round-tripping a 400", () => {
    const { onChangeTimeZone } = setup();
    const input = screen.getByLabelText("Residence timezone");
    fireEvent.change(input, { target: { value: "America/Los_Angles" } });
    fireEvent.blur(input);
    expect(onChangeTimeZone).not.toHaveBeenCalled();
    expect(screen.getByText(/not a recognised time zone/i)).toBeInTheDocument();
  });

  it("does not fire a mutation when the zone is unchanged", () => {
    const { onChangeTimeZone } = setup({ residenceTimezone: "Asia/Karachi" });
    fireEvent.blur(screen.getByLabelText("Residence timezone"));
    expect(onChangeTimeZone).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run src/components/admin/user-timeoff-cell.test.tsx
```
Expected: FAIL — cannot resolve `./user-timeoff-cell`.

- [ ] **Step 3: Write the component**

Create `src/components/admin/user-timeoff-cell.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { isValidTimeZone, SUPPORTED_TIME_ZONES } from "@/lib/timezones";
import { VALID_COUNTRY_CODES } from "@/lib/constants";

/**
 * The two time-off fields on a `/admin/users` row.
 *
 * Extracted from page.tsx (1074 lines) so both controls are testable and the
 * page's diff stays a single cell. They share one column because that table
 * already carries ~25 of them.
 *
 * The calendar is a fixed 3-value select because only US/PK/ES holidays are
 * seeded, and it is a POLICY assignment, not geography (design D-G).
 *
 * The zone is a free input backed by a <datalist>, not a <select>: there are
 * 418 canonical zones, which is unusable as a dropdown, and the browser gives
 * type-to-filter for free. Free text is checked here with the same
 * `isValidTimeZone` the API uses, so a typo never becomes a pointless 400.
 * The list is only a convenience — the field legitimately accepts values the
 * canonical list omits (UTC, Europe/Kyiv), which is exactly why validation is
 * never membership of that list.
 */
export function UserTimeOffCell({
  countryCode,
  residenceTimezone,
  disabled = false,
  onChangeCalendar,
  onChangeTimeZone,
}: {
  countryCode: string | null;
  residenceTimezone: string | null;
  disabled?: boolean;
  onChangeCalendar: (next: string | null) => void;
  onChangeTimeZone: (next: string | null) => void;
}) {
  const [zone, setZone] = useState(residenceTimezone ?? "");
  const [invalid, setInvalid] = useState(false);

  // Re-sync when the server value changes under us (a refetch after a
  // sibling mutation), mirroring EditableName/EditableAsanaEmail in page.tsx.
  useEffect(() => {
    setZone(residenceTimezone ?? "");
    setInvalid(false);
  }, [residenceTimezone]);

  function commitZone() {
    const trimmed = zone.trim();
    if (trimmed === (residenceTimezone ?? "")) {
      setInvalid(false);
      return;
    }
    if (trimmed === "") {
      setInvalid(false);
      onChangeTimeZone(null);
      return;
    }
    if (!isValidTimeZone(trimmed)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChangeTimeZone(trimmed);
  }

  const fieldCls =
    "w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none disabled:opacity-50";

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Holiday calendar"
        value={countryCode ?? ""}
        disabled={disabled}
        onChange={(e) => onChangeCalendar(e.target.value || null)}
        className={`${fieldCls} cursor-pointer`}
      >
        <option value="">— none —</option>
        {VALID_COUNTRY_CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
      <input
        aria-label="Residence timezone"
        list="iana-time-zones"
        value={zone}
        disabled={disabled}
        placeholder="UTC"
        onChange={(e) => setZone(e.target.value)}
        onBlur={commitZone}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitZone();
          if (e.key === "Escape") {
            setZone(residenceTimezone ?? "");
            setInvalid(false);
          }
        }}
        className={`${fieldCls} ${invalid ? "border-destructive" : ""}`}
      />
      {invalid && (
        <span className="text-[10px] leading-tight text-destructive">
          Not a recognised time zone
        </span>
      )}
      <datalist id="iana-time-zones">
        {SUPPORTED_TIME_ZONES.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
    </div>
  );
}
```

`VALID_COUNTRY_CODES` is already exported from `src/lib/constants.ts:214`. The `focus:border-brand` / `border-border` / `bg-background` classes are copied from the sibling client `<select>` in `page.tsx`, so this cell matches the page byte-for-byte rather than introducing a third input style — `/admin/users` is a hub page, so Burnt Orange focus is the correct accent per DESIGN.md's dual-accent rule.

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run src/components/admin/user-timeoff-cell.test.tsx
```
Expected: PASS — `Tests 8 passed (8)`.

- [ ] **Step 5: Wire it into `page.tsx`**

Five edits, all additive except the two arithmetic bumps:

1. Add the import next to the other component imports:
```tsx
import { UserTimeOffCell } from "@/components/admin/user-timeoff-cell";
```

2. Add two fields to the `User` type (after `asanaEmail: string | null;`):
```tsx
  countryCode: string | null;
  residenceTimezone: string | null;
```
The page's `["admin-users"]` query does `SELECT *` server-side (`GET` is `db.select().from(users)`), so both fields arrive with no query change.

3. Add two mutations, immediately after `asanaEmailMutation`, copying its exact shape:
```tsx
  const calendarMutation = useMutation({
    mutationFn: async ({ userId, countryCode }: { userId: string; countryCode: string | null }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, countryCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update holiday calendar");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Holiday calendar updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const timeZoneMutation = useMutation({
    mutationFn: async ({ userId, residenceTimezone }: { userId: string; residenceTimezone: string | null }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, residenceTimezone }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update timezone");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Timezone updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
```

4. Add the header cell. In the `<thead>` block, immediately **after** the "Client" `<th>` (the one containing `<Building2 …/>` and `<span>Client</span>`) and **before** the `<th>…>All</th>`, insert:
```tsx
                <th className="text-foreground/80 h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-36">
                  <div className="flex items-center gap-1.5"><CalendarDays className="size-3.5 text-muted-foreground" /><span>Time off</span></div>
                </th>
```
`CalendarDays` comes from `lucide-react`; add it to the existing `lucide-react` import list if it is not already there.

5. Add the body cell and fix the arithmetic. In the row renderer, immediately after the `</TableCell>` that closes the Client cell and **before** the `{user.role === "client" || user.role === "prospect" ? (` ternary, insert:
```tsx
        <TableCell className="align-top">
          {user.role === "client" || user.role === "prospect" ? (
            <span className="text-xs text-muted-foreground/40">—</span>
          ) : (
            <UserTimeOffCell
              countryCode={user.countryCode}
              residenceTimezone={user.residenceTimezone}
              disabled={calendarMutation.isPending || timeZoneMutation.isPending}
              onChangeCalendar={(countryCode) => calendarMutation.mutate({ userId: user.id, countryCode })}
              onChangeTimeZone={(residenceTimezone) => timeZoneMutation.mutate({ userId: user.id, residenceTimezone })}
            />
          )}
        </TableCell>
```
Then bump `totalCols` by one: change `const totalCols = 6 + ALL_ROLES.length + (isSuperAdmin ? 1 : 0) + 1 + 1 + CONFIGURABLE_SECTIONS.length + 2 + 1;` to `const totalCols = 7 + ALL_ROLES.length + ...` (same expression, leading `6` → `7`).

The new cell sits **outside** the client/prospect ternary and renders a dash for those roles, so the existing `colSpan={1 + CONFIGURABLE_SECTIONS.length}` needs **no** change — verify that by counting: the client/prospect branch still covers exactly "All" + the section columns.

- [ ] **Step 6: Verify the page compiles and the row arithmetic is right**

```bash
node_modules/.bin/tsc --noEmit > /tmp/tsc-task7.txt 2>&1; echo "exit=$?"; cat /tmp/tsc-task7.txt
node_modules/.bin/eslint src/app/admin/users/page.tsx src/components/admin/user-timeoff-cell.tsx
```
Expected: tsc = exactly ONE error (`rename-1o8m-keys-to-mf.ts:46`). eslint = clean apart from the four pre-existing `eslint-disable` lines at the top of `page.tsx`, which you did not write.

Then check the header/body column counts match by eye: every `<th>` in `<thead>` must have exactly one `<TableCell>` (or be covered by a `colSpan`) in **both** row branches. A mismatch renders as a visibly skewed table.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/user-timeoff-cell.tsx src/components/admin/user-timeoff-cell.test.tsx src/app/admin/users/page.tsx
git commit -m "feat(admin): holiday-calendar + timezone controls on the users table

One new column holding both controls, extracted into UserTimeOffCell so they
are testable and page.tsx's diff is a single cell — that table already carries
~25 columns and page.tsx is 1074 lines.

The zone control is an input + datalist rather than a 418-option select: the
browser gives type-to-filter for free, and the field legitimately accepts
values the canonical list omits (UTC, Europe/Kyiv), which is why the same
try/catch validator runs client-side too.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Whole-branch verification and ledger update

**Files:**
- Modify: `.superpowers/sdd/2026-08-03-team-calendar-time-off-holidays/progress.md` (**do NOT commit — `.superpowers/*` is excluded from every commit**)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing in code. A recorded verification baseline and the handoff state.

- [ ] **Step 1: Predict, then run the full new surface**

Write the prediction down **before** running: **115 tests across 9 files** — 27 working-days + 35 guards + 13 email + 7 timezones + 5 event-logger + 4 cancel-route + 4 post-route + 12 admin-users-route + 8 user-timeoff-cell.

```bash
node_modules/.bin/vitest run \
  src/lib/time-off/ \
  src/lib/email.test.ts \
  src/lib/timezones.test.ts \
  src/lib/event-logger.test.ts \
  src/app/api/time-off/ \
  src/app/api/admin/users/ \
  src/components/admin/user-timeoff-cell.test.tsx
```
Expected: `Test Files 9 passed (9)`, `Tests 115 passed (115)`. Any other number means a test was dropped, duplicated, or silently skipped — investigate before claiming done.

- [ ] **Step 2: Confirm the spec's own scoped prediction still holds**

```bash
node_modules/.bin/vitest run src/lib/time-off/ src/lib/email.test.ts
```
Expected: `Tests 75 passed (75)` — the spec §6 prediction of 72 → ~75, hit exactly.

- [ ] **Step 3: Final unfiltered typecheck**

```bash
node_modules/.bin/tsc --noEmit > /tmp/tsc-final.txt 2>&1; echo "exit=$?"; cat /tmp/tsc-final.txt
```
Expected: exactly ONE error — `scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46` TS2349. Judge **by filename**. Do not report a count without the filenames.

- [ ] **Step 4: Prove `todayInCountry` is gone and nothing still references it**

```bash
grep -rn "todayInCountry\|COUNTRY_TIME_ZONES" src/ ; echo "exit=$?"
grep -rn "logAdminEvent" src/ ; echo "exit=$?"
```
Expected: both grep exit `1` with no output. A hit means a call site was missed.

- [ ] **Step 5: Confirm the branch is still provably additive where it claims to be**

```bash
git diff --stat d2e1327c..HEAD
grep -rn "DROP COLUMN\|DROP TABLE\|ALTER COLUMN\|RENAME" drizzle/migrations/0088_user_residence_timezone.sql ; echo "exit=$?"
```
Expected: the grep exits `1` (0088 is a single `ADD COLUMN`). The diffstat should show 8 files created and 6 modified, and no deletions outside `guards.ts` / `guards.test.ts` (where `COUNTRY_TIME_ZONES` and the old describe block were deliberately removed).

- [ ] **Step 6: Record the verification baseline in the ledger, then commit only the code**

Append a section to `.superpowers/sdd/2026-08-03-team-calendar-time-off-holidays/progress.md` recording: the 115/115 and 75/75 numbers as measured (not predicted), the one-error tsc baseline by filename, that 0088 is **written but NOT applied**, the two approved spec amendments and why, and the rollout order below. `.superpowers/*` stays uncommitted per the global constraints — the ledger is a working note, not a branch artifact.

```bash
git status --short
```
Expected: only `.superpowers/…/progress.md` modified and the 7 pre-existing untracked probe scripts in `scripts/`. Nothing else uncommitted. **Do not** `git add` either.

---

## Rollout — Manu's steps, in this order, each needing its own OK

Amendment 2 swaps the spec's steps 2 and 3. `working_days` is an integer snapshot computed at submission and never recomputed, so this order is load-bearing, not a preference.

1. **Get the direct connection string.** Supabase dashboard → Project Settings → Database → Direct connection. Add it to `.env.local` as `DIRECT_DATABASE_URL` — Manu does this himself, `.env` commands are hard-blocked for Claude. `DATABASE_URL` is the Supavisor transaction pooler on port 6543 and is the wrong endpoint for DDL; it dropped one 0087 attempt mid-run with `CONNECTION_CLOSED`.
2. **Pre-flight `pg_locks`** with `scripts/_diag2.ts` and run into a window with no lock holders. Ignore that script's naive "PARTIAL STATE — DO NOT RERUN" verdict line; it is meaningless post-0087.
3. **Apply 0088** — `npx tsx scripts/_apply-0088.ts`. Production schema change, needs its own explicit OK. The lock wait, not the DDL, is the entire risk; the 3s `lock_timeout` caps it and the 6× retry absorbs a lost race. **Never** raise `statement_timeout` to "fix" a lock wait — that lengthens the stall.
4. **Answer the holiday-days question**, then **seed the corrected holiday list** (`scripts/seed-public-holidays.ts`, 66 rows into an empty table, own OK required). This now comes **before** step 5.
5. **Assign both fields for the 14 MF staff** through `/admin/users`. Because the calendars are already seeded, D-C's 422 now genuinely makes this self-enforcing: a person with no calendar cannot submit, and a person with a calendar has real holidays behind it.
6. **Only then** ship any submit UI (the Tasks 8–9 re-plan).

**Tell Thread C it loses 0088 as well as 0087.**

## Deliberately not fixed — recorded, not swept

- `PUT /api/admin/users` returns `{ success: true }` for a `userId` that does not exist. Now visible because Task 6 adds `.returning()`, but pre-existing, and adding a 404 changes existing API behaviour the spec did not authorize.
- The other 11 `logEvent` call sites stay fire-and-forget. Same bug class, out of scope, and Thread G deliberately left them; Thread G's static guard (`src/lib/sales-cache.awaited.test.ts`, arriving on merge from `main`) lists only 4 helpers and will not flag them.
- `countWorkingDays` hardcodes a Sat/Sun weekend. Correct for US, PK and ES; would only break on a Gulf hire (Fri/Sat).
- The admin user-deletion 500 (`timeEntries.userId` is notNull with NO ACTION over ~15,300 rows, so it already 500s on `main` today).
- The `#F8BF1D` vs `#FAC800` email palette question — all six builders or none.

## Self-review against the spec

| Spec section | Covered by |
|---|---|
| §3 migration 0088 + nullability asymmetry | Task 3 (SQL, schema comment documenting both halves) |
| §3 applying 0088 (guard pattern, direct connection) | Task 3 Step 3 + Rollout 1–3 |
| §4.1 `schema.ts` | Task 3 Step 2 |
| §4.2 `todayInZone` + UTC fallback + retained internal throw | Task 2 Step 7 |
| §4.3 `queries.ts` / `working-days.ts` / `constants.ts` unchanged | No task touches them (`timezones.ts` is a new file precisely so this stays true) |
| §4.4 `[id]/route.ts` | Task 4 |
| §4.5 POST 422, no-users-row case, POST-only gating | Task 5 |
| §4.6 both PUT validators, try/catch not membership | Task 6 |
| §4.7 audit log (as amended: `logEventAsync` inside `after()`) | Tasks 1 + 6 |
| §4.8 admin UI controls | Task 7 |
| §5 rollout order (as amended: seed before assign) | Rollout section |
| §6 testing, 32 → 35, 72 → 75, route-level tests, tsc baseline | Tasks 2, 4, 5, 6, 8 |
| §7 out of scope | "Deliberately not fixed" |
| §8 constraints carried in | Global Constraints |
