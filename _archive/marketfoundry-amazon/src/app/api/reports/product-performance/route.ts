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
  const start = params.get("start");
  const end = params.get("end");
  const refresh = params.get("refresh") === "true";

  if (!accountId || !start || !end) {
    return NextResponse.json(
      { error: "accountId, start and end are required" },
      { status: 400 },
    );
  }

  const cacheKey = buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>("report-product-performance-v2", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  try {
    // advertised_product_summary is ads-only (one row per product ad / day).
    // Intentwise stores attributed orders in ad_orders and attributed units
    // in ad_conversions; ad_revenue is attributed sales.
    const sql = `
      SELECT
        product AS asin,
        MAX(product_title) AS product_title,
        SUM(CAST(ad_spend AS FLOAT)) AS ad_spend,
        SUM(CAST(ad_revenue AS FLOAT)) AS ad_revenue,
        SUM(CAST(ad_impressions AS FLOAT)) AS impressions,
        SUM(CAST(ad_clicks AS FLOAT)) AS clicks,
        SUM(CAST(ad_conversions AS FLOAT)) AS units,
        SUM(CAST(ad_orders AS FLOAT)) AS orders
      FROM intentwise_ecommerce_graph.advertised_product_summary
      WHERE account_id = $1
        AND report_date BETWEEN $2 AND $3
      GROUP BY product
      ORDER BY ad_spend DESC
    `;

    const rows = await queryRedshift(sql, [accountId, start, end]);

    const products = rows.map((r) => {
      const row = r as Record<string, string>;

      const adSpend = parseFloat(row.ad_spend) || 0;
      const adRevenue = parseFloat(row.ad_revenue) || 0;
      const impressions = parseFloat(row.impressions) || 0;
      const clicks = parseFloat(row.clicks) || 0;
      const units = parseFloat(row.units) || 0;
      const orders = parseFloat(row.orders) || 0;

      return {
        asin: row.asin ?? "",
        productTitle: row.product_title ?? "",
        adSpend,
        adRevenue,
        acos: adRevenue !== 0 ? (adSpend / adRevenue) * 100 : 0,
        roas: adSpend !== 0 ? adRevenue / adSpend : 0,
        impressions,
        clicks,
        conversions: orders,
        cvr: clicks !== 0 ? (orders / clicks) * 100 : 0,
        orders,
        units,
      };
    });

    const response = { products };
    await setCachedReport("report-product-performance-v2", cacheKey, response);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
