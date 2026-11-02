import { hasAdminPowers } from "@/lib/roles";
/**
 * DELETE /api/design-status/brand-story-versions/[versionId]/assets/[assetId]
 *
 * Removes a brand-story asset slot binding and the underlying Drive file.
 * Used when the user clears a background, focus image, logo, or ASIN image.
 * (The screenview is removed together with the version itself.)
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { brandStoryAssets, brandStoryVersions, driveFiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ versionId: string; assetId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId, assetId } = await params;

  const [row] = await db
    .select({
      kind: brandStoryAssets.kind,
      driveFileRowId: brandStoryAssets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(brandStoryAssets)
    .innerJoin(driveFiles, eq(driveFiles.id, brandStoryAssets.driveFileId))
    .where(
      and(eq(brandStoryAssets.id, assetId), eq(brandStoryAssets.versionId, versionId))
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (row.kind === "screenview") {
    return NextResponse.json(
      { error: "Cannot delete the screenview directly — delete the version instead." },
      { status: 400 }
    );
  }

  // Deleting drive_files cascades to brand_story_assets via FK.
  await db.transaction(async (tx) => {
    await tx.delete(driveFiles).where(eq(driveFiles.id, row.driveFileRowId));
    await tx
      .update(brandStoryVersions)
      .set({ updatedAt: new Date() })
      .where(eq(brandStoryVersions.id, versionId));
  });

  // Best-effort delete from Drive. If this fails the DB is still consistent;
  // we just leak a single file.
  try {
    await driveClient.deleteFile(row.driveFileGid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[brand-story assets DELETE] Drive delete failed for ${row.driveFileGid}: ${msg}. ` +
        "DB row removed; leaving as Drive orphan."
    );
  }

  return NextResponse.json({ ok: true });
}
