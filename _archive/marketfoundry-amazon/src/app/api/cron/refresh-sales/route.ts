import { NextRequest, NextResponse } from "next/server";
import { gatherClients, warmDailyAndSns, resolveBaseUrl, cronAuthHeaders } from "@/lib/sales-warm";

export const maxDuration = 300;

/**
 * Cron: refresh summary + daily sparkline + SNS timeline into the Supabase cache.
 * Inventory is warmed by a SEPARATE cron (/api/cron/refresh-sales-inventory) so the
 * expensive inventory step can no longer eat this job's 300s budget and starve
 * daily/sns (which left them perpetually stale → cache miss → stuck spinner).
 * Runs every 6h via vercel.json.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = resolveBaseUrl();
  const headers = cronAuthHeaders();

  const { allClients, weeks, results } = await gatherClients(baseUrl, headers);
  results.push(...(await warmDailyAndSns(baseUrl, headers, allClients, weeks)));

  return NextResponse.json({ refreshed: results, timestamp: new Date().toISOString() });
}
