import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchDailyCampaignMetrics } from "@/lib/ppc-queries";
import { formatLocalDate } from "@/lib/date-ranges";

export const maxDuration = 30;

/**
 * GET /api/ppc/daily-metrics?clientIdCode=X
 * Returns daily campaign metrics for the last 7 days (from Redshift).
 * Used for dashboard sparklines.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientIdCode = new URL(req.url).searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });
  }

  // Resolve clientIdCode → Intentwise account ID
  const [client] = await db
    .select({ rawData: aac.rawData })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const raw = typeof client.rawData === "string"
    ? JSON.parse(client.rawData)
    : (client.rawData as Record<string, string>);
  const accountId = parseInt(raw?.IntentwiseID, 10);
  if (!accountId) {
    return NextResponse.json({ error: "No Intentwise ID for this client" }, { status: 404 });
  }

  // Current week: last 7 days ending yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(yesterday);
  weekAgo.setDate(yesterday.getDate() - 6);

  // Previous week: the 7 days before that
  const prevEnd = new Date(weekAgo);
  prevEnd.setDate(weekAgo.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - 6);

  const [rows, prevRows] = await Promise.all([
    fetchDailyCampaignMetrics(accountId, formatLocalDate(weekAgo), formatLocalDate(yesterday)),
    fetchDailyCampaignMetrics(accountId, formatLocalDate(prevStart), formatLocalDate(prevEnd)),
  ]);

  const toDayMetrics = (r: { report_date: string; total_spend: number; total_revenue: number; total_impressions: number; total_clicks: number; total_orders: number }) => {
    const spend = Number(r.total_spend) || 0;
    const revenue = Number(r.total_revenue) || 0;
    const impressions = Number(r.total_impressions) || 0;
    const clicks = Number(r.total_clicks) || 0;
    const orders = Number(r.total_orders) || 0;
    return {
      date: String(r.report_date).slice(0, 10),
      totalSpend: spend,
      totalRevenue: revenue,
      totalImpressions: impressions,
      totalClicks: clicks,
      totalOrders: orders,
      acos: revenue > 0 ? (spend / revenue) * 100 : 0,
      roas: spend > 0 ? revenue / spend : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  };

  const days = rows.map(toDayMetrics);
  const prevDays = prevRows.map(toDayMetrics);

  return NextResponse.json({ days, prevDays });
}
