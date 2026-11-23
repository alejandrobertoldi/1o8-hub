import type { KpiUnit } from "@/lib/kpi/values";

/**
 * The numbers snapshot a client monthly report is rendered from. Stored as
 * JSON on client_reports.data, so keep it plain data and bump `version` on
 * breaking changes.
 */

export type MetricRow = {
  key: string;
  label: string;
  unit: KpiUnit;
  value: number;
  /** Previous calendar month; null when there's nothing to compare. */
  previous: number | null;
  /** Same month last year; null when the hub has no complete data for it. */
  lastYear: number | null;
  lowerIsBetter?: boolean;
  hint?: string;
};

export type KpiCard = MetricRow & {
  /** Where the number comes from ("Shopify", "GA4 revenue (until Shopify is connected)"). */
  basis: string;
  /** The target as the team wrote it ("$150k / mo"). */
  target: string | null;
  targetValue: number | null;
  onTrack: boolean | null;
};

export type MetricGroup = { title: string | null; rows: MetricRow[] };

export type ChartSeries<P> = { label: string; unit: KpiUnit; points: P[] };
export type DailyPoint = { day: string; value: number | null };
export type MonthPoint = { period: string; value: number | null };

export type SectionKey = "sales" | "paid_media" | "traffic" | "email";

export type ReportSection = {
  key: SectionKey;
  title: string;
  source: string;
  groups: MetricGroup[];
  daily: ChartSeries<DailyPoint> | null;
  trend: ChartSeries<MonthPoint> | null;
};

export type ClientReportData = {
  version: 1;
  client: { code: string; name: string; logo: string | null };
  period: { key: string; label: string; start: string; end: string; previousLabel: string; lastYearLabel: string };
  /** Latest day with data in the month (any source); before `period.end` means the month isn't complete yet. */
  dataThrough: string | null;
  preparedBy: string | null;
  team: { name: string; roles: string[] }[];
  sources: string[];
  kpis: KpiCard[];
  /** Net sales over the last 13 months. */
  kpiTrend: ChartSeries<MonthPoint> | null;
  sections: ReportSection[];
  generatedAt: string;
};
