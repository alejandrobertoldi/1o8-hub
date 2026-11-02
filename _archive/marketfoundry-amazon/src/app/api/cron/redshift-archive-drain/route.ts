import { NextRequest, NextResponse } from "next/server";
import { runDrain, DRAIN_BUDGET_MS } from "@/lib/archive/drainer";

export const maxDuration = 300;

/**
 * Nightly archive drainer (spec §7.1).
 * Schedule: every 15 minutes (configured in vercel.json). Claims pending
 * work units and works them until a ~200s budget expires (Vercel's ceiling
 * is 300s); unfinished units wait for the next drain.
 * Auth: CRON_SECRET bearer token.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDrain({ budgetMs: DRAIN_BUDGET_MS });
  return NextResponse.json(result);
}
