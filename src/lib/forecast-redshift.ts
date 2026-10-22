/**
 * Shared Redshift fetch helpers for Forecast Tool.
 * Fetches account-level and per-ASIN historical data and returns plain objects
 * suitable for caching in the forecast_tool_versions JSONB columns.
 */

import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";

/** Resolve the Intentwise account ID for a client from the AAC table. */
export async function getIntentwiseAccountId(clientIdCode: string): Promise<number | null> {
  try {
    const [client] = await db
      .select({ rawData: aac.rawData })
      .from(aac)
      .where(eq(aac.clientIdCode, clientIdCode))
      .limit(1);
    if (client) {
      const raw = typeof client.rawData === "string"
        ? JSON.parse(client.rawData)
        : (client.rawData as Record<string, string>) || {};
      const iwId = raw.IntentwiseID || raw.intentwiseID;
      if (iwId) return parseInt(String(iwId), 10) || null;
    }
  } catch { /* continue without */ }
  return null;
}

/** Fetch account-level monthly historical from Redshift account_summary. */
export async function fetchAccountHistorical(
  intentwiseAccountId: number
): Promise<Record<string, Record<string, number>>> {
  const historical: Record<string, Record<string, number>> = {};
  const rsQuery = `
    SELECT
      month,
      SUM(product_sales) AS product_sales,
      SUM(units_ordered) AS units_ordered,
      SUM(sessions) AS sessions,
      SUM(ad_spend) AS ad_spend,
      SUM(ad_revenue) AS ad_revenue,
      SUM(total_order_items) AS total_order_items,
      SUM(ad_impressions) AS ad_impressions,
      SUM(ad_clicks) AS ad_clicks,
      SUM(ad_orders) AS ad_orders,
      SUM(ad_conversions) AS ad_conversions
    FROM (
      SELECT
        TO_CHAR(report_date, 'YYYY-MM') AS month,
        report_date,
        MAX(product_sales) AS product_sales,
        MAX(product_quantity) AS units_ordered,
        MAX(COALESCE(mobile_app_sessions, 0) + COALESCE(browser_session, 0)) AS sessions,
        MAX(ad_spend) AS ad_spend,
        MAX(ad_revenue) AS ad_revenue,
        MAX(total_order_items) AS total_order_items,
        MAX(ad_impressions) AS ad_impressions,
        MAX(ad_clicks) AS ad_clicks,
        MAX(ad_orders) AS ad_orders,
        MAX(CAST(ad_conversions AS FLOAT)) AS ad_conversions
      FROM "intentwise_ecommerce_graph"."account_summary"
      WHERE account_id = ${intentwiseAccountId}
        AND report_date >= DATEADD(month, -18, CURRENT_DATE)
      GROUP BY report_date, TO_CHAR(report_date, 'YYYY-MM')
    ) daily
    GROUP BY month
    ORDER BY month
  `;
  const rows = await queryRedshift<{
    month: string;
    product_sales: string | number | null;
    units_ordered: string | number | null;
    sessions: string | number | null;
    ad_spend: string | number | null;
    ad_revenue: string | number | null;
    total_order_items: string | number | null;
    ad_impressions: string | number | null;
    ad_clicks: string | number | null;
    ad_orders: string | number | null;
    ad_conversions: string | number | null;
  }>(rsQuery);
  for (const row of rows) {
    historical[row.month] = {
      product_sales: Number(row.product_sales) || 0,
      units_ordered: Number(row.units_ordered) || 0,
      sessions: Number(row.sessions) || 0,
      ad_spend: Number(row.ad_spend) || 0,
      ad_revenue: Number(row.ad_revenue) || 0,
      total_order_items: Number(row.total_order_items) || 0,
      ad_impressions: Number(row.ad_impressions) || 0,
      ad_clicks: Number(row.ad_clicks) || 0,
      ad_orders: Number(row.ad_orders) || 0,
      ad_conversions: Number(row.ad_conversions) || 0,
    };
  }
  return historical;
}

/** Fetch per-ASIN monthly data (units, sales, inventory) from Redshift. */
export async function fetchAsinHistorical(
  intentwiseAccountId: number,
  asinCodes: string[]
): Promise<Record<string, Record<string, Record<string, number>>>> {
  const asinHistorical: Record<string, Record<string, Record<string, number>>> = {};
  if (asinCodes.length === 0) return asinHistorical;

  const asinList = asinCodes.map((a) => `'${a}'`).join(",");

  // Per-ASIN units + sales from product_summary
  const asinQuery = `
    SELECT
      product AS asin,
      TO_CHAR(report_date, 'YYYY-MM') AS month,
      SUM(COALESCE(product_quantity, 0)) AS product_quantity,
      SUM(COALESCE(product_sales, 0)) AS product_sales
    FROM "intentwise_ecommerce_graph"."product_summary"
    WHERE account_id = ${intentwiseAccountId}
      AND product IN (${asinList})
      AND report_date >= DATEADD(month, -18, CURRENT_DATE)
    GROUP BY product, TO_CHAR(report_date, 'YYYY-MM')
    ORDER BY product, month
  `;
  const asinRows = await queryRedshift<{
    asin: string;
    month: string;
    product_quantity: string | number | null;
    product_sales: string | number | null;
  }>(asinQuery);
  for (const row of asinRows) {
    if (!asinHistorical[row.asin]) asinHistorical[row.asin] = {};
    asinHistorical[row.asin][row.month] = {
      product_quantity: Number(row.product_quantity) || 0,
      product_sales: Number(row.product_sales) || 0,
    };
  }

  // Per-ASIN end-of-month inventory from health report
  const invQuery = `
    SELECT h.asin,
      TO_CHAR(h.snapshot_date, 'YYYY-MM') AS month,
      MAX(h."available") AS inv_eom
    FROM "amazon_source_data"."sellercentral_fbamanageinventoryhealth_report" h
    INNER JOIN (
      SELECT asin, TO_CHAR(snapshot_date, 'YYYY-MM') AS m, MAX(snapshot_date) AS max_date
      FROM "amazon_source_data"."sellercentral_fbamanageinventoryhealth_report"
      WHERE account_id = ${intentwiseAccountId}
        AND asin IN (${asinList})
        AND snapshot_date >= DATEADD(month, -18, CURRENT_DATE)
      GROUP BY asin, TO_CHAR(snapshot_date, 'YYYY-MM')
    ) latest ON h.asin = latest.asin
             AND h.snapshot_date = latest.max_date
             AND TO_CHAR(h.snapshot_date, 'YYYY-MM') = latest.m
    WHERE h.account_id = ${intentwiseAccountId}
      AND h.asin IN (${asinList})
    GROUP BY h.asin, TO_CHAR(h.snapshot_date, 'YYYY-MM')
  `;
  const invRows = await queryRedshift<{
    asin: string;
    month: string;
    inv_eom: string | number | null;
  }>(invQuery);
  for (const row of invRows) {
    if (!asinHistorical[row.asin]) asinHistorical[row.asin] = {};
    if (!asinHistorical[row.asin][row.month])
      asinHistorical[row.asin][row.month] = { product_quantity: 0, product_sales: 0 };
    asinHistorical[row.asin][row.month].inv_eom = Number(row.inv_eom) || 0;
  }

  return asinHistorical;
}
