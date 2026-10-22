/**
 * I/O for the SEO ↔ PPC status page: keyword sets from Postgres, PPC search
 * terms from Redshift (24h cache in reports_cache). Maths lives in ppc-status.ts.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportsCache, seoPassageMap, seoAsins, seoKeywords } from "@/lib/db/schema";
import { fetchSearchTermTotals, type SearchTermTotalRow } from "@/lib/ppc-queries";
import type { DateWindow, buildKeywordSet } from "./ppc-status";

export const CACHE_TYPE = "seo-ppc-status";
export const CACHE_TTL_MS = 86_400_000;

export function isFresh(updatedAt: Date, now: number): boolean {
  return now - updatedAt.getTime() <= CACHE_TTL_MS;
}

export interface SearchTermsResult {
  rows: SearchTermTotalRow[];
  /** When this data was actually fetched from Redshift — the cache row's
   * `updatedAt` on a hit, or now on a miss. Used to surface a data-freshness
   * note; NOT the response time (spec §7 `cachedAt`). */
  fetchedAt: Date;
}

export async function loadSearchTerms(accountId: number, w: DateWindow): Promise<SearchTermsResult> {
  const cacheKey = `${accountId}|${w.start}|${w.end}`;
  const [hit] = await db
    .select({ data: reportsCache.data, updatedAt: reportsCache.updatedAt })
    .from(reportsCache)
    .where(and(eq(reportsCache.cacheType, CACHE_TYPE), eq(reportsCache.cacheKey, cacheKey)))
    .limit(1);
  if (hit && isFresh(hit.updatedAt, Date.now())) return { rows: hit.data as SearchTermTotalRow[], fetchedAt: hit.updatedAt };

  const rows = await fetchSearchTermTotals(accountId, w.start, w.end);
  const now = new Date();
  await db
    .insert(reportsCache)
    .values({ cacheType: CACHE_TYPE, cacheKey, data: rows, updatedAt: now })
    .onConflictDoUpdate({ target: [reportsCache.cacheType, reportsCache.cacheKey], set: { data: rows, updatedAt: now } });
  return { rows, fetchedAt: now };
}

export async function loadKeywordInputs(projectIds: string[]): Promise<Parameters<typeof buildKeywordSet>[0]> {
  if (projectIds.length === 0) return { s6: [], s2: [] };
  const [maps, kws] = await Promise.all([
    db
      .select({ asin: seoAsins.asin, passages: seoPassageMap.passages })
      .from(seoPassageMap)
      .innerJoin(seoAsins, eq(seoAsins.id, seoPassageMap.asinId))
      .where(inArray(seoPassageMap.projectId, projectIds)),
    db
      .select({ text: seoKeywords.text, tier: seoKeywords.priorityTier, searchVolume: seoKeywords.searchVolume, suggestedBid: seoKeywords.ppcSuggestedBid })
      .from(seoKeywords)
      .where(and(inArray(seoKeywords.projectId, projectIds), inArray(seoKeywords.priorityTier, ["T1", "T2"]), eq(seoKeywords.isNegative, false))),
  ]);
  return {
    s6: maps.map((m) => ({ asin: m.asin, keywords: (m.passages ?? []).flatMap((p) => p.keywords_used ?? []) })),
    s2: kws.map((k) => ({ text: k.text, tier: k.tier, searchVolume: k.searchVolume, suggestedBid: k.suggestedBid == null ? null : Number(k.suggestedBid) })),
  };
}
