/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { forecastToolVersions, forecastToolAsins } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getIntentwiseAccountId,
  fetchAccountHistorical,
  fetchAsinHistorical,
} from "@/lib/forecast-redshift";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // If setting as current, unset others for same client
  if (body.isCurrent) {
    const [existing] = await db
      .select({ clientIdCode: forecastToolVersions.clientIdCode })
      .from(forecastToolVersions)
      .where(eq(forecastToolVersions.id, id));

    if (existing) {
      await db
        .update(forecastToolVersions)
        .set({ isCurrent: false })
        .where(and(
          eq(forecastToolVersions.clientIdCode, existing.clientIdCode),
          eq(forecastToolVersions.isCurrent, true)
        ));
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isCurrent !== undefined) updateData.isCurrent = body.isCurrent;
  if (body.isLocked !== undefined) updateData.isLocked = body.isLocked;
  if (body.seasonalityData !== undefined) updateData.seasonalityData = body.seasonalityData;

  const [updated] = await db
    .update(forecastToolVersions)
    .set(updateData)
    .where(eq(forecastToolVersions.id, id))
    .returning();

  return NextResponse.json({ version: updated });
}

/** POST = refresh historical data from Redshift and re-cache on the version */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Load version
  const [version] = await db
    .select()
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.id, id));
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Block refresh if locked
  if (version.isLocked) {
    return NextResponse.json({ error: "Version is locked. Unlock it first to refresh historical data." }, { status: 409 });
  }

  const iwId = await getIntentwiseAccountId(version.clientIdCode);
  if (!iwId) {
    return NextResponse.json({ error: "No Intentwise account found for this client" }, { status: 404 });
  }

  // Fetch ASINs for this version
  const asins = await db
    .select({ asin: forecastToolAsins.asin })
    .from(forecastToolAsins)
    .where(eq(forecastToolAsins.versionId, id));
  const asinCodes = asins.map((a) => a.asin).filter(Boolean) as string[];

  // Fetch fresh data from Redshift
  const [historicalData, asinHistoricalData] = await Promise.all([
    fetchAccountHistorical(iwId),
    fetchAsinHistorical(iwId, asinCodes),
  ]);

  // Update the version with fresh cached data
  const [updated] = await db
    .update(forecastToolVersions)
    .set({ historicalData, asinHistoricalData })
    .where(eq(forecastToolVersions.id, id))
    .returning();

  return NextResponse.json({ version: updated, historical: historicalData, asinHistorical: asinHistoricalData });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const [version] = await db
    .select({ id: forecastToolVersions.id, clientIdCode: forecastToolVersions.clientIdCode })
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.id, id));

  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Delete version (FK cascades handle asins + cells)
  await db.delete(forecastToolVersions).where(eq(forecastToolVersions.id, id));

  return NextResponse.json({ deleted: true, clientIdCode: version.clientIdCode });
}
