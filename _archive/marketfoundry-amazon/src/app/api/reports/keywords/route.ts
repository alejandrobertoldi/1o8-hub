// src/app/api/reports/keywords/route.ts
import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthOrCron(req);
  if (unauthorized) return unauthorized;

  const params = req.nextUrl.searchParams;
  const accountId = (await getEffectiveAccountId(req)) ?? "";
  const start     = params.get("start");
  const end       = params.get("end");
  const refresh   = params.get("refresh") === "true";

  if (!accountId || !start || !end) {
    return NextResponse.json(
      { error: "accountId, start and end are required" },
      { status: 400 }
    );
  }

  const cacheKey = buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>("report-keywords", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  try {
    const sql = `
      SELECT
        keyword_text,
        campaign_type,
        match_type,
        is_brand_keyword,
        SUM(CAST(ad_spend       AS FLOAT)) AS ad_spend,
        SUM(CAST(ad_revenue     AS FLOAT)) AS ad_revenue,
        SUM(CAST(ad_clicks      AS FLOAT)) AS ad_clicks,
        SUM(CAST(ad_conversions AS FLOAT)) AS ad_conversions,
        SUM(CAST(ad_impressions AS FLOAT)) AS ad_impressions
      FROM intentwise_ecommerce_graph.keyword_summary
      WHERE account_id  = ${accountId}
        AND report_date BETWEEN '${start}' AND '${end}'
      GROUP BY
        keyword_text,
        campaign_type,
        match_type,
        is_brand_keyword
      ORDER BY ad_spend DESC
    `;

    const rows = await queryRedshift(sql) as Record<string, string>[];

    const keywords = rows.map((row) => {
      const adSpend       = parseFloat(row.ad_spend)       || 0;
      const adRevenue     = parseFloat(row.ad_revenue)     || 0;
      const adClicks      = parseFloat(row.ad_clicks)      || 0;
      const adConversions = parseFloat(row.ad_conversions) || 0;
      const adImpressions = parseFloat(row.ad_impressions) || 0;

      const acos = adRevenue     !== 0 ? (adSpend / adRevenue) * 100 : 0;
      const roas = adSpend       !== 0 ? adRevenue / adSpend         : 0;
      const cpc  = adClicks      !== 0 ? adSpend / adClicks          : 0;
      const ctr  = adImpressions !== 0 ? (adClicks / adImpressions) * 100 : 0;
      const cvr  = adClicks      !== 0 ? (adConversions / adClicks) * 100  : 0;

      return {
        keyword:       row.keyword_text    || "",
        campaignType:  row.campaign_type   || "",
        matchType:     row.match_type      || "",
        isBrand:       row.is_brand_keyword === "true" || row.is_brand_keyword === "1",
        adSpend,
        adRevenue,
        adClicks,
        adConversions,
        adImpressions,
        acos,
        roas,
        cpc,
        ctr,
        cvr,
      };
    });

    const response = { keywords };

    await setCachedReport("report-keywords", cacheKey, response);

    return NextResponse.json(response);

  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

