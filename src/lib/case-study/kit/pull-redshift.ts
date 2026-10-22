import { queryRedshift } from "@/lib/redshift";
import type { PulledMetrics, ChannelBlock, ProductRow } from "./metrics";

export type PullGroup = "account" | "products" | "campaigns";
export interface RedshiftPull { metrics: Partial<PulledMetrics>; failed: PullGroup[] }

const ACCOUNT_SQL = `
  SELECT TO_CHAR(report_date::DATE, 'YYYY-MM') AS month,
    SUM(sales) AS sales, SUM(units) AS units, SUM(ad_sales) AS ad_sales, SUM(ad_spend) AS ad_spend,
    SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(ad_orders) AS ad_orders, SUM(sessions) AS sessions
  FROM (
    SELECT report_date,
      COALESCE(NULLIF(MAX(ordered_revenue), 0), MAX(product_sales), 0) AS sales,
      COALESCE(NULLIF(MAX(ordered_units), 0), MAX(product_quantity), 0) AS units,
      COALESCE(MAX(ad_revenue), 0) AS ad_sales, COALESCE(MAX(ad_spend), 0) AS ad_spend,
      COALESCE(MAX(ad_impressions), 0) AS impressions, COALESCE(MAX(ad_clicks), 0) AS clicks,
      COALESCE(MAX(ad_orders), 0) AS ad_orders,
      COALESCE(MAX(browser_session), 0) + COALESCE(MAX(mobile_app_sessions), 0) AS sessions
    FROM "intentwise_ecommerce_graph"."account_summary"
    WHERE account_id = $1::BIGINT AND report_date::DATE >= $2::DATE AND report_date::DATE <= $3::DATE
    GROUP BY report_date
  ) d
  GROUP BY 1 ORDER BY 1`;

const PRODUCT_SQL = `
  SELECT asin, sku, MAX(title) AS title, SUM(sales) AS sales, SUM(units) AS units, SUM(page_views) AS page_views,
    SUM(CASE WHEN buy_box IS NOT NULL THEN buy_box * sales ELSE 0 END) AS bb_num,
    SUM(CASE WHEN buy_box IS NOT NULL THEN sales ELSE 0 END) AS bb_den
  FROM (
    SELECT report_date, sku, MAX(product) AS asin, MAX(product_title) AS title,
      COALESCE(MAX(product_sales), 0) AS sales, COALESCE(MAX(product_quantity), 0) AS units,
      COALESCE(MAX(browser_page_views), 0) + COALESCE(MAX(mobile_app_page_views), 0) AS page_views,
      MAX(buy_box_prcntg) AS buy_box
    FROM "intentwise_ecommerce_graph"."product_summary"
    WHERE account_id = $1::BIGINT AND report_date::DATE >= $2::DATE AND report_date::DATE <= $3::DATE
    GROUP BY report_date, sku
  ) d
  GROUP BY asin, sku`;

const CAMPAIGN_SQL = `
  SELECT TO_CHAR(report_date::DATE, 'YYYY-MM') AS month, campaign_type,
    COALESCE(SUM(ad_spend), 0) AS spend, COALESCE(SUM(ad_revenue), 0) AS sales, COALESCE(SUM(ad_orders), 0) AS orders
  FROM "intentwise_ecommerce_graph"."campaign_summary"
  WHERE account_id = $1::BIGINT AND report_date::DATE >= $2::DATE AND report_date::DATE <= $3::DATE
  GROUP BY 1, 2 ORDER BY 1`;

const n = (v: unknown) => Number(v ?? 0) || 0;
export function normaliseBuyBox(v: number): number { return v <= 1 ? v * 100 : v; }
export function channelOf(campaignType: string | null): "sp" | "sbsd" | "other" {
  const t = (campaignType ?? "").trim().toUpperCase();
  if (t.startsWith("SP")) return "sp";
  if (t.startsWith("SB") || t.startsWith("SD")) return "sbsd";
  return "other";
}

function mapAccount(rows: Record<string, unknown>[]): Partial<PulledMetrics> {
  if (!rows.length) return {};
  const sum = (k: string) => rows.reduce((s, r) => s + n(r[k]), 0);
  return {
    salesMonthly: rows.map((r) => ({ month: String(r.month), value: n(r.sales) })),
    salesTotal: sum("sales"), unitsTotal: sum("units"), adSales: sum("ad_sales"), adSpend: sum("ad_spend"),
    adImpressions: sum("impressions"), adClicks: sum("clicks"), adOrders: sum("ad_orders"), sessions: sum("sessions"),
  };
}

function mapProducts(rows: Record<string, unknown>[]): Partial<PulledMetrics> {
  if (!rows.length) return {};
  const byAsin = new Map<string, { title: string; sales: number; units: number }>();
  let pageViews = 0, bbNum = 0, bbDen = 0;
  const skus = new Set<string>();
  for (const r of rows) {
    const asin = String(r.asin ?? "");
    const cur = byAsin.get(asin) ?? { title: String(r.title ?? asin), sales: 0, units: 0 };
    cur.sales += n(r.sales); cur.units += n(r.units);
    byAsin.set(asin, cur);
    pageViews += n(r.page_views); bbNum += n(r.bb_num); bbDen += n(r.bb_den);
    if (n(r.sales) > 0) skus.add(String(r.sku));
  }
  const list = [...byAsin.entries()].filter(([a]) => a);
  const top = (k: "sales" | "units"): ProductRow[] =>
    list.filter(([, v]) => v[k] > 0).sort((a, b) => b[1][k] - a[1][k]).slice(0, 3)
      .map(([asin, v]) => ({ asin, title: v.title, value: v[k] }));
  return {
    pageViews, skuCount: skus.size,
    ...(bbDen > 0 ? { buyBoxPct: normaliseBuyBox(bbNum / bbDen) } : {}),
    topByRevenue: top("sales"), topByUnits: top("units"),
  };
}

function mapCampaigns(rows: Record<string, unknown>[]): Partial<PulledMetrics> {
  if (!rows.length) return {};
  const block = (ch: "sp" | "sbsd"): ChannelBlock => {
    const mine = rows.filter((r) => channelOf(r.campaign_type as string | null) === ch);
    const months = new Map<string, { spend: number; sales: number }>();
    for (const r of mine) {
      const m = months.get(String(r.month)) ?? { spend: 0, sales: 0 };
      m.spend += n(r.spend); m.sales += n(r.sales);
      months.set(String(r.month), m);
    }
    return {
      spend: mine.reduce((s, r) => s + n(r.spend), 0), sales: mine.reduce((s, r) => s + n(r.sales), 0),
      orders: mine.reduce((s, r) => s + n(r.orders), 0),
      monthly: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
    };
  };
  return { paidSp: block("sp"), paidSbSd: block("sbsd") };
}

export async function pullRedshiftMetrics(accountId: string, start: string, end: string): Promise<RedshiftPull> {
  const params = [accountId, start, end];
  const groups: [PullGroup, string, (r: Record<string, unknown>[]) => Partial<PulledMetrics>][] = [
    ["account", ACCOUNT_SQL, mapAccount], ["products", PRODUCT_SQL, mapProducts], ["campaigns", CAMPAIGN_SQL, mapCampaigns],
  ];
  const settled = await Promise.allSettled(groups.map(([, sql]) => queryRedshift<Record<string, unknown>>(sql, params)));
  const metrics: Partial<PulledMetrics> = {};
  const failed: PullGroup[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") Object.assign(metrics, groups[i][2](s.value));
    else { failed.push(groups[i][0]); console.error(`[case-study pull] ${groups[i][0]} failed:`, s.reason); }
  });
  return { metrics, failed };
}
