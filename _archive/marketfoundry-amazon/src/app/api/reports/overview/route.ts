import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";
import { queryBigQuery } from "@/lib/bigquery";
import { maacAacTable } from "@/lib/bq-datasets";
import { getCachedData, setCachedData } from "@/lib/sales-cache";

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
    return NextResponse.json({ error: "accountId, start and end are required" }, { status: 400 });
  }

  const cacheKey = buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>("report-overview", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const pyStart = new Date(start);
  const pyEnd = new Date(end);
  pyStart.setFullYear(pyStart.getFullYear() - 1);
  pyEnd.setFullYear(pyEnd.getFullYear() - 1);
  const pyStartStr = pyStart.toISOString().slice(0, 10);
  const pyEndStr = pyEnd.toISOString().slice(0, 10);

  try {
    const currentSql = `
      SELECT
        SUM(total_sales) as total_sales,
        SUM(total_ad_revenue) as total_ad_revenue,
        SUM(total_ad_spend) as total_ad_spend,
        SUM(total_product_quantity) as total_product_quantity,
        SUM(total_mobile_sessions) as total_mobile_sessions,
        SUM(total_browser_sessions) as total_browser_sessions,
        SUM(total_ad_clicks) as total_ad_clicks,
        SUM(total_ad_conversions) as total_ad_conversions,
        SUM(total_ad_impressions) as total_ad_impressions
      FROM (
        SELECT
          report_date,
          MAX(CAST(product_sales AS FLOAT)) as total_sales,
          MAX(CAST(ad_revenue AS FLOAT)) as total_ad_revenue,
          MAX(CAST(ad_spend AS FLOAT)) as total_ad_spend,
          MAX(CAST(product_quantity AS FLOAT)) as total_product_quantity,
          MAX(CAST(mobile_app_sessions AS FLOAT)) as total_mobile_sessions,
          MAX(CAST(browser_session AS FLOAT)) as total_browser_sessions,
          MAX(CAST(ad_clicks AS FLOAT)) as total_ad_clicks,
          MAX(CAST(ad_conversions AS FLOAT)) as total_ad_conversions,
          MAX(CAST(ad_impressions AS FLOAT)) as total_ad_impressions
        FROM intentwise_ecommerce_graph.account_summary
        WHERE account_id = $1
          AND report_date BETWEEN $2 AND $3
        GROUP BY report_date
      ) daily
    `;

    const previousSql = `
      SELECT
        SUM(total_sales) as total_sales,
        SUM(total_ad_revenue) as total_ad_revenue,
        SUM(total_ad_spend) as total_ad_spend,
        SUM(total_product_quantity) as total_product_quantity,
        SUM(total_mobile_sessions) as total_mobile_sessions,
        SUM(total_browser_sessions) as total_browser_sessions,
        SUM(total_ad_clicks) as total_ad_clicks,
        SUM(total_ad_conversions) as total_ad_conversions,
        SUM(total_ad_impressions) as total_ad_impressions
      FROM (
        SELECT
          report_date,
          MAX(CAST(product_sales AS FLOAT)) as total_sales,
          MAX(CAST(ad_revenue AS FLOAT)) as total_ad_revenue,
          MAX(CAST(ad_spend AS FLOAT)) as total_ad_spend,
          MAX(CAST(product_quantity AS FLOAT)) as total_product_quantity,
          MAX(CAST(mobile_app_sessions AS FLOAT)) as total_mobile_sessions,
          MAX(CAST(browser_session AS FLOAT)) as total_browser_sessions,
          MAX(CAST(ad_clicks AS FLOAT)) as total_ad_clicks,
          MAX(CAST(ad_conversions AS FLOAT)) as total_ad_conversions,
          MAX(CAST(ad_impressions AS FLOAT)) as total_ad_impressions
        FROM intentwise_ecommerce_graph.account_summary
        WHERE account_id = $1
          AND report_date BETWEEN $2 AND $3
        GROUP BY report_date
      ) daily
    `;

    const dailySql = `
      SELECT 
        report_date,
        CAST(product_sales AS FLOAT) as product_sales,
        CAST(ad_revenue AS FLOAT) as ad_revenue,
        CAST(ad_spend AS FLOAT) as ad_spend,
        CAST(product_quantity AS FLOAT) as product_quantity,
        CAST(mobile_app_sessions AS FLOAT) as mobile_app_sessions,
        CAST(browser_session AS FLOAT) as browser_session,
        CAST(ad_clicks AS FLOAT) as ad_clicks,
        CAST(ad_conversions AS FLOAT) as ad_conversions,
        CAST(ad_impressions AS FLOAT) as ad_impressions
      FROM intentwise_ecommerce_graph.account_summary
      WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
      ORDER BY report_date ASC
    `;

    const dailyPYSql = `
      SELECT 
        report_date,
        CAST(product_sales AS FLOAT) as product_sales,
        CAST(ad_revenue AS FLOAT) as ad_revenue,
        CAST(ad_spend AS FLOAT) as ad_spend,
        CAST(product_quantity AS FLOAT) as product_quantity,
        CAST(mobile_app_sessions AS FLOAT) as mobile_app_sessions,
        CAST(browser_session AS FLOAT) as browser_session,
        CAST(ad_clicks AS FLOAT) as ad_clicks,
        CAST(ad_conversions AS FLOAT) as ad_conversions,
        CAST(ad_impressions AS FLOAT) as ad_impressions
      FROM intentwise_ecommerce_graph.account_summary
      WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
      ORDER BY report_date ASC
    `;

    const goalsSql = `
  SELECT
    SUM(SalesForecast1D) AS sales_goal,
    SUM(ADSpendBudget1D) AS ad_spend_goal,
    SUM(ACOSGoal1D) AS acos_goal,
    SUM(TACOSGoal1D) AS tacos_goal,
    SUM(ROASGoal1D) AS roas_goal
  FROM \`${maacAacTable()}\`
  WHERE CAST(IntentwiseID AS STRING) = @accountId
`;

    const [currentRows, previousRows, dailyRows, dailyPYRows, goalRows] = await Promise.all([
  queryRedshift(currentSql, [accountId, start, end]),
  queryRedshift(previousSql, [accountId, pyStartStr, pyEndStr]),
  queryRedshift(dailySql, [accountId, start, end]),
  queryRedshift(dailyPYSql, [accountId, pyStartStr, pyEndStr]),
  queryBigQuery<{
    sales_goal: number;
    ad_spend_goal: number;
    acos_goal: number;
    tacos_goal: number;
    roas_goal: number;
  }>(goalsSql, { accountId }),
]);
    const current = currentRows[0] as Record<string, string> || {};
    const previous = previousRows[0] as Record<string, string> || {};

    const goals = goalRows[0] || {};

    const salesGoal = Number(goals.sales_goal ?? 0);
    const adSpendGoal = Number(goals.ad_spend_goal ?? 0);
    const acosGoal = Number(goals.acos_goal ?? 0);
    const tacosGoal = Number(goals.tacos_goal ?? 0);
    const roasGoal = Number(goals.roas_goal ?? 0);

    const totalSales = parseFloat(current.total_sales) || 0;
    const totalSalesPY = parseFloat(previous.total_sales) || 0;
    const totalSalesYoY = totalSales - totalSalesPY;
    const totalSalesYoYPct = totalSalesPY !== 0 ? (totalSalesYoY / totalSalesPY) * 100 : 0;

    const totalAdRevenue = parseFloat(current.total_ad_revenue) || 0;
    const totalAdRevenuePY = parseFloat(previous.total_ad_revenue) || 0;
    const organicSales = totalSales - totalAdRevenue;
    const organicSalesPY = totalSalesPY - totalAdRevenuePY;
    const organicSalesYoY = organicSales - organicSalesPY;
    const organicSalesYoYPct = organicSalesPY !== 0 ? (organicSalesYoY / organicSalesPY) * 100 : 0;

    const adRevenue = totalAdRevenue;
    const adRevenuePY = totalAdRevenuePY;
    const adRevenueYoY = adRevenue - adRevenuePY;
    const adRevenueYoYPct = adRevenuePY !== 0 ? (adRevenueYoY / adRevenuePY) * 100 : 0;

    const adSpend = parseFloat(current.total_ad_spend) || 0;
    const adSpendPY = parseFloat(previous.total_ad_spend) || 0;
    const adSpendYoY = adSpend - adSpendPY;
    const adSpendYoYPct = adSpendPY !== 0 ? (adSpendYoY / adSpendPY) * 100 : 0;

    const unitsSold = parseFloat(current.total_product_quantity) || 0;
    const unitsSoldPY = parseFloat(previous.total_product_quantity) || 0;
    const unitsSoldYoY = unitsSold - unitsSoldPY;
    const unitsSoldYoYPct = unitsSoldPY !== 0 ? (unitsSoldYoY / unitsSoldPY) * 100 : 0;

    const acos = totalAdRevenue !== 0 ? (adSpend / totalAdRevenue) * 100 : 0;
    const acosPY = totalAdRevenuePY !== 0 ? (adSpendPY / totalAdRevenuePY) * 100 : 0;
    const acosYoY = acos - acosPY;
    const acosYoYPct = acosPY !== 0 ? (acosYoY / acosPY) * 100 : 0;

    const tacos = totalSales !== 0 ? (adSpend / totalSales) * 100 : 0;
    const tacosPY = totalSalesPY !== 0 ? (adSpendPY / totalSalesPY) * 100 : 0;
    const tacosYoY = tacos - tacosPY;
    const tacosYoYPct = tacosPY !== 0 ? (tacosYoY / tacosPY) * 100 : 0;

    const roas = adSpend !== 0 ? totalAdRevenue / adSpend : 0;
    const roasPY = adSpendPY !== 0 ? totalAdRevenuePY / adSpendPY : 0;
    const roasYoY = roas - roasPY;
    const roasYoYPct = roasPY !== 0 ? (roasYoY / roasPY) * 100 : 0;

    const mobileSessions = parseFloat(current.total_mobile_sessions) || 0;
    const browserSessions = parseFloat(current.total_browser_sessions) || 0;
    const sessions = mobileSessions + browserSessions;
    const mobileSessionsPY = parseFloat(previous.total_mobile_sessions) || 0;
    const browserSessionsPY = parseFloat(previous.total_browser_sessions) || 0;
    const sessionsPY = mobileSessionsPY + browserSessionsPY;
    const sessionsYoY = sessions - sessionsPY;
    const sessionsYoYPct = sessionsPY !== 0 ? (sessionsYoY / sessionsPY) * 100 : 0;

    const clicks = parseFloat(current.total_ad_clicks) || 0;
    const clicksPY = parseFloat(previous.total_ad_clicks) || 0;
    const clicksYoY = clicks - clicksPY;
    const clicksYoYPct = clicksPY !== 0 ? (clicksYoY / clicksPY) * 100 : 0;

    const conversions = parseFloat(current.total_ad_conversions) || 0;
    const conversionsPY = parseFloat(previous.total_ad_conversions) || 0;
    const conversionsYoY = conversions - conversionsPY;
    const conversionsYoYPct = conversionsPY !== 0 ? (conversionsYoY / conversionsPY) * 100 : 0;

    const cvr = clicks !== 0 ? (conversions / clicks) * 100 : 0;
    const cvrPY = clicksPY !== 0 ? (conversionsPY / clicksPY) * 100 : 0;
    const cvrYoY = cvr - cvrPY;
    const cvrYoYPct = cvrPY !== 0 ? (cvrYoY / cvrPY) * 100 : 0;

    const impressions = parseFloat(current.total_ad_impressions) || 0;
    const impressionsPY = parseFloat(previous.total_ad_impressions) || 0;
    const impressionsYoY = impressions - impressionsPY;
    const impressionsYoYPct = impressionsPY !== 0 ? (impressionsYoY / impressionsPY) * 100 : 0;

    const ctr = impressions !== 0 ? (clicks / impressions) * 100 : 0;
    const ctrPY = impressionsPY !== 0 ? (clicksPY / impressionsPY) * 100 : 0;
    const ctrYoY = ctr - ctrPY;
    const ctrYoYPct = ctrPY !== 0 ? (ctrYoY / ctrPY) * 100 : 0;

    const cpc = clicks !== 0 ? adSpend / clicks : 0;

    const response = {
      totalSales, totalSalesPY, yoy: totalSalesYoY, yoyPct: totalSalesYoYPct, salesGoal,
      organicSales, organicSalesPY, organicSalesYoY, organicSalesYoYPct,
      adRevenue, adRevenuePY, adRevenueYoY, adRevenueYoYPct,
      adSpend, adSpendPY, adSpendYoY, adSpendYoYPct, adSpendGoal,
      unitsSold, unitsSoldPY, unitsSoldYoY, unitsSoldYoYPct,
      acos, acosPY, acosYoY, acosYoYPct, acosGoal,
      tacos, tacosPY, tacosYoY, tacosYoYPct, tacosGoal,
      roas, roasPY, roasYoY, roasYoYPct, roasGoal,
      sessions, sessionsPY, sessionsYoY, sessionsYoYPct,
      mobileSessions, mobileSessionsPY, browserSessions, browserSessionsPY,
      clicks, clicksPY, clicksYoY, clicksYoYPct,
      conversions, conversionsPY, conversionsYoY, conversionsYoYPct,
      cvr, cvrPY, cvrYoY, cvrYoYPct,
      impressions, impressionsPY, impressionsYoY, impressionsYoYPct,
      ctr, ctrPY, ctrYoY, ctrYoYPct,
      cpc,
      daily: dailyRows,
      dailyPY: dailyPYRows,
    };

    await setCachedReport("report-overview", cacheKey, response);

    return NextResponse.json(response);

  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}