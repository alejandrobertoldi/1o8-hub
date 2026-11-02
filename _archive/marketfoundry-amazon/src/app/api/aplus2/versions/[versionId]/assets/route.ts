import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/aplus2/versions/[versionId]/assets
 *
 * multipart/form-data:
 *   file          — the binary
 *   kind          — "image" | "video"
 *   slotKey       — spec key (e.g. "focus", "image_left", "video", "hotspot_image")
 *   variant       — "desktop" | "mobile" (default "desktop")
 *   moduleId      — required when the slot is on a module
 *   moduleItemId  — set when the slot is inside a repeatable item
 *
 * If a row already exists at the slot+variant, we delete it first (releasing
 * the partial unique index), then insert the new row. The replaced Drive
 * file is trashed best-effort after the DB transaction commits.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Assets, aplus2ModuleItems, aplus2Modules, aplus2Sets, aplus2Versions,
  driveFiles, driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import {
  APLUS2_IMAGE_MIME, APLUS2_VIDEO_MIME, aplus2AssetFilename, aplus2VersionSlugFromSet,
  type Aplus2Variant,
} from "@/lib/aplus2/drive-naming";
import { lookupAplus2VariationId } from "@/lib/aplus2/variation-scope.server";

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

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const kind = formData.get("kind");
  const slotKey = formData.get("slotKey");
  const moduleIdRaw = formData.get("moduleId");
  const moduleItemIdRaw = formData.get("moduleItemId");
  const variantRaw = formData.get("variant") ?? "desktop";
  const file = formData.get("file");

  if (kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "kind must be 'image' or 'video'" }, { status: 400 });
  }
  if (typeof slotKey !== "string" || !slotKey) {
    return NextResponse.json({ error: "slotKey is required" }, { status: 400 });
  }
  if (variantRaw !== "desktop" && variantRaw !== "mobile") {
    return NextResponse.json({ error: "variant must be 'desktop' or 'mobile'" }, { status: 400 });
  }
  if (kind === "video" && variantRaw === "mobile") {
    return NextResponse.json({ error: "video slots have no mobile variant" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const variant = variantRaw as Aplus2Variant;

  const mimeMap = kind === "image" ? APLUS2_IMAGE_MIME : APLUS2_VIDEO_MIME;
  const ext = mimeMap[file.type.toLowerCase()];
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported mime type "${file.type}" for kind=${kind}` },
      { status: 415 }
    );
  }

  const moduleId = typeof moduleIdRaw === "string" && moduleIdRaw ? moduleIdRaw : null;
  const moduleItemId = typeof moduleItemIdRaw === "string" && moduleItemIdRaw ? moduleItemIdRaw : null;
  if (!moduleId) return NextResponse.json({ error: "moduleId is required" }, { status: 400 });

  // Look up version + its Drive subfolder + slug fields.
  const [v] = await db
    .select({
      versionId: aplus2Versions.id,
      versionNumber: aplus2Versions.versionNumber,
      folderRowId: driveFolders.id,
      driveFolderGid: driveFolders.driveFolderId,
      folderName: driveFolders.name,
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
  if (!v) return NextResponse.json({ error: "Version or Drive folder not found" }, { status: 404 });

  // Look up module position.
  const [mod] = await db
    .select({
      position: aplus2Modules.position,
      moduleType: aplus2Modules.moduleType,
      versionId: aplus2Modules.versionId,
    })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod || mod.versionId !== versionId) {
    return NextResponse.json({ error: "moduleId does not belong to this version" }, { status: 400 });
  }

  // Look up item position (if any).
  let itemPosition: number | undefined;
  if (moduleItemId) {
    const [it] = await db
      .select({ position: aplus2ModuleItems.position, moduleId: aplus2ModuleItems.moduleId })
      .from(aplus2ModuleItems)
      .where(eq(aplus2ModuleItems.id, moduleItemId))
      .limit(1);
    if (!it || it.moduleId !== moduleId) {
      return NextResponse.json({ error: "moduleItemId does not belong to this module" }, { status: 400 });
    }
    itemPosition = it.position;
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
    kind,
    slotKey,
    itemPosition,
    variant,
    ext,
  });

  // Existing asset at this slot+variant (replace flow).
  const existingWhere = moduleItemId
    ? and(eq(aplus2Assets.moduleItemId, moduleItemId), eq(aplus2Assets.slotKey, slotKey), eq(aplus2Assets.variant, variant))
    : and(eq(aplus2Assets.moduleId, moduleId), eq(aplus2Assets.slotKey, slotKey), eq(aplus2Assets.variant, variant));
  const [existing] = await db
    .select({
      assetId: aplus2Assets.id,
      driveFileRowId: aplus2Assets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(existingWhere)
    .limit(1);

  // Upload to Drive first.
  const buffer = Buffer.from(await file.arrayBuffer());
  let uploadedGid: string;
  try {
    const u = await driveClient.uploadFile(filename, v.driveFolderGid, buffer, file.type);
    uploadedGid = u.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive upload failed: ${msg}` }, { status: 502 });
  }

  try {
    const inserted = await db.transaction(async (tx) => {
      if (existing) {
        await tx.delete(aplus2Assets).where(eq(aplus2Assets.id, existing.assetId));
        await tx.delete(driveFiles).where(eq(driveFiles.id, existing.driveFileRowId));
      }
      const [fileRow] = await tx
        .insert(driveFiles)
        .values({
          driveFileId: uploadedGid,
          folderId: v.folderRowId,
          originalName: file.name,
          displayName: filename,
          mimeType: file.type,
          sizeBytes: file.size,
          entityType: "aplus2_version",
          entityId: v.versionId,
          uploadedBy: session.user.email ?? session.user.name ?? "unknown",
        })
        .returning({ id: driveFiles.id });
      const [assetRow] = await tx
        .insert(aplus2Assets)
        .values({
          versionId, moduleId, moduleItemId, kind, slotKey, variant,
          driveFileId: fileRow.id, filename,
        })
        .returning({ id: aplus2Assets.id });
      // If video, also stamp video_drive_file_id on the module for fast lookup.
      if (kind === "video") {
        await tx.update(aplus2Modules).set({ videoDriveFileId: uploadedGid, updatedAt: new Date() }).where(eq(aplus2Modules.id, moduleId));
      }
      await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, versionId));
      return { assetId: assetRow.id, driveFileId: uploadedGid, filename };
    });

    if (existing) {
      try { await driveClient.deleteFile(existing.driveFileGid); }
      catch (cleanupErr) {
        const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(`[aplus2 POST asset] old file ${existing.driveFileGid} trash failed: ${m}`);
      }
    }
    return NextResponse.json({ ok: true, asset: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aplus2 POST asset] DB insert failed:", msg);
    try { await driveClient.deleteFile(uploadedGid); }
    catch (cleanupErr) { console.error("[aplus2 POST asset] orphan cleanup failed:", cleanupErr); }
    return NextResponse.json({ error: `DB insert failed: ${msg}` }, { status: 500 });
  }
}
