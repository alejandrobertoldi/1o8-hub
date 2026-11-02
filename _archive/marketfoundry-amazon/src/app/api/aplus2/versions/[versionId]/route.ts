import { hasAdminPowers } from "@/lib/roles";
/**
 * PATCH  /api/aplus2/versions/[versionId]
 *   Body: { status: "not_started"|"in_progress"|"in_review"|"approved"|"live"|"discontinued" }
 *   Updates the version-level status only. (Modules are patched via
 *   /api/aplus2/modules/[moduleId].)
 *
 * DELETE /api/aplus2/versions/[versionId]
 *   Cascade-deletes the version + its modules + items + assets, deletes the
 *   drive_folders row, trashes the Drive subfolder best-effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Versions, driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { APLUS2_VERSION_STATUSES } from "@/lib/aplus2/zod-schemas";
import { siblingShouldBecomeDiscontinued } from "@/lib/design-live-versions";

const patchSchema = z.strictObject({
  status: z.enum(APLUS2_VERSION_STATUSES),
});

export async function PATCH(
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
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body", details: body.error.flatten() }, { status: 400 });
  }

  try {
    const [versionRow] = await db
      .select({
        id: aplus2Versions.id,
        setId: aplus2Versions.setId,
        versionNumber: aplus2Versions.versionNumber,
        contentType: aplus2Versions.contentType,
      })
      .from(aplus2Versions)
      .where(eq(aplus2Versions.id, versionId))
      .limit(1);
    if (!versionRow) return NextResponse.json({ error: "Version not found" }, { status: 404 });

    await db
      .update(aplus2Versions)
      .set({ status: body.data.status, updatedAt: new Date() })
      .where(eq(aplus2Versions.id, versionId));

    if (body.data.status === "live") {
      const siblings = await db
        .select({
          id: aplus2Versions.id,
          versionNumber: aplus2Versions.versionNumber,
          status: aplus2Versions.status,
          contentType: aplus2Versions.contentType,
        })
        .from(aplus2Versions)
        .where(eq(aplus2Versions.setId, versionRow.setId));
      const discontinueIds = siblings
        .filter(
          (s) =>
            s.id !== versionId &&
            s.contentType === versionRow.contentType &&
            siblingShouldBecomeDiscontinued({
              siblingVersionNumber: s.versionNumber,
              siblingStatus: s.status,
              liveVersionNumber: versionRow.versionNumber,
            })
        )
        .map((s) => s.id);
      if (discontinueIds.length > 0) {
        await db
          .update(aplus2Versions)
          .set({ status: "discontinued", updatedAt: new Date() })
          .where(inArray(aplus2Versions.id, discontinueIds));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
    return NextResponse.json(
      { error: cause ? `${msg} (${cause})` : msg },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;

  const [versionRow] = await db
    .select({
      id: aplus2Versions.id,
      folderRowId: aplus2Versions.driveFolderId,
      folderGid: driveFolders.driveFolderId,
    })
    .from(aplus2Versions)
    .leftJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!versionRow) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(aplus2Versions).where(eq(aplus2Versions.id, versionId));
    if (versionRow.folderRowId) {
      await tx.delete(driveFolders).where(eq(driveFolders.id, versionRow.folderRowId));
    }
  });

  if (versionRow.folderGid) {
    try { await driveClient.deleteFile(versionRow.folderGid); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aplus2 DELETE version] folder ${versionRow.folderGid} trash failed: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true });
}
