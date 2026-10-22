/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  clientBrandGuidelineNotes,
  driveFiles,
  variations,
  variationGroups,
} from "@/lib/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);

  const versions = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode))
    .orderBy(desc(clientBrandGuidelineVersions.versionNumber));

  const activeVersion = versions.find((v) => v.archivedAt === null) ?? null;

  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));

  const logoFiles = bg
    ? await db.select().from(driveFiles)
        .where(and(eq(driveFiles.entityType, "brand_logo"), eq(driveFiles.entityId, bg.id)))
    : [];

  const clientVariations = await db
    .select({
      id: variations.id,
      name: variations.name,
      code: variations.code,
      status: variations.status,
      contentGuidelines: variations.contentGuidelines,
    })
    .from(variations)
    .where(eq(variations.clientId, clientIdCode));

  const variationGuidelinesData = await Promise.all(
    clientVariations.map(async (v) => {
      const groups = await db
        .select({
          id: variationGroups.id,
          name: variationGroups.name,
          contentGuidelines: variationGroups.contentGuidelines,
        })
        .from(variationGroups)
        .where(eq(variationGroups.variationId, v.id))
        .orderBy(asc(variationGroups.sortOrder));
      return { ...v, groups };
    })
  );

  return NextResponse.json({
    state: bg ? {
      summary: {
        logo: bg.summaryLogo,
        colors: bg.summaryColors,
        typography: bg.summaryTypography,
        voice: bg.summaryVoice,
      },
      extractionStatus: bg.extractionStatus,
      extractionStage: bg.extractionStage,
      lastExtractedAt: bg.lastExtractedAt,
      lastExtractionError: bg.lastExtractionError,
    } : null,
    activeVersion,
    versions,
    notes,
    logoFiles,
    variationGuidelines: variationGuidelinesData,
  });
}
