import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/design-status/upload-brand-story
 *
 * Creates a new brand story version for the client.
 * Each call:
 *   - Allocates the next version_number (per client).
 *   - Creates a Drive subfolder named {CLIENT}_Brandstory_V## under the
 *     client's existing `brand_story` parent folder.
 *   - Uploads the screenview image as {slug}_screenview.{ext} into it.
 *   - Inserts drive_folders, brand_story_versions, drive_files, and a
 *     brand_story_assets (kind='screenview') row inside one DB transaction.
 *
 * If any step fails after the Drive subfolder is created, the subfolder is
 * trashed (best-effort) to avoid orphaned Drive resources.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  brandStoryAssets,
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

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const clientIdCode = formData.get("clientIdCode");
  const file = formData.get("file");

  if (typeof clientIdCode !== "string" || !clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const ext = ALLOWED_MIME[file.type.toLowerCase()];
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported mime type "${file.type}". Allowed: image/png, image/jpeg, image/webp.` },
      { status: 415 }
    );
  }

  // 1. Resolve the root brand_story folder as the parent for new version subfolders.
  const [parentFolder] = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, clientIdCode),
        eq(driveFolders.folderType, "brand_story")
      )
    )
    .limit(1);

  if (!parentFolder) {
    return NextResponse.json(
      { error: `No brand_story Drive folder found for client ${clientIdCode}` },
      { status: 404 }
    );
  }

  // 2. Allocate the next version number.
  const [maxRow] = await db
    .select({
      maxV: sql<number>`COALESCE(MAX(${brandStoryVersions.versionNumber}), 0)::int`,
    })
    .from(brandStoryVersions)
    .where(eq(brandStoryVersions.clientIdCode, clientIdCode));
  const versionNumber = (maxRow?.maxV ?? 0) + 1;
  const versionPadded = String(versionNumber).padStart(2, "0");
  const slug = `${clientIdCode}_Brandstory_V${versionPadded}`;
  const screenviewName = `${slug}_screenview.${ext}`;
  // Master-files subfolder follows the same naming convention as the screenview
  // (underscore-joined): {slug}_Master_Files. Created empty up-front so master
  // uploads have a home from the moment the process starts.
  const masterSubfolderName = `${slug}_Master_Files`;

  // 3. Create the Drive subfolder.
  let createdDriveFolderId: string | null = null;
  let createdMasterFolderId: string | null = null;
  let uploadedDriveFileId: string | null = null;

  try {
    const driveFolder = await driveClient.createFolder(slug, parentFolder.driveFolderId);
    createdDriveFolderId = driveFolder.id;

    // 4. Upload the screenview file into the new subfolder.
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await driveClient.uploadFile(
      screenviewName,
      driveFolder.id,
      buffer,
      file.type
    );
    uploadedDriveFileId = uploaded.id;

    // 5. Eager-create the (empty) Master Files subfolder inside the version folder.
    const masterFolder = await driveClient.createFolder(
      masterSubfolderName,
      driveFolder.id
    );
    createdMasterFolderId = masterFolder.id;

    // 6. Insert all DB rows in a transaction.
    const result = await db.transaction(async (tx) => {
      const [folderRow] = await tx
        .insert(driveFolders)
        .values({
          clientIdCode,
          driveFolderId: driveFolder.id,
          folderType: "brand_story_version",
          path: `${parentFolder.path}/${slug}`,
          parentFolderId: parentFolder.id,
          name: slug,
        })
        .returning({ id: driveFolders.id });

      await tx.insert(driveFolders).values({
        clientIdCode,
        driveFolderId: masterFolder.id,
        folderType: "brand_story_master",
        path: `${parentFolder.path}/${slug}/${masterSubfolderName}`,
        parentFolderId: folderRow.id,
        name: masterSubfolderName,
      });

      const [versionRow] = await tx
        .insert(brandStoryVersions)
        .values({
          clientIdCode,
          versionNumber,
          driveFolderId: folderRow.id,
        })
        .returning({
          id: brandStoryVersions.id,
          versionNumber: brandStoryVersions.versionNumber,
          status: brandStoryVersions.status,
        });

      const [fileRow] = await tx
        .insert(driveFiles)
        .values({
          driveFileId: uploaded.id,
          folderId: folderRow.id,
          originalName: file.name,
          displayName: screenviewName,
          mimeType: file.type,
          sizeBytes: file.size,
          entityType: "brand_story_version",
          entityId: versionRow.id,
          uploadedBy: session.user.email ?? session.user.name ?? "unknown",
        })
        .returning({ id: driveFiles.id });

      await tx.insert(brandStoryAssets).values({
        versionId: versionRow.id,
        kind: "screenview",
        driveFileId: fileRow.id,
        filename: screenviewName,
      });

      return { versionId: versionRow.id, versionNumber: versionRow.versionNumber };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const base = err instanceof Error ? err.message : String(err);
    // Drizzle wraps the driver error; the real Postgres reason (e.g. the
    // unique-constraint name) lives on err.cause. Surface it so the toast is
    // actionable instead of just echoing the failed query.
    const cause =
      err instanceof Error && err.cause instanceof Error ? ` — ${err.cause.message}` : "";
    const msg = base + cause;
    console.error("[upload-brand-story] failed:", msg);

    // Best-effort cleanup so we don't leave orphan Drive resources.
    if (uploadedDriveFileId) {
      try {
        await driveClient.deleteFile(uploadedDriveFileId);
      } catch (cleanupErr) {
        console.error("[upload-brand-story] cleanup file delete failed:", cleanupErr);
      }
    }
    if (createdMasterFolderId) {
      try {
        await driveClient.deleteFile(createdMasterFolderId);
      } catch (cleanupErr) {
        console.error("[upload-brand-story] cleanup master folder delete failed:", cleanupErr);
      }
    }
    if (createdDriveFolderId) {
      try {
        await driveClient.deleteFile(createdDriveFolderId);
      } catch (cleanupErr) {
        console.error("[upload-brand-story] cleanup folder delete failed:", cleanupErr);
      }
    }

    return NextResponse.json(
      { error: `Failed to create brand story version: ${msg}` },
      { status: 500 }
    );
  }
}
