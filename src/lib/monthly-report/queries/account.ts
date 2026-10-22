import { queryRedshift } from "@/lib/redshift";

const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export interface AccountSummaryRow {
  product_sales: number;
  product_quantity: number;
  total_order_items: number;
  ad_revenue: number;
  ad_spend: number;
  browser_sessions: number;
  mobile_sessions: number;
  ad_impressions: number;
}

/**
 * Roll up account_summary over a date range.
 * Returns `null` if zero rows (signals "no data, omit section").
 */
export async function fetchAccountRollup(
  accountId: string,
  start: string,
  end: string,
): Promise<AccountSummaryRow | null> {
  const rows = await queryRedshift<AccountSummaryRow>(
    `
    SELECT
      COALESCE(SUM(product_sales), 0)        AS product_sales,
      COALESCE(SUM(product_quantity), 0)     AS product_quantity,
      COALESCE(SUM(total_order_items), 0)    AS total_order_items,
      COALESCE(SUM(ad_revenue), 0)           AS ad_revenue,
      COALESCE(SUM(ad_spend), 0)             AS ad_spend,
      COALESCE(SUM(browser_session), 0)      AS browser_sessions,
      COALESCE(SUM(mobile_app_sessions), 0)  AS mobile_sessions,
      COALESCE(SUM(ad_impressions), 0)       AS ad_impressions
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
  `,
    [accountId, start, end],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  if (r.product_sales === 0 && r.product_quantity === 0 && r.total_order_items === 0) {
    return null;
  }
  return {
    product_sales: Number(r.product_sales),
    product_quantity: Number(r.product_quantity),
    total_order_items: Number(r.total_order_items),
    ad_revenue: Number(r.ad_revenue),
    ad_spend: Number(r.ad_spend),
    browser_sessions: Number(r.browser_sessions),
    mobile_sessions: Number(r.mobile_sessions),
    ad_impressions: Number(r.ad_impressions),
  };
}

/**
 * Six months of monthly revenue ending at `periodStart`, oldest→newest.
 * Missing months are gap-filled with zero so the caller gets a dense series.
 */
export async function fetchRevenueSeries(
  accountId: string,
  periodStart: string,   // YYYY-MM-01
): Promise<Array<{ month: string; revenue: number }>> {
  const [y, m] = periodStart.split("-").map(Number);
  // Inclusive range: (periodStart - 5 months) … periodStart
  const startDate = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of periodStart month

  // Intentwise stores timestamps in local time (UTC+1/+2). DATEADD(hour,2,...) shifts
  // the value so date_trunc lands in the correct calendar month before grouping.
  const rows = await queryRedshift<{ month_key: string; revenue: number | string }>(
    `
    SELECT
      TO_CHAR(DATEADD(hour, 2, report_date), 'YYYY-MM') AS month_key,
      COALESCE(SUM(product_sales), 0)                   AS revenue
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY 1
    ORDER BY 1 ASC
  `,
    [accountId, startDate, endDate],
  );

  const byKey = new Map<string, number>();
  for (const r of rows) {
    byKey.set(String(r.month_key), Number(r.revenue));
  }

  const out: Array<{ month: string; revenue: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({
      month: MONTH_LABELS[d.getUTCMonth()],
      revenue: byKey.get(key) ?? 0,
    });
  }
  return out;
}

export interface DailyPoint {
  /** Day of month, 1..31 — used to align current/YoY series side-by-side. */
  day: number;
  sales: number;
  units: number;
  orderItems: number;
}

/**
 * Daily sales + units + order_items for an inclusive date range, indexed by
 * day-of-month. Same DATEADD(hour,2,...) timezone shift as fetchRevenueSeries.
 * Returns rows that exist; missing days are gap-filled by the caller. Summing
 * across days yields the same totals as fetchAccountRollup over the same range.
 */
export async function fetchDailySeries(
  accountId: string,
  start: string,
  end: string,
): Promise<DailyPoint[]> {
  const rows = await queryRedshift<{
    day: number | string; sales: number | string; units: number | string; order_items: number | string;
  }>(
    `
    SELECT
      EXTRACT(DAY FROM DATEADD(hour, 2, report_date))::int AS day,
      COALESCE(SUM(product_sales), 0)                       AS sales,
      COALESCE(SUM(product_quantity), 0)                    AS units,
      COALESCE(SUM(total_order_items), 0)                   AS order_items
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY 1
    ORDER BY 1 ASC
  `,
    [accountId, start, end],
  );
  return rows.map(r => ({
    day: Number(r.day),
    sales: Number(r.sales),
    units: Number(r.units),
    orderItems: Number(r.order_items),
  }));
}

export interface CampaignDailyPoint {
  /** Day of month, 1..31. */
  day: number;
  impressions: number;
  /** Ad spend in dollars (Amazon "Total cost"). */
  spend: number;
  /** Ad revenue in dollars (Amazon "Sales"). */
  revenue: number;
}

/**
 * Daily ad impressions/spend/revenue from account_summary, indexed by day-of-month.
 * Same DATEADD(hour,2,...) timezone shift as fetchDailySeries — Intentwise stores
 * timestamps in local time, and we want calendar-day alignment in the user's TZ.
 * Caller gap-fills missing days.
 */
export async function fetchCampaignDailySeries(
  accountId: string,
  start: string,
  end: string,
): Promise<CampaignDailyPoint[]> {
  const rows = await queryRedshift<{
    day: number | string; impressions: number | string; spend: number | string; revenue: number | string;
  }>(
    `
    SELECT
      EXTRACT(DAY FROM DATEADD(hour, 2, report_date))::int AS day,
      COALESCE(SUM(ad_impressions), 0)                      AS impressions,
      COALESCE(SUM(ad_spend), 0)                            AS spend,
      COALESCE(SUM(ad_revenue), 0)                          AS revenue
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY 1
    ORDER BY 1 ASC
  `,
    [accountId, start, end],
  );
  return rows.map(r => ({
    day: Number(r.day),
    impressions: Number(r.impressions),
    spend: Number(r.spend),
    revenue: Number(r.revenue),
  }));
}

/** Latest calendar day present in account_summary for this account (Intentwise TZ shift). */
export async function fetchAccountDataThrough(accountId: string): Promise<string | null> {
  const rows = await queryRedshift<{ max_date: string | null }>(
    `
    SELECT TO_CHAR(MAX(DATEADD(hour, 2, report_date)), 'YYYY-MM-DD') AS max_date
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
  `,
    [accountId],
  );
  const value = rows[0]?.max_date;
  return value ? String(value) : null;
}
