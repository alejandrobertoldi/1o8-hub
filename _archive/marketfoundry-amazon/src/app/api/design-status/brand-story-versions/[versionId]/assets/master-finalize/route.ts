import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/design-status/brand-story-versions/[versionId]/assets/master-finalize
 *
 * Called by the browser after a successful resumable Drive upload.
 * Records the uploaded file in driveFiles + brandStoryAssets.
 *
 * Request body (JSON):
 *   { driveFileId: string; originalName: string; targetFilename: string; mimeType: string; size: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  brandStoryAssets,
  brandStoryVersions,
  driveFiles,
  driveFolders,
} from "@/lib/db/schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;

  let body: {
    driveFileId?: unknown;
    originalName?: unknown;
    targetFilename?: unknown;
    mimeType?: unknown;
    size?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { driveFileId, originalName, targetFilename, mimeType, size } = body;
  if (typeof driveFileId !== "string" || !driveFileId) {
    return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });
  }
  if (typeof targetFilename !== "string" || !targetFilename) {
    return NextResponse.json({ error: "targetFilename is required" }, { status: 400 });
  }
  const safeMime = typeof mimeType === "string" && mimeType ? mimeType : "application/octet-stream";
  const safeSize = typeof size === "number" ? size : null;
  const safeOriginal = typeof originalName === "string" ? originalName : targetFilename;

  // 1. Look up the version + Drive folder.
  const [versionRow] = await db
    .select({
      versionId: brandStoryVersions.id,
      folderRowId: driveFolders.id,
      folderName: driveFolders.name,
    })
    .from(brandStoryVersions)
    .innerJoin(driveFolders, eq(driveFolders.id, brandStoryVersions.driveFolderId))
    .where(eq(brandStoryVersions.id, versionId))
    .limit(1);

  if (!versionRow) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const slug = versionRow.folderName;
  const subfolderName = `${slug}_Master_Files`;

  // 2. Find the Master Files subfolder DB row.
  const [subfolderRow] = await db
    .select({ id: driveFolders.id })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.name, subfolderName),
        eq(driveFolders.parentFolderId, versionRow.folderRowId)
      )
    )
    .limit(1);

  if (!subfolderRow) {
    return NextResponse.json(
      { error: "Master Files subfolder not found — did the session step complete?" },
      { status: 400 }
    );
  }

  // 3. DB transaction: insert driveFiles + brandStoryAssets.
  try {
    const inserted = await db.transaction(async (tx) => {
      const [fileRow] = await tx
        .insert(driveFiles)
        .values({
          driveFileId,
          folderId: subfolderRow.id,
          originalName: safeOriginal,
          displayName: targetFilename,
          mimeType: safeMime,
          sizeBytes: safeSize,
          entityType: "brand_story_version",
          entityId: versionRow.versionId,
          uploadedBy: session.user.email ?? session.user.name ?? "unknown",
        })
        .returning({ id: driveFiles.id });

      const [assetRow] = await tx
        .insert(brandStoryAssets)
        .values({
          versionId,
          kind: "master_file",
          driveFileId: fileRow.id,
          filename: targetFilename,
        })
        .returning({ id: brandStoryAssets.id, createdAt: brandStoryAssets.createdAt });

      await tx
        .update(brandStoryVersions)
        .set({ updatedAt: new Date() })
        .where(eq(brandStoryVersions.id, versionId));

      return { assetId: assetRow.id, createdAt: assetRow.createdAt };
    });

    return NextResponse.json({ ok: true, asset: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[master-finalize] DB insert failed:", msg);
    return NextResponse.json({ error: `DB insert failed: ${msg}` }, { status: 500 });
  }
}
