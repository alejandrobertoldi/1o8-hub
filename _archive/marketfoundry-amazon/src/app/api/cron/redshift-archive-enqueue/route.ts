import { NextRequest, NextResponse } from "next/server";
import { runNightlyEnqueue } from "@/lib/archive/enqueuer";

export const maxDuration = 300;

/**
 * Nightly archive enqueuer (spec §7.1).
 * Schedule: 20:00 UTC daily (configured in vercel.json) — after Intentwise's
 * 07:30-10:30 PST refresh window, per spec §3.3.
 * Auth: CRON_SECRET bearer token, matching the existing cron convention.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runNightlyEnqueue(new Date());
  return NextResponse.json(result);
}
