import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Assets, aplus2Modules, aplus2Versions, driveFiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { assetId } = await params;
  const [asset] = await db
    .select({
      assetId: aplus2Assets.id,
      versionId: aplus2Assets.versionId,
      moduleId: aplus2Assets.moduleId,
      kind: aplus2Assets.kind,
      driveFileRowId: aplus2Assets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(eq(aplus2Assets.id, assetId))
    .limit(1);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(aplus2Assets).where(eq(aplus2Assets.id, asset.assetId));
    await tx.delete(driveFiles).where(eq(driveFiles.id, asset.driveFileRowId));
    if (asset.kind === "video" && asset.moduleId) {
      await tx.update(aplus2Modules).set({ videoDriveFileId: null, updatedAt: new Date() }).where(eq(aplus2Modules.id, asset.moduleId));
    }
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, asset.versionId));
  });

  try { await driveClient.deleteFile(asset.driveFileGid); }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[aplus2 DELETE asset] file ${asset.driveFileGid} trash failed: ${msg}`);
  }

  return NextResponse.json({ ok: true });
}
