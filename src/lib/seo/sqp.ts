import type { SqpRow } from "@/lib/ppc-queries";
import { db } from "@/lib/db";
import { seoProjects, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchSqpData } from "@/lib/ppc-queries";
import { getIntentwiseAccountId } from "@/lib/forecast-redshift";

/** Sort SQP rows by purchases desc; tie-break cart-adds desc, then volume desc. */
export function rankByPurchases(rows: SqpRow[]): SqpRow[] {
  return [...rows].sort(
    (a, b) =>
      b.asin_purchase_count - a.asin_purchase_count ||
      b.asin_cart_add_count - a.asin_cart_add_count ||
      b.search_query_volume - a.search_query_volume
  );
}

/**
 * Collapse per-week SQP rows (Redshift returns one row per query × week) into
 * one row per query for the window: sum the count metrics, volume-weight the
 * share percentages (so they stay ≤ 100), and span the date range. Without
 * this, the same phrase appears once per week and ranking reflects the best
 * single week rather than the 8-week total.
 */
export function aggregateByQuery(rows: SqpRow[]): SqpRow[] {
  const byQuery = new Map<string, SqpRow[]>();
  for (const r of rows) {
    const arr = byQuery.get(r.search_query);
    if (arr) arr.push(r);
    else byQuery.set(r.search_query, [r]);
  }
  const sum = (rs: SqpRow[], pick: (r: SqpRow) => number) => rs.reduce((s, r) => s + pick(r), 0);
  const out: SqpRow[] = [];
  for (const [query, rs] of byQuery) {
    const sumVol = sum(rs, (r) => r.search_query_volume);
    // Volume-weighted average of an already-0..100 share; falls back to a plain
    // mean when the window has no recorded volume.
    const wAvg = (pick: (r: SqpRow) => number) =>
      sumVol > 0 ? sum(rs, (r) => pick(r) * r.search_query_volume) / sumVol : sum(rs, pick) / rs.length;
    out.push({
      account_id: rs[0].account_id,
      asin: rs[0].asin,
      search_query: query,
      search_query_volume: sumVol,
      asin_impression_count: sum(rs, (r) => r.asin_impression_count),
      asin_impression_share: wAvg((r) => r.asin_impression_share),
      asin_click_count: sum(rs, (r) => r.asin_click_count),
      asin_click_share: wAvg((r) => r.asin_click_share),
      asin_cart_add_count: sum(rs, (r) => r.asin_cart_add_count),
      asin_cart_add_share: wAvg((r) => r.asin_cart_add_share),
      asin_purchase_count: sum(rs, (r) => r.asin_purchase_count),
      asin_purchase_share: wAvg((r) => r.asin_purchase_share),
      start_date: rs.reduce((m, r) => (r.start_date < m ? r.start_date : m), rs[0].start_date),
      end_date: rs.reduce((m, r) => (r.end_date > m ? r.end_date : m), rs[0].end_date),
    });
  }
  return out;
}

/** Group SQP rows by their ASIN. */
export function groupByAsin(rows: SqpRow[]): Record<string, SqpRow[]> {
  const out: Record<string, SqpRow[]> = {};
  for (const r of rows) (out[r.asin] ??= []).push(r);
  return out;
}

/** The ASIN with the highest total purchases, or null if every total is 0. */
export function pickLeadAsin(perAsin: Record<string, SqpRow[]>): string | null {
  let best: string | null = null;
  let bestTotal = 0;
  for (const [asin, rows] of Object.entries(perAsin)) {
    const total = rows.reduce((s, r) => s + r.asin_purchase_count, 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = asin;
    }
  }
  return bestTotal > 0 ? best : null;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The last `n` complete Sun-Sat weeks, ending on the most recently COMPLETED
 * Saturday (the Saturday before the current week's Sunday). Pure: `today` is
 * injected so it is deterministic in tests.
 */
export function lastNFullWeeks(n: number, today: Date): { startDate: string; endDate: string } {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  const endSat = new Date(d);
  endSat.setUTCDate(d.getUTCDate() - dow - 1); // Saturday before this week's Sunday
  const startSun = new Date(endSat);
  startSun.setUTCDate(endSat.getUTCDate() - (n * 7 - 1));
  return { startDate: fmt(startSun), endDate: fmt(endSat) };
}

export interface SqpWindow {
  startDate: string;
  endDate: string;
  weeks: number;
}

export type ProjectSqp =
  | { available: false; reason: "no-account-mapping" | "redshift-error" | "no-sqp-rows" }
  | {
      available: true;
      window: SqpWindow;
      leadAsin: string;
      perAsin: Record<string, SqpRow[]>;
      titleQueries: SqpRow[];
    };

/** Pure assembly: filter to the family, rank per ASIN, choose the lead ASIN. */
export function assembleProjectSqp(
  familyAsins: string[],
  rows: SqpRow[],
  window: SqpWindow
): ProjectSqp {
  const family = new Set(familyAsins);
  // Drop Amazon's aggregate/redacted totals row, which Redshift returns with a
  // null (or blank) search_query — it has the highest volume but is not a usable
  // keyword phrase, and would otherwise leak "null" into the title prompt and a
  // blank row into the UI table. (SqpRow types this as string but it can be null.)
  const inFamily = rows.filter((r) => family.has(r.asin) && !!r.search_query && r.search_query.trim() !== "");
  const grouped = groupByAsin(inFamily);
  const perAsin: Record<string, SqpRow[]> = {};
  for (const [asin, rs] of Object.entries(grouped)) perAsin[asin] = rankByPurchases(aggregateByQuery(rs));
  const leadAsin = pickLeadAsin(perAsin);
  if (!leadAsin) return { available: false, reason: "no-sqp-rows" };
  // A variation shares ONE title, so rank queries across the WHOLE family
  // (every child ASIN aggregated together), not just the top-selling ASIN.
  const titleQueries = rankByPurchases(aggregateByQuery(inFamily));
  return { available: true, window, leadAsin, perAsin, titleQueries };
}

export interface TitleKw {
  KeywordText: string;
  KeywordSearchVolume: number;
}

/** Build the "Approved Title Keywords" prompt block from SQP (preferred) or Helium 10. */
export function buildTitleKeywordBlock(sqp: ProjectSqp, titleKws: TitleKw[]): string {
  if (sqp.available) {
    const lines = sqp.titleQueries
      .slice(0, 8)
      .map((r) => `- ${r.search_query} (purchases: ${r.asin_purchase_count}, volume: ${r.search_query_volume})`)
      .join("\n");
    return `Source: Search Query Performance (SQP) — ranked by actual purchases across the whole variation family. Put the HIGHEST-converting query phrase right after the brand and keep it contiguous.\n${lines}`;
  }
  const lines = titleKws.map((k) => `- ${k.KeywordText} (SV: ${k.KeywordSearchVolume})`).join("\n");
  return `Source: Helium 10 search volume (no SQP data for this account). Put the HIGHEST-volume keyword first.\n${lines}`;
}

/**
 * Resolve a SEO project to its per-ASIN SQP, ranked by purchases.
 * Returns `{ available: false, reason }` for any miss (no account mapping,
 * Redshift error, or zero purchases) so callers fall back to Helium 10.
 */
export async function getProjectSqp(
  projectId: string,
  opts: { weeks?: number } = {}
): Promise<ProjectSqp> {
  const weeks = opts.weeks ?? 8;

  const [project] = await db
    .select({ clientIdCode: seoProjects.clientIdCode })
    .from(seoProjects)
    .where(eq(seoProjects.id, projectId))
    .limit(1);
  if (!project?.clientIdCode) return { available: false, reason: "no-account-mapping" };

  const accountId = await getIntentwiseAccountId(project.clientIdCode);
  if (!accountId) return { available: false, reason: "no-account-mapping" };

  const asinRows = await db
    .select({ asin: seoAsins.asin })
    .from(seoAsins)
    .where(eq(seoAsins.projectId, projectId));
  const familyAsins = asinRows.map((a) => a.asin).filter(Boolean) as string[];
  if (familyAsins.length === 0) return { available: false, reason: "no-sqp-rows" };

  const window = { ...lastNFullWeeks(weeks, new Date()), weeks };

  let rows: SqpRow[];
  try {
    rows = await fetchSqpData(accountId, window.startDate, window.endDate);
  } catch (err) {
    // Distinguish a real Redshift outage from "no Intentwise mapping" (which returns
    // above without logging). Both render the same H10 fallback notice in the UI.
    console.warn(
      `[seo/sqp] Redshift fetchSqpData failed for project ${projectId} (account ${accountId}); falling back to Helium 10.`,
      err
    );
    return { available: false, reason: "redshift-error" };
  }

  return assembleProjectSqp(familyAsins, rows, window);
}
