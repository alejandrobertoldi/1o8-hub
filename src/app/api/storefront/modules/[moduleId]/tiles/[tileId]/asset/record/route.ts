/**
 * POST /api/storefront/modules/[moduleId]/tiles/[tileId]/asset/record
 *
 * After the browser PUTs bytes to Drive, persist the new file id on the tile.
 */
import { NextRequest, NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth-db";
import { getErrorMessage } from "@/lib/api-utils";
import { hasAdminPowers } from "@/lib/roles";
import { commitTileAsset, prepareTileAsset } from "@/lib/storefront/asset-upload";

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
    driveFileId?: string;
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

  const driveFileId = body.driveFileId?.trim();
  const mimeType = body.mimeType?.trim() || "";
  const fileSize = Number(body.fileSize);
  if (!driveFileId) return NextResponse.json({ error: "Missing driveFileId" }, { status: 400 });
  if (!mimeType) return NextResponse.json({ error: "Missing mimeType" }, { status: 400 });
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Missing or invalid fileSize" }, { status: 400 });
  }

  try {
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

    const committed = await commitTileAsset(prepared, driveFileId);
    if (!committed.ok) {
      return NextResponse.json({ error: committed.error }, { status: committed.status });
    }

    return NextResponse.json({ driveFileId, warnings: prepared.warnings });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[storefront tile asset/record] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
