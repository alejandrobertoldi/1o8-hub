/**
 * Process-local cache for GET /api/seo/projects.
 *
 * The manager page is a single authenticated list, identical for every hub
 * user. Caching it means a warm Vercel instance answers in-process instead of
 * waiting on a pooled connection that may already be wedged. Same contract as
 * `clients-cache`: short TTL, stale-while-revalidate, writes invalidate.
 */

export const SEO_PROJECTS_CACHE_TTL_MS = 15_000;

type Slot = { data: unknown; storedAt: number };

let slot: Slot | null = null;
let generation = 0;
let inFlight: Promise<unknown> | null = null;

export function peekSeoProjectsCache<T>(): T | null {
  return slot ? (slot.data as T) : null;
}

export function writeSeoProjectsCache<T>(data: T, now: number = Date.now()): void {
  slot = { data, storedAt: now };
}

export function invalidateSeoProjectsCache(): void {
  slot = null;
  generation++;
  inFlight = null;
}

export async function getOrFillSeoProjectsCache<T>(
  fill: () => Promise<T>,
  now: number = Date.now(),
): Promise<T> {
  if (slot && now - slot.storedAt < SEO_PROJECTS_CACHE_TTL_MS) {
    return slot.data as T;
  }

  if (slot) {
    if (!inFlight) void startFill(fill).catch(() => {});
    return slot.data as T;
  }

  if (inFlight) return inFlight as Promise<T>;
  return startFill(fill);
}

function startFill<T>(fill: () => Promise<T>): Promise<T> {
  const startedAt = generation;
  const run = Promise.resolve()
    .then(fill)
    .then((data) => {
      if (generation === startedAt) writeSeoProjectsCache(data);
      return data;
    });

  inFlight = run;
  void run
    .finally(() => {
      if (inFlight === run) inFlight = null;
    })
    .catch(() => {});
  return run;
}
