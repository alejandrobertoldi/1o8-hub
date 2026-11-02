// GET /api/reviews/runs?client_id= — recent review sync runs (job log).
import { NextRequest, NextResponse } from "next/server";
import { requireReviewsReader } from "@/lib/reviews/access";
import { recentSyncRuns } from "@/lib/reviews/insights";

export async function GET(req: NextRequest) {
  const access = await requireReviewsReader();
  if (access.error) return access.error;
  const clientIdCode = req.nextUrl.searchParams.get("client_id")?.trim() || null;
  const limit = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 100));
  return NextResponse.json({ runs: await recentSyncRuns(clientIdCode, limit) }, { headers: { "Cache-Control": "no-store" } });
}
