// ═══════════════════════════════════════════════════════════════
// POST /api/design/listing-images/upload-session
//
// Initiates a Drive resumable upload session for a listing-image slot. The
// browser then PUTs the bytes straight to the returned session URI, so the file
// never passes through Vercel and is not subject to its ~4.5 MB request-body
// cap. After the PUT, the client calls ./upload/record to persist the rows.
//
// Same pattern as /api/drive/upload-session + brand-logo-uploader, but using the
// listing-image folder/version rules in @/lib/listing-image-upload.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { hasAdminPowers } from "@/lib/roles";
import { getErrorMessage } from "@/lib/api-utils";
import { isListingImageSlot } from "@/lib/listing-image-slots";
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

    const body = (await req.json()) as {
      clientIdCode?: string;
      productId?: string;
      columnName?: string;
      mimeType?: string;
      fileSize?: number;
    };

    const clientIdCode = body.clientIdCode?.trim();
    const productId = body.productId?.trim();
    const columnName = body.columnName?.trim();
    const mimeType = body.mimeType?.trim() || "application/octet-stream";
    const fileSize = Number(body.fileSize);

    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
    }
    if (!productId || !columnName) {
      return NextResponse.json({ error: "Missing productId or columnName" }, { status: 400 });
    }
    if (!isListingImageSlot(columnName)) {
      return NextResponse.json({ error: "Invalid image slot" }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Missing or invalid fileSize" }, { status: 400 });
    }

    const target = await resolveListingImageTarget({
      productId,
      clientIdCode,
      columnName,
      mimeType,
    });
    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status });
    }

    // Forward the browser's Origin so Drive puts CORS headers on the session
    // URI's responses — without it the browser's PUT is blocked by CORS.
    const origin = req.headers.get("origin") ?? undefined;

    const sessionUri = await driveClient.createResumableSession(
      target.displayName,
      target.folderDriveId,
      mimeType,
      fileSize,
      origin
    );

    return NextResponse.json({
      sessionUri,
      displayName: target.displayName,
      versionNumber: target.versionNumber,
      folderId: target.folderDbId,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[listing-images/upload-session] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
