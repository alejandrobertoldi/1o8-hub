# Auth identity memo — design

**Date:** 2026-08-11 · **Thread:** I (prod DB performance) · **Status:** approved, ready to implement

## Problem

Every request answers "who is this?" with a `users`-by-email `SELECT` in
`src/lib/auth-db.ts`. `getAuthSession` is wrapped in React `cache()`, which dedupes
**within one request only** — so a page that fires several API calls in parallel asks the
same question several times in the same instant.

Production caught this live on 2026-08-11. Three backends sat `state=active` /
`wait_event=Client:ClientRead` on that exact query, started within **2 seconds** of each
other, ageing 164s → 285s and never progressing, while eight other backends served the
identical query fine 41s and 105s earlier. Production's pool is `max: 3`, so one instance's
entire allowance was gone. `/onboarding` returned HTTP 503 (the 20s `withDbTimeout`); a
private window loaded fine, i.e. the browser was pinned to the poisoned instance by
keep-alive.

The database was healthy throughout. The waste is duplicated identical questions, and the
outage is what happens when the pool that serves them is three slots wide.

## Why a TTL cache alone is not the fix

The three wedged queries started within 2 seconds of each other. A value cache is *empty*
at that moment, so all three still miss and all three still issue their own query. The
load-bearing mechanism is **sharing the in-flight promise**; the TTL only covers the
*next* burst.

Single-flight alone still leaves the instance dark when a query is frozen: later requests
share the hung promise and wait forever. Two of three pool slots are saved and nothing is
served. Keeping the instance *up* requires a third mechanism — serving the last-known-good
row when a refresh is taking abnormally long.

## Design

### New module: `src/lib/auth-identity-cache.ts`

Mirrors the house pattern in `src/lib/clients-cache.ts`: module-level `Map`, `unknown`
value, generic at the boundary, injectable timings. Deliberately **not** `globalThis`-cached
— a hot reload yields a cold cache, which is harmless.

```
AUTH_IDENTITY_TTL_MS            =  10_000   // fresh: return without touching the DB
AUTH_IDENTITY_STALE_AFTER_MS    =   3_000   // above the measured 1.74s cold connect
AUTH_IDENTITY_STALE_CEILING_MS  = 300_000   // beyond this, refuse to serve stale

fresh:    Map<email, { row, storedAt }>   // last SUCCESSFUL row
inFlight: Map<email, Promise<row>>
```

`getOrFillAuthIdentity(email, fill, timings?)`:

1. Fresh row inside the TTL → return it, no DB.
2. Otherwise adopt the existing in-flight promise, or start one and register it.
3. If a prior row exists inside the 5-minute ceiling → race the in-flight promise against a
   3s timer. Promise wins → its value. Timer wins → **serve the stale row**; the refresh
   keeps running with a `.catch()` attached so its late rejection cannot surface as an
   unhandled rejection. The timer is always cleared.
4. No usable prior row → await the promise, as today.
5. The fill rejecting is treated the same as it being slow: serve the stale row if one is
   inside the ceiling, else rethrow. This is the `read ECONNRESET` "stalls then resets"
   failure mode the thread records as real.
6. **`null` is never stored.** A not-found must not suppress the auto-create branch.

Also exported: `patchAuthIdentity(email, row)`, `invalidateAuthIdentities()`.

**Why 3s and not 1s:** a cold connection measurably costs **1.74s** on this project. A
threshold below that would serve stale rows on every cold pool rather than only on failure.

### Changed: `src/lib/auth-db.ts`

`const email = session.user.email` hoisted so the fill closure keeps its narrowing; the
select wrapped in `getOrFillAuthIdentity`; **two write-backs**:

- after auto-create → `patchAuthIdentity(email, created)`
- after the name/image sync write → `patchAuthIdentity(email, { ...dbUser, name, image })`

The second is mandatory. Without it the memo keeps the pre-write row, the next request
inside the TTL re-detects the same "change" and writes again — a write storm bounded only
by the TTL. That is 2026-08-04's root cause #2 (235,900 no-op UPDATEs on the auth path)
rebuilt in a new place, and it is the most likely way this change goes wrong.

### Changed: two invalidation call sites

`invalidateAuthIdentities()` after the write in `/api/admin/users` PUT and
`/api/team/[userId]` PATCH.

Not wired into the other four `update(users)` sites. The memo is per-instance, so only the
instance that served the write can clear its copy; the chance the affected user's next
request lands there is ~1/N. **The TTL is the staleness contract; these two calls are a
dev-mode and lucky-instance nicety, nothing more.**

## Staleness contract

| Consumer | Before | After |
|---|---|---|
| `session.user.role` via `getAuthSession` | fresh every request | ≤ 10s stale; ≤ 5 min during a DB failure |
| `session.user.role` via the JWT (`auth.ts`) | stale until re-login | unchanged |
| Self-role-change guard (`admin/users:131`) | compares `userId` to `session.user.id` | unaffected |
| Revoked access | effective immediately | effective within 10s |

A revoked or downgraded account retains its old role for at most one page view. This is
strictly fresher than the JWT path the same session already trusts.

## Scope decisions

- **Memoised:** the six columns of `authUserColumns` only — the exact query that wedged.
- **Not memoised:** the two `aac` queries (`clientStatus`, resolved `allowedSections`).
  They fire for `client`/`prospect` roles only, and every account in the evidence is
  staff/owner. Keeping a permissions surface out of the memo also narrows the blast radius.
- **`max: 3 → 6` is NOT part of this change.** "Exactly 3 stuck" is the cleanest fingerprint
  the investigation produced; widening the pool in the same deploy would destroy our ability
  to tell whether the memo worked. Held as a ready second lever.

## Testing

`src/lib/auth-identity-cache.test.ts` — no DB, injected `fill` and injected timings rather
than fake timers:

1. Concurrent callers share one fill (fill called once).
2. A fresh hit inside the TTL does not call the fill.
3. An expired TTL refills.
4. A rejection is not cached; the next caller retries.
5. A rejection with a stale row inside the ceiling returns the stale row.
6. A fill still pending past the stale threshold, with a stale row, returns stale — and the
   late fill still populates the cache.
7. A fill pending past the threshold with no stale row keeps waiting.
8. A row older than the ceiling is not served as stale.
9. `null` is never stored.
10. `invalidateAuthIdentities()` clears.

## Verification after deploy

The `pg_stat_activity` probe should show **at most one** `users`-by-email backend per
instance instead of a 2-second cluster of three.

## Deliberately out of scope (findings, not fixes)

- `/api/auth/session-sync` fires an **unconditional** `update users set last_login_at` on
  every initial page load — a write transaction on the auth path, same class as root cause
  #2 though not a no-op.
- Two parallel first-sign-in requests both receive `null` from the one shared query and both
  `insert`, so one hits the unique-email constraint. Pre-existing; `onConflictDoNothing`
  would fix it.
