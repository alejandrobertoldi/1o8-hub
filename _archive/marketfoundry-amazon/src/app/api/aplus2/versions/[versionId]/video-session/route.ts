import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/aplus2/versions/[versionId]/video-session
 *
 * Initiates a resumable Google Drive upload session for an aplus2 video asset.
 * The browser uploads the file bytes directly to Drive — the file never passes
 * through Next.js, so there are no body-size or timeout limits.
 *
 * Uses the same Drive folder as image uploads for this version
 * (aplus2_versions.drive_folder_id → drive_folders.drive_folder_id).
 *
 * Request body (JSON):
 *   { moduleId: string; size: number; mimeType?: string }
 *
 * Response:
 *   { uploadUri: string; filename: string; folderRowId: string }
 *     uploadUri   — Drive resumable URI; browser PUT's the file bytes here
 *     filename    — canonical Drive filename (e.g. "DRC_SC_US_B0XYZ_PAplus_V01_M02_video.mp4")
 *     folderRowId — drive_folders.id (UUID) for the DB record on finalize
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Modules,
  aplus2Sets,
  aplus2Versions,
  driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import {
  APLUS2_VIDEO_MIME,
  aplus2AssetFilename,
  aplus2VersionSlugFromSet,
} from "@/lib/aplus2/drive-naming";
import { lookupAplus2VariationId } from "@/lib/aplus2/variation-scope.server";

export const maxDuration = 30;

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

  let body: { moduleId?: unknown; size?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { moduleId: moduleIdRaw, size, mimeType: mimeTypeRaw } = body;
  if (typeof moduleIdRaw !== "string" || !moduleIdRaw) {
    return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json({ error: "size must be a positive number" }, { status: 400 });
  }
  const mimeType = typeof mimeTypeRaw === "string" && mimeTypeRaw ? mimeTypeRaw : "video/mp4";
  const ext = APLUS2_VIDEO_MIME[mimeType.toLowerCase()];
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported mime type "${mimeType}" for video` },
      { status: 415 }
    );
  }

  // Look up version + its Drive folder (same join as POST /assets).
  const [v] = await db
    .select({
      versionId: aplus2Versions.id,
      versionNumber: aplus2Versions.versionNumber,
      folderRowId: driveFolders.id,
      driveFolderGid: driveFolders.driveFolderId,
      clientIdCode: aplus2Sets.clientIdCode,
      contentType: aplus2Versions.contentType,
      scopeType: aplus2Sets.scopeType,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      productId: aplus2Sets.productId,
    })
    .from(aplus2Versions)
    .innerJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!v) {
    return NextResponse.json(
      { error: "Version or Drive folder not found" },
      { status: 404 }
    );
  }

  // Look up module position.
  const [mod] = await db
    .select({
      position: aplus2Modules.position,
      moduleType: aplus2Modules.moduleType,
      versionId: aplus2Modules.versionId,
    })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleIdRaw))
    .limit(1);
  if (!mod || mod.versionId !== versionId) {
    return NextResponse.json(
      { error: "moduleId does not belong to this version" },
      { status: 400 }
    );
  }

  const variationId =
    v.scopeType === "PARENT" ? await lookupAplus2VariationId(v.productId) : null;
  const slug = aplus2VersionSlugFromSet({
    clientIdCode: v.clientIdCode,
    scopeType: v.scopeType,
    scopeIdentifier: v.scopeIdentifier,
    variationId,
    contentType: v.contentType,
    versionNumber: v.versionNumber,
  });

  const filename = aplus2AssetFilename({
    slug,
    modulePosition: mod.position,
    moduleType: mod.moduleType,
    kind: "video",
    slotKey: "video",
    variant: "desktop",
    ext,
  });

  // Create Drive resumable session — browser PUTs bytes directly to Drive.
  // Pass Origin so Drive adds CORS headers to the upload URI responses.
  const browserOrigin = req.headers.get("origin") ?? undefined;
  let uploadUri: string;
  try {
    uploadUri = await driveClient.createResumableSession(
      filename,
      v.driveFolderGid,   // ← same folder as image uploads for this version
      mimeType,
      size,
      browserOrigin
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Drive session creation failed: ${msg}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    uploadUri,
    filename,
    folderRowId: v.folderRowId,
  });
}
