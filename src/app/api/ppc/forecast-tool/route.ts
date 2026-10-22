import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  forecastToolVersions,
  forecastToolCells,
  forecastToolAsins,
  forecastToolAsinCells,
} from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const versionId = req.nextUrl.searchParams.get("versionId");
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });

  // Get all versions for this client
  const versions = await db
    .select()
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.clientIdCode, clientIdCode))
    .orderBy(desc(forecastToolVersions.createdAt));

  // Load specific or current version
  const activeVersion = versionId
    ? versions.find(v => v.id === versionId)
    : versions.find(v => v.isCurrent) || versions[0];

  if (!activeVersion) {
    return NextResponse.json({ versions: [], activeVersion: null, cells: [], asins: [], asinCells: [], historical: {} });
  }

  // Load cells, ASINs in parallel
  const [cells, asins] = await Promise.all([
    db.select().from(forecastToolCells).where(eq(forecastToolCells.versionId, activeVersion.id)),
    db.select().from(forecastToolAsins).where(eq(forecastToolAsins.versionId, activeVersion.id)).orderBy(forecastToolAsins.sortOrder),
  ]);

  // Load ALL asin cells for all ASINs in this version
  let allAsinCells: (typeof forecastToolAsinCells.$inferSelect)[] = [];
  if (asins.length > 0) {
    const allAsinIds = asins.map(a => a.id);
    allAsinCells = await db
      .select()
      .from(forecastToolAsinCells)
      .where(inArray(forecastToolAsinCells.asinId, allAsinIds));
  }

  // Use cached historical data from the version row (no Redshift query)
  const historical = activeVersion.historicalData ?? {};
  const asinHistorical = activeVersion.asinHistoricalData ?? {};

  return NextResponse.json({
    versions,
    activeVersion,
    cells,
    asins,
    asinCells: allAsinCells,
    asinHistorical,
    historical,
  });
}
