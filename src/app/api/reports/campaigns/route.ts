import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";

export const maxDuration = 60;

function getCampaignTypeName(type: string): string {
  const map: Record<string, string> = {
    "SP M PT": "Sponsored Products - Product Targeting",
    "SP M KT": "Sponsored Products - Keyword Targeting",
    "SB M PT": "Sponsored Brands - Product Targeting",
    "SP A": "Sponsored Products - Auto Targeting",
    "SB M KT": "Sponsored Brands - Keyword Targeting",
    "SB M V": "Sponsored Brands - Video",
    "SD PT": "Sponsored Display - Product Targeting",
    "SD A": "Sponsored Display - Auto Targeting",
    "SB M V PT": "Sponsored Brands - Video - Product Targeting",
    "SP M KT,SP M PT": "Sponsored Products - Keyword/Product Targeting",
  };
  return map[type] || type;
}

function ntbPct(ntbOrders: number, orders: number): number {
  return orders !== 0 ? (ntbOrders / orders) * 100 : 0;
}

function mapCampaignRow(
  r: Record<string, string>,
  kind: "type" | "name",
) {
  const spend = parseFloat(r.ad_spend) || 0;
  const revenue = parseFloat(r.ad_revenue) || 0;
  const clicks = parseFloat(r.ad_clicks) || 0;
  const impressions = parseFloat(r.ad_impressions) || 0;
  const conversions = parseFloat(r.ad_conversions) || 0;
  const orders = parseFloat(r.ad_orders) || 0;
  const ntbOrders = parseFloat(r.ntb_orders) || 0;
  return {
    ...(kind === "type"
      ? { campaignType: getCampaignTypeName(r.campaign_type) }
      : { campaignName: r.campaign_name }),
    adSpend: spend,
    adRevenue: revenue,
    acos: revenue !== 0 ? (spend / revenue) * 100 : 0,
    roas: spend !== 0 ? revenue / spend : 0,
    avgCpc: clicks !== 0 ? spend / clicks : 0,
    impressions,
    clicks,
    conversions,
    cvr: clicks !== 0 ? (conversions / clicks) * 100 : 0,
    orders,
    ntbOrders,
    ntbPct: ntbPct(ntbOrders, orders),
  };
}

const METRIC_SELECT = `
  SUM(CAST(ad_spend AS FLOAT)) AS ad_spend,
  SUM(CAST(ad_revenue AS FLOAT)) AS ad_revenue,
  SUM(CAST(ad_clicks AS FLOAT)) AS ad_clicks,
  SUM(CAST(ad_impressions AS FLOAT)) AS ad_impressions,
  SUM(CAST(ad_conversions AS FLOAT)) AS ad_conversions,
  SUM(CAST(ad_orders AS FLOAT)) AS ad_orders,
  SUM(CAST(ntb_orders AS FLOAT)) AS ntb_orders
`;

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthOrCron(req);
  if (unauthorized) return unauthorized;

  const params = req.nextUrl.searchParams;
  const accountId = (await getEffectiveAccountId(req)) ?? "";
  const start = params.get("start");
  const end = params.get("end");
  const refresh = params.get("refresh") === "true";

  if (!accountId || !start || !end) {
    return NextResponse.json({ error: "accountId, start and end are required" }, { status: 400 });
  }

  const cacheKey = buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>("report-campaigns-v2", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  try {
    const result = await queryRedshift(
      `
      SELECT
        campaign_type,
        ${METRIC_SELECT}
      FROM intentwise_ecommerce_graph.campaign_summary
      WHERE account_id = $1
        AND report_date BETWEEN $2 AND $3
        AND campaign_type IS NOT NULL
      GROUP BY campaign_type
      ORDER BY SUM(CAST(ad_spend AS FLOAT)) DESC
    `,
      [accountId, start, end],
    );

    const rows = (result as Record<string, string>[]).map((r) => mapCampaignRow(r, "type"));

    const resultByName = await queryRedshift(
      `
      SELECT
        campaign_name,
        ${METRIC_SELECT}
      FROM intentwise_ecommerce_graph.campaign_summary
      WHERE account_id = $1
        AND report_date BETWEEN $2 AND $3
        AND campaign_name IS NOT NULL
      GROUP BY campaign_name
      ORDER BY SUM(CAST(ad_spend AS FLOAT)) DESC
    `,
      [accountId, start, end],
    );

    const rowsByName = (resultByName as Record<string, string>[]).map((r) =>
      mapCampaignRow(r, "name"),
    );

    const response = { rows, rowsByName };
    await setCachedReport("report-campaigns-v2", cacheKey, response);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
