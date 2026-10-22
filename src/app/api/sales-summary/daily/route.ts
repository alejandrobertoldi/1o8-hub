/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { queryRedshift } from "@/lib/redshift";
import { getCachedData, setCachedData, buildDailyCacheKey } from "@/lib/sales-cache";
import { PORTAL_DEMO } from "@/lib/portal-demo";

export const maxDuration = 60;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;
const SNS_TABLE = `"amazon_source_data"."replenishment_offer_metrics"`;

export async function GET(req: NextRequest) {
  // Allow cron refresh via CRON_SECRET bearer token
  const isCronRequest = req.headers.get("x-cron-refresh") === "true";
  const cronSecret = process.env.CRON_SECRET;

  if (isCronRequest && cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    // Cron-authenticated — proceed without session
  } else {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user?.clientStatus === "Prospect") return NextResponse.json(PORTAL_DEMO.salesDaily);
  }

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const accountIds = req.nextUrl.searchParams.get("accountIds");
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  if (!start || !end || !accountIds) {
    return NextResponse.json({ error: "Missing start, end, or accountIds" }, { status: 400 });
  }

  // Check Supabase cache first (unless refresh requested)
  const cacheKey = buildDailyCacheKey(start, end, accountIds);
  if (!refresh) {
    const cached = await getCachedData<{ days: unknown[] }>("daily", cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const ids = accountIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.some((id) => isNaN(parseInt(id, 10)))) {
    return NextResponse.json({ error: "Invalid accountIds" }, { status: 400 });
  }
  const inClause = ids.map((id) => `${parseInt(id, 10)}::BIGINT`).join(",");

  const sql = `
    SELECT
      TO_CHAR(report_date, 'YYYY-MM-DD') AS report_date,
      COALESCE(SUM(ad_impressions), 0) AS ad_impressions,
      COALESCE(SUM(ad_clicks), 0) AS ad_clicks,
      COALESCE(SUM(ad_spend), 0) AS ad_spend,
      COALESCE(SUM(ad_revenue), 0) AS ad_revenue,
      COALESCE(SUM(ad_orders), 0) AS ad_orders,
      COALESCE(SUM(product_sales), 0) AS product_sales,
      COALESCE(SUM(product_quantity), 0) AS product_quantity,
      COALESCE(SUM(shipped_units), 0) AS shipped_units,
      COALESCE(SUM(shipped_revenue), 0) AS shipped_revenue,
      COALESCE(SUM(ordered_units), 0) AS ordered_units,
      COALESCE(SUM(ordered_revenue), 0) AS ordered_revenue,
      COALESCE(SUM(total_order_items), 0) AS total_order_items,
      COALESCE(SUM(mobile_app_sessions), 0) AS mobile_app_sessions,
      COALESCE(SUM(browser_session), 0) AS browser_session,
      COALESCE(SUM(glance_view_byasin), 0) AS glance_view_byasin,
      0 AS ntb_orders,
      0 AS ntb_revenue,
      0 AS ntb_ordered_units,
      0 AS new_active_sns_subscriptions,
      0 AS new_sns_subscriptions_revenue
    FROM ${FULL_TABLE}
    WHERE report_date >= '${start}'::DATE AND report_date <= '${end}'::DATE
      AND account_id IN (${inClause})
    GROUP BY report_date
    ORDER BY report_date
  `;

  // SNS: cumulative active_subscriptions — weekly data, get latest snapshot up to end of range
  const snsSql = `
    SELECT
      COALESCE(SUM(r.active_subscriptions::FLOAT), 0)::BIGINT AS active_subscriptions
    FROM ${SNS_TABLE} r
    INNER JOIN (
      SELECT account_id, MAX(end_date) AS max_date
      FROM ${SNS_TABLE}
      WHERE end_date::DATE <= '${end}'::DATE
        AND account_id IN (${inClause})
      GROUP BY account_id
    ) latest ON r.account_id = latest.account_id AND r.end_date = latest.max_date
    WHERE r.account_id IN (${inClause})
  `;

  const [rows, snsResult] = await Promise.all([
    queryRedshift<Record<string, unknown>>(sql),
    queryRedshift<{ active_subscriptions: number }>(snsSql).catch(() => [{ active_subscriptions: 0 }]),
  ]);

  // Apply latest SNS value to all daily rows (cumulative metric, not per-day)
  const snsValue = Number(snsResult[0]?.active_subscriptions) || 0;
  for (const row of rows) {
    row.new_active_sns_subscriptions = snsValue;
  }

  const result = { days: rows };

  // Write to Supabase cache after the response — never fire-and-forget, or the
  // write is abandoned when Vercel freezes the sandbox and pins a pool slot.
  after(async () => {
    try {
      await setCachedData("daily", cacheKey, result);
    } catch (err) {
      console.error("Failed to write daily cache:", err);
    }
  });

  return NextResponse.json(result);
}
