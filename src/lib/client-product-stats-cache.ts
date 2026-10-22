/**
 * Process-local TTL cache for the `master` GROUP BY that feeds `/api/clients`
 * product counts.
 *
 * That aggregate is the slow query. Putting it on the request path is what
 * made GET /api/clients (and, via pool starvation, GET /api/clients?lite=1)
 * blow the 20s handler budget. Callers get the last good map immediately
 * after the first fill; a cold start waits a short bounded window then
 * returns empty counters while this fill continues in the background.
 */

import type { ClientProductStats } from "@/lib/client-product-stats";

export const PRODUCT_STATS_TTL_MS = 60 * 1000;

/** How long a request may wait for a cold fill before serving empty counters. */
export const PRODUCT_STATS_WAIT_MS = 1_500;

type Slot = { data: Map<string, ClientProductStats>; storedAt: number };

let slot: Slot | null = null;
let inFlight: Promise<Map<string, ClientProductStats>> | null = null;
let generation = 0;

export function readProductStats(
  now: number = Date.now(),
): Map<string, ClientProductStats> | null {
  if (!slot) return null;
  if (now - slot.storedAt >= PRODUCT_STATS_TTL_MS) return null;
  return slot.data;
}

export function peekProductStats(): Map<string, ClientProductStats> | null {
  return slot ? slot.data : null;
}

export function writeProductStats(
  data: Map<string, ClientProductStats>,
  now: number = Date.now(),
): void {
  slot = { data, storedAt: now };
}

export function invalidateClientProductStats(): void {
  slot = null;
  generation++;
}

function startFill(
  fill: () => Promise<Map<string, ClientProductStats>>,
  onFilled?: (data: Map<string, ClientProductStats>) => void,
): Promise<Map<string, ClientProductStats>> {
  const startedAt = generation;
  const run = (async () => {
    const data = await fill();
    if (generation === startedAt) {
      writeProductStats(data);
      onFilled?.(data);
    }
    return data;
  })();

  inFlight = run;
  void run.finally(() => {
    if (inFlight === run) inFlight = null;
  });
  void run.catch(() => {});
  return run;
}

/**
 * Stale-while-revalidate stats. A cold cache waits up to `waitMs` for the
 * first fill; after that every caller is served from memory.
 */
export async function getProductStatsForRequest(
  fill: () => Promise<Map<string, ClientProductStats>>,
  onFilled?: (data: Map<string, ClientProductStats>) => void,
  waitMs: number = PRODUCT_STATS_WAIT_MS,
  now: number = Date.now(),
): Promise<Map<string, ClientProductStats>> {
  const cached = readProductStats(now);
  if (cached) return cached;

  const stale = peekProductStats();
  if (stale) {
    if (!inFlight) startFill(fill, onFilled);
    return stale;
  }

  const pending = inFlight ?? startFill(fill, onFilled);
  if (waitMs <= 0) return new Map();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Map<string, ClientProductStats>>((resolve) => {
    timer = setTimeout(() => resolve(peekProductStats() ?? new Map()), waitMs);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
