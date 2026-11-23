import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, clientBrandGuidelines, clientReports, kpiDaily } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/gcp-auth";
import { driveFileId } from "@/lib/kpi/sales-summary";
import { INTERNAL_CLIENT_CODE } from "@/lib/my-dashboard/asana-map";
import type { Totals } from "@/lib/kpi/values";
import { buildClientReport, type MonthData } from "./build";
import { periodRange, trailingPeriods } from "./period";
import type { ClientReportData } from "./types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const MAX_LOGO_BYTES = 1_500_000;

/**
 * The client's logo (Brand Guidelines → summary logo, a Drive file) as a data
 * URL, so the report and its PDF show it without a signed-in Drive proxy.
 * Null when there's no logo or Drive can't be read.
 */
async function logoDataUrl(url: string | null | undefined): Promise<string | null> {
  const id = driveFileId(url);
  if (!id) return null;
  try {
    const token = await getAccessToken([DRIVE_SCOPE]);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch (e) {
    console.warn("[client-report] logo", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Builds (doesn't save) the report numbers for a client and month. Null when the client doesn't exist. */
export async function buildReportFor(code: string, period: string): Promise<ClientReportData | null> {
  const [client] = await db
    .select({ code: aac.clientIdCode, name: aac.clientName, raw: aac.rawData })
    .from(aac)
    .where(eq(sql`upper(${aac.clientIdCode})`, code.toUpperCase()))
    .limit(1);
  if (!client) return null;

  const periods = trailingPeriods(period, 13);
  const from = periodRange(periods[0]).start;
  const { start, end } = periodRange(period);
  const [rows, [guide]] = await Promise.all([
    db
      .select({ source: kpiDaily.source, metric: kpiDaily.metric, day: kpiDaily.day, value: kpiDaily.value })
      .from(kpiDaily)
      .where(and(eq(sql`upper(${kpiDaily.clientIdCode})`, code.toUpperCase()), gte(kpiDaily.day, from), lte(kpiDaily.day, end))),
    db.select({ logo: clientBrandGuidelines.summaryLogo }).from(clientBrandGuidelines).where(eq(clientBrandGuidelines.clientIdCode, client.code)).limit(1),
  ]);

  const months: Record<string, MonthData> = {};
  const coverageDays: Record<string, Record<string, Set<string>>> = {};
  const days: Record<string, Totals> = {};
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days[d.toISOString().slice(0, 10)] = {};
  }
  let dataThrough: string | null = null;
  for (const r of rows) {
    const p = r.day.slice(0, 7);
    const k = `${r.source}:${r.metric}`;
    const m = (months[p] ??= { totals: {}, coverage: {} });
    m.totals[k] = (m.totals[k] ?? 0) + r.value;
    ((coverageDays[p] ??= {})[r.source] ??= new Set()).add(r.day);
    if (p === period) {
      days[r.day][k] = (days[r.day][k] ?? 0) + r.value;
      if (!dataThrough || r.day > dataThrough) dataThrough = r.day;
    }
  }
  for (const [p, bySource] of Object.entries(coverageDays)) {
    for (const [s, set] of Object.entries(bySource)) months[p].coverage[s] = set.size;
  }

  return buildClientReport({
    client: {
      code: client.code,
      name: client.name ?? client.code,
      logo: await logoDataUrl(guide?.logo?.primary_url),
      raw: (client.raw ?? {}) as Record<string, string>,
    },
    period,
    months,
    days,
    dataThrough,
    generatedAt: new Date().toISOString(),
  });
}

/** Builds the report and saves it (replacing the numbers of an existing one). */
export async function generateReport(code: string, period: string, userId: string | null) {
  const data = await buildReportFor(code, period);
  if (!data) return null;
  const now = new Date();
  const [row] = await db
    .insert(clientReports)
    .values({ clientIdCode: data.client.code, period, data, dataThrough: data.dataThrough, generatedBy: userId, generatedAt: now })
    .onConflictDoUpdate({
      target: [clientReports.clientIdCode, clientReports.period],
      set: { data, dataThrough: data.dataThrough, generatedBy: userId, generatedAt: now, updatedAt: now },
    })
    .returning();
  return row;
}

export async function getReport(code: string, period: string) {
  const [row] = await db
    .select()
    .from(clientReports)
    .where(and(eq(sql`upper(${clientReports.clientIdCode})`, code.toUpperCase()), eq(clientReports.period, period)))
    .limit(1);
  return row ?? null;
}

export type ReportListRow = {
  code: string;
  name: string;
  accountManager: string | null;
  projectManager: string | null;
  /** Sources with data in the month. */
  sources: string[];
  report: { status: string; generatedAt: string; dataThrough: string | null } | null;
};

/** Every active client with its data sources for the month and its report, if any. */
export async function listReports(period: string): Promise<ReportListRow[]> {
  const { start, end } = periodRange(period);
  const [clients, sourceRows, reports] = await Promise.all([
    db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus, raw: aac.rawData }).from(aac),
    db
      .selectDistinct({ code: sql<string>`upper(${kpiDaily.clientIdCode})`, source: kpiDaily.source })
      .from(kpiDaily)
      .where(and(gte(kpiDaily.day, start), lte(kpiDaily.day, end))),
    db
      .select({ code: clientReports.clientIdCode, status: clientReports.status, generatedAt: clientReports.generatedAt, dataThrough: clientReports.dataThrough })
      .from(clientReports)
      .where(eq(clientReports.period, period)),
  ]);
  const sources = new Map<string, string[]>();
  for (const r of sourceRows) sources.set(r.code, [...(sources.get(r.code) ?? []), r.source].sort());
  const byCode = new Map(reports.map((r) => [r.code.toUpperCase(), r]));
  const first = (v: string | undefined) => v?.split(/[,;/]/)[0]?.trim() || null;
  return clients
    .filter((c) => (c.status ?? "").toLowerCase() === "active" && c.code.toUpperCase() !== INTERNAL_CLIENT_CODE)
    .map((c) => {
      const raw = (c.raw ?? {}) as Record<string, string>;
      const r = byCode.get(c.code.toUpperCase());
      return {
        code: c.code,
        name: c.name ?? c.code,
        accountManager: first(raw.AccountManager_MF),
        projectManager: first(raw.ProjectManager_MF),
        sources: sources.get(c.code.toUpperCase()) ?? [],
        report: r ? { status: r.status, generatedAt: r.generatedAt.toISOString(), dataThrough: r.dataThrough } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
