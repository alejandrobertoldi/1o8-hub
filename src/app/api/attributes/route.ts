import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

// In-memory cache (module-level, 5min TTL)
let cachedRows: (typeof attributes.$inferSelect)[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedAttributes() {
  const now = Date.now();
  if (cachedRows && now - cacheTimestamp < CACHE_TTL) {
    return cachedRows;
  }
  cachedRows = await db
    .select()
    .from(attributes)
    .orderBy(asc(attributes.referenceGroup), asc(attributes.subgroup), asc(attributes.generalLabel));
  cacheTimestamp = now;
  return cachedRows;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const group = url.get("group") || "";
  const essentialOnly = url.get("essential") === "true";

  let rows = await getCachedAttributes();

  // Apply filters in-memory (fast since dataset is small ~972 rows)
  if (group) {
    rows = rows.filter((r) => r.referenceGroup === group);
  }

  if (essentialOnly) {
    rows = rows.filter((r) => r.isEssential);
  }

  return NextResponse.json(rows);
}
