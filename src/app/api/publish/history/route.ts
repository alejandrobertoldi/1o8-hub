import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { publishHistory } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { unauthorized, forbidden } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!canAccessSection(session, "publish")) return forbidden("Forbidden: admin only");

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 100);

  const entries = await db
    .select()
    .from(publishHistory)
    .orderBy(desc(publishHistory.publishedAt))
    .limit(limit);

  return NextResponse.json(entries);
}
