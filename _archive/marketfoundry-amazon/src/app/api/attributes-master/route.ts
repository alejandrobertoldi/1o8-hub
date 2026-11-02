import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { fetchAttributesMaster, groupByPDPCard, getRequirementCounts } from "@/lib/attributes-master";

let cachedData: Awaited<ReturnType<typeof fetchAttributesMaster>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getCachedAttributesMaster() {
  const now = Date.now();
  if (cachedData && now - cacheTimestamp < CACHE_TTL) {
    return cachedData;
  }
  cachedData = await fetchAttributesMaster();
  cacheTimestamp = now;
  return cachedData;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const format = url.get("format");

  const attributes = await getCachedAttributesMaster();

  if (format === "cards") {
    const cards = groupByPDPCard(attributes);
    return NextResponse.json(cards);
  }

  if (format === "counts") {
    const counts = getRequirementCounts(attributes);
    return NextResponse.json(counts);
  }

  return NextResponse.json(attributes);
}