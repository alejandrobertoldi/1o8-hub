/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
// Weekly review snapshot. Every Saturday (UTC) Vercel calls this route every
// 5 minutes (see vercel.json). Each call refreshes the REVIEWS_SYNC_BATCH
// stalest active ASINs (default 20, about 280s of provider time) and stamps
// them fetched, so successive calls walk the whole active catalog until every
// ASIN is fresher than REVIEWS_SYNC_STALE_DAYS (default 6) and the rest of the
// day's calls return immediately. A lock skips a call while the previous one is
// still running; an ASIN whose last attempt failed is retried at most every
// 6 hours so one broken listing cannot eat the day's provider budget.
import { helium10Enabled } from "@/lib/helium10/enabled";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { reviewSyncRuns } from "@/lib/db/schema";
import { runReviewSync, staleSyncTargets } from "@/lib/reviews/sync";

export const maxDuration = 300;

/** A cron run older than this is treated as crashed and no longer blocks the next call. */
const LOCK_WINDOW_MS = 6 * 60_000;
/** Minimum gap between attempts on an ASIN whose last attempt errored. */
const FAILED_RETRY_MS = 6 * 3_600_000;
/** Rainforest pages per ASIN; paging stops early once a page predates the last fetch. */
const CRON_MAX_PAGES = 3;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.REVIEWS_SYNC_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "REVIEWS_SYNC_ENABLED=false" });
  }

  const batch = Math.max(1, Math.min(Number(process.env.REVIEWS_SYNC_BATCH) || 20, 100));
  const staleDays = Math.max(1, Number(process.env.REVIEWS_SYNC_STALE_DAYS) || 6);
  const providers: Array<"rainforest" | "helium10"> = [];
  if (process.env.RAINFOREST_API_KEY) providers.push("rainforest");
  if (helium10Enabled() && process.env.HELIUM10_CONNECTION_OWNER_ID) providers.push("helium10");
  if (!providers.length) return NextResponse.json({ skipped: true, reason: "No review provider configured" });

  const [inFlight] = await db
    .select({ id: reviewSyncRuns.id, startedAt: reviewSyncRuns.startedAt })
    .from(reviewSyncRuns)
    .where(and(eq(reviewSyncRuns.status, "running"), eq(reviewSyncRuns.trigger, "cron"), gt(reviewSyncRuns.startedAt, new Date(Date.now() - LOCK_WINDOW_MS))))
    .limit(1);
  if (inFlight) return NextResponse.json({ skipped: true, reason: "Previous cron run still in progress", runId: inFlight.id, startedAt: inFlight.startedAt });

  const staleBefore = new Date(Date.now() - staleDays * 86_400_000);
  const failedBefore = new Date(Date.now() - FAILED_RETRY_MS);
  const targets = await staleSyncTargets(batch, staleBefore, { failedBefore });
  if (!targets.length) return NextResponse.json({ processed: 0, remaining: 0, message: "Every ASIN is fresh" });

  const result = await runReviewSync(targets, {
    providers, trigger: "cron", triggeredBy: "vercel-cron", deadline: Date.now() + 280_000, historyDays: 30, maxPagesPerAsin: CRON_MAX_PAGES,
  });
  const remaining = (await staleSyncTargets(10_000, staleBefore, { failedBefore })).length;
  return NextResponse.json({
    processed: result.asinsDone,
    remaining,
    failed: result.asinsFailed,
    reviewsAdded: result.reviewsAdded,
    topicsRefreshed: result.topicsRefreshed,
    rainforestCredits: result.rainforestCredits,
    heliumCalls: result.heliumCalls,
    timedOut: result.timedOut,
    runId: result.runId,
    clients: [...new Set(targets.map((t) => t.clientIdCode))],
    errors: result.errors.slice(0, 20),
  });
}
