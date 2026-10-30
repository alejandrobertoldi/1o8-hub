import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { kpiDaily } from "@/lib/db/schema";
import type { Totals } from "./values";

/**
 * Report data for one client and date range: totals ("source:metric" → sum)
 * for the range, the same-length period right before it and the same dates
 * last year, plus per-day totals for charts.
 */

const DAY = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export type KpiSeries = {
  start: string;
  end: string;
  days: string[];
  byDay: Record<string, Totals>;
  totals: Totals;
  previous: Totals;
  lastYear: Totals;
  /** Sources with any data for this client. */
  sources: string[];
};

/** Pure: the comparison windows for a range. */
export function comparisonRanges(start: string, end: string) {
  const length = daysBetween(start, end) + 1;
  // Same dates a year earlier; Feb 29 becomes Feb 28.
  const shift = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4) === "-02-29" ? "-02-28" : d.slice(4)}`;
  return {
    previous: { start: addDays(start, -length), end: addDays(start, -1) },
    lastYear: { start: shift(start), end: shift(end) },
  };
}

async function rows(code: string, start: string, end: string) {
  return db
    .select({ source: kpiDaily.source, metric: kpiDaily.metric, day: kpiDaily.day, value: kpiDaily.value })
    .from(kpiDaily)
    .where(and(eq(kpiDaily.clientIdCode, code), gte(kpiDaily.day, start), lte(kpiDaily.day, end)));
}

function sum(list: { source: string; metric: string; value: number }[]): Totals {
  const t: Totals = {};
  for (const r of list) t[`${r.source}:${r.metric}`] = (t[`${r.source}:${r.metric}`] ?? 0) + r.value;
  return t;
}

export async function kpiSeries(code: string, start: string, end: string): Promise<KpiSeries> {
  const cmp = comparisonRanges(start, end);
  const [current, previous, lastYear] = await Promise.all([
    rows(code, start, end),
    rows(code, cmp.previous.start, cmp.previous.end),
    rows(code, cmp.lastYear.start, cmp.lastYear.end),
  ]);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const byDay: Record<string, Totals> = Object.fromEntries(days.map((d) => [d, {}]));
  for (const r of current) {
    const t = (byDay[r.day] ??= {});
    t[`${r.source}:${r.metric}`] = (t[`${r.source}:${r.metric}`] ?? 0) + r.value;
  }
  return {
    start,
    end,
    days,
    byDay,
    totals: sum(current),
    previous: sum(previous),
    lastYear: sum(lastYear),
    sources: [...new Set(current.map((r) => r.source))].sort(),
  };
}
