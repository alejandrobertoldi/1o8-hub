import { hasAdminPowers } from "@/lib/roles";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines, clientBrandGuidelineVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { runExtraction } from "@/lib/brand-guidelines/extraction";
import { snapshotActiveVersionAiPreview } from "@/lib/brand-guidelines/snapshot";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, versionId } = await params;

  const [version] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, versionId)).limit(1);
  if (!version || version.clientIdCode !== clientIdCode) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  await db.update(clientBrandGuidelines).set({
    extractionStatus: "extracting",
    extractionStage: null,
    lastExtractionError: null,
    updatedAt: new Date(),
  }).where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));

  let error: string | null = null;
  try {
    const buffer = await driveClient.downloadFileContent(version.driveFileId);
    await runExtraction({ versionId, clientIdCode, pdfBuffer: buffer });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  try {
    await snapshotActiveVersionAiPreview(clientIdCode);
  } catch (err) {
    console.error("snapshotActiveVersionAiPreview failed", err);
  }

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  return NextResponse.json({
    status: bg?.extractionStatus ?? "idle",
    summary: bg ? {
      logo: bg.summaryLogo, colors: bg.summaryColors,
      typography: bg.summaryTypography, voice: bg.summaryVoice,
    } : null,
    error,
  });
}
