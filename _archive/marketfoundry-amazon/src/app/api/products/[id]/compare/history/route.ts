import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { amazonSnapshots } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ComparisonResult } from "@/lib/sp-api/comparator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const limitParam = parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = Math.min(Math.max(limitParam, 1), 50);

  const snapshots = await db
    .select()
    .from(amazonSnapshots)
    .where(eq(amazonSnapshots.productId, id))
    .orderBy(desc(amazonSnapshots.fetchedAt))
    .limit(limit);

  const history = snapshots.map((s) => {
    const cr = s.comparisonResult as ComparisonResult | null;
    return {
      id: s.id,
      overallMatch: s.overallMatch,
      fetchedAt: s.fetchedAt,
      mismatchedFields: cr?.mismatchedFields ?? 0,
      totalFields: cr?.totalFields ?? 0,
    };
  });

  return NextResponse.json({ history });
}
