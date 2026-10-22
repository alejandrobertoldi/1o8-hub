/**
 * Process-local memo for the identity lookup on the auth path.
 *
 * Why this exists: `getAuthSession` answers "who is this?" with a `users`-by-email
 * SELECT, and it is wrapped in React `cache()` — which dedupes within ONE request
 * only. A page that fires several API calls in parallel therefore asks the same
 * question several times in the same instant.
 *
 * Measured in production on 2026-08-11: three backends sat `state=active` /
 * `wait_event=Client:ClientRead` on that exact query, started within 2 SECONDS of
 * each other, ageing 164s -> 285s and never progressing, while eight other
 * backends served the identical query fine 41s and 105s earlier. Production runs
 * `max: 3`, so one instance's entire pool allowance was gone and `/onboarding`
 * returned a 503. The database was healthy the whole time.
 *
 * Note what that 2-second cluster rules out: a cache that stores only VALUES is
 * empty at that moment, so all three callers still miss and all three still issue
 * their own query. Sharing the in-flight promise is the half that fixes the burst;
 * the TTL only covers the next one.
 *
 * Staleness contract: the memo lives in one instance's memory, so
 * `invalidateAuthIdentities()` can only clear the instance that served the write —
 * the odds the affected user's next request lands there are ~1/N. The TTL is
 * therefore the real contract: a revoked or downgraded role takes effect within
 * AUTH_IDENTITY_TTL_MS, which is still far fresher than the JWT the same session
 * already trusts (stale until re-login).
 *
 * Callers must treat a hit as read-only; every reader is handed the same object.
 */

/** Fresh enough to return without touching the database. */
export const AUTH_IDENTITY_TTL_MS = 10_000;

/**
 * How long a refresh may run before we fall back to the last-known-good row.
 *
 * Deliberately ABOVE the measured 1.74s cost of a cold connection on this
 * project. A lower threshold would serve stale rows every time the pool is cold
 * rather than only when something is actually broken.
 */
export const AUTH_IDENTITY_STALE_AFTER_MS = 3_000;

/** Past this age we would rather fail the request than answer from memory. */
export const AUTH_IDENTITY_STALE_CEILING_MS = 5 * 60 * 1000;

type Slot = { row: unknown; storedAt: number };

/** Last SUCCESSFUL row per email. Kept past the TTL to back the stale fallback. */
const fresh = new Map<string, Slot>();

/** Lookups in progress, one per email. See getOrFillAuthIdentity. */
const inFlight = new Map<string, Promise<unknown>>();

/** Overridable timings, so the tests need neither a clock nor fake timers. */
export type AuthIdentityTimings = {
  now?: number;
  ttlMs?: number;
  staleAfterMs?: number;
  staleCeilingMs?: number;
};

const STALE_WINDOW_ELAPSED = Symbol("auth-identity-stale-window-elapsed");

/**
 * Store a row the caller has just written or created.
 *
 * The name/image sync in `getAuthSession` MUST call this after its UPDATE.
 * Without it the memo keeps the pre-write row, the next request inside the TTL
 * re-detects the same "change" and writes again — the 235,900-no-op-UPDATE bug of
 * 2026-08-04 rebuilt in a new place.
 */
export function patchAuthIdentity<T>(
  email: string,
  row: T,
  now: number = Date.now(),
): void {
  if (row === null || row === undefined) return;
  fresh.set(email, { row, storedAt: now });
}

/** Drop every memoised identity in THIS process. See the staleness contract above. */
export function invalidateAuthIdentities(): void {
  fresh.clear();
}

/**
 * Read-through memo with in-flight de-duplication and a last-known-good fallback.
 *
 * Three mechanisms, in the order they matter:
 *
 * 1. **Single-flight.** Concurrent callers adopt the same promise, so one page
 *    load costs one identity query instead of one per parallel API call.
 * 2. **TTL.** A resolved row serves the next few seconds of navigation for free.
 * 3. **Stale fallback.** If the refresh is still pending after `staleAfterMs`, or
 *    it rejects outright, a previously-successful row inside `staleCeilingMs` is
 *    returned instead. Without this a frozen query takes the whole instance dark:
 *    every later request politely waits on the same hung promise forever, because
 *    postgres.js has no acquire timeout. With it, the instance keeps serving.
 *
 * A `null` fill result (user not found) is never stored — it must not suppress the
 * auto-create branch in `getAuthSession`.
 */
export async function getOrFillAuthIdentity<T>(
  email: string,
  fill: () => Promise<T>,
  timings: AuthIdentityTimings = {},
): Promise<T> {
  const now = timings.now ?? Date.now();
  const ttlMs = timings.ttlMs ?? AUTH_IDENTITY_TTL_MS;
  const staleAfterMs = timings.staleAfterMs ?? AUTH_IDENTITY_STALE_AFTER_MS;
  const staleCeilingMs = timings.staleCeilingMs ?? AUTH_IDENTITY_STALE_CEILING_MS;

  const slot = fresh.get(email);
  if (slot && now - slot.storedAt < ttlMs) return slot.row as T;

  let pending = inFlight.get(email) as Promise<T> | undefined;
  if (!pending) {
    pending = (async () => {
      try {
        const row = await fill();
        // Stamped with the STARTING caller's clock, not resolution time: the row
        // is only guaranteed to reflect the database as of when we asked, and it
        // keeps the tests deterministic under an injected `now`.
        if (row !== null && row !== undefined) {
          fresh.set(email, { row, storedAt: now });
        }
        return row;
      } finally {
        inFlight.delete(email);
      }
    })();
    inFlight.set(email, pending);
  }

  const staleUsable = slot !== undefined && now - slot.storedAt < staleCeilingMs;
  if (!staleUsable) return await pending;

  // Once we may abandon `pending`, nothing is guaranteed to await it — swallow a
  // late rejection here or it surfaces as an unhandled rejection long after the
  // response was sent. The race below still sees the rejection.
  pending.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const staleWindow = new Promise<typeof STALE_WINDOW_ELAPSED>((resolve) => {
    timer = setTimeout(() => resolve(STALE_WINDOW_ELAPSED), staleAfterMs);
  });

  try {
    const winner = await Promise.race([pending, staleWindow]);
    if (winner === STALE_WINDOW_ELAPSED) return slot.row as T;
    return winner as T;
  } catch {
    // The refresh failed outright — the `read ECONNRESET` shape where the peer
    // resets rather than serving. Last-known-good beats failing the request.
    return slot.row as T;
  } finally {
    clearTimeout(timer);
  }
}
