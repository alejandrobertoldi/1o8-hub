import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const accountId = searchParams.get("accountId") ?? "";
  const year = searchParams.get("year") ?? "";
  const asin = searchParams.get("asin") ?? "ALL";

  if (!accountId || !year) {
    return NextResponse.json(
      { error: "Missing accountId or year" },
      { status: 400 }
    );
  }

  const rows = await queryRedshift(
    `
    SELECT
      DATE_PART(week, start_date::date) AS week_num,
      TO_CHAR(start_date::date, 'YYYY-MM-DD') AS week_start,
      asin,
      SUM(active_subscriptions::numeric) AS active_subscriptions,
      SUM(total_subscriptions_revenue::numeric) AS revenue,
      SUM(shipped_subscription_units::numeric) AS units,
      AVG(revenue_penetration::numeric) AS penetration
    FROM amazon_source_data.replenishment_offer_metrics
    WHERE account_id = $1
      AND start_date::date BETWEEN $2::date AND $3::date
      AND program_type = 'SUBSCRIBE_AND_SAVE'
      AND aggregation_frequency = 'WEEK'
      AND ($4 = 'ALL' OR asin = $4)
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
    `,
    [accountId, `${year}-01-01`, `${year}-12-31`, asin]
  );

  return NextResponse.json({
    accountId,
    year,
    asin,
    rows: rows.map((r: Record<string, unknown>) => ({
      week_num: Number(r.week_num ?? 0),
      week_start: String(r.week_start ?? ""),
      asin: String(r.asin ?? ""),
      active_subscriptions: Number(r.active_subscriptions ?? 0),
      revenue: Number(r.revenue ?? 0),
      units: Number(r.units ?? 0),
      penetration: Number(r.penetration ?? 0),
    })),
  });
}