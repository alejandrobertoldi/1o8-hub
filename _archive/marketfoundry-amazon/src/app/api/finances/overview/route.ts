import { NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { queryRedshift } from "@/lib/redshift";
import { unauthorized, forbidden } from "@/lib/api-utils";

export const maxDuration = 60;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;

export async function GET() {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!canAccessSection(session, "finances")) return forbidden();

  // Get all client accounts
  const clients = await db.select().from(aac);
  if (clients.length === 0) {
    return NextResponse.json([]);
  }

  // Query last 30 days and previous 30 days for comparison
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  const prevStart = new Date();
  prevStart.setDate(start.getDate() - 30);

  const endStr = end.toISOString().slice(0, 10);
  const startStr = start.toISOString().slice(0, 10);
  const prevStartStr = prevStart.toISOString().slice(0, 10);

  try {
    const rows = await queryRedshift(`
      SELECT
        account_name,
        SUM(CASE WHEN report_date >= '${startStr}' THEN COALESCE(product_sales, 0) + COALESCE(ad_revenue, 0) ELSE 0 END) as total_revenue,
        SUM(CASE WHEN report_date >= '${startStr}' THEN COALESCE(ad_spend, 0) ELSE 0 END) as ad_spend,
        SUM(CASE WHEN report_date >= '${startStr}' THEN COALESCE(ad_revenue, 0) ELSE 0 END) as ad_revenue,
        SUM(CASE WHEN report_date >= '${startStr}' THEN COALESCE(product_sales, 0) ELSE 0 END) as product_sales,
        SUM(CASE WHEN report_date < '${startStr}' THEN COALESCE(product_sales, 0) + COALESCE(ad_revenue, 0) ELSE 0 END) as prev_total_revenue
      FROM ${FULL_TABLE}
      WHERE report_date >= '${prevStartStr}' AND report_date <= '${endStr}'
      GROUP BY account_name
      ORDER BY total_revenue DESC
    `);

    const result = rows.map((row: Record<string, unknown>) => ({
      clientIdCode: String(row.account_name ?? ""),
      totalRevenue: Number(row.total_revenue ?? 0),
      adSpend: Number(row.ad_spend ?? 0),
      adRevenue: Number(row.ad_revenue ?? 0),
      productSales: Number(row.product_sales ?? 0),
      prevTotalRevenue: Number(row.prev_total_revenue ?? 0),
    }));

    return NextResponse.json(result);
  } catch (err) {
    // Redshift unavailable — return empty to show empty state, but log for debugging
    console.error("[finances/overview] Redshift query failed:", err instanceof Error ? err.message : err);
    return NextResponse.json([]);
  }
}
