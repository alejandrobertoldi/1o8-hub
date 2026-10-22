import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/aplus2/versions/[versionId]/video-finalize
 *
 * Called after the browser has successfully PUT the video bytes to the
 * Drive resumable URI returned by /video-session.
 *
 * Records the drive_files row and the aplus2_assets row, and stamps
 * aplus2_modules.video_drive_file_id for fast lookup — the same post-upload
 * work done by POST /assets for images.
 *
 * Request body (JSON):
 *   {
 *     driveFileId:   string   — Drive file GID returned by the PUT response
 *     moduleId:      string   — UUID of the module this video belongs to
 *     filename:      string   — canonical filename from /video-session response
 *     folderRowId:   string   — drive_folders.id UUID from /video-session response
 *     originalName:  string   — browser File.name (stored as originalName)
 *     mimeType:      string   — e.g. "video/mp4"
 *     sizeBytes:     number   — file size in bytes
 *     replaceAssetId?: string — aplus2_assets.id of the existing video to replace
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Assets,
  aplus2Modules,
  aplus2Versions,
  driveFiles,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

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
    moduleId?: unknown;
    filename?: unknown;
    folderRowId?: unknown;
    originalName?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
    replaceAssetId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { driveFileId, moduleId, filename, folderRowId, originalName, mimeType, sizeBytes, replaceAssetId } = body;

  if (typeof driveFileId !== "string" || !driveFileId)
    return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });
  if (typeof moduleId !== "string" || !moduleId)
    return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
  if (typeof filename !== "string" || !filename)
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  if (typeof folderRowId !== "string" || !folderRowId)
    return NextResponse.json({ error: "folderRowId is required" }, { status: 400 });

  const safeMime = typeof mimeType === "string" && mimeType ? mimeType : "video/mp4";
  const safeSize = typeof sizeBytes === "number" && sizeBytes > 0 ? sizeBytes : 0;
  const safeOriginalName = typeof originalName === "string" ? originalName : filename;
  const safeReplaceAssetId = typeof replaceAssetId === "string" && replaceAssetId ? replaceAssetId : null;

  // Verify the module belongs to this version.
  const [mod] = await db
    .select({ id: aplus2Modules.id, versionId: aplus2Modules.versionId })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod || mod.versionId !== versionId) {
    return NextResponse.json({ error: "moduleId does not belong to this version" }, { status: 400 });
  }

  // Fetch the asset being replaced (if any) so we can trash its Drive file.
  let replacedDriveGid: string | null = null;
  let replacedDriveFileRowId: string | null = null;
  if (safeReplaceAssetId) {
    const [existing] = await db
      .select({
        assetId: aplus2Assets.id,
        driveFileRowId: aplus2Assets.driveFileId,
        driveFileGid: driveFiles.driveFileId,
      })
      .from(aplus2Assets)
      .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
      .where(eq(aplus2Assets.id, safeReplaceAssetId))
      .limit(1);
    if (existing) {
      replacedDriveGid = existing.driveFileGid;
      replacedDriveFileRowId = existing.driveFileRowId;
    }
  }

  try {
    const inserted = await db.transaction(async (tx) => {
      // Delete replaced asset rows first (releasing the partial unique index).
      if (safeReplaceAssetId) {
        await tx.delete(aplus2Assets).where(eq(aplus2Assets.id, safeReplaceAssetId));
        if (replacedDriveFileRowId) {
          await tx.delete(driveFiles).where(eq(driveFiles.id, replacedDriveFileRowId));
        }
      }

      // Insert drive_files row.
      const [fileRow] = await tx
        .insert(driveFiles)
        .values({
          driveFileId,
          folderId: folderRowId,
          originalName: safeOriginalName,
          displayName: filename,
          mimeType: safeMime,
          sizeBytes: safeSize,
          entityType: "aplus2_version",
          entityId: versionId,
          uploadedBy: session.user.email ?? session.user.name ?? "unknown",
        })
        .returning({ id: driveFiles.id });

      // Insert aplus2_assets row.
      const [assetRow] = await tx
        .insert(aplus2Assets)
        .values({
          versionId,
          moduleId,
          moduleItemId: null,
          kind: "video",
          slotKey: "video",
          variant: "desktop",
          driveFileId: fileRow.id,
          filename,
        })
        .returning({ id: aplus2Assets.id });

      // Stamp video_drive_file_id on the module for fast lookup.
      await tx
        .update(aplus2Modules)
        .set({ videoDriveFileId: driveFileId, updatedAt: new Date() })
        .where(eq(aplus2Modules.id, moduleId));

      // Bump version updatedAt.
      await tx
        .update(aplus2Versions)
        .set({ updatedAt: new Date() })
        .where(eq(aplus2Versions.id, versionId));

      return { assetId: assetRow.id, driveFileId, filename };
    });

    // Trash the replaced Drive file best-effort after the transaction commits.
    if (replacedDriveGid) {
      try {
        await driveClient.deleteFile(replacedDriveGid);
      } catch (cleanupErr) {
        const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(`[aplus2 video-finalize] old file ${replacedDriveGid} trash failed: ${m}`);
      }
    }

    return NextResponse.json({ ok: true, asset: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aplus2 video-finalize] DB insert failed:", msg);
    // Trash the newly-uploaded Drive file to avoid orphans.
    try {
      await driveClient.deleteFile(driveFileId);
    } catch (cleanupErr) {
      console.error("[aplus2 video-finalize] orphan cleanup failed:", cleanupErr);
    }
    return NextResponse.json({ error: `DB insert failed: ${msg}` }, { status: 500 });
  }
}
