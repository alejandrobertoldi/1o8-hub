/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";
import {
  getCachedReport,
  setCachedReport,
  buildDatedKey,
  buildAsinKey,
} from "@/lib/reports-cache";

function shiftByYear(dateStr: string, years: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `W${String(week).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthOrCron(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const accountId = (await getEffectiveAccountId(req)) ?? "";
  const start     = searchParams.get("start") ?? "";
  const end       = searchParams.get("end") ?? "";
  const asin      = searchParams.get("asin") ?? "";

  if (!accountId || !start || !end)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const refresh = searchParams.get("refresh") === "true";
  const cacheType = asin ? "report-subscribe-save-asin" : "report-subscribe-save";
  const cacheKey = asin
    ? buildAsinKey(accountId, start, end, asin)
    : buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>(cacheType, cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const pyStart = shiftByYear(start, -1);
  const pyEnd   = shiftByYear(end, -1);

  // ASINs disponibles
  const asinRows = await queryRedshift(`
    SELECT DISTINCT asin
    FROM amazon_source_data.replenishment_offer_metrics
    WHERE account_id = $1
      AND TO_CHAR(start_date::date, 'YYYY-MM-DD') BETWEEN $2 AND $3
      AND program_type = 'SUBSCRIBE_AND_SAVE'
      AND aggregation_frequency = 'WEEK'
    ORDER BY asin ASC
  `, [accountId, start, end]);

  const asins = asinRows.map((r: Record<string, unknown>) => String(r.asin ?? ""));

  const selectedAsin = asin || "ALL";
  

  if (!selectedAsin) return NextResponse.json({ asins, charts: [], pyCharts: [] });

  // Current period
  const currentRows = await queryRedshift(`
    SELECT
      TO_CHAR(start_date::date, 'YYYY-MM-DD') AS week_start,
      SUM(active_subscriptions::numeric)       AS active_subscriptions,
      SUM(total_subscriptions_revenue::numeric) AS revenue,
      SUM(shipped_subscription_units::numeric)  AS units,
      AVG(revenue_penetration::numeric)         AS penetration
    FROM amazon_source_data.replenishment_offer_metrics
    WHERE account_id = $1
      AND ($2 = 'ALL' OR asin = $2)
      AND TO_CHAR(start_date::date, 'YYYY-MM-DD') BETWEEN $3 AND $4
      AND program_type = 'SUBSCRIBE_AND_SAVE'
      AND aggregation_frequency = 'WEEK'
    GROUP BY week_start
    ORDER BY week_start ASC
  `, [accountId, selectedAsin, start, end]);

  // Previous year
  const pyRows = await queryRedshift(`
    SELECT
      TO_CHAR(start_date::date, 'YYYY-MM-DD') AS week_start,
      SUM(active_subscriptions::numeric)        AS active_subscriptions,
      SUM(total_subscriptions_revenue::numeric)  AS revenue,
      SUM(shipped_subscription_units::numeric)   AS units,
      AVG(revenue_penetration::numeric)          AS penetration
    FROM amazon_source_data.replenishment_offer_metrics
    WHERE account_id = $1
      AND ($2 = 'ALL' OR asin = $2)
      AND TO_CHAR(start_date::date, 'YYYY-MM-DD') BETWEEN $3 AND $4
      AND program_type = 'SUBSCRIBE_AND_SAVE'
      AND aggregation_frequency = 'WEEK'
    GROUP BY week_start
    ORDER BY week_start ASC
  `, [accountId, selectedAsin, pyStart, pyEnd]);

  const fmt = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      week:          getISOWeek(String(r.week_start ?? "")),
      week_start:    String(r.week_start ?? ""),
      subscriptions: Number(r.active_subscriptions ?? 0),
      revenue:       Number(r.revenue ?? 0),
      units:         Number(r.units ?? 0),
      penetration:   Number(r.penetration ?? 0),
    }));

  const current = fmt(currentRows);
  const py      = fmt(pyRows);

  // Merge by index
  const maxLen = Math.max(current.length, py.length);
  const merged = Array.from({ length: maxLen }, (_, i) => ({
    week:              current[i]?.week ?? py[i]?.week ?? "",
    subscriptions:     current[i]?.subscriptions ?? 0,
    subscriptions_py:  py[i]?.subscriptions ?? 0,
    revenue:           current[i]?.revenue ?? 0,
    revenue_py:        py[i]?.revenue ?? 0,
    units:             current[i]?.units ?? 0,
    units_py:          py[i]?.units ?? 0,
    penetration:       current[i]?.penetration ?? 0,
    penetration_py:    py[i]?.penetration ?? 0,
  }));

  const response = { asins, selectedAsin, data: merged };
  await setCachedReport(cacheType, cacheKey, response);
  return NextResponse.json(response);
}