# Time-off Cancel + Approver Revoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an approver "Revoke" path for approved time off of any date, and restore the "My requests" section that both prior plans dropped.

**Architecture:** Two acts, separated at the transport layer. The owner's no-note self-cancel uses the existing, untouched `DELETE /api/time-off/[id]`. The approver's revoke becomes a third verb on `PATCH /api/time-off/[id]`, because `PATCH` already performs the attribution, note handling and decision email the ruling requires. A new pure guard `canRevoke` joins `canCancel` in `guards.ts`, and both are imported by the client so button visibility and server enforcement share one definition.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM + PostgreSQL (Supabase), TanStack Query, Vitest + Testing Library, shadcn/ui (Radix), Tailwind CSS 4, Resend.

**Spec:** `docs/superpowers/specs/2026-08-10-time-off-cancel-and-revoke-design.md` — read it before Task 1, then read the Amendment Log below, which **overrides** the spec wherever the two disagree.

---

## AMENDMENT LOG — 2026-08-10, before any code was written

**Read this before anything else. The original version of this plan was diagnosed against a stale
checkout and roughly 40% of it was already shipped or obsolete.**

The spec's §1.1 diagnosis ("there is no cancel UI anywhere in the app", "`RequestsList.tsx` is 66
lines and contains no button of any kind") was true when the grep ran, and **false by the time the
spec was committed**. Commit `e2842686` — *"feat(team,time-off): approved PTO detail, edit/cancel,
calendar on team page"*, authored Fri 7 Aug 18:53 by Manu, co-authored by Cursor — is an **ancestor**
of the spec commit `c893a46d` and already shipped:

- the owner **Cancel** button (`Cancel request`) on own pending / future-approved rows,
- an owner **Edit** dialog plus a whole new `PUT /api/time-off/[id]` handler and `put.route.test.ts`,
- the `currentUserId` / `today` / `onCancel` / `onEdit` props on `RequestsList`,
- server-computed `today` in the `GET /api/time-off` payload.

The spec session evidently grepped before pulling that commit. Verified state at `c3420e96`:

| Original task | Verdict | Evidence |
|---|---|---|
| 1 — `canRevoke` guard | **Valid, unchanged** | zero hits for `canRevoke` in `src/` |
| 2 — email `cancelled` case | **Valid, but gains tests** | `email.ts:277-283` still `"approved" \| "denied"`; `Note from Jake` still at `:330`. The plan assumed no email tests existed — **`src/lib/email.test.ts` exists with 13 tests**, including a `buildTimeOffDecisionEmail` block. |
| 3 — GET returns `residenceTimezone` | **WITHDRAWN** | `route.ts:62` already selects `residenceTimezone` and `:70` already computes `today = todayInZone(me?.residenceTimezone ?? null, new Date())`, returning `today` in the body. Ruling R6's goal is met, and met *better* server-side. Adding the raw zone would be a dead payload key and moving the computation client-side would be a regression. |
| 4 — PATCH accepts `cancelled` | **Valid, unchanged** | `[id]/route.ts:59` rejects it, `:78` hardcodes `!== "pending"`, `:95` pins `"pending"` |
| 5 — `RequestsList` controls | **Rescoped to Revoke only** | Cancel + Edit already shipped at `RequestsList.tsx:109-152`. File is **238 lines, not 66**; its test file has **12 tests, not 8**, and already contains 3 of the 4 cancel tests the plan wanted. |
| 6 — "My requests" section | **Valid, simplified** | zero hits for `My requests`; still genuinely missing. But the handler wiring, `currentUserId` and `today` plumbing already exist in `page.tsx:123-128`, so Steps 3–4 shrink to almost nothing. |
| 7 — manual verification | **Valid; Steps 1–3 are Manu's** | needs his login |

**Other stale facts corrected here:**

- `[id]/route.ts` now exports **three** handlers — `PATCH` (:38), `PUT` (:141), `DELETE` (:324). The
  plan predates `PUT`. **`PUT` and `DELETE` are both out of scope and must not be modified**, and
  `put.route.test.ts` (4 tests) must keep passing.
- `[id]/route.test.ts`'s 4 existing tests are all **`DELETE` day-boundary** tests; the file imports
  only `DELETE` and has **no PATCH coverage at all**. Task 4 adds the first.
- The shipped Cancel button uses `window.confirm` and `size="xs"` + `text-destructive`, **not** the
  plan's `AlertDialog` + `size="sm"` + `text-red-500`. Task 5 matches the shipped file's idiom.
- Baseline established in this worktree before any edit: **119 tests passing** across the 10 scoped
  files, **132** including `src/lib/email.test.ts`.

**What did NOT change:** every locked decision and ruling R1–R7 stands. `canCancel` and its six tests
are still untouched. D10 is still reversed for approvers only. Revoke still goes on `PATCH`, still
reuses `cancelled` with a mandatory note and re-pointed `decided_by`, still no schema change.

---

## Global Constraints

- Worktree: `/Users/manu/MFHub/.worktrees/time-off-revoke`, branch `feat/time-off-revoke`, off `c3420e96`.
  `node_modules` is a **symlink** to `/Users/manu/MFHub/node_modules`, so `npx vitest` and
  `node_modules/.bin/tsc` work from the worktree. **Never run `npm install`** — it would mutate the
  main repo's tree.
- **NEVER** push, deploy, write to prod, merge to main, or change the schema without Manu's explicit
  per-action OK. This plan requires none of those.
- Additive only. **No schema change and no new status enum value.**
- `/Users/manu/MFHub/node_modules/.bin/tsc --noEmit` is run **UNFILTERED** and judged **BY FILENAME**
  against the baseline recorded in Task 0. **The exit code is NOT the signal** — identical output at
  exit 1 and exit 2.
- **NEVER** run `next build`.
- vitest does not typecheck — always follow vitest with tsc.
- **Predict every test count before running it.** Counts are given per task.
- Mutation-prove each new test: break the implementation, confirm exactly the predicted tests fail,
  revert **with Edit** (`git checkout -- <path>` and `git stash` are BLOCKED), re-run.
- `rm -r` / `rm -f` are BLOCKED.
- **NEVER `git add .`** — explicit pathspec on both `add` and `commit`, with `-m` BEFORE `--`. One
  task per commit.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Dates are `YYYY-MM-DD` **strings** across module boundaries, never `Date`.
- Read `DESIGN.md` before any visual decision. Destructive actions use `--brand-red` `#FF5C5F`
  (`DESIGN.md:89`); modals stay `bg-white dark:bg-zinc-900` (`DESIGN.md:154,177`).
- **Do not modify** `canCancel` or its six tests in `guards.test.ts`. Their passing unmodified is the
  regression signal that D10 was not widened for owners.
- **Do not modify** `DELETE /api/time-off/[id]` or `PUT /api/time-off/[id]`.
- **Do not remove or weaken anything `e2842686` shipped** — Cancel, Edit, the `PUT` route, or the
  server-computed `today`. Approvers and admins must not lose the Cancel/Edit they have today; the
  restructure in Task 6 moves those controls into "My requests", it does not delete them.
- Do not "fix" the deliberate mismatch between the queue gate (`role === "admin"`) and the badge gate
  (`isApprover`).
- Do not widen the shared `sendEmail` helper.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/time-off/guards.ts` | Modify | Add `canRevoke`. Policy definition, pure, shared by client and server. |
| `src/lib/time-off/guards.test.ts` | Modify | 37 → 42 tests. |
| `src/lib/email.ts` | Modify | Widen decision email to a `cancelled` case; fix the stale "Note from Jake". |
| `src/lib/email.test.ts` | Modify | 13 → 16 tests. |
| `src/app/api/time-off/[id]/route.ts` | Modify | `PATCH` accepts `status: "cancelled"` from an approver, note required. |
| `src/app/api/time-off/[id]/route.test.ts` | Modify | 4 → 11 tests. |
| `src/app/calendar/requests/_components/RequestsList.tsx` | Modify | Add the optional Revoke control. |
| `src/app/calendar/requests/_components/RequestsList.test.tsx` | Modify | 12 → 16 tests. |
| `src/app/calendar/requests/page.tsx` | Modify | Restore "My requests"; wire `onRevoke`. |
| `src/app/calendar/requests/page.test.tsx` | Modify | 5 → 7 tests. |

`src/app/api/time-off/route.ts` is **not** in this table — original Task 3 is withdrawn.

Task order is dependency order: guards → email → API → component → page.

---

### Task 0: tsc baseline — ALREADY MEASURED, do not re-derive

Run in this worktree at `c3420e96` before any edit. The baseline is **exactly ONE error**, and it is
the only acceptable output of every later `tsc` step:

```
scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts(46,28): error TS2349: This expression is not callable.
  Type 'TransactionSql<{}>' has no call signatures.
```

Judge **by filename**: no file this plan touches may ever appear. The known `.next/dev/types` TS2344
error on `api/hours/route` does **not** appear here because no dev server has run in this worktree —
if it shows up later, that is why, and it is not caused by this work. Ignore the exit code entirely.

---

### Task 1: `canRevoke` guard

**Files:**
- Modify: `src/lib/time-off/guards.ts` (append after `canCancel`, which ends at line 65)
- Test: `src/lib/time-off/guards.test.ts` (append a new `describe` after the `canCancel` block)

**Interfaces:**
- Consumes: nothing.
- Produces: `canRevoke(status: string): boolean` — exported from `@/lib/time-off/guards`. Used by
  Task 4 (PATCH route) and Task 5 (RequestsList).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/time-off/guards.test.ts`. Add `canRevoke` to the existing import from `"./guards"`.

```ts
describe("canRevoke", () => {
  it("allows revoking an approved request", () => {
    expect(canRevoke("approved")).toBe(true);
  });

  // Deliberately date-free: an approver may revoke approved leave whether it
  // starts tomorrow, is in progress, or finished last month (ruling R4).
  it("allows revoking an approved request regardless of its dates", () => {
    expect(canRevoke("approved")).toBe(true);
  });

  it("rejects revoking a pending request", () => {
    // Pending already has Deny, which sends its own decision email.
    expect(canRevoke("pending")).toBe(false);
  });

  it("rejects revoking a denied request", () => {
    expect(canRevoke("denied")).toBe(false);
  });

  it("rejects revoking an already-cancelled request", () => {
    expect(canRevoke("cancelled")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/time-off/guards.test.ts`
Expected: FAIL. `canRevoke is not a function` (or a TS resolution error on the import).

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/time-off/guards.ts`, after `canCancel`:

```ts
/**
 * Whether an approver may revoke a request.
 *
 * Approved only — pending already has Deny, and denied/cancelled are terminal.
 *
 * Deliberately takes no date. Spec D10 ("once time off has begun, undoing it
 * is a conversation, not a button") still governs the OWNER path in
 * `canCancel` and is unchanged; it was reversed for approvers only on
 * 2026-08-10, so an approver may revoke approved leave of any date. The
 * required decision note is what carries the conversation D10 assumed.
 *
 * Approver authority is enforced at the route, not here — mirroring
 * `canCancel`, which likewise does not check ownership.
 *
 * Consequence, intended and not an oversight: an approver who is also the
 * requester can revoke their own already-started leave, because the owner
 * path rejects it first and this path then accepts it.
 */
export function canRevoke(status: string): boolean {
  return status === "approved";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/time-off/guards.test.ts`
**Predicted count: 42 passed** (37 existing + 5 new `it` blocks). If the run reports anything else,
stop and investigate rather than adjusting the number afterwards.

- [ ] **Step 5: Mutation-prove the new tests**

Edit `guards.ts` to `return status === "pending";`. Re-run.
Expected: exactly **3 failures** — `allows revoking an approved request`, `allows revoking an
approved request regardless of its dates`, `rejects revoking a pending request`. 39 pass.
Revert **with Edit** back to `status === "approved"`. Re-run: 42 passed.

- [ ] **Step 6: Typecheck**

Run: `/Users/manu/MFHub/node_modules/.bin/tsc --noEmit`
Expected: the Task 0 baseline, unchanged. Neither `guards.ts` nor `guards.test.ts` may appear.
Ignore the exit code.

- [ ] **Step 7: Commit**

```bash
git add src/lib/time-off/guards.ts src/lib/time-off/guards.test.ts
git commit -m "feat(time-off): add canRevoke guard

Approver-only reversal of D10. canCancel and its six tests are untouched;
the owner cancel window is unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/time-off/guards.ts src/lib/time-off/guards.test.ts
```

---

### Task 2: Decision email gains a `cancelled` case

**Files:**
- Modify: `src/lib/email.ts` — `TimeOffEmailDecision` (line 277) and `buildTimeOffDecisionEmail`
  (line 320; the `Note from Jake` string is at line 330)
- Test: `src/lib/email.test.ts` (13 existing tests; the `buildTimeOffDecisionEmail` block starts at
  line 72 and has 4)

**Interfaces:**
- Consumes: nothing.
- Produces: `buildTimeOffDecisionEmail(r: TimeOffEmailDecision)` where `TimeOffEmailDecision.status`
  is now `"approved" | "denied" | "cancelled"`. Returns `{ subject, html }` as before. Used by Task 4.

- [ ] **Step 1: Read the current implementation and its tests**

Read `src/lib/email.ts:277-356` and `src/lib/email.test.ts:72-100`. Note the existing shape:
`approved` is derived as `r.status === "approved"`, and `label` / `color` / the subject verb all
branch off that single boolean. Match the test file's existing fixture style.

- [ ] **Step 2: Write the failing tests**

Append three tests inside the existing `describe("buildTimeOffDecisionEmail", ...)` block:

```ts
  it("says revoked in the subject when cancelled", () => {
    // status 'cancelled' -> subject matches /revoked/i and NOT /denied/i
  });

  it("labels a cancelled decision Revoked in the body", () => {
    // html contains "Time Off Revoked" and the --brand-red #FF5C5F token
  });

  // email.ts:330 hardcoded "Note from Jake", false since D2 was reversed to
  // two approvers on 2026-08-07.
  it("attributes the note to the approver rather than naming Jake", () => {
    // with a decisionNote: html matches /note from your approver/i
    // and does NOT match /jake/i
  });
```

Fill the bodies against the file's established fixture helper.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/email.test.ts`
Expected: the 3 new tests FAIL. The "Jake" test fails on the current literal; the other two fail on
the two-way branch. A TS error on `status: "cancelled"` is also an acceptable red.

- [ ] **Step 4: Widen the type and the branching**

Change `TimeOffEmailDecision.status` to `"approved" | "denied" | "cancelled"`.

Replace the `approved` / `label` / `color` derivation with a three-way map. DESIGN.md tokens
(`DESIGN.md:89`): `--brand-green` `#34C759` for approved, `--brand-red` `#FF5C5F` for both denied
and revoked. Hex stays hardcoded because email clients do not support CSS custom properties — keep
the existing comment explaining this.

```ts
const LABELS = {
  approved: "Approved",
  denied: "Denied",
  cancelled: "Revoked",
} as const;
const COLORS = {
  approved: "#34C759",
  denied: "#FF5C5F",
  cancelled: "#FF5C5F",
} as const;
const SUBJECT_VERBS = {
  approved: "approved",
  denied: "denied",
  cancelled: "revoked",
} as const;
const label = LABELS[r.status];
const color = COLORS[r.status];
```

Subject becomes:

```ts
subject: `[MarketFoundry Hub] Your time off was ${SUBJECT_VERBS[r.status]} — ${r.startDate} to ${r.endDate}`,
```

The heading `Time Off ${label}` needs no edit — with `label` now "Revoked" it reads "Time Off
Revoked", which is correct.

- [ ] **Step 5: Fix the stale approver name**

Replace the `Note from Jake` literal at `email.ts:330` with `Note from your approver`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/email.test.ts`
**Predicted count: 16 passed** (13 existing + 3 new).

- [ ] **Step 7: Mutation-prove**

Set `SUBJECT_VERBS.cancelled` to `"denied"`. Re-run. Expected: exactly **1 failure** — `says revoked
in the subject when cancelled`. Revert **with Edit**. Then revert `Note from your approver` to `Note
from Jake`: expected exactly **1 failure** — the attribution test. Revert **with Edit**. Re-run: 16
passed.

- [ ] **Step 8: Typecheck**

Run: `/Users/manu/MFHub/node_modules/.bin/tsc --noEmit`
Expected: the Task 0 baseline. `email.ts` must not appear. Widening a union is
backwards-compatible, so `[id]/route.ts` must not appear either.

- [ ] **Step 9: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat(time-off): add revoked case to the decision email

Also fixes the hardcoded 'Note from Jake', false since D2 was reversed to
two approvers on 2026-08-07.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/lib/email.ts src/lib/email.test.ts
```

---

### ~~Task 3: GET `/api/time-off` returns `residenceTimezone`~~ — WITHDRAWN

**Do not implement.** `src/app/api/time-off/route.ts:61-75` already selects `residenceTimezone` and
already returns a server-computed `today`:

```ts
const today = todayInZone(me?.residenceTimezone ?? null, new Date());
return NextResponse.json({ requests: rows, countryCode: ..., today });
```

Ruling R6 asked that client-side button visibility match server enforcement exactly. Computing
`today` on the server and shipping the string satisfies that more strictly than shipping the raw zone
and recomputing in the browser. `src/app/api/time-off/route.ts` is not modified by this plan.

---

### Task 4: PATCH accepts `status: "cancelled"` from an approver

**Files:**
- Modify: `src/app/api/time-off/[id]/route.ts` — the `PATCH` handler, lines 38–139 **only**. `PUT`
  (:141) and `DELETE` (:324) are out of scope.
- Test: `src/app/api/time-off/[id]/route.test.ts` (4 existing tests, all `DELETE`)

**Interfaces:**
- Consumes: `canRevoke` from Task 1; the widened `buildTimeOffDecisionEmail` from Task 2.
- Produces: `PATCH /api/time-off/[id]` accepting
  `{ status: "approved" | "denied" | "cancelled", decisionNote?: string }`. `cancelled` requires a
  non-blank `decisionNote`. Consumed by Task 6.

- [ ] **Step 1: Read the existing harness**

Read the whole of `src/app/api/time-off/[id]/route.test.ts`. It **imports only `DELETE`** — you are
adding the file's first `PATCH` coverage, so `import { DELETE, PATCH } from "./route";`. Reuse its
existing helpers verbatim rather than inventing new ones:
- `mockSelects(...results)` queues the results of successive
  `db.select().from().where().limit(1)` calls. `PATCH` makes **two**: the request row, then the
  requester's `{ email }`.
- `mockUpdateOk()` stubs `db.update().set().where().returning()`.
- `asMock(getAuthSession).mockResolvedValue(...)`.
- `@/lib/email` is already fully mocked at the top of the file, so
  `buildTimeOffDecisionEmail` is a `vi.fn()` you can assert on.

Two gate facts the tests must respect: `PATCH` requires **both** `canSubmitTimeOff(role)` (so
`admin` or `editor`) **and** `isApprover(email)`. Use a real approver address from
`TIME_OFF_APPROVER_EMAILS` — `jake@marketfoundry.agency` or `manu@marketfoundry.agency`.

- [ ] **Step 2: Write the failing tests**

```ts
describe("PATCH revoke", () => {
  it("lets an approver revoke an approved request", async () => {
    // approver session; existing row status 'approved'; note supplied
    // expect 200; assert db.update's set() payload carries status 'cancelled'
    // and decidedBy === the approver's user id; assert
    // buildTimeOffDecisionEmail was called with status 'cancelled'
  });

  it("rejects a revoke from a non-approver", async () => {
    // role admin but email not in TIME_OFF_APPROVER_EMAILS -> 403
  });

  it("rejects a revoke with no note", async () => {
    // approver session, decisionNote omitted -> 400, db.update not called
  });

  it("rejects a revoke with a whitespace-only note", async () => {
    // decisionNote '   ' -> 400
  });

  it("rejects revoking a pending request", async () => {
    // existing row status 'pending', target 'cancelled' -> 409
  });

  it("rejects revoking an already-cancelled request", async () => {
    // existing row status 'cancelled' -> 409
  });
});

// Ruling R7 (2026-08-10): self-approval is DELIBERATELY allowed. Both
// permanent approvers are also requesters, and blocking it would make each a
// hard dependency for the other's time off. This test pins the behaviour so a
// future reader does not "fix" it.
it("lets an approver decide their own request", async () => {
  // session user id === existing.userId, status pending, target 'approved'
  // -> 200
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/time-off/[id]/route.test.ts"`
Expected: the 6 revoke tests FAIL (400 from the status validator rejecting `"cancelled"`). The
self-approval test may already PASS — correct and expected; it pins existing behaviour rather than
driving new code.

- [ ] **Step 4: Widen the status validator**

Replace the check at lines 59–66:

```ts
  if (status !== "approved" && status !== "denied" && status !== "cancelled") {
    return NextResponse.json(
      { error: "status must be 'approved', 'denied' or 'cancelled'" },
      { status: 400 }
    );
  }
  const decisionNote =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null;

  // A revocation must say why (ruling R3) — it is the substitute for the
  // conversation D10 assumed would happen off-system.
  if (status === "cancelled" && !decisionNote) {
    return NextResponse.json(
      { error: "A note is required when revoking approved time off" },
      { status: 400 }
    );
  }
```

- [ ] **Step 5: Make the state guard target-aware**

Replace the guard at lines 77–83:

```ts
  // pending -> approved/denied is the original decision. approved -> cancelled
  // is an approver revoking already-granted leave (D10 reversed for approvers
  // on 2026-08-10). Everything else is a stale link or a double-click.
  const allowed =
    status === "cancelled"
      ? canRevoke(existing.status)
      : existing.status === "pending";

  if (!allowed) {
    return NextResponse.json(
      { error: `Request is already ${existing.status}` },
      { status: 409 }
    );
  }
```

Add `canRevoke` to the existing import from `@/lib/time-off/guards` at lines 13–19.

- [ ] **Step 6: Generalise the conditional update**

The update at lines 85–97 pins `eq(timeOffRequests.status, "pending")`. Change **that one clause** to
`eq(timeOffRequests.status, existing.status)` so it pins whatever status was read. Everything else —
`decidedBy: session.user.id`, `decidedAt`, `decisionNote`, `updatedAt` — is already correct for a
revoke and re-points attribution to the approver exactly as ruling R3 requires.

Also update the stale header comment at line 37 (`— approve or deny. Jake only (spec D2).`) to name
the third verb and the two approvers.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/time-off/[id]/route.test.ts"`
**Predicted count: 11 passed** (4 existing DELETE + 6 revoke + 1 self-approval).

Then confirm the neighbouring file is unharmed:
Run: `npx vitest run "src/app/api/time-off/[id]/put.route.test.ts"` — **predicted 4 passed**.

- [ ] **Step 8: Mutation-prove**

Edit the guard so the `cancelled` branch reads `existing.status === "pending"` instead of
`canRevoke(existing.status)`. Re-run.
Expected: exactly **2 failures** — `lets an approver revoke an approved request` and `rejects
revoking a pending request`. Revert **with Edit**, re-run: 11 passed.

- [ ] **Step 9: Typecheck**

Run: `/Users/manu/MFHub/node_modules/.bin/tsc --noEmit`
Expected: the Task 0 baseline.

- [ ] **Step 10: Commit**

```bash
git add "src/app/api/time-off/[id]/route.ts" "src/app/api/time-off/[id]/route.test.ts"
git commit -m "feat(time-off): let approvers revoke approved requests via PATCH

Revoke reuses the cancelled status with decided_by re-pointed to the
approver and a mandatory note. DELETE stays the owner's no-note self-cancel
and PUT stays the owner's edit; both are untouched. Also pins deliberate
self-approval with a test (R7).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- "src/app/api/time-off/[id]/route.ts" "src/app/api/time-off/[id]/route.test.ts"
```

---

### Task 5: `RequestsList` gains an optional Revoke control

**Files:**
- Modify: `src/app/calendar/requests/_components/RequestsList.tsx` (**238 lines**)
- Test: `src/app/calendar/requests/_components/RequestsList.test.tsx` (**12** existing tests)

**Interfaces:**
- Consumes: `canRevoke` from `@/lib/time-off/guards` (`canCancel` is already imported at line 14).
- Produces: `RequestsListProps` gains **one** optional prop:
  ```ts
  onRevoke?: (id: string, note: string) => Promise<void> | void;
  ```
  `currentUserId`, `today`, `onCancel` and `onEdit` **already exist** (lines 32–40) — do not redeclare
  them. Consumed by Task 6.

- [ ] **Step 1: Read DESIGN.md and the existing patterns**

Read `DESIGN.md` — specifically `:89` (`--brand-red` `#FF5C5F` = destructive) and `:154,172-177`
(Modals keep `bg-white dark:bg-zinc-900`). Read `RequestsList.tsx` in full: note that it already has
a `Dialog` + `Textarea` edit flow (lines 159–235), a `busyId` pattern (line 57), and a
`text-destructive` ghost `size="xs"` Cancel button (lines 141–150).

**Deviation from the original plan, deliberate:** it prescribed `AlertDialog` +
`size="sm"` + `text-red-500` copied from `ApproverQueue.tsx`. This file's own shipped idiom is
`Dialog` + `size="xs"` + `text-destructive`, and a revoke needs a `Textarea` anyway — which
`AlertDialog` does not provide and the existing edit `Dialog` does. Match the file, not the stale
plan. `text-destructive` and `text-red-500` are the same DESIGN.md destructive intent.

- [ ] **Step 2: Write the failing tests**

Append to `RequestsList.test.tsx`, reusing its `ROW` fixture (`userId: "u1"`, `status: "approved"`,
`startDate: "2026-08-10"`) and plain `render` + `fireEvent` style. Note the existing buttons are named
exactly `"Edit"` and `"Cancel request"`.

```tsx
describe("revoke control", () => {
  it("shows Revoke on an approved row when onRevoke is supplied", () => {
    // requests=[ROW] (approved), onRevoke=vi.fn(), no onCancel/onEdit
    // expect a button named /revoke/i
  });

  it("hides Revoke on a pending row", () => {
    // {...ROW, status: 'pending'}, onRevoke supplied -> no /revoke/i button
  });

  it("keeps the revoke confirm disabled until a note is typed", async () => {
    // click Revoke, assert the confirm button is disabled,
    // change the textarea, assert it becomes enabled
  });
});

// Pins the shipped gate: e2842686 requires BOTH handlers before showing the
// owner action row, so a caller that passes neither gets a read-only list.
it("hides Cancel when no onCancel handler is supplied", () => {
  // ROW with currentUserId 'u1' and today '2026-08-07' but no onCancel/onEdit
  // -> no /cancel request/i button
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/app/calendar/requests/_components/RequestsList.test.tsx`
Expected: the 3 revoke tests FAIL (no such button). The `hides Cancel when no onCancel handler` test
should already PASS — it pins existing behaviour.

- [ ] **Step 4: Implement**

Add `onRevoke` to `RequestsListProps` and destructure it. Inside the `requests.map`, alongside the
existing `canModify`:

```tsx
const showRevoke = Boolean(onRevoke) && canRevoke(r.status);
```

The action row currently renders on `canModify ? ... : null` (line 130). Change its condition to
`canModify || showRevoke`, keeping Edit and `Cancel request` gated on `canModify` **individually** so
a revoke-only caller does not gain owner controls and an owner-only caller does not gain Revoke.

Revoke button, matching the file's idiom:

```tsx
<Button
  type="button"
  variant="ghost"
  size="xs"
  className="text-destructive hover:text-destructive"
  disabled={busyId === r.id}
  onClick={() => openRevoke(r)}
>
  Revoke
</Button>
```

Add a second `Dialog`, modelled on the edit dialog (lines 159–235): local state
`revoking: RequestRow | null`, `revokeNote: string`, `revokeError: string | null`. A required
`Textarea` for the note; the confirm `Button` is `disabled` while `!revokeNote.trim()` or
`busyId === revoking?.id`. On confirm, `setBusyId`, `await onRevoke(revoking.id, revokeNote.trim())`,
close on success, surface the thrown message on failure — exactly as `handleSaveEdit` does. Reset
`revokeNote` when the dialog opens.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/calendar/requests/_components/RequestsList.test.tsx`
**Predicted count: 16 passed** (12 existing + 4 new).

- [ ] **Step 6: Mutation-prove**

Drop the `canRevoke(r.status)` term from `showRevoke` so it becomes `Boolean(onRevoke)`. Re-run.
Expected: exactly **1 failure** — `hides Revoke on a pending row`. Revert **with Edit**.

Then remove the `disabled` note check on the confirm button. Re-run. Expected: exactly **1
failure** — `keeps the revoke confirm disabled until a note is typed`. Revert **with Edit**, re-run:
16 passed.

- [ ] **Step 7: Typecheck**

Run: `/Users/manu/MFHub/node_modules/.bin/tsc --noEmit`
Expected: the Task 0 baseline.

- [ ] **Step 8: Commit**

```bash
git add src/app/calendar/requests/_components/RequestsList.tsx src/app/calendar/requests/_components/RequestsList.test.tsx
git commit -m "feat(time-off): add an optional revoke control to RequestsList

onRevoke is optional, so every existing call site is unaffected and the
Cancel/Edit controls shipped in e2842686 are untouched. Visibility reuses the
same pure canRevoke guard the route enforces with; the mandatory note is
collected in a Dialog matching the file's existing edit dialog.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/calendar/requests/_components/RequestsList.tsx src/app/calendar/requests/_components/RequestsList.test.tsx
```

---

### Task 6: Restore the "My requests" section and wire `onRevoke`

**Files:**
- Modify: `src/app/calendar/requests/page.tsx` (**165 lines**; the branch to replace is lines 139–162)
- Test: `src/app/calendar/requests/page.test.tsx` (5 existing tests)

**Interfaces:**
- Consumes: the extended `RequestsList` from Task 5; the widened `PATCH` from Task 4.
- Produces: the finished page. Nothing consumes it.

**What already exists — do not rebuild:** `handleCancel` (lines 73–82), `handleEdit` (84–107), the
`listActions` bundle (123–128) carrying `currentUserId`, `today`, `onCancel`, `onEdit`, and
`selfData.today` from the server (line 15). Original Task 6 Steps 3–4 are therefore almost entirely
already done; the only new derived value is `mine`, and the only new handler is `handleRevoke`.

- [ ] **Step 1: Write the failing tests**

Append to `page.test.tsx`, reusing `mockFetchSequence(selfBody, daysTakenBody)` and `asMock(useSession)`.
Note the existing self-body shape already includes `today`. **The existing session mocks omit
`user.id`**, so add `id: "u1"` to the new tests' sessions if you need `mine` to be non-empty —
`BASE_ROW.userId` is `"u1"`.

```tsx
it("renders a My requests section for an approver", async () => {
  // jake@marketfoundry.agency, role admin, user id 'u1';
  // self body has one row owned by 'u1'
  // expect /my requests/i in the document
});

it("renders a My requests section for a non-approver admin", async () => {
  // aqib@marketfoundry.agency, role admin, user id 'u1'
  // expect /my requests/i AND the days-taken sentence (/taken/i)
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/calendar/requests/page.test.tsx`
Expected: both new tests FAIL — no "My requests" heading exists today, and the non-approver admin
branch currently passes no `ownDays`.

- [ ] **Step 3: Add the derived value and the revoke handler**

After `const pending = ...` (line 122):

```tsx
  const mine = requests.filter((r) => r.userId === session?.user?.id);
```

Add `handleRevoke` next to `handleCancel`, in the same style (the existing `handleCancel` toasts and
returns; `handleRevoke` must **throw** on failure so the dialog can surface the message, matching
`handleEdit`):

```tsx
  async function handleRevoke(id: string, note: string) {
    const res = await fetch(`/api/time-off/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", decisionNote: note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Failed to revoke request");
    toast.success("Time off revoked");
    queryClient.invalidateQueries({ queryKey: ["time-off"] });
  }
```

- [ ] **Step 4: Rebuild the three branches**

Replace lines 139–162. Heading classes are copied verbatim from the existing "All requests" heading
at line 147.

```tsx
      {approver ? (
        <div className="space-y-8">
          <ApproverQueue
            pending={pending}
            breakdown={daysTaken?.breakdown ?? []}
            onDecide={handleDecide}
          />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              My requests
            </h3>
            <RequestsList
              requests={mine}
              showRequester={false}
              ownDays={daysTaken?.ownDays}
              {...listActions}
            />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              All requests
            </h3>
            <RequestsList requests={requests} showRequester onRevoke={handleRevoke} />
          </div>
        </div>
      ) : role === "admin" ? (
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              My requests
            </h3>
            <RequestsList
              requests={mine}
              showRequester={false}
              ownDays={daysTaken?.ownDays}
              {...listActions}
            />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              All requests
            </h3>
            <RequestsList requests={requests} showRequester />
          </div>
        </div>
      ) : (
        <RequestsList
          requests={requests}
          showRequester={false}
          ownDays={daysTaken?.ownDays}
          {...listActions}
        />
      )}
```

Three things to be deliberate about:

1. **No capability is lost.** Today both admin branches spread `listActions` onto the single
   all-requests list, so an admin can Cancel/Edit their own rows there. After this change those
   controls live in "My requests" instead — same rows, same controls, better labelled. The
   non-approver admin's "All requests" is genuinely read-only, which is the correct scope for them.
2. The non-approver admin branch passes **no** `onRevoke` — only approvers revoke.
3. The editor branch is unchanged: `GET` already returns only their own rows for a non-admin, so
   `mine === requests` there and a separate section would be redundant.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/calendar/requests/page.test.tsx`
**Predicted count: 7 passed** (5 existing + 2 new).

Watch the existing test `shows all requests read-only for a non-approver admin` — its name was
already inaccurate (the branch passes `listActions` today) and its assertions are
`getByText("Jo")` + no pending queue, both of which still hold because "All requests" keeps
`showRequester`. If it fails, that is a real signal, not a naming nit.

- [ ] **Step 6: Mutation-prove**

Delete the "My requests" block from the **non-approver-admin** branch only. Re-run.
Expected: exactly **1 failure** — `renders a My requests section for a non-approver admin`. Revert
**with Edit**, re-run: 7 passed.

- [ ] **Step 7: Full scoped run and typecheck**

Run: `npx vitest run src/lib/time-off src/lib/email.test.ts src/app/api/time-off src/app/calendar/requests`

**Predicted total: 155 passed / 11 files.** Derivation from the verified 132-test baseline:
`guards 37→42 (+5)`, `email 13→16 (+3)`, `[id]/route 4→11 (+7)`, `RequestsList 12→18 (+6)`,
`page 5→7 (+2)` = +23. Unchanged: `working-days 27`, `put.route 4`, `approved/route 6`,
`days-taken/route 6`, `time-off/route 9`, `ApproverQueue 9`.

**Amended 2026-08-10:** this step originally predicted 153 with `RequestsList 12→16 (+4)`. Task 5's
review produced a fix round (`8e183e13`) that added two coverage-only tests, so RequestsList is 18,
not 16, and the correct total is **155**.

Run: `/Users/manu/MFHub/node_modules/.bin/tsc --noEmit`
Expected: the Task 0 baseline.

- [ ] **Step 8: Commit**

```bash
git add src/app/calendar/requests/page.tsx src/app/calendar/requests/page.test.tsx
git commit -m "feat(time-off): restore the My requests section and wire revoke

The 2026-08-03 backend plan specified this section and the follow-up UI plan
dropped it. Non-approver admins regain their days-taken count, and approvers
get Revoke on the all-requests list. Cancel/Edit move into My requests
rather than being removed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/calendar/requests/page.tsx src/app/calendar/requests/page.test.tsx
```

---

### Task 7: Verification and review

**Files:** none.

- [ ] **Step 1: Code review (Claude's part — do this first)**

Use the `superpowers:requesting-code-review` skill against the whole branch (`c3420e96..HEAD`). Tell
the reviewer to write its report to a **FILE** first and then reply — subagent replies get lost — and
verify the file exists before believing either a success or a failure. Give the reviewer this
Amendment Log so it does not re-derive the plan's stale premises.

- [ ] **Step 2: Browser pass (Manu's part — ASK FIRST, do not start unprompted)**

Needs Manu's Google login, so it cannot be done unattended. `npx next dev` on **PORT=3100**, never
3000, and never from `/Users/manu/MFHub`. Then:

- Create a request starting **at least two days out** — Manu's `2026-08-10 → 2026-08-14` row starts
  today and no longer satisfies `canCancel`, so it cannot prove the Cancel button.
- Confirm: "My requests" now renders; Cancel appears on the new future row and removes it; Cancel is
  absent on a started row; Cancel/Edit are absent on another user's row in "All requests"; Revoke
  appears on approved rows there; its confirm stays disabled until a note is typed; the revoked row
  becomes `cancelled` and the requester gets the "Revoked" email.
- **Mandatory, and the reason this step cannot be skipped:** confirm a revoke **actually persists** —
  the row's status must really change to `cancelled` and its `decided_by` must really become the
  approver. Task 4's review established that `route.ts`'s conditional
  `UPDATE ... WHERE status = existing.status` has **zero automated coverage**: the test harness's
  `where` mock ignores its argument, so reverting that clause to the literal `"pending"` leaves all
  11 tests green while every real revoke would match zero rows and return a misleading 409
  ("Request was decided by someone else"). This browser step is the only signal that clause works.

- [ ] **Step 3: Stop**

Do **not** run `superpowers:finishing-a-development-branch`, and do not push or merge. Both need
Manu's explicit per-action OK.

---

## Self-Review

**Spec coverage.** §2.2 guard → Task 1. §2.2 GET payload → **already shipped**, Task 3 withdrawn.
§2.2 PATCH → Task 4. §2.2 email + the `Note from Jake` fix → Task 2. §2.3 page → Task 6. §2.3
`RequestsList` → Task 5 (cancel half already shipped; revoke half is new). §2.4 UI → Task 5 Steps 1
and 4, with one documented deviation. §3 error handling → Task 4 Steps 4–5 and Task 6 Step 3. §4
testing → per-task counts, all recounted against the real files. §5 accepted consequences →
documented in the `canRevoke` docstring, Task 1 Step 3. §6 non-goals → Global Constraints. §7
implementer note → Task 7 Step 2.

**Placeholder scan.** Tasks 2, 4, 5 and 6 give test bodies as commented specifications rather than
literal code, because the four test files each use a different established mocking harness that must
be read and matched; inventing one here would produce tests that do not run. Each comment states the
exact setup and the exact assertion. Every non-test code step contains real code.

**Type consistency.** `canRevoke(status: string): boolean` is used identically in Tasks 4 and 5.
`onRevoke: (id: string, note: string) => Promise<void> | void` matches Task 6's `handleRevoke` and
the union style of the sibling `onCancel`/`onEdit` props. `TimeOffEmailDecision.status` widens once in
Task 2 and is consumed unchanged in Task 4.

**Count provenance.** Every "existing" count in this document was obtained by
`grep -cE '^\s*(it|test)(\.\w+)?\('` against the worktree at `c3420e96` and cross-checked by a full
scoped vitest run reporting **119 passed / 10 files** (132 including `email.test.ts`). The original
plan's 8-for-`RequestsList` and its claim that no email tests existed were both wrong.
