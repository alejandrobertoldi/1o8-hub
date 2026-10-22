import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { sessionHasClient } from "@/lib/client-codes";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";
import {
  DEMO_CLIENT_DISPLAY,
  resolveDemoDataSource,
} from "@/lib/demo-client-alias";

export const maxDuration = 60;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;

interface DayRow {
  report_date: string;
  product_sales: number;
  ad_spend: number;
  ad_revenue: number;
}

/**
 * GET /api/ppc/sales-monitor?clientIdCode=X
 * Returns 30 days of daily product_sales, ad_spend, ad_revenue + goals.
 */
export async function GET(req: NextRequest) {
  try {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string; clientIdCode?: string }).role;
  const userClientCode = (session.user as { clientIdCode?: string }).clientIdCode;

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });
  }

  // Auth: admin/editor can see any client; client role can only see assigned
  // clients. clientIdCode may hold several comma-separated codes (multi-brand
  // owners like Trejo's Tacos + Trejo's Spirits), so membership, not equality.
  if (role === "client" && !sessionHasClient(userClientCode ?? null, clientIdCode)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!role || !(isEditorOrAbove(role) || role === "client")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Demo clients (e.g. Zingora) borrow IntentWise from a donor AAC row.
  const dataClientCode = resolveDemoDataSource(clientIdCode);
  const display = DEMO_CLIENT_DISPLAY[clientIdCode];

  const [client] = await db
    .select({ clientName: aac.clientName, rawData: aac.rawData })
    .from(aac)
    .where(eq(aac.clientIdCode, dataClientCode))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const raw = typeof client.rawData === "string"
    ? JSON.parse(client.rawData)
    : (client.rawData as Record<string, string>) || {};

  const intentwiseId = raw.IntentwiseID || raw["Intentwise ID"] || raw.intentwiseID;
  if (!intentwiseId) {
    return NextResponse.json({ error: "No IntentWise ID for client" }, { status: 404 });
  }

  const accountId = parseInt(String(intentwiseId), 10);
  if (isNaN(accountId)) {
    return NextResponse.json({ error: "Invalid IntentWise ID" }, { status: 400 });
  }

  // Parse goals from rawData
  function parseGoalValue(key: string): number | null {
    const v = raw[key];
    if (!v || v === "N/A" || String(v).includes("#")) return null;
    const n = parseFloat(String(v).replace(/[%$,]/g, ""));
    return isNaN(n) ? null : n;
  }

  const goals = {
    salesForecast1M: parseGoalValue("SalesForecast1M"),
    adSpendBudget1M: parseGoalValue("ADSpendBudget1M"),
    acosGoal1M: parseGoalValue("ACOSGoal1M"),
    tacosGoal1M: parseGoalValue("TACOSGoal1M"),
    roasGoal1M: parseGoalValue("ROASGoal1M"),
  };

  // Date range: last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const rows = await queryRedshift<DayRow>(
    `SELECT
      TO_CHAR(report_date, 'YYYY-MM-DD') AS report_date,
      COALESCE(SUM(product_sales), 0) AS product_sales,
      COALESCE(SUM(ad_spend), 0) AS ad_spend,
      COALESCE(SUM(ad_revenue), 0) AS ad_revenue
    FROM ${FULL_TABLE}
    WHERE account_id = $1
      AND report_date >= $2::DATE AND report_date <= $3::DATE
    GROUP BY report_date
    ORDER BY report_date DESC`,
    [accountId, fmt(startDate), fmt(endDate)]
  );

  const days = rows.map((r) => {
    const ps = Number(r.product_sales) || 0;
    const spend = Number(r.ad_spend) || 0;
    const rev = Number(r.ad_revenue) || 0;
    return {
      date: r.report_date,
      product_sales: ps,
      ad_spend: spend,
      ad_revenue: rev,
      acos: rev > 0 ? (spend / rev) * 100 : 0,
      tacos: ps > 0 ? (spend / ps) * 100 : 0,
      roas: spend > 0 ? rev / spend : 0,
    };
  });

  const latestDate = days.length > 0 ? days[0].date : null;

  return NextResponse.json({
    client: {
      name: display?.clientName || client.clientName || clientIdCode,
      marketplace: raw.Marketplace || "Amazon",
      country: raw.Country || "US",
      intentwiseId: String(accountId),
    },
    goals,
    latestDate,
    days,
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sales-monitor] Unhandled error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
