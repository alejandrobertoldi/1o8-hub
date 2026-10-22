import type { OverviewDailyRow, OverviewResponse } from "./kpi-derivations";
import type { CampaignRow } from "./campaigns";
import { classifyRoas, type Band } from "./status-bands";

export interface CombinedPoint { date: string; sales: number; adRevenue: number; adSpend: number; acos: number }
export interface CpcCvrPoint { date: string; cpc: number; cvr: number }
export interface TrafficPoint { date: string; impressions: number; clicks: number; ctr: number }
export interface FunnelStep {
  key: string;
  label: string;
  value: number;
  unit: "count" | "currency";
  pctOfSessions: number | null;
  dollarsPerOrder?: number;
}
export interface RoasRankRow { label: string; roas: number; adSpend: number; adRevenue: number; band: Band }
export interface ScatterPoint { label: string; x: number; y: number; r: number; band: Band }

/** Division that never yields NaN/Infinity: 0 when the denominator is 0/absent. */
function safeDiv(num: number | null | undefined, den: number | null | undefined): number {
  if (num == null || den == null || den === 0) return 0;
  return num / den;
}

// ── Per-day series (combined chart, CPC/CVR chart, traffic chart) ──────────────
export function combinedSeries(daily: OverviewDailyRow[]): CombinedPoint[] {
  return (daily ?? []).map((r) => ({
    date: r.report_date,
    sales: r.product_sales ?? 0,
    adRevenue: r.ad_revenue ?? 0,
    adSpend: r.ad_spend ?? 0,
    acos: safeDiv(r.ad_spend, r.ad_revenue) * 100,
  }));
}

export function cpcCvrSeries(daily: OverviewDailyRow[]): CpcCvrPoint[] {
  return (daily ?? []).map((r) => ({
    date: r.report_date,
    cpc: safeDiv(r.ad_spend, r.ad_clicks),
    cvr: safeDiv(r.ad_conversions, r.ad_clicks) * 100,
  }));
}

export function trafficSeries(daily: OverviewDailyRow[]): TrafficPoint[] {
  return (daily ?? []).map((r) => ({
    date: r.report_date,
    impressions: r.ad_impressions ?? 0,
    clicks: r.ad_clicks ?? 0,
    ctr: safeDiv(r.ad_clicks, r.ad_impressions) * 100,
  }));
}

// ── Conversion funnel: Sessions → Clicks → Conversions → Sales ─────────────────
export function computeFunnel(d: OverviewResponse): FunnelStep[] {
  const sessions = d.sessions ?? 0;
  const clicks = d.clicks ?? 0;
  const conversions = d.conversions ?? 0;
  const sales = d.totalSales ?? 0;
  const pct = (n: number): number | null => (sessions > 0 ? (n / sessions) * 100 : null);
  return [
    { key: "sessions", label: "Sessions", value: sessions, unit: "count", pctOfSessions: sessions > 0 ? 100 : null },
    { key: "clicks", label: "Clicks", value: clicks, unit: "count", pctOfSessions: pct(clicks) },
    { key: "conversions", label: "Conversions", value: conversions, unit: "count", pctOfSessions: pct(conversions) },
    { key: "sales", label: "Sales", value: sales, unit: "currency", pctOfSessions: null, dollarsPerOrder: conversions > 0 ? sales / conversions : 0 },
  ];
}

// ── Campaign charts: ROAS ranking + spend/ROAS scatter ─────────────────────────
/** campaign_type → campaign_name → "Unknown". */
function defaultCampaignLabel(r: CampaignRow): string {
  return r.campaignType ?? r.campaignName ?? "Unknown";
}

export function rankByRoas(rows: CampaignRow[], label: (r: CampaignRow) => string = defaultCampaignLabel): RoasRankRow[] {
  return (rows ?? [])
    .map((r) => ({ label: label(r), roas: r.roas ?? 0, adSpend: r.adSpend ?? 0, adRevenue: r.adRevenue ?? 0, band: classifyRoas(r.roas ?? 0) }))
    .sort((a, b) => (b.roas - a.roas) || a.label.localeCompare(b.label));
}

export function toScatter(
  rows: CampaignRow[],
  opts: { label?: (r: CampaignRow) => string; minR?: number; maxR?: number } = {},
): ScatterPoint[] {
  const label = opts.label ?? defaultCampaignLabel;
  const minR = opts.minR ?? 6;
  const maxR = opts.maxR ?? 28;
  const maxRev = Math.max(0, ...(rows ?? []).map((r) => r.adRevenue ?? 0));
  const scaleR = (rev: number): number => (maxRev > 0 ? minR + (rev / maxRev) * (maxR - minR) : minR);
  return (rows ?? []).map((r) => ({
    label: label(r),
    x: r.adSpend ?? 0,
    y: r.roas ?? 0,
    r: scaleR(r.adRevenue ?? 0),
    band: classifyRoas(r.roas ?? 0),
  }));
}
