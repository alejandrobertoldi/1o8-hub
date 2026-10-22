// GET /api/reviews/insights?client_id=&asins= — aggregated Amazon Customer Feedback topics,
// trends and SEO keyword candidates for a client (optionally narrowed to ASINs).
import { NextRequest, NextResponse } from "next/server";
import { parseAsinList, requireReviewsReader } from "@/lib/reviews/access";
import { getClientTopicInsights, getRatingHistory } from "@/lib/reviews/insights";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const access = await requireReviewsReader();
  if (access.error) return access.error;
  const clientIdCode = req.nextUrl.searchParams.get("client_id")?.trim();
  if (!clientIdCode) return NextResponse.json({ error: "client_id is required." }, { status: 400 });
  const asins = parseAsinList(req.nextUrl.searchParams.get("asins"));
  const days = Math.max(7, Math.min(Number(req.nextUrl.searchParams.get("days")) || 90, 1095));
  const insights = await getClientTopicInsights(clientIdCode, asins.length ? asins : null);
  const history = await getRatingHistory(asins.length ? asins : insights.perAsin.map((p) => p.asin), days);
  return NextResponse.json({ ...insights, history }, { headers: { "Cache-Control": "no-store" } });
}
