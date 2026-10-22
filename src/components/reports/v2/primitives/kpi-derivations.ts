import type { ChipTone } from "./chip";
import type { KpiMiniStat } from "./kpi-card";
import { classifyRoas, classifyAcos, type Band } from "./status-bands";

/** One row of the overview daily series (subset we consume). */
export interface OverviewDailyRow {
  report_date: string;
  product_sales: number | null;
  ad_revenue: number | null;
  ad_spend: number | null;
  ad_clicks: number | null;
  ad_conversions: number | null;
  ad_impressions?: number | null; // traffic chart (present in route response; optional to keep prior fixtures valid)
}

/** Subset of GET /api/reports/overview consumed by the KPI grid. */
export interface OverviewResponse {
  totalSales: number; totalSalesPY: number; yoyPct: number; salesGoal: number;
  organicSales: number; organicSalesPY: number; organicSalesYoYPct: number;
  adRevenue: number; adRevenuePY: number; adRevenueYoYPct: number;
  adSpend: number; adSpendPY: number; adSpendYoYPct: number; adSpendGoal: number;
  acos: number; acosPY: number; acosGoal: number; // acos in percent points; acosGoal is a fraction
  roas: number; roasPY: number; roasGoal: number;  // ratios
  conversions: number; conversionsPY: number;
  clicks: number; clicksPY: number; cvrYoYPct: number;
  // ── Insight-only fields (§7). Present in the raw /api/reports/overview response
  //    (see route.ts) but not needed by the KPI grid, so optional here. ──────────
  tacos?: number;            // percent points (adSpend / totalSales × 100)
  tacosGoal?: number;        // FRACTION (×100 to compare with tacos)
  clicksYoYPct?: number;
  conversionsYoYPct?: number;
  // ── Chart-only scalars (§8). Present in the raw /api/reports/overview response
  //    (route.ts) but not needed by the KPI grid, so optional here. ──────────────
  sessions?: number;         // funnel step 1 (mobile + browser sessions)
  impressions?: number;      // traffic chart chip
  ctr?: number;              // traffic chart chip (percent points)
  cpc?: number;              // CPC/CVR chart chip
  cvr?: number;              // CPC/CVR chart chip (percent points)
  daily: OverviewDailyRow[];
  dailyPY: OverviewDailyRow[];
}

export interface SparkSeries { current: number[]; py: number[] }

export interface KpiCardSpec {
  key: string;
  variant: "hero" | "supporting";
  label: string;
  value: string;
  chip?: { tone: ChipTone; text: string };
  miniStats: [KpiMiniStat, KpiMiniStat];
  spark: SparkSeries;
}

// ── Formatters ───────────────────────────────────────────────────────────────
export function fmtCurrencyCompact(n: number | null): string {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}
export function fmtPct(n: number | null, dp = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(dp)}%`;
}
export function fmtRoas(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}
export function fmtInt(n: number | null): string {
  return Math.round(n ?? 0).toLocaleString();
}

// ── Derivations ──────────────────────────────────────────────────────────────
/** CVR default per spec §6: conversions / clicks × 100; null when clicks absent (renders "—"). */
export function cvrFromCounts(conversions: number | null, clicks: number | null): number | null {
  if (clicks == null || clicks === 0) return null;
  return ((conversions ?? 0) / clicks) * 100;
}
/** Percentage share; null when the denominator is 0/absent. */
export function ratioPct(part: number | null, whole: number | null): number | null {
  if (whole == null || whole === 0) return null;
  return ((part ?? 0) / whole) * 100;
}

export type MetricDirection = "higherBetter" | "lowerBetter" | "neutral";
export function yoyChipMeta(yoyPct: number | null, direction: MetricDirection): { tone: ChipTone; text: string } {
  if (yoyPct == null || Number.isNaN(yoyPct) || yoyPct === 0) return { tone: "neutral", text: "0.00%" };
  const up = yoyPct > 0;
  const text = `${up ? "▲" : "▼"} ${Math.abs(yoyPct).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  let tone: ChipTone = "neutral";
  if (direction === "higherBetter") tone = up ? "positive" : "negative";
  else if (direction === "lowerBetter") tone = up ? "negative" : "positive";
  return { tone, text };
}

const BAND_CHIP: Record<Band, { tone: ChipTone; text: string }> = {
  good: { tone: "positive", text: "Healthy" },
  warn: { tone: "warning", text: "Watch" },
  bad: { tone: "negative", text: "At risk" },
  none: { tone: "neutral", text: "—" },
};
export function bandChipMeta(band: Band): { tone: ChipTone; text: string } {
  return BAND_CHIP[band];
}

// ── Per-day sparkline selectors (guarded — never NaN/Infinity) ────────────────
function organicPerDay(r: OverviewDailyRow): number {
  if (r.product_sales == null || r.ad_revenue == null) return 0;
  return r.product_sales - r.ad_revenue;
}
function acosPctPerDay(r: OverviewDailyRow): number {
  if (r.ad_revenue == null || r.ad_revenue === 0 || r.ad_spend == null) return 0;
  return (r.ad_spend / r.ad_revenue) * 100;
}
function roasPerDay(r: OverviewDailyRow): number {
  if (r.ad_spend == null || r.ad_spend === 0 || r.ad_revenue == null) return 0;
  return r.ad_revenue / r.ad_spend;
}
function cvrPctPerDay(r: OverviewDailyRow): number {
  if (r.ad_clicks == null || r.ad_clicks === 0 || r.ad_conversions == null) return 0;
  return (r.ad_conversions / r.ad_clicks) * 100;
}

// ── The 7 cards ──────────────────────────────────────────────────────────────
export function buildKpiCards(d: OverviewResponse): KpiCardSpec[] {
  const spark = (sel: (r: OverviewDailyRow) => number): SparkSeries => ({
    current: (d.daily ?? []).map(sel),
    py: (d.dailyPY ?? []).map(sel),
  });
  const cvrNow = cvrFromCounts(d.conversions, d.clicks);
  const cvrPy = cvrFromCounts(d.conversionsPY, d.clicksPY);
  return [
    {
      key: "total-sales", variant: "hero", label: "Total Sales",
      value: fmtCurrencyCompact(d.totalSales),
      chip: yoyChipMeta(d.yoyPct, "higherBetter"),
      miniStats: [
        { label: "Previous year", value: fmtCurrencyCompact(d.totalSalesPY) },
        { label: "Period goal", value: fmtCurrencyCompact(d.salesGoal) },
      ],
      spark: spark((r) => r.product_sales ?? 0),
    },
    {
      key: "organic-sales", variant: "hero", label: "Organic Sales",
      value: fmtCurrencyCompact(d.organicSales),
      chip: yoyChipMeta(d.organicSalesYoYPct, "higherBetter"),
      miniStats: [
        { label: "Previous year", value: fmtCurrencyCompact(d.organicSalesPY) },
        { label: "Share of sales", value: fmtPct(ratioPct(d.organicSales, d.totalSales)) },
      ],
      spark: spark(organicPerDay),
    },
    {
      key: "ad-revenue", variant: "hero", label: "Ad Revenue",
      value: fmtCurrencyCompact(d.adRevenue),
      chip: yoyChipMeta(d.adRevenueYoYPct, "higherBetter"),
      miniStats: [
        { label: "Previous year", value: fmtCurrencyCompact(d.adRevenuePY) },
        { label: "Share of sales", value: fmtPct(ratioPct(d.adRevenue, d.totalSales)) },
      ],
      spark: spark((r) => r.ad_revenue ?? 0),
    },
    {
      key: "ad-spend", variant: "supporting", label: "Ad Spend",
      value: fmtCurrencyCompact(d.adSpend),
      chip: yoyChipMeta(d.adSpendYoYPct, "neutral"),
      miniStats: [
        { label: "Previous year", value: fmtCurrencyCompact(d.adSpendPY) },
        { label: "Budget used", value: fmtPct(ratioPct(d.adSpend, d.adSpendGoal)) },
      ],
      spark: spark((r) => r.ad_spend ?? 0),
    },
    {
      key: "acos", variant: "supporting", label: "ACoS",
      value: fmtPct(d.acos),
      // route collapses zero-ad-revenue to acos=0 → treat 0 as no-data "—" (mirrors ROAS-0)
      chip: bandChipMeta(classifyAcos(d.acos ? d.acos : null)),
      miniStats: [
        { label: "Previous year", value: fmtPct(d.acosPY) },
        { label: "Target", value: fmtPct((d.acosGoal ?? 0) * 100) },
      ],
      spark: spark(acosPctPerDay),
    },
    {
      key: "roas", variant: "supporting", label: "ROAS",
      value: fmtRoas(d.roas),
      chip: bandChipMeta(classifyRoas(d.roas ? d.roas : null)),
      miniStats: [
        { label: "Previous year", value: fmtRoas(d.roasPY) },
        { label: "Target", value: fmtRoas(d.roasGoal) },
      ],
      spark: spark(roasPerDay),
    },
    {
      key: "cvr", variant: "supporting", label: "Conversion Rate",
      value: fmtPct(cvrNow),
      chip: cvrNow == null ? { tone: "neutral", text: "—" } : yoyChipMeta(d.cvrYoYPct, "higherBetter"),
      miniStats: [
        { label: "Previous year", value: fmtPct(cvrPy) },
        { label: "Conversions", value: fmtInt(d.conversions) },
      ],
      spark: spark(cvrPctPerDay),
    },
  ];
}
