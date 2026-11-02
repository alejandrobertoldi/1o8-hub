import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";

function shiftByMonth(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function shiftByYear(dateStr: string, years: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

interface RawRow {
  report_date: string;
  product_sales: number;
  ad_spend: number;
  ad_revenue: number;
  total_order_items: number;
  product_quantity: number;
}

async function fetchRows(accountId: string, start: string, end: string): Promise<RawRow[]> {
  const sql = `
    SELECT
      report_date::date::text   AS report_date,
      SUM(product_sales)        AS product_sales,
      SUM(ad_spend)             AS ad_spend,
      SUM(ad_revenue)           AS ad_revenue,
      SUM(total_order_items)    AS total_order_items,
      SUM(product_quantity)     AS product_quantity
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY report_date
    ORDER BY report_date ASC
  `;
  const rows = await queryRedshift(sql, [accountId, start, end]);
  return rows.map((r: Record<string, unknown>) => ({
    report_date: String(r.report_date),
    product_sales: Number(r.product_sales ?? 0),
    ad_spend: Number(r.ad_spend ?? 0),
    ad_revenue: Number(r.ad_revenue ?? 0),
    total_order_items: Number(r.total_order_items ?? 0),
    product_quantity: Number(r.product_quantity ?? 0),
  }));
}

function aggregate(rows: RawRow[]) {
  const t = rows.reduce(
    (acc, r) => ({
      product_sales: acc.product_sales + r.product_sales,
      ad_spend: acc.ad_spend + r.ad_spend,
      ad_revenue: acc.ad_revenue + r.ad_revenue,
      total_order_items: acc.total_order_items + r.total_order_items,
      product_quantity: acc.product_quantity + r.product_quantity,
    }),
    { product_sales: 0, ad_spend: 0, ad_revenue: 0, total_order_items: 0, product_quantity: 0 }
  );
  return {
    ...t,
    organic_sales: t.product_sales - t.ad_revenue,
    acos: t.ad_revenue !== 0 ? (t.ad_spend / t.ad_revenue) * 100 : 0,
    roas: t.ad_spend !== 0 ? t.ad_revenue / t.ad_spend : 0,
    tacos: t.product_sales !== 0 ? (t.ad_spend / t.product_sales) * 100 : 0,
    avg_units_per_order: t.total_order_items !== 0 ? t.product_quantity / t.total_order_items : 0,
    avg_sales_per_order: t.total_order_items !== 0 ? t.product_sales / t.total_order_items : 0,
  };
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthOrCron(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const accountId = (await getEffectiveAccountId(req)) ?? "";
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  const refresh = searchParams.get("refresh") === "true";

  if (!accountId || !start || !end)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const cacheKey = buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>("report-period-comparative", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const pmStart = shiftByMonth(start, -1);
  const pmEnd   = shiftByMonth(end, -1);
  const pyStart = shiftByYear(start, -1);
  const pyEnd   = shiftByYear(end, -1);

  const [currentRows, pmRows, pyRows] = await Promise.all([
    fetchRows(accountId, start, end),
    fetchRows(accountId, pmStart, pmEnd),
    fetchRows(accountId, pyStart, pyEnd),
  ]);

  const daily = currentRows.map((row, i) => {
    const pm = pmRows[i];
    const py = pyRows[i];
    const organic    = row.product_sales - row.ad_revenue;
    const organic_pm = pm ? pm.product_sales - pm.ad_revenue : 0;
    const organic_py = py ? py.product_sales - py.ad_revenue : 0;
    return {
      report_date:      row.report_date,
      ad_revenue:       row.ad_revenue,
      ad_spend:         row.ad_spend,
      organic_sales:    organic,
      product_sales:    row.product_sales,
      acos:             row.ad_revenue   !== 0 ? (row.ad_spend   / row.ad_revenue)   * 100 : 0,
      roas:             row.ad_spend     !== 0 ?  row.ad_revenue  / row.ad_spend           : 0,
      tacos:            row.product_sales !== 0 ? (row.ad_spend   / row.product_sales) * 100 : 0,
      ad_revenue_pm:    pm?.ad_revenue    ?? 0,
      ad_spend_pm:      pm?.ad_spend      ?? 0,
      organic_sales_pm: organic_pm,
      product_sales_pm: pm?.product_sales ?? 0,
      acos_pm:          pm && pm.ad_revenue    !== 0 ? (pm.ad_spend    / pm.ad_revenue)    * 100 : 0,
      roas_pm:          pm && pm.ad_spend      !== 0 ?  pm.ad_revenue   / pm.ad_spend            : 0,
      tacos_pm:         pm && pm.product_sales !== 0 ? (pm.ad_spend    / pm.product_sales) * 100 : 0,
      ad_revenue_py:    py?.ad_revenue    ?? 0,
      ad_spend_py:      py?.ad_spend      ?? 0,
      organic_sales_py: organic_py,
      product_sales_py: py?.product_sales ?? 0,
      acos_py:          py && py.ad_revenue    !== 0 ? (py.ad_spend    / py.ad_revenue)    * 100 : 0,
      roas_py:          py && py.ad_spend      !== 0 ?  py.ad_revenue   / py.ad_spend            : 0,
      tacos_py:         py && py.product_sales !== 0 ? (py.ad_spend    / py.product_sales) * 100 : 0,
    };
  });

  const response = {
    summary: {
      current: aggregate(currentRows),
      pm:      aggregate(pmRows),
      py:      aggregate(pyRows),
      dateRange: { start, end, pmStart, pmEnd, pyStart, pyEnd },
    },
    daily,
  };

  await setCachedReport("report-period-comparative", cacheKey, response);
  return NextResponse.json(response);
}