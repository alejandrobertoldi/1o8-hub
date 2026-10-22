import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/design-status/brand-story-versions/[versionId]/assets
 *
 * Uploads a single image into one of the slots of a brand story version.
 * Kinds:
 *   - bg_desktop, bg_mobile  → identified by versionId
 *   - focus, logo            → identified by versionId + moduleId
 *   - asin                   → identified by versionId + asinItemId
 *
 * If an asset already exists at the slot, the existing brand_story_assets
 * + drive_files rows are removed in the same transaction (the partial
 * unique indexes would otherwise block the insert), then the Drive file is
 * deleted best-effort after the transaction commits.
 *
 * Filename follows the locked convention from primer.md:
 *   bg_desktop  → {slug}_bg_desktop.{ext}
 *   bg_mobile   → {slug}_bg_mobile.{ext}
 *   focus       → {slug}_M##_focus.{ext}      (## = module.position padded)
 *   logo        → {slug}_M##_logo.{ext}
 *   asin        → {slug}_M##_asin0N.{ext}     (N = asin_item.position 1..4)
 * where slug = {CLIENT}_Brandstory_V## (also the Drive subfolder name).
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  brandStoryAsinItems,
  brandStoryAssets,
  brandStoryModules,
  brandStoryVersions,
  driveFiles,
  driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

const ALLOWED_MIME: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

type AssetKind = "bg_desktop" | "bg_mobile" | "focus" | "logo" | "asin" | "master_file" | "screenview";

const KIND_SET: Set<AssetKind> = new Set([
  "bg_desktop",
  "bg_mobile",
  "focus",
  "logo",
  "asin",
  "master_file",
  "screenview",
]);

async function handleMasterFile({
  versionId,
  file,
  session,
}: {
  versionId: string;
  file: File;
  session: Awaited<ReturnType<typeof getAuthSession>>;
}) {
  // 1. Look up the version + its Drive folder.
  const [versionRow] = await db
    .select({
      versionId: brandStoryVersions.id,
      clientIdCode: brandStoryVersions.clientIdCode,
      folderRowId: driveFolders.id,
      driveFolderGid: driveFolders.driveFolderId,
      folderName: driveFolders.name,
    })
    .from(brandStoryVersions)
    .innerJoin(driveFolders, eq(driveFolders.id, brandStoryVersions.driveFolderId))
    .where(eq(brandStoryVersions.id, versionId))
    .limit(1);

  if (!versionRow) {
    return NextResponse.json(
      { error: "Version not found or has no Drive folder" },
      { status: 404 }
    );
  }

  const slug = versionRow.folderName;
  const subfolderName = `${slug}_Master_Files`;

  // 2. Find or create the Master Files subfolder in Drive + DB.
  const [existingSubfolder] = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.name, subfolderName),
        eq(driveFolders.parentFolderId, versionRow.folderRowId)
      )
    )
    .limit(1);

  let subfolderDbId: string;
  let subfolderGid: string;

  if (existingSubfolder) {
    subfolderDbId = existingSubfolder.id;
    subfolderGid = existingSubfolder.driveFolderId;
  } else {
    let driveFolder: { id: string };
    try {
      driveFolder = await driveClient.createFolder(subfolderName, versionRow.driveFolderGid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[brand-story master_file] Drive createFolder failed:", msg);
      return NextResponse.json({ error: `Drive folder creation failed: ${msg}` }, { status: 502 });
    }
    const [insertedFolder] = await db
      .insert(driveFolders)
      .values({
        clientIdCode: versionRow.clientIdCode,
        driveFolderId: driveFolder.id,
        folderType: "brand_story_master",
        path: `${slug}/${subfolderName}`,
        parentFolderId: versionRow.folderRowId,
        name: subfolderName,
      })
      .returning({ id: driveFolders.id });
    subfolderDbId = insertedFolder.id;
    subfolderGid = driveFolder.id;
  }

  // 3. Upload file to Drive subfolder.
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  let uploadedGid: string;
  try {
    const uploaded = await driveClient.uploadFile(
      file.name,
      subfolderGid,
      buffer,
      mimeType
    );
    uploadedGid = uploaded.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand-story master_file] Drive upload failed:", msg);
    return NextResponse.json({ error: `Drive upload failed: ${msg}` }, { status: 502 });
  }

  // 4. DB transaction: insert driveFiles + brandStoryAssets.
  try {
    const inserted = await db.transaction(async (tx) => {
      const [fileRow] = await tx
        .insert(driveFiles)
        .values({
          driveFileId: uploadedGid,
          folderId: subfolderDbId,
          originalName: file.name,
          displayName: file.name,
          mimeType,
          sizeBytes: file.size,
          entityType: "brand_story_version",
          entityId: versionRow.versionId,
          uploadedBy: session!.user.email ?? session!.user.name ?? "unknown",
        })
        .returning({ id: driveFiles.id });

      const [assetRow] = await tx
        .insert(brandStoryAssets)
        .values({
          versionId,
          kind: "master_file",
          driveFileId: fileRow.id,
          filename: file.name,
        })
        .returning({ id: brandStoryAssets.id, createdAt: brandStoryAssets.createdAt });

      await tx
        .update(brandStoryVersions)
        .set({ updatedAt: new Date() })
        .where(eq(brandStoryVersions.id, versionId));

      return { assetId: assetRow.id, filename: file.name, createdAt: assetRow.createdAt };
    });

    return NextResponse.json({ ok: true, asset: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand-story master_file] DB insert failed:", msg);
    try { await driveClient.deleteFile(uploadedGid); } catch { /* best-effort */ }
    return NextResponse.json({ error: `DB insert failed: ${msg}` }, { status: 500 });
  }
}

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
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const kindRaw = formData.get("kind");
  const moduleIdRaw = formData.get("moduleId");
  const asinItemIdRaw = formData.get("asinItemId");
  const file = formData.get("file");

  if (typeof kindRaw !== "string" || !KIND_SET.has(kindRaw as AssetKind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${[...KIND_SET].join(", ")}` },
      { status: 400 }
    );
  }
  const kind = kindRaw as AssetKind;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // ── master_file: separate path — any mime, multiple per version, subfolder ──
  if (kind === "master_file") {
    return handleMasterFile({ versionId, file, session });
  }

  const ext = ALLOWED_MIME[file.type.toLowerCase()];
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported mime type "${file.type}". Allowed: image/png, image/jpeg, image/webp.` },
      { status: 415 }
    );
  }

  const moduleId = typeof moduleIdRaw === "string" && moduleIdRaw ? moduleIdRaw : null;
  const asinItemId = typeof asinItemIdRaw === "string" && asinItemIdRaw ? asinItemIdRaw : null;

  if ((kind === "focus" || kind === "logo") && !moduleId) {
    return NextResponse.json({ error: `kind=${kind} requires moduleId` }, { status: 400 });
  }
  if (kind === "asin" && !asinItemId) {
    return NextResponse.json({ error: "kind=asin requires asinItemId" }, { status: 400 });
  }

  // 1. Look up the version + its Drive subfolder.
  const [versionRow] = await db
    .select({
      versionId: brandStoryVersions.id,
      clientIdCode: brandStoryVersions.clientIdCode,
      versionNumber: brandStoryVersions.versionNumber,
      folderRowId: driveFolders.id,
      driveFolderGid: driveFolders.driveFolderId,
      folderName: driveFolders.name,
    })
    .from(brandStoryVersions)
    .innerJoin(driveFolders, eq(driveFolders.id, brandStoryVersions.driveFolderId))
    .where(eq(brandStoryVersions.id, versionId))
    .limit(1);

  if (!versionRow) {
    return NextResponse.json(
      { error: "Version not found or has no Drive folder" },
      { status: 404 }
    );
  }
  const slug = versionRow.folderName; // {CLIENT}_Brandstory_V##

  // 2. For focus/logo: confirm module belongs to version, get its position.
  let modulePosition: number | null = null;
  if (moduleId) {
    const [mod] = await db
      .select({ position: brandStoryModules.position, versionId: brandStoryModules.versionId })
      .from(brandStoryModules)
      .where(eq(brandStoryModules.id, moduleId))
      .limit(1);
    if (!mod || mod.versionId !== versionId) {
      return NextResponse.json(
        { error: "moduleId does not belong to this version" },
        { status: 400 }
      );
    }
    modulePosition = mod.position;
  }

  // 3. For asin: confirm asin item belongs to a module of this version, get positions.
  let asinItemPosition: number | null = null;
  if (asinItemId) {
    const [it] = await db
      .select({
        position: brandStoryAsinItems.position,
        moduleId: brandStoryAsinItems.moduleId,
        modulePosition: brandStoryModules.position,
        moduleVersionId: brandStoryModules.versionId,
      })
      .from(brandStoryAsinItems)
      .innerJoin(brandStoryModules, eq(brandStoryModules.id, brandStoryAsinItems.moduleId))
      .where(eq(brandStoryAsinItems.id, asinItemId))
      .limit(1);
    if (!it || it.moduleVersionId !== versionId) {
      return NextResponse.json(
        { error: "asinItemId does not belong to this version" },
        { status: 400 }
      );
    }
    asinItemPosition = it.position;
    modulePosition = it.modulePosition;
  }

  // 4. Compute the target filename.
  const mPadded = modulePosition !== null ? String(modulePosition).padStart(2, "0") : null;
  let filename: string;
  switch (kind) {
    case "bg_desktop":
      filename = `${slug}_bg_desktop.${ext}`;
      break;
    case "bg_mobile":
      filename = `${slug}_bg_mobile.${ext}`;
      break;
    case "screenview":
      filename = `${slug}_screenview.${ext}`;
      break;
    case "focus":
      filename = `${slug}_M${mPadded}_focus.${ext}`;
      break;
    case "logo":
      filename = `${slug}_M${mPadded}_logo.${ext}`;
      break;
    case "asin":
      filename = `${slug}_M${mPadded}_asin0${asinItemPosition}.${ext}`;
      break;
  }

  // 5. Look up an existing asset at this slot (for replace flow).
  const existingWhere = (() => {
    if (kind === "bg_desktop" || kind === "bg_mobile" || kind === "screenview") {
      return and(
        eq(brandStoryAssets.versionId, versionId),
        eq(brandStoryAssets.kind, kind)
      );
    }
    if (kind === "focus" || kind === "logo") {
      return and(
        eq(brandStoryAssets.moduleId, moduleId!),
        eq(brandStoryAssets.kind, kind)
      );
    }
    // kind === "asin"
    return eq(brandStoryAssets.asinItemId, asinItemId!);
  })();

  const [existing] = await db
    .select({
      assetId: brandStoryAssets.id,
      driveFileRowId: brandStoryAssets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(brandStoryAssets)
    .innerJoin(driveFiles, eq(driveFiles.id, brandStoryAssets.driveFileId))
    .where(existingWhere)
    .limit(1);

  // 6. Upload new file to Drive first; abort cleanly if it fails (no DB writes yet).
  const buffer = Buffer.from(await file.arrayBuffer());
  let uploadedGid: string;
  try {
    const uploaded = await driveClient.uploadFile(
      filename,
      versionRow.driveFolderGid,
      buffer,
      file.type
    );
    uploadedGid = uploaded.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand-story assets POST] Drive upload failed:", msg);
    return NextResponse.json(
      { error: `Drive upload failed: ${msg}` },
      { status: 502 }
    );
  }

  // 7. DB transaction: delete old rows (if any), then insert new ones.
  try {
    const inserted = await db.transaction(async (tx) => {
      if (existing) {
        // Removing the brand_story_assets row releases the partial-unique slot.
        await tx.delete(brandStoryAssets).where(eq(brandStoryAssets.id, existing.assetId));
        // drive_files row will not auto-cascade — delete it directly.
        await tx.delete(driveFiles).where(eq(driveFiles.id, existing.driveFileRowId));
      }

      const [fileRow] = await tx
        .insert(driveFiles)
        .values({
          driveFileId: uploadedGid,
          folderId: versionRow.folderRowId,
          originalName: file.name,
          displayName: filename,
          mimeType: file.type,
          sizeBytes: file.size,
          entityType: "brand_story_version",
          entityId: versionRow.versionId,
          uploadedBy: session.user.email ?? session.user.name ?? "unknown",
        })
        .returning({ id: driveFiles.id });

      const [assetRow] = await tx
        .insert(brandStoryAssets)
        .values({
          versionId,
          moduleId,
          asinItemId,
          kind,
          driveFileId: fileRow.id,
          filename,
        })
        .returning({ id: brandStoryAssets.id });

      // Bump version updated_at so polling clients notice.
      await tx
        .update(brandStoryVersions)
        .set({ updatedAt: new Date() })
        .where(eq(brandStoryVersions.id, versionId));

      return {
        assetId: assetRow.id,
        driveFileGid: uploadedGid,
        filename,
      };
    });

    // 8. Best-effort delete of the replaced Drive file (after DB commit).
    if (existing) {
      try {
        await driveClient.deleteFile(existing.driveFileGid);
      } catch (cleanupErr) {
        const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(
          `[brand-story assets POST] Old Drive file ${existing.driveFileGid} could not be deleted: ${m}. ` +
            "Leaving as orphan; DB is consistent."
        );
      }
    }

    return NextResponse.json({ ok: true, asset: inserted });
  } catch (err) {
    // DB failed after we already pushed to Drive. Roll back Drive by deleting the new file.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand-story assets POST] DB insert failed:", msg);
    try {
      await driveClient.deleteFile(uploadedGid);
    } catch (cleanupErr) {
      console.error("[brand-story assets POST] new file cleanup failed:", cleanupErr);
    }
    return NextResponse.json(
      { error: `DB insert failed: ${msg}` },
      { status: 500 }
    );
  }
}
