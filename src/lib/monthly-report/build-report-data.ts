import type {
  Report, KPI, MoMTableRow, ProductRow as TplProductRow, SectionId,
  Highlight, Goal, Risk, CompareSalesData, CompareSalesTable, Direction,
  CampaignManagerData, CampaignStat,
} from "@/components/monthly-report/types";
import { driveLogoSrc } from "@/lib/client-logos/logo-index";
import type {
  HeadlineResult, ProductsResult, MonthlyPeriod, ClientContext,
} from "./types";
import type { CampaignDailyPoint, DailyPoint } from "./queries/account";
import { brand } from "@/components/monthly-report/defaults";
import { fmtPtsDelta } from "./format";

export interface BuildInput {
  client: ClientContext;
  /** Client codes with a logo in Drive (1o8 Hub_Backend/Client Logos). */
  logoCodes?: Set<string>;
  period: MonthlyPeriod;
  headline: HeadlineResult | null;
  products: ProductsResult | null;
  revenueSeries: Array<{ month: string; revenue: number }>;
  lead: string;
  /** Daily current-period sales+units, indexed by day-of-month. */
  dailyCurrent?: DailyPoint[];
  /** Daily prior-year same-period sales+units, indexed by day-of-month. */
  dailyPrevYear?: DailyPoint[];
  /** Daily ad impressions/spend/revenue for the current period. */
  campaignDaily?: CampaignDailyPoint[];
  /** Prior calendar month campaign daily — used for advertising MoM. */
  campaignDailyPrev?: CampaignDailyPoint[];
  /** Optional analytical content. Empty arrays cause the corresponding
   *  SectionId to be omitted from data.sections (renderers also defend
   *  with a null return — double-defended). */
  highlights?: Highlight[];
  goals?: Goal[];
  risks?: Risk[];
}

const DOLLAR = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}
function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return n >= 10000 ? `$${COMPACT.format(n)}` : DOLLAR.format(n);
}
// 2-decimal money with thousands abbreviated (e.g. $46.52, $1.50K, $10.33K).
const MONEY_DEC = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtMoneyDec(n: number | null): string {
  if (n === null) return "—";
  return n >= 1000 ? `$${COMPACT.format(n)}` : MONEY_DEC.format(n);
}
function absDelta(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || !Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  return curr - prev;
}
/** Unsigned magnitude. Color / glyph carries direction — no + or − prefix. */
function fmtAbs(delta: number | null, format: (n: number) => string): string {
  if (delta === null || !Number.isFinite(delta)) return "—";
  return format(Math.abs(delta));
}
function fmtCountDelta(d: number | null): string {
  return fmtAbs(d, (n) => INT.format(Math.round(n)));
}
function fmtDecimalDelta(d: number | null): string {
  return fmtAbs(d, (n) => n.toFixed(2));
}
function direction(delta: number | null, goodIsUp = true, epsilon = 0.005): Direction {
  if (delta === null || Math.abs(delta) < epsilon) return "flat";
  const isUp = delta > 0;
  return (isUp === goodIsUp) ? "up" : "down";
}
function fmtAbsChange(
  delta: number | null,
  format: (n: number) => string,
  goodIsUp = true,
  epsilon = 0.005,
): { value: string; direction: Direction } {
  return { value: fmtAbs(delta, format), direction: direction(delta, goodIsUp, epsilon) };
}

function humanPeriod(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", timeZone: "UTC" });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function issuedToday(): string {
  return new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function buildKpis(h: HeadlineResult): KPI[] {
  const c = h.current;
  const p = h.previous;
  const d = h.deltas;
  const avgUnitsPerOrder = c.orderItems > 0 ? c.units / c.orderItems : null;
  const prevAvgUnits = p && p.orderItems > 0 ? p.units / p.orderItems : null;
  const orderItemsDelta = absDelta(c.orderItems, p?.orderItems ?? null);
  const avgUnitsDelta = absDelta(avgUnitsPerOrder, prevAvgUnits);
  // Ordered to match Amazon Sales Dashboard layout (Order items · Units · Sales · Avg units · AOV)
  const all: KPI[] = [
    { label: "Order items",     value: INT.format(c.orderItems),           prev: p ? INT.format(p.orderItems) : "—", delta: fmtCountDelta(orderItemsDelta), direction: direction(orderItemsDelta, true, 0.5), foot: "Total order items",            highlight: true },
    { label: "Units ordered",   value: INT.format(c.units),                prev: p ? INT.format(p.units) : "—",      delta: fmtCountDelta(d.units),  direction: direction(d.units, true, 0.5), foot: "Units ordered",               highlight: true },
    { label: "Product sales",   value: fmtMoney(c.sales),                  prev: p ? fmtMoney(p.sales) : "—",        delta: fmtAbs(d.sales, (n) => fmtMoney(n)),  direction: direction(d.sales), foot: "Ordered product sales",        highlight: true },
    { label: "Avg. units/order",value: avgUnitsPerOrder !== null ? avgUnitsPerOrder.toFixed(2) : "—", prev: prevAvgUnits !== null ? prevAvgUnits.toFixed(2) : "—", delta: fmtDecimalDelta(avgUnitsDelta), direction: direction(avgUnitsDelta), foot: "Avg. units per order item",   highlight: true },
    { label: "Avg. sales/order",value: fmtMoneyDec(c.aov ?? 0),            prev: p ? fmtMoneyDec(p.aov ?? 0) : "—",  delta: fmtAbs(d.aov, (n) => fmtMoneyDec(n)),    direction: direction(d.aov),  foot: "Avg. sales per order item",    highlight: true },
    ...(c.cvr    !== null ? [{ label: "CVR",     value: fmtPct(c.cvr),    prev: p && p.cvr !== null ? fmtPct(p.cvr) : "—", delta: fmtPtsDelta(d.cvr),    direction: direction(d.cvr, true, 0.005),    foot: "Sessions → orders"  } as KPI] : []),
    ...(c.buyBox !== null ? [{ label: "Buy-box", value: fmtPct(c.buyBox), prev: p && p.buyBox !== null ? fmtPct(p.buyBox) : "—", delta: fmtPtsDelta(d.buyBox), direction: direction(d.buyBox, true, 0.005), foot: "Weighted by sessions" } as KPI] : []),
  ];
  return all;
}

function buildMoMTable(h: HeadlineResult): MoMTableRow[] {
  const rows: Array<[string, number | null, number | null, number | null, boolean]> = [
    ["Sales",   h.current.sales,       h.previous?.sales ?? null,       h.deltas.sales,   true],
    ["Units",   h.current.units,       h.previous?.units ?? null,       h.deltas.units,   true],
    ["AOV",     h.current.aov,         h.previous?.aov ?? null,         h.deltas.aov,     true],
    ...(h.current.cvr    !== null ? [["CVR",     h.current.cvr,    h.previous?.cvr ?? null,    h.deltas.cvr,    true] as [string, number | null, number | null, number | null, boolean]] : []),
    ...(h.current.buyBox !== null ? [["Buy-box", h.current.buyBox, h.previous?.buyBox ?? null, h.deltas.buyBox, true] as [string, number | null, number | null, number | null, boolean]] : []),
  ];
  return rows.map(([metric, curr, prev, delta, goodIsUp]) => {
    const isMoney = metric === "Sales" || metric === "AOV";
    const isRate = metric === "CVR" || metric === "Buy-box";
    const fmt = isMoney
      ? (v: number | null) => v === null ? "—" : fmtMoney(v)
      : isRate
      ? (v: number | null) => fmtPct(v)
      : (v: number | null) => v === null ? "—" : INT.format(v);
    const deltaStr = isMoney
      ? fmtAbs(delta, (n) => fmtMoney(n))
      : isRate
      ? fmtPtsDelta(delta)
      : fmtCountDelta(delta);
    const epsilon = isRate ? 0.005 : isMoney ? 0.005 : 0.5;
    return {
      metric,
      prev: fmt(prev),
      curr: fmt(curr),
      delta: deltaStr,
      deltaDirection: direction(delta, goodIsUp, epsilon),
    };
  });
}

function narrative(h: HeadlineResult, client: string): string {
  if (!h.previous) {
    return `First-month data for ${client}. No previous-month comparison available.`;
  }
  const salesDelta = fmtAbs(h.deltas.sales, (n) => fmtMoney(n));
  const bbDelta = fmtPtsDelta(h.deltas.buyBox);
  return `Revenue moved ${salesDelta} vs previous month. Buy-box moved ${bbDelta}. CVR landed at ${fmtPct(h.current.cvr)}.`;
}

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface DailyTotals {
  orderItems: number;
  units: number;
  sales: number;
  avgUnits: number | null;
  avgSales: number | null;
}

function totalsOf(rows: DailyPoint[]): DailyTotals {
  const orderItems = rows.reduce((s, r) => s + r.orderItems, 0);
  const units      = rows.reduce((s, r) => s + r.units, 0);
  const sales      = rows.reduce((s, r) => s + r.sales, 0);
  return {
    orderItems, units, sales,
    avgUnits: orderItems > 0 ? units / orderItems : null,
    avgSales: orderItems > 0 ? sales / orderItems : null,
  };
}

function buildCompareTable(curr: DailyTotals, prev: DailyTotals): CompareSalesTable {
  // Compare table mirrors Seller Central's "Compare Sales" view, which always
  // shows full precision (e.g. "$10,326.60") — never compacted to "$10.33K".
  const money = (n: number | null) => n === null ? "—" : MONEY_DEC.format(n);
  const num = (n: number | null) => n === null ? "—" : n.toFixed(2);
  const moneyAbs = (n: number) => MONEY_DEC.format(n);
  return {
    columns: [
      "Total order items",
      "Units ordered",
      "Ordered product sales",
      "Average units/order item",
      "Average sales/order item",
    ],
    current: [
      INT.format(curr.orderItems),
      INT.format(curr.units),
      money(curr.sales),
      num(curr.avgUnits),
      money(curr.avgSales),
    ],
    previous: [
      INT.format(prev.orderItems),
      INT.format(prev.units),
      money(prev.sales),
      num(prev.avgUnits),
      money(prev.avgSales),
    ],
    changes: [
      fmtAbsChange(absDelta(curr.orderItems, prev.orderItems), (n) => INT.format(Math.round(n)), true, 0.5),
      fmtAbsChange(absDelta(curr.units,      prev.units),      (n) => INT.format(Math.round(n)), true, 0.5),
      fmtAbsChange(absDelta(curr.sales,      prev.sales),      moneyAbs),
      fmtAbsChange(absDelta(curr.avgUnits,   prev.avgUnits),   (n) => n.toFixed(2)),
      fmtAbsChange(absDelta(curr.avgSales,   prev.avgSales),   moneyAbs),
    ],
  };
}

/**
 * Align current + prior-year daily series by day-of-month over the full current
 * calendar month. Missing days fall back to zero so the chart always covers
 * day 1..N regardless of partial-month data.
 */
function buildCompareSales(
  period: MonthlyPeriod,
  current: DailyPoint[],
  previous: DailyPoint[],
): CompareSalesData {
  const [yStr, mStr] = period.period.split("-");
  const y = Number(yStr);
  const m = Number(mStr);                          // 1..12
  const daysInMonth = new Date(y, m, 0).getDate(); // last day of month m
  const monthLabel = SHORT_MONTHS[m - 1];

  const currMap = new Map(current.map(p => [p.day, p]));
  const prevMap = new Map(previous.map(p => [p.day, p]));

  const sales: { label: string; value: number }[] = [];
  const salesPrev: { label: string; value: number }[] = [];
  const units: { label: string; value: number }[] = [];
  const unitsPrev: { label: string; value: number }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const label = String(d);
    const c = currMap.get(d);
    const p = prevMap.get(d);
    sales.push({ label, value: c?.sales ?? 0 });
    salesPrev.push({ label, value: p?.sales ?? 0 });
    units.push({ label, value: c?.units ?? 0 });
    unitsPrev.push({ label, value: p?.units ?? 0 });
  }

  return {
    currentLabel: `${monthLabel} ${y}`,
    previousLabel: `${monthLabel} ${y - 1}`,
    sales, salesPrev, units, unitsPrev,
    table: buildCompareTable(totalsOf(current), totalsOf(previous)),
  };
}

/**
 * Day-aligned ad performance series + period totals for the Campaign Manager
 * section. MVP uses the 3 metrics already in account_summary: impressions,
 * spend (Amazon "Total cost"), revenue (Amazon "Sales"). Click-level fields
 * (clicks, purchases, branded searches, DPV, NTB) aren't in this table — we
 * skip them rather than fake values.
 */
function campaignPeriodTotals(
  campaign: CampaignDailyPoint[],
  daily: DailyPoint[],
  daysInMonth: number,
): { totSales: number; totSpend: number; totRevenue: number } {
  const byDayCampaign = new Map(campaign.map(p => [p.day, p]));
  const byDaySales = new Map(daily.map(p => [p.day, p]));
  let totSales = 0;
  let totSpend = 0;
  let totRevenue = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    totSales += byDaySales.get(d)?.sales ?? 0;
    totSpend += byDayCampaign.get(d)?.spend ?? 0;
    totRevenue += byDayCampaign.get(d)?.revenue ?? 0;
  }
  return { totSales, totSpend, totRevenue };
}

function withAcosTrend(table: MoMTableRow[], campaigns: CampaignManagerData | undefined): MoMTableRow[] {
  const acos = campaigns?.stats.find((s) => s.label === "ACoS");
  if (!acos || table.some((row) => row.metric === "ACoS")) return table;
  return [
    ...table,
    {
      metric: "ACoS",
      prev: acos.prev ?? "—",
      curr: acos.value,
      delta: acos.delta ?? "—",
      deltaDirection: acos.direction ?? "flat",
    },
  ];
}

function campaignStat(
  label: string,
  current: number | null,
  previous: number | null,
  format: (n: number) => string,
  kind: "money" | "pts" = "money",
  goodIsUp = true,
): CampaignStat {
  const delta = absDelta(current, previous);
  return {
    label,
    value: current === null ? "—" : format(current),
    prev: previous === null ? "—" : format(previous),
    delta: kind === "pts" ? fmtPtsDelta(delta, 2) : fmtAbs(delta, format),
    direction: direction(delta, goodIsUp, kind === "pts" ? 0.005 : 0.005),
  };
}

function buildCampaignManager(
  period: MonthlyPeriod,
  campaign: CampaignDailyPoint[],
  daily: DailyPoint[],
  previousCampaign?: CampaignDailyPoint[],
  previousSales?: number | null,
): CampaignManagerData {
  const [yStr, mStr] = period.period.split("-");
  const y = Number(yStr);
  const m = Number(mStr);                          // 1..12
  const daysInMonth = new Date(y, m, 0).getDate(); // last day of month m
  const monthLabel = SHORT_MONTHS[m - 1];

  const byDayCampaign = new Map(campaign.map(p => [p.day, p]));
  const byDaySales = new Map(daily.map(p => [p.day, p]));

  const totalSales: { label: string; value: number }[] = [];
  const adSpend: { label: string; value: number }[] = [];
  const adRevenue: { label: string; value: number }[] = [];
  const acos: { label: string; value: number }[] = [];

  let totSales = 0;
  let totSpend = 0;
  let totRevenue = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const label = String(d);
    const c = byDayCampaign.get(d);
    const s = byDaySales.get(d);
    const sales = s?.sales ?? 0;
    const spend = c?.spend ?? 0;
    const revenue = c?.revenue ?? 0;
    totalSales.push({ label, value: sales });
    adSpend.push({ label, value: spend });
    adRevenue.push({ label, value: revenue });
    // Daily ACoS as percent. Undefined when ad_revenue is 0 → 0% so the line
    // stays on the axis instead of going to infinity.
    acos.push({ label, value: revenue > 0 ? (spend / revenue) * 100 : 0 });
    totSales += sales;
    totSpend += spend;
    totRevenue += revenue;
  }

  const periodAcos = totRevenue > 0 ? (totSpend / totRevenue) * 100 : null;
  const prev = previousCampaign && previousCampaign.length > 0
    ? campaignPeriodTotals(previousCampaign, [], Number(period.prevEnd.slice(8, 10)))
    : null;
  const prevSales = previousSales ?? null;
  const prevSpend = prev ? prev.totSpend : null;
  const prevRevenue = prev ? prev.totRevenue : null;
  const prevAcos = prevRevenue !== null && prevRevenue > 0 && prevSpend !== null
    ? (prevSpend / prevRevenue) * 100
    : null;
  const money = (n: number) => MONEY_DEC.format(n);
  const acosFmt = (n: number) => `${n.toFixed(2)}%`;

  const stats: CampaignStat[] = [
    campaignStat("Total Sales", totSales, prevSales, money, "money"),
    campaignStat("Ad Spend", totSpend, prevSpend, money, "money"),
    campaignStat("Ad Revenue", totRevenue, prevRevenue, money, "money"),
    campaignStat("ACoS", periodAcos, prevAcos, acosFmt, "pts", false),
  ];

  return {
    dateRange: `${monthLabel} 1 - ${monthLabel} ${daysInMonth}, ${y}`,
    stats,
    series: { totalSales, adSpend, adRevenue, acos },
  };
}

function buildProducts(p: ProductsResult): TplProductRow[] {
  return p.rows.map(r => ({
    asin: r.asin, title: r.title, sku: r.sku,
    sessions: r.sessions, units: r.units, sales: r.sales,
    cvr: r.cvr, buyBox: r.buyBox,
  }));
}

export function buildReportData(inp: BuildInput): Report {
  const { client, period, headline, products, revenueSeries, lead, highlights, goals, risks } = inp;
  const dailyCurrent = inp.dailyCurrent ?? [];
  const dailyPrevYear = inp.dailyPrevYear ?? [];
  const hasDaily = dailyCurrent.length > 0 || dailyPrevYear.length > 0;
  const compareSales = hasDaily ? buildCompareSales(period, dailyCurrent, dailyPrevYear) : undefined;
  const campaignDaily = inp.campaignDaily ?? [];
  const hasCampaignSignal = campaignDaily.some(p => p.impressions > 0 || p.spend > 0 || p.revenue > 0);
  const campaigns = hasCampaignSignal
    ? buildCampaignManager(
      period,
      campaignDaily,
      dailyCurrent,
      inp.campaignDailyPrev,
      headline?.previous?.sales ?? null,
    )
    : undefined;

  // Section ordering: cover → toc → kpis → campaigns → mom → highlights → products → goals → risks.
  // Each non-default member is omitted when its data is missing or empty.
  const sections: SectionId[] = ["cover", "toc"];
  if (headline) sections.push("kpis");
  if (campaigns) sections.push("campaigns");
  if (headline) sections.push("mom");
  if (highlights && highlights.length > 0) sections.push("highlights");
  if (products && products.rows.length > 0) sections.push("products");
  if (goals && goals.length > 0) sections.push("goals");
  if (risks && risks.length > 0) sections.push("risks");

  return {
    meta: {
      client: client.name,
      month: period.label,
      period: humanPeriod(period.start, period.end),
      lead,
      issued: issuedToday(),
      reportId: (() => {
        const [yr, mo] = period.period.split("-");
        const monthName = new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("en-US", { month: "long" });
        return `${monthName}|${yr.slice(2)}|${client.clientIdCode ?? client.accountId}`;
      })(),
      accent: brand.colors.accent,
      clientIdCode: client.clientIdCode,
      // Only when Drive has one, so the email never shows a broken image.
      clientLogoUrl: driveLogoSrc(client.clientIdCode, inp.logoCodes ?? new Set()),
    },
    sections,
    kpis: headline ? buildKpis(headline) : undefined,
    compareSales,
    campaigns,
    mom: headline ? {
      revenueSeries: revenueSeries.map(p => ({ label: p.month, value: p.revenue })),
      revenueTargetSeries: [],
      cacSeries: [],
      table: withAcosTrend(buildMoMTable(headline), campaigns),
      narrative: narrative(headline, client.name),
    } : undefined,
    highlights,
    goals,
    risks,
    products: products && products.rows.length > 0 ? buildProducts(products) : undefined,
  };
}
