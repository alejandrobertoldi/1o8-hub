/* eslint-disable react-doctor/js-tosorted-immutable */
/**
 * PPC Redshift query library.
 *
 * Queries the Intentwise ecommerce_graph summary tables for
 * campaign, keyword, search term, and advertised product data.
 * All queries use parameterized inputs.
 */
import { queryRedshift, queryRedshiftOrThrow } from "@/lib/redshift";

const EG = "intentwise_ecommerce_graph";
const ASD = "amazon_source_data";

// ─── Types ───────────────────────────────────────────────────────────

export interface CampaignRow {
  account_id: number;
  account_name: string;
  campaign_id: number;
  campaign_name: string;
  campaign_type: string;
  status: string;
  daily_budget: number;
  bidding_strategy: string;
  report_date: string;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_conversions: number;
  ad_orders: number;
  ntb_revenue: number;
  ntb_orders: number;
  percent_time_in_budget: number;
}

export interface KeywordRow {
  account_id: number;
  keyword_id: number;
  keyword_text: string;
  match_type: string;
  is_brand_keyword: boolean;
  current_bid: number;
  adgroup_name: string;
  campaign_id: number;
  campaign_name: string;
  campaign_type: string;
  report_date: string;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_conversions: number;
  ad_orders: number;
  ad_top_of_search_impression_share: number;
}

export interface SearchTermRow {
  account_id: number;
  search_term: string;
  target: string;
  match_type: string;
  is_asin: boolean;
  is_brand_term: boolean;
  campaign_name: string;
  campaign_type: string;
  report_date: string;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_conversions: number;
  ad_orders: number;
}

/** One row per search term, SUMmed in Redshift over a date range (see fetchSearchTermTotals). */
export interface SearchTermTotalRow {
  search_term: string;
  is_asin: boolean;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
}

export interface SqpRow {
  account_id: number;
  asin: string;
  search_query: string;
  search_query_volume: number;
  asin_impression_count: number;
  asin_impression_share: number;
  asin_click_count: number;
  asin_click_share: number;
  asin_cart_add_count: number;
  asin_cart_add_share: number;
  asin_purchase_count: number;
  asin_purchase_share: number;
  start_date: string;
  end_date: string;
}

// ─── Queries ─────────────────────────────────────────────────────────

const QUERY_TIMEOUT = 30_000; // 30s per-query timeout (eng decision #6)

export interface DailyMetricRow {
  report_date: string;
  total_spend: number;
  total_revenue: number;
  total_impressions: number;
  total_clicks: number;
  total_orders: number;
}

/** Daily aggregated campaign metrics for sparklines */
export async function fetchDailyCampaignMetrics(
  accountId: number,
  startDate: string,
  endDate: string
): Promise<DailyMetricRow[]> {
  return queryRedshift<DailyMetricRow>(
    `SELECT
      report_date,
      SUM(ad_spend) AS total_spend,
      SUM(ad_revenue) AS total_revenue,
      SUM(ad_impressions) AS total_impressions,
      SUM(ad_clicks) AS total_clicks,
      SUM(ad_orders) AS total_orders
    FROM "${EG}"."campaign_summary"
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY report_date
    ORDER BY report_date ASC`,
    [accountId, startDate, endDate]
  );
}

export async function fetchCampaignSummary(
  accountId: number,
  startDate: string,
  endDate: string
): Promise<CampaignRow[]> {
  return queryRedshift<CampaignRow>(
    `SELECT
      account_id, account_name, campaign_id, campaign_name, campaign_type,
      status, daily_budget, bidding_strategy, report_date,
      ad_impressions, ad_clicks, ad_spend, ad_revenue,
      ad_conversions, ad_orders, ntb_revenue, ntb_orders,
      percent_time_in_budget
    FROM "${EG}"."campaign_summary"
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    ORDER BY report_date DESC, ad_spend DESC`,
    [accountId, startDate, endDate]
  );
}

export async function fetchKeywordSummary(
  accountId: number,
  startDate: string,
  endDate: string
): Promise<KeywordRow[]> {
  return queryRedshift<KeywordRow>(
    `SELECT
      account_id, keyword_id, keyword_text, match_type, is_brand_keyword,
      current_bid, adgroup_name, campaign_id, campaign_name, campaign_type,
      report_date, ad_impressions, ad_clicks, ad_spend, ad_revenue,
      ad_conversions, ad_orders, ad_top_of_search_impression_share
    FROM "${EG}"."keyword_summary"
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    ORDER BY report_date DESC, ad_spend DESC`,
    [accountId, startDate, endDate]
  );
}

export async function fetchSearchTermSummary(
  accountId: number,
  startDate: string,
  endDate: string
): Promise<SearchTermRow[]> {
  return queryRedshift<SearchTermRow>(
    `SELECT
      account_id, search_term, target, match_type, is_asin, is_brand_term,
      campaign_name, campaign_type, report_date,
      ad_impressions, ad_clicks, ad_spend, ad_revenue,
      ad_conversions, ad_orders
    FROM "${EG}"."searchterm_summary"
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    ORDER BY report_date DESC, ad_spend DESC`,
    [accountId, startDate, endDate]
  );
}

/**
 * Search term totals SUMmed in Redshift over the given date range, one row
 * per (non-ASIN) search term. Uses queryRedshiftOrThrow with retry disabled:
 * queryRedshift swallows errors and returns [], which would otherwise cache
 * a Redshift outage for 24h as "this account legitimately has no data".
 */
export async function fetchSearchTermTotals(
  accountId: number,
  startDate: string,
  endDate: string
): Promise<SearchTermTotalRow[]> {
  return queryRedshiftOrThrow<SearchTermTotalRow>(
    `SELECT
      search_term,
      bool_or(is_asin) AS is_asin,
      SUM(ad_impressions) AS ad_impressions,
      SUM(ad_clicks) AS ad_clicks,
      SUM(ad_spend) AS ad_spend,
      SUM(ad_revenue) AS ad_revenue,
      SUM(ad_orders) AS ad_orders
    FROM "${EG}"."searchterm_summary"
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
      AND NOT is_asin
      AND search_term IS NOT NULL
    GROUP BY search_term`,
    [accountId, startDate, endDate],
    { retry: false }
  );
}

export interface AsinWindowSpec {
  asin: string;
  before: { start: string; end: string };
  after: { start: string; end: string };
}

/** One row per (advertised ASIN, search term, window) — see fetchAsinTermWindows. */
export interface AsinTermWindowRow {
  asin: string;
  search_term: string;
  win: "before" | "after";
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
}

/**
 * Per-ASIN search-term sums for each ASIN's own before/after windows (SEO ↔ PPC
 * status v2, spec §7). Search terms are attributed to an ASIN through the ad
 * groups that advertise it; an ad group advertising several ASINs counts
 * under each of them (flagged in the UI via fetchAdGroupShares).
 * An after window whose end < start (go-live today) simply matches no rows.
 */
export async function fetchAsinTermWindows(accountId: number, specs: AsinWindowSpec[]): Promise<AsinTermWindowRow[]> {
  if (specs.length === 0) return [];
  const params: Array<string | number> = [accountId];
  // Redshift rejects `WITH w(...) AS (VALUES ...)`, so the window table is a UNION ALL of SELECTs.
  const selects = specs.map((s, n) => {
    const i = params.length + 1;
    params.push(s.asin, s.before.start, s.before.end, s.after.start, s.after.end);
    return n === 0
      ? `SELECT $${i}::varchar AS asin, $${i + 1}::date AS before_start, $${i + 2}::date AS before_end, $${i + 3}::date AS after_start, $${i + 4}::date AS after_end`
      : `SELECT $${i}::varchar, $${i + 1}::date, $${i + 2}::date, $${i + 3}::date, $${i + 4}::date`;
  });
  // A plain overall date bound lets Redshift prune by report_date; the per-ASIN OR below alone
  // scanned the account's whole history and hit the 90s read timeout. YYYY-MM-DD sorts as text.
  const lo = specs.map((s) => s.before.start).sort()[0];
  const hi = specs.map((s) => s.after.end).sort().at(-1)!;
  params.push(lo, hi);
  const loIdx = params.length - 1, hiIdx = params.length;
  return queryRedshiftOrThrow<AsinTermWindowRow>(
    `WITH w AS (${selects.join(" UNION ALL ")}),
    pa AS (
      SELECT DISTINCT adgroupid::varchar AS ag, asin
      FROM "${ASD}"."ad_sponsoredproducts_productads"
      WHERE account_id = $1
    )
    SELECT w.asin, st.search_term,
      CASE WHEN st.report_date BETWEEN w.before_start AND w.before_end THEN 'before' ELSE 'after' END AS win,
      SUM(st.ad_impressions) AS ad_impressions,
      SUM(st.ad_clicks) AS ad_clicks,
      SUM(st.ad_spend) AS ad_spend,
      SUM(st.ad_revenue) AS ad_revenue,
      SUM(st.ad_orders) AS ad_orders
    FROM "${EG}"."searchterm_summary" st
    JOIN pa ON pa.ag = st.adgroup_id::varchar
    JOIN w ON w.asin = pa.asin
    WHERE st.account_id = $1
      AND NOT st.is_asin
      AND st.search_term IS NOT NULL
      AND st.report_date BETWEEN $${loIdx}::date AND $${hiIdx}::date
      AND (st.report_date BETWEEN w.before_start AND w.before_end
        OR st.report_date BETWEEN w.after_start AND w.after_end)
    GROUP BY 1, 2, 3`,
    params,
    { retry: false }
  );
}

export interface AdGroupShareRow {
  asin: string;
  shared_with: number;
}

/**
 * For each given ASIN that is advertised in SP: how many OTHER ASINs share at least one of its
 * ad groups (0 when all its ad groups are solo). An ASIN with no row is not advertised (O3).
 */
export async function fetchAdGroupShares(accountId: number, asins: string[]): Promise<AdGroupShareRow[]> {
  if (asins.length === 0) return [];
  const placeholders = asins.map((_, i) => `$${i + 2}`).join(", ");
  return queryRedshiftOrThrow<AdGroupShareRow>(
    `WITH pa AS (
      SELECT DISTINCT adgroupid::varchar AS ag, asin
      FROM "${ASD}"."ad_sponsoredproducts_productads"
      WHERE account_id = $1
    )
    SELECT a.asin, COUNT(DISTINCT b.asin) AS shared_with
    FROM pa a
    LEFT JOIN pa b ON b.ag = a.ag AND b.asin <> a.asin
    WHERE a.asin IN (${placeholders})
    GROUP BY 1`,
    [accountId, ...asins],
    { retry: false }
  );
}

export async function fetchSqpData(
  accountId: number,
  startDate: string,
  endDate: string
): Promise<SqpRow[]> {
  return queryRedshift<SqpRow>(
    `SELECT
      account_id, asin, search_query, search_query_volume,
      asin_impression_count, asin_impression_share,
      asin_click_count, asin_click_share,
      asin_cart_add_count, asin_cart_add_share,
      asin_purchase_count, asin_purchase_share,
      start_date, end_date
    FROM "${ASD}"."brandanalytics_searchqueryperformance_report"
    WHERE account_id = $1
      AND start_date >= $2
      AND end_date <= $3
    ORDER BY search_query_volume DESC`,
    [accountId, startDate, endDate]
  );
}

// ─── Aggregation helpers ─────────────────────────────────────────────

export interface CampaignSummaryAgg {
  totalSpend: number;
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  totalOrders: number;
  totalConversions: number;
  acos: number;
  roas: number;
  cpc: number;
  ctr: number;
  cvr: number;
  topCampaigns: { name: string; spend: number; revenue: number; impressions: number; clicks: number; orders: number; acos: number; roas: number; cpc: number; ctr: number; cvr: number }[];
  campaignCount: number;
  byType: Record<string, { spend: number; revenue: number; impressions: number }>;
}

export function aggregateCampaigns(rows: CampaignRow[]): CampaignSummaryAgg {
  let totalSpend = 0, totalRevenue = 0, totalImpressions = 0;
  let totalClicks = 0, totalOrders = 0, totalConversions = 0;
  const byType: Record<string, { spend: number; revenue: number; impressions: number }> = {};
  const byCampaign = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; orders: number }>();

  for (const r of rows) {
    const spend = Number(r.ad_spend) || 0;
    const revenue = Number(r.ad_revenue) || 0;
    const impressions = Number(r.ad_impressions) || 0;
    const clicks = Number(r.ad_clicks) || 0;
    const orders = Number(r.ad_orders) || 0;
    totalSpend += spend;
    totalRevenue += revenue;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalOrders += orders;
    totalConversions += Number(r.ad_conversions) || 0;

    const t = r.campaign_type || "unknown";
    if (!byType[t]) byType[t] = { spend: 0, revenue: 0, impressions: 0 };
    byType[t].spend += spend;
    byType[t].revenue += revenue;
    byType[t].impressions += impressions;

    const existing = byCampaign.get(r.campaign_name) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, orders: 0 };
    existing.spend += spend;
    existing.revenue += revenue;
    existing.impressions += impressions;
    existing.clicks += clicks;
    existing.orders += orders;
    byCampaign.set(r.campaign_name, existing);
  }

  const topCampaigns = [...byCampaign.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([name, d]) => ({
      name,
      spend: d.spend,
      revenue: d.revenue,
      impressions: d.impressions,
      clicks: d.clicks,
      orders: d.orders,
      acos: d.revenue > 0 ? (d.spend / d.revenue) * 100 : 0,
      roas: d.spend > 0 ? d.revenue / d.spend : 0,
      cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      cvr: d.clicks > 0 ? (d.orders / d.clicks) * 100 : 0,
    }));

  return {
    totalSpend,
    totalRevenue,
    totalImpressions,
    totalClicks,
    totalOrders,
    totalConversions,
    acos: totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : 0,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cvr: totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0,
    topCampaigns,
    campaignCount: byCampaign.size,
    byType,
  };
}

export interface KeywordSummaryAgg {
  totalKeywords: number;
  brandKeywords: number;
  nonBrandKeywords: number;
  totalSpend: number;
  totalRevenue: number;
  topKeywords: { text: string; spend: number; revenue: number; acos: number; impressions: number; isBrand: boolean }[];
}

export function aggregateKeywords(rows: KeywordRow[]): KeywordSummaryAgg {
  let totalSpend = 0, totalRevenue = 0;
  const byKeyword = new Map<string, { spend: number; revenue: number; impressions: number; isBrand: boolean }>();
  const brandSet = new Set<string>();
  const nonBrandSet = new Set<string>();

  for (const r of rows) {
    const spend = Number(r.ad_spend) || 0;
    const revenue = Number(r.ad_revenue) || 0;
    totalSpend += spend;
    totalRevenue += revenue;

    const existing = byKeyword.get(r.keyword_text) || { spend: 0, revenue: 0, impressions: 0, isBrand: r.is_brand_keyword };
    existing.spend += spend;
    existing.revenue += revenue;
    existing.impressions += Number(r.ad_impressions) || 0;
    byKeyword.set(r.keyword_text, existing);

    if (r.is_brand_keyword) brandSet.add(r.keyword_text);
    else nonBrandSet.add(r.keyword_text);
  }

  const topKeywords = [...byKeyword.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([text, d]) => ({
      text,
      spend: d.spend,
      revenue: d.revenue,
      acos: d.revenue > 0 ? (d.spend / d.revenue) * 100 : 0,
      impressions: d.impressions,
      isBrand: d.isBrand,
    }));

  return {
    totalKeywords: byKeyword.size,
    brandKeywords: brandSet.size,
    nonBrandKeywords: nonBrandSet.size,
    totalSpend,
    totalRevenue,
    topKeywords,
  };
}

export interface SearchTermSummaryAgg {
  totalSearchTerms: number;
  totalSpend: number;
  totalRevenue: number;
  brandTermCount: number;
  asinTargetCount: number;
  topSearchTerms: { term: string; spend: number; revenue: number; clicks: number; impressions: number }[];
}

export function aggregateSearchTerms(rows: SearchTermRow[]): SearchTermSummaryAgg {
  let totalSpend = 0, totalRevenue = 0;
  let brandTermCount = 0, asinTargetCount = 0;
  const byTerm = new Map<string, { spend: number; revenue: number; clicks: number; impressions: number }>();

  for (const r of rows) {
    const spend = Number(r.ad_spend) || 0;
    const revenue = Number(r.ad_revenue) || 0;
    totalSpend += spend;
    totalRevenue += revenue;

    const existing = byTerm.get(r.search_term) || { spend: 0, revenue: 0, clicks: 0, impressions: 0 };
    existing.spend += spend;
    existing.revenue += revenue;
    existing.clicks += Number(r.ad_clicks) || 0;
    existing.impressions += Number(r.ad_impressions) || 0;
    byTerm.set(r.search_term, existing);
  }

  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.search_term)) continue;
    seen.add(r.search_term);
    if (r.is_brand_term) brandTermCount++;
    if (r.is_asin) asinTargetCount++;
  }

  const topSearchTerms = [...byTerm.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([term, d]) => ({
      term,
      spend: d.spend,
      revenue: d.revenue,
      clicks: d.clicks,
      impressions: d.impressions,
    }));

  return {
    totalSearchTerms: byTerm.size,
    totalSpend,
    totalRevenue,
    brandTermCount,
    asinTargetCount,
    topSearchTerms,
  };
}
