import { classifyRoas, classifyAcos, type Band } from "./status-bands";
import type { KeywordRow } from "./keywords";
import type { CampaignRow } from "./campaigns";
import type { ProductRow } from "./products";

/** Normalized table row — keyword, campaign, and product shapes map to this so the
 *  MetricTable primitive and all pure logic stay generic over one type. */
export interface MetricRow {
  name: string;
  subtitle?: string;    // product tables: title under ASIN
  matchType?: string;   // keyword tables only
  adSpend: number;
  adRevenue: number;
  acos: number;         // percent points
  roas: number;         // ratio
  avgCpc: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cvr: number;          // percent points
  orders: number;
  units: number;
  ntbOrders: number;
  ntbPct: number;       // percent points: ntbOrders ÷ orders × 100
}

export function ntbPctFrom(ntbOrders: number, orders: number): number {
  return orders !== 0 ? (ntbOrders / orders) * 100 : 0;
}

export function keywordToMetricRow(k: KeywordRow): MetricRow {
  return {
    name: k.keyword,
    matchType: k.matchType,
    adSpend: k.adSpend,
    adRevenue: k.adRevenue,
    acos: k.acos,
    roas: k.roas,
    avgCpc: k.cpc,
    impressions: k.adImpressions,
    clicks: k.adClicks,
    conversions: k.adConversions,
    cvr: k.cvr,
    orders: 0,
    units: 0,
    ntbOrders: 0,
    ntbPct: 0,
  };
}

export function campaignToMetricRow(c: CampaignRow): MetricRow {
  const orders = c.orders ?? 0;
  const ntbOrders = c.ntbOrders ?? 0;
  return {
    name: c.campaignName ?? "—",
    adSpend: c.adSpend,
    adRevenue: c.adRevenue,
    acos: c.acos,
    roas: c.roas,
    avgCpc: c.avgCpc,
    impressions: c.impressions,
    clicks: c.clicks,
    conversions: c.conversions,
    cvr: c.cvr,
    orders,
    units: 0,
    ntbOrders,
    ntbPct: c.ntbPct ?? ntbPctFrom(ntbOrders, orders),
  };
}

export function productToMetricRow(p: ProductRow): MetricRow {
  const clicks = p.clicks;
  return {
    name: p.asin || "—",
    subtitle: p.productTitle || undefined,
    adSpend: p.adSpend,
    adRevenue: p.adRevenue,
    acos: p.acos,
    roas: p.roas,
    avgCpc: clicks !== 0 ? p.adSpend / clicks : 0,
    impressions: p.impressions,
    clicks,
    conversions: p.conversions,
    cvr: p.cvr,
    orders: p.orders ?? 0,
    units: p.units ?? 0,
    ntbOrders: 0,
    ntbPct: 0,
  };
}

/** ROAS band. classifyRoas already maps 0/null → none. */
export function roasBandOf(roas: number): Band {
  return classifyRoas(roas);
}
/** ACoS band. The route collapses zero-ad-revenue to acos=0, which must read as
 *  "—"/none rather than a green "good ≤25%" (spec §9). Mirror kpi-derivations. */
export function acosBandOf(acos: number): Band {
  return classifyAcos(acos === 0 ? null : acos);
}

export type BandFilter = Band | "all";

export interface FilterOpts {
  search?: string;
  matchType?: string;      // "all" or a specific match type
  roasBand?: BandFilter;
  acosBand?: BandFilter;
}

export function filterRows(rows: MetricRow[], opts: FilterOpts): MetricRow[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q) && !(r.subtitle ?? "").toLowerCase().includes(q)) return false;
    if (opts.matchType && opts.matchType !== "all" && r.matchType !== opts.matchType) return false;
    if (opts.roasBand && opts.roasBand !== "all" && roasBandOf(r.roas) !== opts.roasBand) return false;
    if (opts.acosBand && opts.acosBand !== "all" && acosBandOf(r.acos) !== opts.acosBand) return false;
    return true;
  });
}

/** Plain stable numeric sort (matches the current dashboards). */
export function sortRows(rows: MetricRow[], key: keyof MetricRow, dir: "asc" | "desc"): MetricRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const av = a.r[key];
      const bv = b.r[key];
      const an = typeof av === "number" ? av : 0;
      const bn = typeof bv === "number" ? bv : 0;
      if (an !== bn) return (an - bn) * sign;
      return a.i - b.i; // stable
    })
    .map((x) => x.r);
}

export function computeTotals(rows: MetricRow[]): MetricRow {
  const sum = (sel: (r: MetricRow) => number) => rows.reduce((acc, r) => acc + sel(r), 0);
  const adSpend = sum((r) => r.adSpend);
  const adRevenue = sum((r) => r.adRevenue);
  const impressions = sum((r) => r.impressions);
  const clicks = sum((r) => r.clicks);
  const conversions = sum((r) => r.conversions);
  const orders = sum((r) => r.orders ?? 0);
  const units = sum((r) => r.units ?? 0);
  const ntbOrders = sum((r) => r.ntbOrders ?? 0);
  return {
    name: "Total",
    adSpend,
    adRevenue,
    acos: adRevenue !== 0 ? (adSpend / adRevenue) * 100 : 0,
    roas: adSpend !== 0 ? adRevenue / adSpend : 0,
    avgCpc: clicks !== 0 ? adSpend / clicks : 0,
    impressions,
    clicks,
    conversions,
    cvr: clicks !== 0 ? (conversions / clicks) * 100 : 0,
    orders,
    units,
    ntbOrders,
    ntbPct: ntbPctFrom(ntbOrders, orders),
  };
}

export interface CsvColumn {
  header: string;
  value: (r: MetricRow) => string | number;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: CsvColumn[], rows: MetricRow[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}
