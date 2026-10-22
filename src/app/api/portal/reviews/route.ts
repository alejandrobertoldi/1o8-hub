// GET /api/portal/reviews?client=  — client-facing read of the review store:
// rating summary per product, top positive/negative themes, recent reviews.
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { unauthorized, resolvePortalClient } from "@/lib/api-utils";
import { parseAsinList } from "@/lib/reviews/access";
import { getClientReviewOverview, getClientTopicInsights, getRatingHistory, listReviews } from "@/lib/reviews/insights";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (session.user?.clientStatus === "Prospect") {
    return NextResponse.json({ demo: true, asins: [], totals: null, positive: [], negative: [], reviews: [], history: [] });
  }
  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientIdCode = resolved.clientIdCode;
  const asins = parseAsinList(req.nextUrl.searchParams.get("asins"));
  const ratings = (req.nextUrl.searchParams.get("ratings") ?? "").split(",").map(Number).filter((r) => Number.isInteger(r) && r >= 1 && r <= 5);
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);

  const [overview, insights, list] = await Promise.all([
    getClientReviewOverview(clientIdCode),
    getClientTopicInsights(clientIdCode, asins.length ? asins : null),
    listReviews({ clientIdCode, asins: asins.length ? asins : null, ratings, page, pageSize: 20, sort: "newest" }),
  ]);
  const history = await getRatingHistory(asins.length ? asins : overview.asins.map((a) => a.asin), 90);

  // Portal payload is deliberately narrower than the hub one: no sync errors, no run log, no raw provider data.
  return NextResponse.json(
    {
      clientIdCode,
      totals: overview.totals,
      asins: overview.asins.map(({ lastError: _lastError, ...a }) => a),
      rangeStart: insights.rangeStart,
      rangeEnd: insights.rangeEnd,
      positive: insights.positive.slice(0, 8),
      negative: insights.negative.slice(0, 8),
      trends: insights.trends,
      reviews: list.reviews,
      page: list.page,
      totalPages: list.totalPages,
      total: list.total,
      distribution: list.distribution,
      history,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
