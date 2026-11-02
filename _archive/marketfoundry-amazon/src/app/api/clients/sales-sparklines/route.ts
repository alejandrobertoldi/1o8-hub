/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { ilike } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";

export const maxDuration = 30;

const RS_TABLE = `"intentwise_ecommerce_graph"."account_summary"`;

interface SparklineRow {
  account_id: number | string;
  report_date: string;
  product_sales: number | string;
}

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try { return JSON.parse(rawData); } catch { return {}; }
  }
  if (rawData && typeof rawData === "object") return rawData as Record<string, string>;
  return {};
}

export async function GET(_req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Map active clients → Intentwise account IDs
  const activeClients = await db
    .select({ clientIdCode: aac.clientIdCode, rawData: aac.rawData })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));

  const accountToClient = new Map<string, string>();
  const allAccountIds: string[] = [];
  for (const c of activeClients) {
    if (!c.clientIdCode) continue;
    const raw = parseRawData(c.rawData);
    const iwId = raw.IntentwiseID?.trim();
    if (!iwId) continue;
    const id = parseInt(iwId, 10);
    if (isNaN(id)) continue;
    accountToClient.set(String(id), c.clientIdCode);
    allAccountIds.push(String(id));
  }

  if (allAccountIds.length === 0) {
    return NextResponse.json({ dates: [], clients: {} });
  }

  const inClause = allAccountIds.map((id) => `${parseInt(id, 10)}::BIGINT`).join(",");

  // Anchor the 7-day window on the latest available report_date so we don't
  // show trailing zeros while data is still landing in Redshift.
  const sql = `
    WITH latest AS (
      SELECT MAX(report_date) AS max_date
      FROM ${RS_TABLE}
      WHERE account_id IN (${inClause})
    )
    SELECT
      account_id::BIGINT AS account_id,
      TO_CHAR(report_date, 'YYYY-MM-DD') AS report_date,
      COALESCE(SUM(product_sales), 0)::FLOAT AS product_sales
    FROM ${RS_TABLE}, latest
    WHERE report_date > latest.max_date - INTERVAL '7 days'
      AND report_date <= latest.max_date
      AND account_id IN (${inClause})
    GROUP BY account_id, report_date
  `;

  const rows = await queryRedshift<SparklineRow>(sql).catch(() => []);

  const allDates = new Set<string>();
  for (const row of rows) allDates.add(row.report_date);
  const dates = Array.from(allDates).toSorted();

  // Aggregate by client + date
  const clientDateSales = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const code = accountToClient.get(String(row.account_id));
    if (!code) continue;
    if (!clientDateSales.has(code)) clientDateSales.set(code, new Map());
    const m = clientDateSales.get(code)!;
    const sales = Number(row.product_sales) || 0;
    m.set(row.report_date, (m.get(row.report_date) ?? 0) + sales);
  }

  const clients: Record<string, { points: { date: string; sales: number }[]; total: number; latest: number }> = {};
  for (const [code, dateMap] of clientDateSales) {
    const points = dates.map((d) => ({ date: d, sales: dateMap.get(d) ?? 0 }));
    const total = points.reduce((s, p) => s + p.sales, 0);
    const latest = points[points.length - 1]?.sales ?? 0;
    clients[code] = { points, total, latest };
  }

  return NextResponse.json({ dates, clients });
}
