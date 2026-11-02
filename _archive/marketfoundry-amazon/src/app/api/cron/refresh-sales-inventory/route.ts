import { NextRequest, NextResponse } from "next/server";
import { gatherClients, warmInventory, resolveBaseUrl, cronAuthHeaders } from "@/lib/sales-warm";

export const maxDuration = 300;

/**
 * Cron: refresh product inventory (Product Details) per client into the Supabase
 * cache. Split out from /api/cron/refresh-sales because this step is the expensive
 * one — running it in its own invocation gives it a full 300s budget and stops it
 * starving the daily/sns warm. Staggered after refresh-sales in vercel.json.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = resolveBaseUrl();
  const headers = cronAuthHeaders();

  const { allClients, weekMetas, results } = await gatherClients(baseUrl, headers);
  results.push(await warmInventory(baseUrl, headers, allClients, weekMetas));

  return NextResponse.json({ refreshed: results, timestamp: new Date().toISOString() });
}
