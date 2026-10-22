import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  driveFiles,
  driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { resolveBrandGuidelinesArchiveFolder } from "@/lib/drive-upload";
import { runExtraction } from "@/lib/brand-guidelines/extraction";
import { snapshotActiveVersionAiPreview } from "@/lib/brand-guidelines/snapshot";

const bodySchema = z.object({
  driveFileId: z.string().min(1),
  folderId: z.string().uuid(),
  displayName: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().default("application/pdf"),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { driveFileId, folderId, displayName, originalName, mimeType, sizeBytes } = parsed.data;

  // Step 0: freeze the outgoing version's AI preview before we archive it.
  // After archival, the snapshot helper only updates the new active version,
  // so without this call the prior version would lose its historical preview.
  try {
    await snapshotActiveVersionAiPreview(clientIdCode);
  } catch (err) {
    console.error("snapshotActiveVersionAiPreview (pre-archive) failed", err);
  }

  // Step 1: archive previous active version (if any) + insert new version + drive_files in a tx.
  const result = await db.transaction(async (tx) => {
    const prior = await tx.select().from(clientBrandGuidelineVersions)
      .where(and(
        eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode),
        isNull(clientBrandGuidelineVersions.archivedAt),
      ))
      .limit(1);

    if (prior[0]) {
      const archive = await resolveBrandGuidelinesArchiveFolder(clientIdCode);
      if (!archive) throw new Error("Could not resolve Brand Guidelines/Archive/ folder");

      // Look up previous file's current Drive parent (the brand_guidelines folder).
      const [priorDriveFile] = await tx.select().from(driveFiles)
        .where(eq(driveFiles.driveFileId, prior[0].driveFileId))
        .limit(1);
      if (priorDriveFile) {
        const [priorFolder] = await tx.select({ driveFolderId: driveFolders.driveFolderId })
          .from(driveFolders).where(eq(driveFolders.id, priorDriveFile.folderId)).limit(1);
        if (priorFolder) {
          await driveClient.moveFile(prior[0].driveFileId, archive.driveFolderId, priorFolder.driveFolderId);
          await tx.update(driveFiles).set({ folderId: archive.id })
            .where(eq(driveFiles.id, priorDriveFile.id));
        }
      }
      await tx.update(clientBrandGuidelineVersions).set({ archivedAt: new Date() })
        .where(eq(clientBrandGuidelineVersions.id, prior[0].id));
    }

    const [maxRow] = await tx.select({
      maxV: sql<number>`COALESCE(MAX(${clientBrandGuidelineVersions.versionNumber}), 0)::int`,
    }).from(clientBrandGuidelineVersions)
      .where(eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode));
    const nextVersion = (maxRow?.maxV ?? 0) + 1;

    const [newVersion] = await tx.insert(clientBrandGuidelineVersions).values({
      clientIdCode,
      versionNumber: nextVersion,
      driveFileId,
      originalFilename: originalName,
      byteSize: sizeBytes ?? null,
      uploadedBy: session.user.email!,
    }).returning();

    // Rename the Drive file to include the now-known version number (matches
    // spec naming: {clientIdCode}_noa_brand_guidelines_v{N}_{ts}.pdf). The
    // upload-session route used "0" as the imageSlot placeholder because
    // the version number isn't known until after the insert above.
    const versionedDisplayName = displayName.replace(
      /_brand_guidelines_[^_]+_/,
      `_brand_guidelines_v${nextVersion}_`
    );
    if (versionedDisplayName !== displayName) {
      await driveClient.renameFile(driveFileId, versionedDisplayName);
    }

    await tx.insert(driveFiles).values({
      driveFileId,
      folderId,
      originalName,
      displayName: versionedDisplayName,
      mimeType,
      sizeBytes: sizeBytes ?? null,
      entityType: "brand_book_version",
      entityId: newVersion.id,
      uploadedBy: session.user.email!,
    });

    // Upsert client_brand_guidelines.
    await tx.insert(clientBrandGuidelines).values({
      clientIdCode,
      activeVersionId: newVersion.id,
      extractionStatus: "extracting",
      extractionStage: null,
    }).onConflictDoUpdate({
      target: clientBrandGuidelines.clientIdCode,
      set: {
        activeVersionId: newVersion.id,
        extractionStatus: "extracting",
        extractionStage: null,
        lastExtractionError: null,
        updatedAt: new Date(),
      },
    });

    return { newVersionId: newVersion.id };
  });

  // Step 2: download PDF buffer from Drive (server→Drive, no body limit) and run extraction.
  let extractionError: string | null = null;
  try {
    const buffer = await driveClient.downloadFileContent(driveFileId);
    await runExtraction({ versionId: result.newVersionId, clientIdCode, pdfBuffer: buffer });
  } catch (err) {
    // runExtraction already updated DB with status='failed'. Capture the error for the response.
    extractionError = err instanceof Error ? err.message : String(err);
  }

  // Step 2b: snapshot the rendered AI preview onto the new active version.
  // Best-effort; failure here should not bubble up to the client.
  try {
    await snapshotActiveVersionAiPreview(clientIdCode);
  } catch (err) {
    console.error("snapshotActiveVersionAiPreview failed", err);
  }

  // Step 3: return current state.
  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  const [version] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, result.newVersionId)).limit(1);

  return NextResponse.json({
    activeVersion: version,
    status: bg?.extractionStatus ?? "idle",
    summary: bg ? {
      logo: bg.summaryLogo,
      colors: bg.summaryColors,
      typography: bg.summaryTypography,
      voice: bg.summaryVoice,
    } : null,
    error: extractionError,
  });
}
