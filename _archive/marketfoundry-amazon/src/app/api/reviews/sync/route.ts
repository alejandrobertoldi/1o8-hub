// POST /api/reviews/sync — pull reviews (Rainforest) and Amazon Customer Feedback
// topics + rating history (Helium 10 MCP) for a client's ASINs into the Hub store.
import { helium10Enabled } from "@/lib/helium10/enabled";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/event-logger";
import { requireReviewsOperator } from "@/lib/reviews/access";
import { runReviewSync, selectSyncTargets } from "@/lib/reviews/sync";
import { recentSyncRuns } from "@/lib/reviews/insights";

export const maxDuration = 300;

const body = z.object({
  client_id: z.string().trim().min(1),
  asins: z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/)).max(100).optional(),
  providers: z.array(z.enum(["rainforest", "helium10"])).min(1).optional(),
  /** ASINs per run when `asins` is omitted (stalest first). */
  limit: z.number().int().min(1).max(60).optional(),
  /** Rainforest pages of 10 reviews per ASIN. */
  max_pages: z.number().int().min(1).max(10).optional(),
  include_inactive: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const access = await requireReviewsOperator(req);
  if (access.error) return access.error;
  const { session } = access;

  const rl = checkRateLimit(`reviews-sync:${session.user.id}`, 4, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many sync requests. Try again in a minute." }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } });
  }

  let input: z.infer<typeof body>;
  try {
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide client_id and, optionally, up to 100 valid ASINs." }, { status: 400 });
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Helium 10 is switched off unless NEXT_PUBLIC_HELIUM10_ENABLED=true: never call it, even if asked
  const providers = (input.providers ?? ["rainforest", "helium10"]).filter((p) => p !== "helium10" || helium10Enabled());
  if (!providers.length) return NextResponse.json({ error: "Helium 10 is disabled — sync review text from Rainforest instead." }, { status: 400 });
  if (providers.includes("rainforest") && !process.env.RAINFOREST_API_KEY && providers.length === 1) {
    return NextResponse.json({ error: "Rainforest API key not configured." }, { status: 500 });
  }

  const targets = await selectSyncTargets({
    clientIdCode: input.client_id,
    asins: input.asins ?? null,
    limit: input.asins?.length ? input.asins.length : (input.limit ?? 25),
    activeOnly: !input.include_inactive,
  });
  if (!targets.length) return NextResponse.json({ error: "No sellable ASINs found for this client." }, { status: 404 });

  const result = await runReviewSync(targets, {
    providers,
    trigger: "manual",
    triggeredBy: session.user.email ?? session.user.id,
    deadline: Date.now() + 270_000,
    maxPagesPerAsin: input.max_pages,
  });

  logEvent({
    userEmail: session.user.email ?? null,
    userName: session.user.name ?? null,
    section: "reviews",
    action: "reviews.sync",
    status: result.status === "failed" ? "error" : result.errors.length ? "warning" : "success",
    resourceType: "client",
    resourceId: input.client_id,
    message: `Synced ${result.asinsDone}/${result.asinsTotal} ASINs, ${result.reviewsAdded} new reviews, ${result.topicsRefreshed} topic snapshots`,
    detail: {
      providers, asins: result.asinsTotal, done: result.asinsDone, failed: result.asinsFailed,
      reviewsAdded: result.reviewsAdded, topicsRefreshed: result.topicsRefreshed,
      rainforestCredits: result.rainforestCredits, heliumCalls: result.heliumCalls, timedOut: result.timedOut,
    },
  });

  const runs = await recentSyncRuns(input.client_id, 5);
  return NextResponse.json({ ...result, runs }, { status: result.status === "failed" ? 502 : 200 });
}
