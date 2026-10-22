# Time-off cancel and approver revoke — design

**Date:** 2026-08-10
**Thread:** E (team calendar — time off + public holidays)
**Status:** approved by Manu, ready for `/writing-plans`
**Base:** `main` @ `81083849` (contains `065cca43`, the D2-reversal commit)

---

## 1. Why this exists

Manu asked to "allow removing approved time-off requests" after finding no cancel control on
`/calendar/requests`. Systematic debugging established two distinct causes, and he ruled on both.

### 1.1 The diagnosis (evidence, not inference)

**There is no cancel UI anywhere in the app.** `canCancel` has exactly three non-test occurrences in
`src/`: its definition in `guards.ts`, a comment in `guards.ts`, and the call at
`src/app/api/time-off/[id]/route.ts:157`. No client code issues `DELETE /api/time-off/{id}` — the
only `DELETE` in the calendar tree is `CalendarView.tsx:248`, which targets `/api/calendar/events/`.
The server-side cancel path is complete and correct; nothing has ever called it.

**The requirement was specified and then dropped between two plans.** The backend plan states it
verbatim at `docs/superpowers/plans/2026-08-03-team-calendar-time-off-holidays.md:2009`:

> A "Cancel" button appears only when the row is `pending`, or `approved` with a future start date;
> it calls `DELETE /api/time-off/[id]` then `router.refresh()`.

The follow-up UI plan that actually wrote `RequestsList.tsx`
(`2026-08-05-team-calendar-requests-ui-implementation.md`) mentions `canCancel` zero times, `D10`
zero times, and "cancel" only as unrelated dialog buttons. No implementer was ever asked to build
it. This is a dropped handoff, not a regression.

**Correction to the thread-E handoff note.** That note claimed `RequestsList.tsx` "is the file that
references `canCancel`". It does not, and never did — the claim came from a grep whose
`RequestsList` alternative matched the file's own name. `RequestsList.tsx` is 66 lines and contains
no button of any kind. Any future session should not re-derive the fix from that note.

**A second gap, same root cause.** The backend plan's Step 4 specified two sections — "My requests"
and "All requests". `page.tsx:96-114` collapsed that to `ApproverQueue` + one all-requests list, so
**no admin has a "My requests" section at all**. `ownDays` is fetched for every role at `page.tsx:39`
but rendered only in the non-admin branch at `:113`.

Scope of that gap, stated precisely: approvers *do* still see their own day count, because
`ApproverQueue.tsx:79-97` renders a team-wide breakdown table that includes their own row. The
people who see no day count at all are **non-approver admins**, who get neither the queue nor
`ownDays`.

### 1.2 Rulings taken in this session

| # | Question | Ruling |
|---|---|---|
| R1 | Scope of 1(a) | Restore the spec's "My requests" section, with the Cancel button on own cancellable rows. |
| R2 | D10 (cancel window) | **Reversed for approvers only.** Owners still cannot cancel approved leave that has started. Approvers may revoke any approved row, any date. |
| R3 | What the record says after a revoke | Reuse `cancelled`; re-point `decided_by` to the approver; **require a note**. No new status value. |
| R4 | Revoke scope | Any `approved` row regardless of date. Overlap with owner self-cancel on future rows is accepted — both land on `cancelled`. |
| R5 | Notify the requester | Yes, reuse `buildTimeOffDecisionEmail` with a new `cancelled` case carrying the mandatory note. |
| R6 | Client-side "today" | Add `residenceTimezone` to the `GET /api/time-off` payload and reuse `todayInZone` client-side, so button visibility matches the server exactly. |
| R7 | Self-approval | **Explicitly allowed.** No behaviour change; add a test pinning it so nobody "fixes" it later. |

D10 remains locked for the owner path. Only the approver path is new.

---

## 2. Architecture

### 2.1 Transport split — the load-bearing decision

The two acts are separated at the transport layer, because they are different acts:

| | Owner self-cancel | Approver revoke |
|---|---|---|
| Route | `DELETE /api/time-off/[id]` | `PATCH /api/time-off/[id]` |
| Gate | `existing.userId === session.user.id` + `canCancel` | `isApprover(email)` + `canRevoke(status)` |
| Note | none | **required** |
| `decided_by` | untouched | re-pointed to the approver |
| Email | none | decision email, `cancelled` case |
| Code change | **none** | widen the status validator and the `!== "pending"` guard |

`PATCH` was chosen over extending `DELETE` because R3/R5 ask for exactly the three things `PATCH`
already does — approver gate (`route.ts:30`), note parsing (`:48-49`), `decidedBy` write (`:72`),
race-safe conditional update (`:68-88`), decision email (`:96-112`). `DELETE` does none of them;
extending it would mean rebuilding all three inside it.

**Consequence: `DELETE /api/time-off/[id]` is not modified by this work, and `canCancel` and its six
tests in `guards.test.ts` are not touched.**

### 2.2 Server changes

**`src/lib/time-off/guards.ts`** — add:

```ts
export function canRevoke(status: string): boolean {
  return status === "approved";
}
```

Pure, single-argument, deliberately date-free (R4). Its docstring carries the D10-reversal rationale
and states that approver authority is enforced at the route, not here — mirroring how `canCancel`
does not check ownership either.

**`src/app/api/time-off/route.ts` (GET)** — the handler already selects `countryCode` from `users`.
Add `residenceTimezone` (`schema.ts:162`, nullable `text`) to the same select and to the response
body. Purely additive:

```
{ requests, countryCode, residenceTimezone }
```

**`src/app/api/time-off/[id]/route.ts` (PATCH)** — three edits:

1. Status validator accepts `"cancelled"` in addition to `"approved" | "denied"`.
2. The `existing.status !== "pending"` guard (`:61-66`) becomes state-machine aware:
   - target `approved` or `denied` → requires `existing.status === "pending"` (today's rule)
   - target `cancelled` → requires `canRevoke(existing.status)`
   - anything else → `409` with the existing message shape
3. A `cancelled` target with a blank or missing `decisionNote` → `400`. `approved`/`denied` keep
   their optional note.

The conditional `UPDATE ... WHERE status = existing.status` stays as the concurrency guard; it
already generalises, since it pins whatever status was read rather than the literal `"pending"`.

**`src/lib/email.ts`** — `TimeOffEmailDecision.status` widens to
`"approved" | "denied" | "cancelled"`. The `cancelled` case renders label "Revoked" in `#FF5C5F`
(DESIGN.md `--brand-red`, same token as denied) and a subject naming the revocation.

Fix while here: `email.ts:330` hardcodes `Note from Jake`, which has been false since D2 was
reversed to two approvers on 2026-08-07. Replace with approver-neutral wording.

### 2.3 Client changes

**`src/app/calendar/requests/page.tsx`** — restore the missing section. All three branches gain a
cancel handler; the approver branch alone gains a revoke handler.

- **approver:** `ApproverQueue` → **My requests** → **All requests** (with revoke)
- **admin, non-approver:** **My requests** → **All requests** (read-only) — this is what fixes their
  absent day count
- **editor:** unchanged single list (GET already returns own rows only) + cancel

`mine = requests.filter(r => r.userId === session.user.id)`. `today` is computed once as
`todayInZone(residenceTimezone, new Date())` and passed down.

**`src/app/calendar/requests/_components/RequestsList.tsx`** — four optional props:

```ts
today?: string;
currentUserId?: string;
onCancel?: (id: string) => Promise<void>;
onRevoke?: (id: string, note: string) => Promise<void>;
```

Visibility rules, both importing the same pure guards the server uses so policy has one definition:

- Cancel when `onCancel && r.userId === currentUserId && today && canCancel(r.status, r.startDate, today)`
- Revoke when `onRevoke && canRevoke(r.status)`

All four props are optional, so every existing call site and all 8 existing `RequestsList` tests
keep compiling and passing unchanged.

### 2.4 UI treatment (per DESIGN.md)

- Revoke button: `variant="ghost" size="sm"` with `text-red-500 hover:bg-red-500/10` — byte-identical
  to the existing Deny button at `ApproverQueue.tsx:55-63`. No new colour decision is introduced.
- Cancel button: `variant="ghost" size="sm"`, muted, no red. It is the owner's own routine action.
- Both confirm through `AlertDialog`, the pattern already used in `EventPopover.tsx:14,238`. The
  revoke dialog carries a required `Textarea`; its confirm stays `disabled` until the note is
  non-empty, which is where R3's "conversation" is forced into the record.
- Modals keep `bg-white dark:bg-zinc-900` per DESIGN.md's Modals block.

---

## 3. Error handling

| Case | Behaviour |
|---|---|
| Revoke without a note | Client keeps confirm disabled; server independently returns `400`. |
| Revoke a row that is no longer `approved` | `409`, surfaced as a toast. |
| Owner cancels a row that crossed the D10 boundary between render and click | `409` from `DELETE`, surfaced as a toast. The server stays the authority; R6 makes this rare rather than impossible. |
| `residenceTimezone` null, empty, or a typo | `todayInZone` already falls back to UTC (`guards.ts:81-104`). No new handling. |
| Decision email fails to send | Already non-fatal — `console.warn`, request still updated (`route.ts:109-111`). Unchanged for the `cancelled` case. |
| Concurrent decision | Existing conditional `UPDATE` returns no row → `409`. Generalises unchanged. |

---

## 4. Testing

Every count below is a **prediction to state before running**, per the thread's standing rule. New
tests must be mutation-proven.

| File | Now | After | Adds |
|---|---|---|---|
| `src/lib/time-off/guards.test.ts` | 37 | 42 | `canRevoke`: approved → true (twice, the second pinning date-independence); pending, denied, cancelled → false |
| `src/app/api/time-off/[id]/route.test.ts` | 4 | 10 | approver revokes approved → 200 + `decided_by` re-pointed; non-approver → 403; missing note → 400; revoke a pending row → 409; revoke an already-cancelled row → 409; **approver decides their own request → 200 (R7, pinned deliberately)** |
| `src/app/calendar/requests/_components/RequestsList.test.tsx` | 8 | 14 | cancel shown on own cancellable row; hidden on own non-cancellable row; hidden on another user's row; revoke shown on approved; hidden on non-approved; revoke confirm disabled until the note is non-empty |
| `src/app/calendar/requests/page.test.tsx` | 5 | 7 | "My requests" renders for an approver; renders for a non-approver admin |

`canCancel`'s 6 existing tests must still pass **unmodified** — that is the regression signal proving
D10 was not widened for owners.

Then, in order: `npx vitest run` on the scoped files → `node_modules/.bin/tsc --noEmit` UNFILTERED,
judged by filename against the known 1-error baseline at
`scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46`. The exit code
is not the signal.

---

## 5. Accepted consequences

**Self-revocation is reachable.** Manu is both owner and approver, so one of his own past approved
rows falls through the owner path (blocked by D10) into the approver path, and he can revoke it with
a note. This follows directly from R2 + R4 + R7 and is intended, not an oversight. It is documented
here and belongs in the `canRevoke` docstring.

**The revoke and owner-cancel paths overlap on approved future rows.** Both produce `cancelled`; only
`decided_by` and the note distinguish them. Accepted under R4 in exchange for one rule instead of a
date-dependent one.

**`cancelled` remains overloaded.** It now means "withdrawn by the owner" *or* "revoked by an
approver", separable only by comparing `decided_by` to `user_id`. Accepted under R3 to avoid a schema
change.

---

## 6. Non-goals

- No schema change and no new status enum value.
- No modification to `DELETE /api/time-off/[id]`, to `canCancel`, or to its six tests.
- The queue gate (`role === "admin"` in `GET /api/time-off`) and the badge gate (`isApprover` in
  `top-nav.tsx`) stay deliberately different. Ruled on 2026-08-07; do not "fix".
- No widening of the shared `sendEmail` helper.
- Self-approval is pinned by a test, not blocked.

---

## 7. Note for the implementer

Manu's `2026-08-10 → 2026-08-14` request — the row that motivated this work — **starts on 2026-08-10**
and so no longer satisfies `canCancel` (`startDate > today` is false). It is now reachable only via
the new approver-revoke path. Do not use it as the manual proof that the owner Cancel button works;
create a request starting at least one day out for that.
