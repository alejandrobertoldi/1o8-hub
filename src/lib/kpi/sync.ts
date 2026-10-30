import { and, desc, eq, gte, lte, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, kpiDaily, kpiSyncRuns } from "@/lib/db/schema";
import { MAIN_KPIS_FIELD, parseClientKpis, type ClientKpi } from "@/lib/clients/kpis";
import { fetchGa4Daily, type DailyValue } from "./ga4";
import { fetchMetaDaily } from "./meta";
import { fetchKlaviyoDaily } from "./klaviyo";
import { clientsWithKlaviyo } from "./secrets";
import { fetchShopifyDaily, normalizeShop, shopifyConnected } from "./shopify";
import { kpiValue, parseTarget, targetStatus, type KpiValue, type TargetStatus, type Totals } from "./values";

/** Hub-only raw_data keys naming each client's data sources. */
export const GA4_PROPERTY_FIELD = "GA4Property";
export const META_AD_ACCOUNT_FIELD = "MetaAdAccount";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY));
/** First pull goes back ~13 months so last year's month is there to compare. */
const BACKFILL_DAYS = 400;
/** Re-read the last few days every time: GA4 keeps settling for ~72h. */
const REFRESH_DAYS = 4;
const CHUNK_DAYS = 180;

type ClientSources = { code: string; ga4: string[]; meta: string[]; klaviyo: boolean; shop: string | null };

/** Some clients have several properties / ad accounts (US, Canada…): comma separated, summed. */
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

async function clientSources(only?: string): Promise<ClientSources[]> {
  const [rows, klaviyo] = await Promise.all([
    db
      .select({ code: aac.clientIdCode, raw: aac.rawData })
      .from(aac)
      .where(only ? eq(aac.clientIdCode, only) : undefined),
    clientsWithKlaviyo(),
  ]);
  return rows.map((r) => {
    const raw = (r.raw ?? {}) as Record<string, string>;
    return {
      code: r.code,
      ga4: list(raw[GA4_PROPERTY_FIELD]),
      meta: list(raw[META_AD_ACCOUNT_FIELD]),
      klaviyo: klaviyo.has(r.code.toUpperCase()),
      shop: normalizeShop(raw.ShopifyStore),
    };
  });
}

/** Several accounts' rows for the same day and metric → one total. */
export function sumByDay(rows: DailyValue[]): DailyValue[] {
  const totals = new Map<string, DailyValue>();
  for (const r of rows) {
    const k = `${r.day}|${r.metric}`;
    const t = totals.get(k);
    if (t) t.value += r.value;
    else totals.set(k, { ...r });
  }
  return [...totals.values()];
}

async function lastDay(code: string, source: string): Promise<string | null> {
  const [row] = await db
    .select({ day: max(kpiDaily.day) })
    .from(kpiDaily)
    .where(and(eq(kpiDaily.clientIdCode, code), eq(kpiDaily.source, source)));
  return row?.day ?? null;
}

async function store(code: string, source: string, rows: { day: string; metric: string; value: number }[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ clientIdCode: code, source, ...r, updatedAt: new Date() }));
    await db
      .insert(kpiDaily)
      .values(chunk)
      .onConflictDoUpdate({
        target: [kpiDaily.clientIdCode, kpiDaily.source, kpiDaily.metric, kpiDaily.day],
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });
  }
}

export type KpiSyncReport = { clients: { code: string; source: string; days: number; error?: string }[] };

/** Pulls every connected source for every client (or one) into kpi_daily, through yesterday. */
export async function syncKpis(trigger: string, only?: string, opts: { full?: boolean } = {}): Promise<KpiSyncReport> {
  const [run] = await db.insert(kpiSyncRuns).values({ trigger }).returning({ id: kpiSyncRuns.id });
  const yesterday = addDays(iso(new Date()), -1);
  const report: KpiSyncReport = { clients: [] };
  const pull = async (code: string, source: string, fetchRange: (from: string, to: string) => Promise<DailyValue[]>) => {
    try {
      // full: re-read the whole backfill window (e.g. after adding a metric).
      const last = opts.full ? null : await lastDay(code, source);
      const from = last ? addDays(last, -REFRESH_DAYS) : addDays(yesterday, -BACKFILL_DAYS);
      // Some APIs cap a query at a year (Klaviyo); pull in half-year slices.
      const rows: DailyValue[] = [];
      for (let start = from; start <= yesterday; start = addDays(start, CHUNK_DAYS)) {
        const end = addDays(start, CHUNK_DAYS - 1) < yesterday ? addDays(start, CHUNK_DAYS - 1) : yesterday;
        rows.push(...(await fetchRange(start, end)));
      }
      // A day split across two slices (time zone edges) comes back twice: add it up.
      const merged = sumByDay(rows);
      await store(code, source, merged);
      report.clients.push({ code, source, days: new Set(merged.map((r) => r.day)).size });
    } catch (err) {
      const cause = (err as { cause?: { message?: string } })?.cause?.message;
      report.clients.push({ code, source, days: 0, error: cause ?? (err instanceof Error ? err.message : String(err)) });
    }
  };
  for (const c of await clientSources(only)) {
    if (c.ga4.length) await pull(c.code, "ga4", async (f, t) => sumByDay((await Promise.all(c.ga4.map((id) => fetchGa4Daily(id, f, t)))).flat()));
    if (c.meta.length) await pull(c.code, "meta", async (f, t) => sumByDay((await Promise.all(c.meta.map((id) => fetchMetaDaily(id, f, t)))).flat()));
    if (c.klaviyo) await pull(c.code, "klaviyo", (f, t) => fetchKlaviyoDaily(c.code, f, t));
    if (c.shop && (await shopifyConnected(c.shop))) await pull(c.code, "shopify", (f, t) => fetchShopifyDaily(c.shop!, f, t));
  }
  const errors = report.clients.filter((c) => c.error).map((c) => `${c.code} ${c.source}: ${c.error}`);
  await db
    .update(kpiSyncRuns)
    .set({ finishedAt: new Date(), report, error: errors.length ? errors.join(" · ") : null })
    .where(eq(kpiSyncRuns.id, run.id));
  return report;
}

export function lastKpiRuns(limit = 10) {
  return db.select().from(kpiSyncRuns).orderBy(desc(kpiSyncRuns.startedAt)).limit(limit);
}

async function totals(codes: string[] | null, from: string, to: string): Promise<Map<string, Totals>> {
  const rows = await db
    .select({ code: kpiDaily.clientIdCode, source: kpiDaily.source, metric: kpiDaily.metric, total: sql<number>`sum(${kpiDaily.value})` })
    .from(kpiDaily)
    .where(and(gte(kpiDaily.day, from), lte(kpiDaily.day, to), codes?.length === 1 ? eq(kpiDaily.clientIdCode, codes[0]) : undefined))
    .groupBy(kpiDaily.clientIdCode, kpiDaily.source, kpiDaily.metric);
  const out = new Map<string, Totals>();
  for (const r of rows) {
    if (codes && !codes.includes(r.code)) continue;
    const t = out.get(r.code) ?? {};
    t[`${r.source}:${r.metric}`] = Number(r.total);
    out.set(r.code, t);
  }
  return out;
}

export type KpiReading = ClientKpi & {
  mtd: KpiValue | null;
  lastMonth: KpiValue | null;
  status: TargetStatus;
};

export type ClientKpiReadings = { code: string; through: string | null; kpis: KpiReading[] };

/**
 * Each client's Main KPIs this month (through yesterday) and last month,
 * with on-track / behind against the target.
 */
export async function kpiReadings(only?: string): Promise<ClientKpiReadings[]> {
  const today = new Date();
  const yesterday = addDays(iso(today), -1);
  const monthStart = `${yesterday.slice(0, 7)}-01`;
  const prevEnd = addDays(monthStart, -1);
  const prevStart = `${prevEnd.slice(0, 7)}-01`;
  const daysElapsed = Number(yesterday.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(yesterday.slice(0, 4)), Number(yesterday.slice(5, 7)), 0)).getUTCDate();

  const clients = await db
    .select({ code: aac.clientIdCode, raw: aac.rawData })
    .from(aac)
    .where(only ? eq(aac.clientIdCode, only) : undefined);
  const withKpis = clients
    .map((c) => ({ code: c.code, kpis: parseClientKpis(((c.raw ?? {}) as Record<string, string>)[MAIN_KPIS_FIELD]) }))
    .filter((c) => c.kpis.length);
  if (!withKpis.length) return [];

  const codes = only ? [only] : null;
  const [mtd, prev, latest] = await Promise.all([
    totals(codes, monthStart, yesterday),
    totals(codes, prevStart, prevEnd),
    db
      .select({ code: kpiDaily.clientIdCode, day: max(kpiDaily.day) })
      .from(kpiDaily)
      .where(only ? eq(kpiDaily.clientIdCode, only) : undefined)
      .groupBy(kpiDaily.clientIdCode),
  ]);
  const latestBy = new Map(latest.map((l) => [l.code, l.day]));

  return withKpis.map((c) => ({
    code: c.code,
    through: latestBy.get(c.code) ?? null,
    kpis: c.kpis.map((k) => {
      const now = kpiValue(k.key, mtd.get(c.code) ?? {});
      return {
        ...k,
        mtd: now,
        lastMonth: kpiValue(k.key, prev.get(c.code) ?? {}),
        status: now ? targetStatus(k.key, now, parseTarget(k.target, now.unit), daysElapsed, daysInMonth) : null,
      };
    }),
  }));
}
