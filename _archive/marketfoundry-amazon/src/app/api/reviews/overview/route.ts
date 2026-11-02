// GET /api/reviews/overview            — every active client with review-store status
// GET /api/reviews/overview?client_id= — per-ASIN overview for one client
import { NextRequest, NextResponse } from "next/server";
import { requireReviewsReader } from "@/lib/reviews/access";
import { getClientReviewOverview, listReviewClients, recentSyncRuns } from "@/lib/reviews/insights";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const access = await requireReviewsReader();
  if (access.error) return access.error;
  const clientIdCode = req.nextUrl.searchParams.get("client_id")?.trim() || null;
  if (!clientIdCode) {
    const clients = await listReviewClients();
    return NextResponse.json({ clients }, { headers: { "Cache-Control": "no-store" } });
  }
  const [overview, runs] = await Promise.all([getClientReviewOverview(clientIdCode), recentSyncRuns(clientIdCode, 5)]);
  return NextResponse.json({ ...overview, runs }, { headers: { "Cache-Control": "no-store" } });
}
