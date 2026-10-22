/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { queryRedshift } from "@/lib/redshift";
import { getCachedData, setCachedData } from "@/lib/sales-cache";

export const maxDuration = 120;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;

function buildMonthlyCacheKey(accountIds: string): string {
  const sorted = accountIds.split(",").map((s) => s.trim()).sort().join(",");
  return `monthly_${sorted}`;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountIds = req.nextUrl.searchParams.get("accountIds");
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  if (!accountIds) {
    return NextResponse.json({ error: "Missing accountIds" }, { status: 400 });
  }

  // Check Supabase cache first (unless refresh requested)
  const cacheKey = buildMonthlyCacheKey(accountIds);
  if (!refresh) {
    const cached = await getCachedData<{ months: unknown[] }>("monthly", cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const ids = accountIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.some((id) => isNaN(parseInt(id, 10)))) {
    return NextResponse.json({ error: "Invalid accountIds" }, { status: 400 });
  }
  const inClause = ids.map((id) => `${parseInt(id, 10)}::BIGINT`).join(",");

  // Start from Jan 1 of the previous year
  const startDate = `${new Date().getFullYear() - 1}-01-01`;

  const sql = `
    SELECT
      month,
      SUM(product_sales) AS product_sales,
      SUM(ad_spend) AS ad_spend,
      SUM(ad_revenue) AS ad_revenue,
      SUM(ad_orders) AS ad_orders,
      SUM(product_quantity) AS product_quantity,
      SUM(ordered_revenue) AS ordered_revenue
    FROM (
      SELECT
        TO_CHAR(report_date, 'YYYY-MM') AS month,
        report_date,
        COALESCE(MAX(product_sales), 0) AS product_sales,
        COALESCE(MAX(ad_spend), 0) AS ad_spend,
        COALESCE(MAX(ad_revenue), 0) AS ad_revenue,
        COALESCE(MAX(ad_orders), 0) AS ad_orders,
        COALESCE(MAX(product_quantity), 0) AS product_quantity,
        COALESCE(MAX(ordered_revenue), 0) AS ordered_revenue
      FROM ${FULL_TABLE}
      WHERE account_id IN (${inClause})
        AND report_date >= '${startDate}'::DATE
      GROUP BY report_date, TO_CHAR(report_date, 'YYYY-MM')
    ) daily
    GROUP BY month
    ORDER BY month
  `;

  const rows = await queryRedshift<Record<string, unknown>>(sql);
  const result = { months: rows };

  // Write to Supabase cache after the response — never fire-and-forget, or the
  // write is abandoned when Vercel freezes the sandbox and pins a pool slot.
  after(async () => {
    try {
      await setCachedData("monthly", cacheKey, result);
    } catch (err) {
      console.error("Failed to write monthly cache:", err);
    }
  });

  return NextResponse.json(result);
}
