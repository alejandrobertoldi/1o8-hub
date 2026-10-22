export type Month = string;
export type Series = { month: Month; value: number }[];
export interface ProductRow { asin: string; title: string; value: number }
export interface ChannelBlock {
  spend: number; sales: number; orders: number;
  monthly: { month: Month; spend: number; sales: number }[];
}
export interface PulledMetrics {
  salesTotal: number; salesMonthly: Series; unitsTotal: number;
  adSales: number; adSpend: number; adImpressions: number; adClicks: number; adOrders: number;
  sessions: number; pageViews: number; buyBoxPct: number; skuCount: number;
  topByRevenue: ProductRow[]; topByUnits: ProductRow[];
  paidSp: ChannelBlock; paidSbSd: ChannelBlock;
  fulfilment: string;
}
export type MetricKey = keyof PulledMetrics;
export type ScalarKey = "salesTotal" | "unitsTotal" | "adSales" | "adSpend" | "adImpressions"
  | "adClicks" | "adOrders" | "sessions" | "pageViews" | "buyBoxPct" | "skuCount" | "fulfilment";
export const SCALAR_KEYS: readonly ScalarKey[] = [
  "salesTotal", "unitsTotal", "adSales", "adSpend", "adImpressions", "adClicks",
  "adOrders", "sessions", "pageViews", "buyBoxPct", "skuCount", "fulfilment",
];

export interface CaseStudyMetrics {
  pulledAt: string | null;
  period: { start: string; end: string };
  auto: Partial<PulledMetrics>;
  overrides: Partial<Pick<PulledMetrics, ScalarKey>>;
  failed: string[];
}

export function emptyMetrics(start: string, end: string): CaseStudyMetrics {
  return { pulledAt: null, period: { start, end }, auto: {}, overrides: {}, failed: [] };
}

export function effective(m: CaseStudyMetrics): Partial<PulledMetrics> {
  const out: Partial<PulledMetrics> = { ...m.auto };
  for (const [k, v] of Object.entries(m.overrides ?? {})) {
    if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface Derived {
  organicSales: number | null; organicPct: number | null; adPct: number | null;
  roas: number | null; acos: number | null; cvrPct: number | null; asp: number | null;
  growthMultiple: number | null; startSales: number | null;
  peakMonth: Month | null; peakSales: number | null;
  h1AvgSales: number | null; h2AvgSales: number | null; h2VsH1Pct: number | null;
  top3RevenueSharePct: number | null; cumulative: Series;
  spAcos: number | null; sbSdAcos: number | null;
}
export type AnyMetricKey = MetricKey | keyof Derived;

const div = (a: number | undefined, b: number | undefined): number | null =>
  a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || b === 0 ? null : a / b;
const avg = (xs: number[]): number | undefined => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);
const times100 = (x: number | null) => (x === null ? null : x * 100);

export function deriveMetrics(e: Partial<PulledMetrics>): Derived {
  const series = e.salesMonthly ?? [];
  const vals = series.map((s) => s.value);
  const organicSales = e.salesTotal !== undefined && e.adSales !== undefined ? e.salesTotal - e.adSales : null;

  let growthMultiple: number | null = null;
  let h1AvgSales: number | null = null;
  let h2AvgSales: number | null = null;
  if (vals.length >= 6) {
    growthMultiple = div(avg(vals.slice(-3)), avg(vals.slice(0, 3)));
    const half = Math.floor(vals.length / 2);
    h1AvgSales = avg(vals.slice(0, half)) ?? null;
    h2AvgSales = avg(vals.slice(half)) ?? null;
  }
  const h2VsH1Pct = h1AvgSales !== null && h2AvgSales !== null
    ? times100(div(h2AvgSales - h1AvgSales, h1AvgSales)) : null;

  let peakIdx = -1;
  vals.forEach((v, i) => { if (peakIdx < 0 || v > vals[peakIdx]) peakIdx = i; });

  let run = 0;
  const cumulative = series.map((s) => ({ month: s.month, value: (run += s.value) }));

  const top3 = (e.topByRevenue ?? []).slice(0, 3).reduce((s, r) => s + r.value, 0);

  return {
    organicSales,
    organicPct: times100(div(organicSales ?? undefined, e.salesTotal)),
    adPct: times100(div(e.adSales, e.salesTotal)),
    roas: div(e.adSales, e.adSpend),
    acos: times100(div(e.adSpend, e.adSales)),
    cvrPct: times100(div(e.unitsTotal, e.sessions)),
    asp: div(e.salesTotal, e.unitsTotal),
    growthMultiple,
    startSales: vals.length ? vals[0] : null,
    peakMonth: peakIdx >= 0 ? series[peakIdx].month : null,
    peakSales: peakIdx >= 0 ? vals[peakIdx] : null,
    h1AvgSales, h2AvgSales, h2VsH1Pct,
    top3RevenueSharePct: e.topByRevenue?.length ? times100(div(top3, e.salesTotal)) : null,
    cumulative,
    spAcos: e.paidSp ? times100(div(e.paidSp.spend, e.paidSp.sales)) : null,
    sbSdAcos: e.paidSbSd ? times100(div(e.paidSbSd.spend, e.paidSbSd.sales)) : null,
  };
}

export const PRIVATE_USD_KEYS: ReadonlySet<AnyMetricKey> = new Set<AnyMetricKey>([
  "salesTotal", "adSales", "adSpend", "organicSales", "asp",
  "startSales", "peakSales", "h1AvgSales", "h2AvgSales",
]);

export function isMissing(e: Partial<PulledMetrics>, d: Derived, key: AnyMetricKey): boolean {
  const v = key in d ? (d as unknown as Record<string, unknown>)[key] : (e as Record<string, unknown>)[key];
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "number") return !Number.isFinite(v);
  return false;
}
