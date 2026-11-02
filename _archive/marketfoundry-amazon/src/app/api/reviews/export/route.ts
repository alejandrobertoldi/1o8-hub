// GET /api/reviews/export?client_id=&asins=  — stored reviews as CSV in the
// shape the SEO S3 parser accepts (also a plain download for analysts).
import { NextRequest, NextResponse } from "next/server";
import { parseAsinList, requireReviewsReader } from "@/lib/reviews/access";
import { reviewsForAsins } from "@/lib/reviews/insights";
import { reviewsToS3Csv } from "@/lib/reviews/normalize";
import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const access = await requireReviewsReader();
  if (access.error) return access.error;
  const clientIdCode = req.nextUrl.searchParams.get("client_id")?.trim();
  let asins = parseAsinList(req.nextUrl.searchParams.get("asins"));
  if (!asins.length) {
    if (!clientIdCode) return NextResponse.json({ error: "client_id or asins is required." }, { status: 400 });
    const rows = await db.selectDistinct({ asin: productReviews.asin }).from(productReviews).where(eq(productReviews.clientIdCode, clientIdCode));
    asins = rows.map((r) => r.asin);
  }
  const rows = await reviewsForAsins(asins, 5000);
  const csv = reviewsToS3Csv(rows);
  const name = `reviews-${clientIdCode ?? asins.slice(0, 3).join("-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
