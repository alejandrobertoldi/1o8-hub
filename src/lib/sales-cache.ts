import { db } from "@/lib/db";
import { salesSummaryCache } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — cron runs every 6h so cache stays warm

/**
 * Whether a cached row may be returned instead of re-querying Redshift.
 * `allowStale` is for browser requests: an expired row beats a live inventory scan
 * that (as of 2026-10) routinely outlives the 90s Redshift timeout and renders
 * nothing. The cron passes false so it still re-queries expired rows.
 */
export function shouldServeCached(ageMs: number, allowStale: boolean): boolean {
  return ageMs <= MAX_AGE_MS || allowStale;
}

/** Like getCachedData, but returns the row regardless of age, with its age. */
export async function getCachedEntry<T>(
  cacheType: string,
  cacheKey: string,
): Promise<{ data: T; updatedAt: Date; ageMs: number } | null> {
  const rows = await db
    .select({ data: salesSummaryCache.data, updatedAt: salesSummaryCache.updatedAt })
    .from(salesSummaryCache)
    .where(
      and(
        eq(salesSummaryCache.cacheType, cacheType),
        eq(salesSummaryCache.cacheKey, cacheKey),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  const updatedAt = new Date(rows[0].updatedAt);
  return { data: rows[0].data as T, updatedAt, ageMs: Date.now() - updatedAt.getTime() };
}

/** updated_at per cache key, for the keys that have a row. */
export async function getCacheUpdatedAt(
  cacheType: string,
  cacheKeys: string[],
): Promise<Map<string, Date>> {
  if (cacheKeys.length === 0) return new Map();
  const rows = await db
    .select({ cacheKey: salesSummaryCache.cacheKey, updatedAt: salesSummaryCache.updatedAt })
    .from(salesSummaryCache)
    .where(
      and(
        eq(salesSummaryCache.cacheType, cacheType),
        inArray(salesSummaryCache.cacheKey, cacheKeys),
      ),
    );
  return new Map(rows.map((r) => [r.cacheKey, new Date(r.updatedAt)]));
}

export async function getCachedData<T>(
  cacheType: string,
  cacheKey: string,
): Promise<T | null> {
  const rows = await db
    .select({ data: salesSummaryCache.data, updatedAt: salesSummaryCache.updatedAt })
    .from(salesSummaryCache)
    .where(
      and(
        eq(salesSummaryCache.cacheType, cacheType),
        eq(salesSummaryCache.cacheKey, cacheKey),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const age = Date.now() - new Date(row.updatedAt).getTime();
  if (age > MAX_AGE_MS) return null;

  return row.data as T;
}

/** Batched getCachedData: one query for many keys, same 24h max-age rule. Missing/stale keys are absent from the map. */
export async function getCachedDataMany<T>(
  cacheType: string,
  keys: string[],
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const unique = [...new Set(keys)];
  if (unique.length === 0) return out;
  const rows = await db
    .select({ cacheKey: salesSummaryCache.cacheKey, data: salesSummaryCache.data, updatedAt: salesSummaryCache.updatedAt })
    .from(salesSummaryCache)
    .where(and(eq(salesSummaryCache.cacheType, cacheType), inArray(salesSummaryCache.cacheKey, unique)));
  const now = Date.now();
  for (const row of rows) {
    if (now - new Date(row.updatedAt).getTime() > MAX_AGE_MS) continue;
    out.set(row.cacheKey, row.data as T);
  }
  return out;
}

export async function setCachedData(
  cacheType: string,
  cacheKey: string,
  data: unknown,
): Promise<void> {
  await db
    .insert(salesSummaryCache)
    .values({
      cacheType,
      cacheKey,
      data: data as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [salesSummaryCache.cacheType, salesSummaryCache.cacheKey],
      set: {
        data: data as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
}

export function buildSummaryCacheKey(start: string, end: string): string {
  return `${start}|${end}`;
}

// Bump this when the inventory response SHAPE changes so stale caches (which lack
// the new fields) are bypassed instead of silently hiding the new data. Old rows
// age out at MAX_AGE_MS; cron re-warms within 6h.
const INVENTORY_CACHE_VERSION = "v2";

export function buildInventoryCacheKey(
  start: string,
  end: string,
  accountIds: string,
): string {
  const sorted = accountIds.split(",").map((s) => s.trim()).sort().join(",");
  return `${INVENTORY_CACHE_VERSION}|${start}|${end}|${sorted}`;
}

export function buildDailyCacheKey(
  start: string,
  end: string,
  accountIds: string,
): string {
  const sorted = accountIds.split(",").map((s) => s.trim()).sort().join(",");
  return `daily|${start}|${end}|${sorted}`;
}

export function buildSnsCacheKey(accountIds: string): string {
  const sorted = accountIds.split(",").map((s) => s.trim()).sort().join(",");
  return `sns|${sorted}`;
}
