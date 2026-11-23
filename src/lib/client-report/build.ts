import { MAIN_KPIS_FIELD, kpiLabel, parseClientKpis, type ClientKpi } from "@/lib/clients/kpis";
import { BLENDED, EMAIL, GOOGLE_ADS, META, SALES, TRAFFIC, type ReportMetric } from "@/lib/kpi/report-metrics";
import { clientTeam } from "@/lib/kpi/sales-summary";
import { kpiValue, parseTarget, type Totals } from "@/lib/kpi/values";
import { daysInPeriod, periodLabel, periodRange, shiftPeriod, trailingPeriods } from "./period";
import type { ChartSeries, ClientReportData, KpiCard, MetricGroup, MetricRow, MonthPoint, ReportSection, SectionKey } from "./types";

/**
 * Builds a client's monthly report numbers from kpi_daily totals. Pure;
 * unit-tested. The loader (load.ts) does the database reads.
 */

/** One month of a client's data: "source:metric" totals and how many days each source has data. */
export type MonthData = { totals: Totals; coverage: Record<string, number> };

export type BuildInput = {
  client: { code: string; name: string; logo: string | null; raw: Record<string, string> };
  period: string;
  /** Months keyed "YYYY-MM"; at least the report month and the 12 before it when available. */
  months: Record<string, MonthData>;
  /** The report month's days keyed "YYYY-MM-DD". */
  days: Record<string, Totals>;
  dataThrough: string | null;
  generatedAt: string;
};

/** KPIs shown when the client has no Main KPIs picked yet (those with data). */
export const DEFAULT_KPIS = ["net_sales", "orders", "aov", "conversion_rate", "ad_spend", "blended_roas", "sessions", "email_revenue"];
const LOWER_IS_BETTER_KPIS = new Set(["cac"]);
/** A comparison month counts a source only when it covers most of the month (a source connected mid-month would fake a jump). */
const MIN_COVERAGE = 0.8;

/** Totals with partially covered sources dropped; null when nothing is left. */
export function completeTotals(month: MonthData | undefined, period: string): Totals | null {
  if (!month) return null;
  const need = daysInPeriod(period) * MIN_COVERAGE;
  const keep = new Set(Object.entries(month.coverage).filter(([, n]) => n >= need).map(([s]) => s));
  const out: Totals = {};
  for (const [k, v] of Object.entries(month.totals)) if (keep.has(k.split(":")[0])) out[k] = v;
  return Object.keys(out).length ? out : null;
}

const finite = (n: number | undefined | null) => (n === undefined || n === null || !Number.isFinite(n) ? null : n);

function metricRows(metrics: ReportMetric[], now: Totals, prev: Totals | null, ly: Totals | null): MetricRow[] {
  const rows: MetricRow[] = [];
  for (const m of metrics) {
    const value = finite(m.compute(now));
    if (value === null) continue;
    rows.push({
      key: m.key,
      label: m.label,
      unit: m.unit,
      value,
      previous: prev ? finite(m.compute(prev)) : null,
      lastYear: ly ? finite(m.compute(ly)) : null,
      ...(m.lowerIsBetter ? { lowerIsBetter: true } : {}),
      ...(m.hint ? { hint: m.hint } : {}),
    });
  }
  return rows;
}

function kpiCards(picked: ClientKpi[], now: Totals, prev: Totals | null, ly: Totals | null): KpiCard[] {
  const list: ClientKpi[] = picked.length ? picked : DEFAULT_KPIS.map((key) => ({ key }));
  const cards: KpiCard[] = [];
  for (const k of list) {
    const v = kpiValue(k.key, now);
    if (!v) continue;
    const lower = LOWER_IS_BETTER_KPIS.has(k.key);
    const targetValue = k.target ? parseTarget(k.target, v.unit) : null;
    cards.push({
      key: k.key,
      label: kpiLabel(k),
      unit: v.unit,
      value: v.value,
      previous: prev ? (kpiValue(k.key, prev)?.value ?? null) : null,
      lastYear: ly ? (kpiValue(k.key, ly)?.value ?? null) : null,
      basis: v.basis,
      target: k.target?.trim() || null,
      targetValue,
      // Targets are monthly, so a full month compares directly.
      onTrack: targetValue === null ? null : lower ? v.value <= targetValue : v.value >= targetValue,
      ...(lower ? { lowerIsBetter: true } : {}),
    });
  }
  return cards;
}

type SectionSpec = {
  key: SectionKey;
  title: string;
  source: string;
  groups: { title: string | null; metrics: ReportMetric[] }[];
  /** The metric charted per day and over 13 months. */
  chart: ReportMetric;
};

const byKey = (list: ReportMetric[], key: string) => list.find((m) => m.key === key)!;

const SECTIONS: SectionSpec[] = [
  { key: "sales", title: "Sales", source: "Shopify", groups: [{ title: null, metrics: SALES }], chart: byKey(SALES, "net_sales") },
  {
    key: "paid_media",
    title: "Paid media",
    source: "Meta and Google Ads",
    groups: [
      { title: "All platforms", metrics: BLENDED },
      { title: "Meta", metrics: META },
      { title: "Google Ads", metrics: GOOGLE_ADS },
    ],
    chart: byKey(BLENDED, "spend"),
  },
  { key: "traffic", title: "Traffic and conversion", source: "Google Analytics", groups: [{ title: null, metrics: TRAFFIC }], chart: byKey(TRAFFIC, "sessions") },
  { key: "email", title: "Email and SMS", source: "Klaviyo", groups: [{ title: null, metrics: EMAIL }], chart: byKey(EMAIL, "attributed_revenue") },
];

function trendOf(label: string, unit: MetricRow["unit"], periods: string[], months: BuildInput["months"], compute: (t: Totals) => number | undefined | null): ChartSeries<MonthPoint> | null {
  const points = periods.map((p) => {
    const t = completeTotals(months[p], p);
    return { period: p, value: t ? finite(compute(t)) : null };
  });
  // Months before the first one with data are left out, so a new client's chart starts at its first month.
  const first = points.findIndex((p) => p.value !== null);
  return first === -1 ? null : { label, unit, points: points.slice(first) };
}

export function buildClientReport(input: BuildInput): ClientReportData {
  const { client, period, months, days } = input;
  const now = months[period]?.totals ?? {};
  const prevKey = shiftPeriod(period, -1);
  const lyKey = shiftPeriod(period, -12);
  const prev = completeTotals(months[prevKey], prevKey);
  const ly = completeTotals(months[lyKey], lyKey);
  const range = periodRange(period);
  const trailing = trailingPeriods(period, 13);
  const dayKeys = Object.keys(days).sort();

  const sections: ReportSection[] = [];
  for (const spec of SECTIONS) {
    const groups: MetricGroup[] = spec.groups
      .map((g) => ({ title: g.title, rows: metricRows(g.metrics, now, prev, ly) }))
      .filter((g) => g.rows.length);
    if (!groups.length) continue;
    const c = spec.chart;
    const daily = dayKeys.map((day) => ({ day, value: finite(c.compute(days[day])) }));
    sections.push({
      key: spec.key,
      title: spec.title,
      source: spec.source,
      groups,
      daily: daily.some((d) => d.value !== null) ? { label: c.label, unit: c.unit, points: daily } : null,
      trend: trendOf(c.label, c.unit, trailing, months, c.compute),
    });
  }

  const team = clientTeam(client.raw).map(({ name, roles }) => ({ name, roles }));
  const am = team.find((m) => m.roles.includes("Account Manager"))?.name ?? null;

  return {
    version: 1,
    client: { code: client.code, name: client.name, logo: client.logo },
    period: {
      key: period,
      label: periodLabel(period),
      start: range.start,
      end: range.end,
      previousLabel: periodLabel(prevKey),
      lastYearLabel: periodLabel(lyKey),
    },
    dataThrough: input.dataThrough,
    preparedBy: am,
    team,
    sources: [...new Set(Object.keys(now).map((k) => k.split(":")[0]))].sort(),
    kpis: kpiCards(parseClientKpis(client.raw[MAIN_KPIS_FIELD]), now, prev, ly),
    kpiTrend: trendOf("Net sales", "money", trailing, months, (t) => kpiValue("net_sales", t)?.value),
    sections,
    generatedAt: input.generatedAt,
  };
}

/** Change as a fraction; null when there's nothing to compare against. */
export function change(value: number, before: number | null): number | null {
  if (before === null || before === 0) return null;
  return (value - before) / Math.abs(before);
}
