/**
 * POST /api/storefront/modules/[moduleId]/tiles/[tileId]/asset/session
 *
 * Mints a Drive resumable upload URI for a split-section tile image.
 */
import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth-db";
import { getErrorMessage } from "@/lib/api-utils";
import { driveClient } from "@/lib/drive-client";
import { hasAdminPowers } from "@/lib/roles";
import { prepareTileAsset } from "@/lib/storefront/asset-upload";

export const maxDuration = 60;

async function authorize() {
  const session = await getAuthSession();
  if (!session) return null;
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") return null;
  return session;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string; tileId: string }> }
) {
  const session = await authorize();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId, tileId } = await params;
  let body: {
    mimeType?: string;
    fileSize?: number;
    width?: number;
    height?: number;
    originalName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mimeType = body.mimeType?.trim() || "";
  const fileSize = Number(body.fileSize);
  if (!mimeType) return NextResponse.json({ error: "Missing mimeType" }, { status: 400 });
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Missing or invalid fileSize" }, { status: 400 });
  }

  const prepared = await prepareTileAsset({
    moduleId,
    tileId,
    mime: mimeType,
    bytes: fileSize,
    width: body.width,
    height: body.height,
    originalName: body.originalName,
  });
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }

  try {
    const origin = req.headers.get("origin") ?? undefined;
    const sessionUri = await driveClient.createResumableSession(
      prepared.filename,
      prepared.folderGid,
      prepared.mime,
      fileSize,
      origin
    );
    return NextResponse.json({
      sessionUri,
      filename: prepared.filename,
      warnings: prepared.warnings,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[storefront tile asset/session] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
