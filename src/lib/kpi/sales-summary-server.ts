import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, clientBrandGuidelines, kpiDaily, users } from "@/lib/db/schema";
import { INTERNAL_CLIENT_CODE } from "@/lib/my-dashboard/asana-map";
import { MAIN_KPIS_FIELD, parseClientKpis, type ClientKpi } from "@/lib/clients/kpis";
import { comparisonRanges } from "./series";
import { clientTeam, driveFileId, type TeamMember } from "./sales-summary";
import type { Totals } from "./values";

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/**
 * The header chart follows the period: one point per day up to two weeks, per
 * week (Monday) up to 14 weeks, else per month.
 */
export function sparkBucket(start: string, end: string): "day" | "week" | "month" {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
  return days <= 14 ? "day" : days <= 98 ? "week" : "month";
}
const bucketOf = (day: string, by: "day" | "week" | "month") => {
  if (by === "day") return day;
  if (by === "month") return `${day.slice(0, 7)}-01`;
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
};

export type SummaryClient = {
  code: string;
  name: string;
  tier: string | null;
  logoFileId: string | null;
  team: (TeamMember & { image: string | null })[];
  kpis: ClientKpi[];
  sources: string[];
  current: Totals;
  previous: Totals;
  lastYear: Totals;
  mtd: Totals;
  ytd: Totals;
  /** Net sales (Shopify, else GA4 revenue) per day / week / month of the period, for the header chart. */
  spark: { date: string; sales: number }[];
};

export type SalesSummary = {
  sparkBy: "day" | "week" | "month";
  start: string;
  end: string;
  previous: { start: string; end: string };
  lastYear: { start: string; end: string };
  mtd: { start: string; end: string };
  ytd: { start: string; end: string };
  clients: SummaryClient[];
  /** Active clients with no KPI data in the year yet. */
  noData: { code: string; name: string }[];
};

/** "source:metric" totals per client for a range. */
async function totalsByClient(from: string, to: string): Promise<Map<string, Totals>> {
  const rows = await db
    .select({ code: kpiDaily.clientIdCode, source: kpiDaily.source, metric: kpiDaily.metric, total: sql<number>`sum(${kpiDaily.value})` })
    .from(kpiDaily)
    .where(and(gte(kpiDaily.day, from), lte(kpiDaily.day, to)))
    .groupBy(kpiDaily.clientIdCode, kpiDaily.source, kpiDaily.metric);
  const out = new Map<string, Totals>();
  for (const r of rows) {
    const t = out.get(r.code.toUpperCase()) ?? {};
    t[`${r.source}:${r.metric}`] = Number(r.total);
    out.set(r.code.toUpperCase(), t);
  }
  return out;
}

/** Every active client's summary for [start, end] with its comparison windows. */
export async function salesSummary(start: string, end: string): Promise<SalesSummary> {
  const cmp = comparisonRanges(start, end);
  const mtd = { start: `${end.slice(0, 7)}-01`, end };
  const ytd = { start: `${end.slice(0, 4)}-01-01`, end };
  const by = sparkBucket(start, end);

  const [clients, guides, people, current, previous, lastYear, mtdT, ytdT, daily] = await Promise.all([
    db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus, raw: aac.rawData }).from(aac),
    db.select({ code: clientBrandGuidelines.clientIdCode, logo: clientBrandGuidelines.summaryLogo }).from(clientBrandGuidelines),
    db.select({ name: users.name, image: users.image }).from(users),
    totalsByClient(start, end),
    totalsByClient(cmp.previous.start, cmp.previous.end),
    totalsByClient(cmp.lastYear.start, cmp.lastYear.end),
    totalsByClient(mtd.start, mtd.end),
    totalsByClient(ytd.start, ytd.end),
    db
      .select({ code: kpiDaily.clientIdCode, day: kpiDaily.day, source: kpiDaily.source, metric: kpiDaily.metric, value: kpiDaily.value })
      .from(kpiDaily)
      .where(
        and(
          gte(kpiDaily.day, start),
          lte(kpiDaily.day, end),
          sql`(${kpiDaily.source}, ${kpiDaily.metric}) in (('shopify', 'net_sales'), ('ga4', 'purchase_revenue'))`,
        ),
      ),
  ]);

  const logoBy = new Map(guides.map((g) => [g.code.toUpperCase(), driveFileId(g.logo?.primary_url)]));
  const imageBy = new Map(people.filter((p) => p.name).map((p) => [p.name!.trim().toLowerCase(), p.image]));

  // Header chart: Shopify net sales per day where the client has Shopify, else GA4 revenue.
  const sparkBy = new Map<string, { shopify: Map<string, number>; ga4: Map<string, number> }>();
  for (const r of daily) {
    const code = r.code.toUpperCase();
    const s = sparkBy.get(code) ?? { shopify: new Map(), ga4: new Map() };
    const m = r.source === "shopify" ? s.shopify : s.ga4;
    const key = bucketOf(r.day, by);
    m.set(key, (m.get(key) ?? 0) + r.value);
    sparkBy.set(code, s);
  }
  const buckets: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (buckets.at(-1) !== bucketOf(d, by)) buckets.push(bucketOf(d, by));

  const out: SummaryClient[] = [];
  const noData: SalesSummary["noData"] = [];
  for (const c of clients) {
    const code = c.code.toUpperCase();
    if (code === INTERNAL_CLIENT_CODE || (c.status ?? "").toLowerCase() !== "active") continue;
    const name = c.name ?? c.code;
    const year = ytdT.get(code);
    if (!year || !Object.keys(year).length) {
      noData.push({ code: c.code, name });
      continue;
    }
    const raw = (c.raw ?? {}) as Record<string, string>;
    const s = sparkBy.get(code);
    const series = s?.shopify.size ? s.shopify : (s?.ga4 ?? new Map<string, number>());
    out.push({
      code: c.code,
      name,
      tier: raw.Tier?.trim() || null,
      logoFileId: logoBy.get(code) ?? null,
      team: clientTeam(raw).map((m) => ({ ...m, image: imageBy.get(m.name.toLowerCase()) ?? null })),
      kpis: parseClientKpis(raw[MAIN_KPIS_FIELD]),
      sources: [...new Set(Object.keys(year).map((k) => k.split(":")[0]))].sort(),
      current: current.get(code) ?? {},
      previous: previous.get(code) ?? {},
      lastYear: lastYear.get(code) ?? {},
      mtd: mtdT.get(code) ?? {},
      ytd: year,
      spark: buckets.map((date) => ({ date, sales: series.get(date) ?? 0 })),
    });
  }
  return { sparkBy: by, start, end, previous: cmp.previous, lastYear: cmp.lastYear, mtd, ytd, clients: out, noData: noData.sort((a, b) => a.name.localeCompare(b.name)) };
}
