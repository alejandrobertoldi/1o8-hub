// ═══════════════════════════════════════════════════════════════
// POST /api/design/listing-images/upload
//
// Direct multipart upload for listing-image slots. Only viable up to
// MAX_LISTING_IMAGE_BYTES — Vercel rejects larger request bodies at the edge
// before this function runs. Bigger files go through ../upload-session, where
// the browser PUTs straight to Drive.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { driveFiles, listingImageSlotVersions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { getErrorMessage } from "@/lib/api-utils";
import { hasAdminPowers } from "@/lib/roles";
import {
  isListingImageSlot,
  MAX_LISTING_IMAGE_BYTES,
  bytesToMb,
} from "@/lib/listing-image-slots";
import { resolveListingImageTarget } from "@/lib/listing-image-upload";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "editor" && !hasAdminPowers(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const clientIdCode = (form.get("clientIdCode") as string | null)?.trim();
    const productId = (form.get("productId") as string | null)?.trim();
    const columnName = (form.get("columnName") as string | null)?.trim();

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
    }
    if (!productId || !columnName) {
      return NextResponse.json({ error: "Missing productId or columnName" }, { status: 400 });
    }
    if (!isListingImageSlot(columnName)) {
      return NextResponse.json({ error: "Invalid image slot" }, { status: 400 });
    }

    if (file.size > MAX_LISTING_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: `${file.name} is ${bytesToMb(file.size)} MB. Maximum for a direct upload is ${bytesToMb(
            MAX_LISTING_IMAGE_BYTES
          )} MB.`,
        },
        { status: 413 }
      );
    }

    const target = await resolveListingImageTarget({
      productId,
      clientIdCode,
      columnName,
      mimeType: file.type,
    });
    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status });
    }

    // Always upload as new Drive file — each version gets a unique name
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await driveClient.uploadFile(
      target.displayName,
      target.folderDriveId,
      buffer,
      file.type
    );
    const driveFileId = uploaded.id;

    const [driveFileRow] = await db
      .insert(driveFiles)
      .values({
        driveFileId: driveFileId,
        folderId: target.folderDbId,
        originalName: file.name,
        displayName: target.displayName,
        mimeType: file.type,
        sizeBytes: file.size,
        entityType: "listing_image",
        entityId: productId,
        uploadedBy: session.user.email!,
      })
      .returning({ id: driveFiles.id });

    if (!driveFileRow) {
      throw new Error("drive_files insert returned no row");
    }

    await db.insert(listingImageSlotVersions).values({
      clientIdCode,
      productId,
      slot: columnName,
      versionNumber: target.versionNumber,
      driveFileId: driveFileRow.id,
      createdBy: session.user.email!,
    });

    return NextResponse.json({
      driveFileId,
      displayName: target.displayName,
      versionNumber: target.versionNumber,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[listing-images/upload] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
