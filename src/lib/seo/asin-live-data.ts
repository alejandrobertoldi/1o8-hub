/**
 * I/O for SEO ↔ PPC status v2: per-(project, ASIN) live rows (Postgres),
 * exported listing versions (BigQuery MFBibleApp.SEO), and per-ASIN search-term
 * windows (Redshift, 24h reports_cache). Rules live in asin-live.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportsCache, seoKeywords, seoProjectAsinLive, seoProjects } from "@/lib/db/schema";
import { getBigQueryClient, SEO_VERSIONS_READ_TABLE } from "@/lib/bigquery";
import { fetchAdGroupShares, fetchAsinTermWindows, type AdGroupShareRow, type AsinTermWindowRow, type AsinWindowSpec } from "@/lib/ppc-queries";
import { listingTextFromBqRow, type ListingText } from "./listing-match";
import type { AsinLiveRow, AsinLiveStatus } from "./asin-live";
import { isFresh } from "./ppc-status-data";

export const ASIN_CACHE_TYPE = "seo-ppc-status-asin";

export function versionKey(asin: string, version: number): string {
  return `${asin}|${version}`;
}

export async function loadVersionTexts(keys: Array<{ asin: string; version: number }>): Promise<Map<string, ListingText>> {
  const out = new Map<string, ListingText>();
  if (keys.length === 0) return out;
  const [job] = await getBigQueryClient().createQueryJob({
    query: `SELECT * FROM \`${SEO_VERSIONS_READ_TABLE}\`
      WHERE CONCAT(ASIN, '|', CAST(SAFE_CAST(SEOVersionNumber AS INT64) AS STRING)) IN UNNEST(@keys)
      ORDER BY ASIN, SKU`,
    params: { keys: keys.map((k) => versionKey(k.asin, k.version)) },
  });
  const [rows] = await job.getQueryResults();
  for (const r of rows as Array<Record<string, unknown>>) {
    const k = versionKey(String(r.ASIN), Number(r.SEOVersionNumber));
    if (!out.has(k)) out.set(k, listingTextFromBqRow(r));
  }
  return out;
}

const liveCols = {
  projectId: seoProjectAsinLive.projectId,
  asin: seoProjectAsinLive.asin,
  status: seoProjectAsinLive.status,
  liveDate: seoProjectAsinLive.liveDate,
  deprecatedDate: seoProjectAsinLive.deprecatedDate,
  deprecatedByProjectId: seoProjectAsinLive.deprecatedByProjectId,
  versionNumber: seoProjectAsinLive.versionNumber,
};

function asRow(r: { status: string } & Omit<AsinLiveRow, "status">): AsinLiveRow {
  return { ...r, status: r.status as AsinLiveStatus };
}

export async function loadClientLiveRows(clientId: string): Promise<Array<AsinLiveRow & { projectName: string }>> {
  const rows = await db
    .select({ ...liveCols, projectName: seoProjects.name })
    .from(seoProjectAsinLive)
    .innerJoin(seoProjects, eq(seoProjects.id, seoProjectAsinLive.projectId))
    .where(and(eq(seoProjectAsinLive.clientIdCode, clientId), eq(seoProjectAsinLive.status, "live")))
    .orderBy(asc(seoProjectAsinLive.asin));
  return rows.map((r) => ({ ...asRow(r), projectName: r.projectName }));
}

export async function loadRowsForAsins(clientId: string, asins: string[]): Promise<AsinLiveRow[]> {
  if (asins.length === 0) return [];
  const rows = await db
    .select(liveCols)
    .from(seoProjectAsinLive)
    .where(and(eq(seoProjectAsinLive.clientIdCode, clientId), inArray(seoProjectAsinLive.asin, asins)));
  return rows.map(asRow);
}

export async function loadS2Keywords(projectIds: string[]): Promise<Map<string, Array<{ text: string; tier: string | null }>>> {
  const out = new Map<string, Array<{ text: string; tier: string | null }>>();
  if (projectIds.length === 0) return out;
  const rows = await db
    .select({ projectId: seoKeywords.projectId, text: seoKeywords.text, tier: seoKeywords.priorityTier })
    .from(seoKeywords)
    .where(and(inArray(seoKeywords.projectId, projectIds), eq(seoKeywords.isNegative, false)));
  for (const r of rows) {
    const arr = out.get(r.projectId) ?? [];
    arr.push({ text: r.text, tier: r.tier });
    out.set(r.projectId, arr);
  }
  return out;
}

export function asinCacheKey(accountId: number, specs: AsinWindowSpec[], shareAsins: string[] = []): string {
  const parts = specs.map((s) => `${s.asin}:${s.before.start}:${s.after.end}`).sort();
  const shares = [...new Set(shareAsins)].sort();
  return `${accountId}|${parts.join(",")}|${shares.join(",")}`;
}

interface AsinTermWindowsCacheData {
  /** 2 = shares lists every advertised ASIN (O3). Older rows listed only shared ones. */
  v: 2;
  rows: AsinTermWindowRow[];
  shares: AdGroupShareRow[];
}

/**
 * Old cache rows are a miss: pre-I2 stored a bare `AsinTermWindowRow[]`; pre-O3 (no `v: 2`)
 * listed only SHARED ASINs, which would read a solo-advertised ASIN as unadvertised.
 */
function isAsinTermWindowsCacheData(data: unknown): data is AsinTermWindowsCacheData {
  return !!data && typeof data === "object" && !Array.isArray(data) && (data as { v?: unknown }).v === 2 && Array.isArray((data as AsinTermWindowsCacheData).rows) && Array.isArray((data as AsinTermWindowsCacheData).shares);
}

/**
 * Fetches per-ASIN search-term windows AND ad-group shares (spec §7) together,
 * caching both under one reports_cache entry so a fresh cache hit makes zero
 * Redshift calls (I2 fix — shares used to be an uncached read on every page load).
 */
export async function loadAsinTermWindows(
  accountId: number,
  specs: AsinWindowSpec[],
  shareAsins: string[],
): Promise<{ rows: AsinTermWindowRow[]; shares: AdGroupShareRow[]; fetchedAt: Date }> {
  if (specs.length === 0 && shareAsins.length === 0) return { rows: [], shares: [], fetchedAt: new Date() };
  const cacheKey = asinCacheKey(accountId, specs, shareAsins);
  const [hit] = await db
    .select({ data: reportsCache.data, updatedAt: reportsCache.updatedAt })
    .from(reportsCache)
    .where(and(eq(reportsCache.cacheType, ASIN_CACHE_TYPE), eq(reportsCache.cacheKey, cacheKey)))
    .limit(1);
  if (hit && isFresh(hit.updatedAt, Date.now()) && isAsinTermWindowsCacheData(hit.data)) {
    return { rows: hit.data.rows, shares: hit.data.shares, fetchedAt: hit.updatedAt };
  }
  const [rows, shares] = await Promise.all([
    fetchAsinTermWindows(accountId, specs),
    fetchAdGroupShares(accountId, shareAsins),
  ]);
  const now = new Date();
  const data: AsinTermWindowsCacheData = { v: 2, rows, shares };
  await db
    .insert(reportsCache)
    .values({ cacheType: ASIN_CACHE_TYPE, cacheKey, data, updatedAt: now })
    .onConflictDoUpdate({ target: [reportsCache.cacheType, reportsCache.cacheKey], set: { data, updatedAt: now } });
  return { rows, shares, fetchedAt: now };
}
