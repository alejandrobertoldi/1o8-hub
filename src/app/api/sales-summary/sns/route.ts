/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { queryRedshift } from "@/lib/redshift";
import { getCachedData, setCachedData, buildSnsCacheKey } from "@/lib/sales-cache";

export const maxDuration = 60;

const SNS_TABLE = `"amazon_source_data"."replenishment_offer_metrics"`;

/**
 * Returns weekly SNS active_subscriptions as a continuous timeline.
 * Each point has the current value and the value from exactly 1 year prior.
 * Timeline spans from ~Jan of previous year to now.
 */
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
  }

  const accountIds = req.nextUrl.searchParams.get("accountIds");
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  if (!accountIds) {
    return NextResponse.json({ error: "Missing accountIds" }, { status: 400 });
  }

  const ids = accountIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.some((id) => isNaN(parseInt(id, 10)))) {
    return NextResponse.json({ error: "Invalid accountIds — must be numeric" }, { status: 400 });
  }

  // Check Supabase cache first
  const cacheKey = buildSnsCacheKey(accountIds);
  if (!refresh) {
    const cached = await getCachedData<{ timeline: unknown[] }>("sns", cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const inClause = ids.map((id) => `${parseInt(id, 10)}::BIGINT`).join(",");

  const now = new Date();
  const prevYear = now.getFullYear() - 1;

  // Get all weekly snapshots from 2 years ago to now
  const sql = `
    SELECT
      TO_CHAR(end_date::DATE, 'YYYY-MM-DD') AS end_date,
      COALESCE(SUM(active_subscriptions::FLOAT), 0)::BIGINT AS active_subscriptions
    FROM ${SNS_TABLE}
    WHERE account_id IN (${inClause})
      AND end_date::DATE >= '${prevYear - 1}-01-01'::DATE
    GROUP BY end_date::DATE
    ORDER BY end_date::DATE
  `;

  const rows = await queryRedshift<{
    end_date: string;
    active_subscriptions: number;
  }>(sql).catch(() => []);

  // Build a date -> value lookup
  const dateMap = new Map<string, number>();
  for (const row of rows) {
    dateMap.set(row.end_date, Number(row.active_subscriptions));
  }

  // Build timeline: all dates from Jan of prev year to now
  const timelineStart = `${prevYear}-01-01`;
  const allDates = rows
    .map((r) => r.end_date)
    .filter((d) => d >= timelineStart);

  // For a given date, find the closest value in dateMap within ±10 days of target
  const findClosest = (targetDate: string): number | null => {
    const target = new Date(targetDate + "T00:00:00").getTime();
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [d, v] of dateMap) {
      const dist = Math.abs(new Date(d + "T00:00:00").getTime() - target);
      if (dist < bestDist && dist <= 10 * 86400000) {
        bestDist = dist;
        best = v;
      }
    }
    return best;
  };

  const timeline: { date: string; value: number; yearAgo: number | null }[] = [];
  for (const date of allDates) {
    const value = dateMap.get(date)!;
    const dt = new Date(date + "T00:00:00");
    dt.setFullYear(dt.getFullYear() - 1);
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    const yearAgoDate = `${dt.getFullYear()}-${m}-${day}`;
    const yearAgo = findClosest(yearAgoDate);
    timeline.push({ date, value, yearAgo });
  }

  const result = { timeline };

  // Write to Supabase cache after the response — never fire-and-forget, or the
  // write is abandoned when Vercel freezes the sandbox and pins a pool slot.
  after(async () => {
    try {
      await setCachedData("sns", cacheKey, result);
    } catch (err) {
      console.error("Failed to write sns cache:", err);
    }
  });

  return NextResponse.json(result);
}
