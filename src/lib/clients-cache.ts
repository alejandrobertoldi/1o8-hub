/**
 * Process-local TTL cache for the `/api/clients` list payload.
 *
 * Why this exists: the list is fetched from ~19 call sites across the app, and
 * every hit re-runs a full `GROUP BY` over `master` plus scans of `aac` and
 * `users`. Nothing in the payload is per-user — it is byte-identical for every
 * authenticated caller — so one copy per process serves them all. Mirrors the
 * module-level cache already used by `/api/products/completeness/batch`.
 *
 * Staleness contract: writes that change a client's *identity* (create, patch,
 * delete, allowed sections, the AAC import) call `invalidateClientsCache()`
 * explicitly. Everything else that can move a number on a client card — a
 * product create/delete/import moving `count`, a role change moving `userCount`
 * — is deliberately left to expire. That is why the TTL is short: a mutation
 * site nobody remembered to wire up self-heals within a minute.
 *
 * After the TTL, the last payload is still served (stale-while-revalidate)
 * while a single background fill refreshes it. That is what keeps `/api/clients`
 * off the 20s timeout: a cold `master` aggregate waiting on a starved pool
 * must not block every dropdown that only needed names.
 *
 * Callers must treat a hit as read-only; every reader is handed the same object.
 */

export const CLIENTS_CACHE_TTL_MS = 60 * 1000;

/** One slot per distinct `?status=` / `?lite=` response shape. */
export type ClientsCacheKey =
  | "active"
  | "all"
  | "inactive"
  | "active-lite"
  | "all-lite";

export function clientsCacheKey(
  status: string | null | undefined,
  lite = false,
): ClientsCacheKey {
  const normalized = status?.toLowerCase();
  if (normalized === "inactive") return "inactive";
  const base = normalized === "all" ? "all" : "active";
  return lite ? `${base}-lite` : base;
}

export function isLiteClientsCacheKey(key: ClientsCacheKey): boolean {
  return key === "active-lite" || key === "all-lite" || key === "inactive";
}

type Slot = { data: unknown; storedAt: number };

const slots = new Map<ClientsCacheKey, Slot>();

export function readClientsCache<T>(
  key: ClientsCacheKey,
  now: number = Date.now(),
): T | null {
  const slot = slots.get(key);
  if (!slot) return null;
  if (now - slot.storedAt >= CLIENTS_CACHE_TTL_MS) return null;
  return slot.data as T;
}

/** Last written payload for `key`, even after the TTL. Null only if never filled. */
export function peekClientsCache<T>(key: ClientsCacheKey): T | null {
  const slot = slots.get(key);
  return slot ? (slot.data as T) : null;
}

export function writeClientsCache<T>(
  key: ClientsCacheKey,
  data: T,
  now: number = Date.now(),
): void {
  slots.set(key, { data, storedAt: now });
}

/**
 * Bumped by every invalidation. A fill that started before the bump must not
 * write its (now pre-write) payload into the slot afterwards — that race is how
 * an invalidated cache resurrected a stale `allowedSections` array and made a
 * section toggle look like it had not persisted.
 */
let generation = 0;

export function invalidateClientsCache(): void {
  slots.clear();
  generation++;
}

/** Fills in progress, one per key. See getOrFillClientsCache. */
const inFlight = new Map<ClientsCacheKey, Promise<unknown>>();

function startFill<T>(key: ClientsCacheKey, fill: () => Promise<T>): Promise<T> {
  const startedAt = generation;
  const run = (async () => {
    const data = await fill();
    // Only cache it if nothing invalidated while this fill was in flight.
    if (generation === startedAt) writeClientsCache(key, data);
    return data;
  })();

  inFlight.set(key, run);
  void run.finally(() => {
    if (inFlight.get(key) === run) inFlight.delete(key);
  });
  // A rejected background refresh must not become an unhandled rejection.
  void run.catch(() => {});
  return run;
}

/**
 * Read-through cache with in-flight de-duplication and stale-while-revalidate.
 *
 * `readClientsCache` on its own is check-then-fill: every concurrent caller that
 * arrives while the slot is cold sees a miss and runs the full query set. With
 * ~22 call sites fetching this list, a cold cache on page load meant N copies of
 * the same three queries competing for the same small pool — the cache made the
 * steady state cheap and the cold start worse. This collapses them: the first
 * miss runs the work, everyone else waits on that same promise.
 *
 * Once a payload has been filled at least once, an expired TTL no longer makes
 * the caller wait. They get the last good copy immediately and one background
 * fill refreshes the slot. A 20s `/api/clients` budget then only applies to a
 * true cold start, not to every page that mounts a client dropdown.
 *
 * A rejected fill is not cached, and the slot is released so the next caller
 * retries rather than inheriting the failure.
 */
export async function getOrFillClientsCache<T>(
  key: ClientsCacheKey,
  fill: () => Promise<T>,
  now: number = Date.now(),
): Promise<T> {
  const cached = readClientsCache<T>(key, now);
  if (cached !== null) return cached;

  const stale = peekClientsCache<T>(key);
  if (stale !== null) {
    if (!inFlight.has(key)) startFill(key, fill);
    return stale;
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  return startFill(key, fill);
}
