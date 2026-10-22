// GET /api/reviews?client_id=…  — paginated stored reviews with filters.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseAsinList, requireReviewsReader } from "@/lib/reviews/access";
import { listReviews } from "@/lib/reviews/insights";

const query = z.object({
  client_id: z.string().trim().min(1),
  asins: z.string().optional(),
  ratings: z.string().optional(),
  verified: z.enum(["1", "0", "true", "false"]).optional(),
  q: z.string().max(200).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["newest", "oldest", "helpful", "rating_asc", "rating_desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const access = await requireReviewsReader();
  if (access.error) return access.error;
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "client_id is required." }, { status: 400 });
  const q = parsed.data;
  const ratings = (q.ratings ?? "").split(",").map((r) => Number(r)).filter((r) => Number.isInteger(r) && r >= 1 && r <= 5);
  const result = await listReviews({
    clientIdCode: q.client_id,
    asins: parseAsinList(q.asins),
    ratings,
    verifiedOnly: q.verified === "1" || q.verified === "true",
    search: q.q ?? null,
    from: q.from ?? null,
    to: q.to ?? null,
    sort: q.sort,
    page: q.page,
    pageSize: q.page_size,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
