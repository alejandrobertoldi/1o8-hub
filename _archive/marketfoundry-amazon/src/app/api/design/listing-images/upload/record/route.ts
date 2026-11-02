// ═══════════════════════════════════════════════════════════════
// POST /api/design/listing-images/upload/record
//
// Persists a listing-image slot version after the browser has PUT the bytes
// directly to a Drive resumable session URI. Only metadata crosses Vercel here,
// so there is no body-size concern.
//
// Mirrors the record step used by brand-logo-uploader.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { driveFiles, listingImageSlotVersions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { getErrorMessage } from "@/lib/api-utils";
import { isListingImageSlot } from "@/lib/listing-image-slots";

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

    const body = (await req.json()) as {
      driveFileId?: string;
      folderId?: string;
      displayName?: string;
      originalName?: string;
      mimeType?: string;
      sizeBytes?: number;
      clientIdCode?: string;
      productId?: string;
      columnName?: string;
      versionNumber?: number;
    };

    const driveFileId = body.driveFileId?.trim();
    const folderId = body.folderId?.trim();
    const displayName = body.displayName?.trim();
    const clientIdCode = body.clientIdCode?.trim();
    const productId = body.productId?.trim();
    const columnName = body.columnName?.trim();
    const versionNumber = Number(body.versionNumber);
    const sizeBytes = Number(body.sizeBytes);

    if (!driveFileId || !folderId || !displayName) {
      return NextResponse.json(
        { error: "Missing driveFileId, folderId or displayName" },
        { status: 400 }
      );
    }
    if (!clientIdCode || !productId || !columnName) {
      return NextResponse.json(
        { error: "Missing clientIdCode, productId or columnName" },
        { status: 400 }
      );
    }
    if (!isListingImageSlot(columnName)) {
      return NextResponse.json({ error: "Invalid image slot" }, { status: 400 });
    }
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      return NextResponse.json({ error: "Missing or invalid versionNumber" }, { status: 400 });
    }

    const [driveFileRow] = await db
      .insert(driveFiles)
      .values({
        driveFileId,
        folderId,
        originalName: body.originalName ?? displayName,
        displayName,
        mimeType: body.mimeType ?? "application/octet-stream",
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
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
      versionNumber,
      driveFileId: driveFileRow.id,
      createdBy: session.user.email!,
    });

    return NextResponse.json({ driveFileId, displayName, versionNumber });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[listing-images/upload/record] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
