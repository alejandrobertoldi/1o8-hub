import { hasAdminPowers } from "@/lib/roles";
/**
 * DELETE /api/aplus2/sets/[setId]
 *
 * Cascade-deletes the set (versions/modules/items/assets via FK) and
 * trashes every version's Drive subfolder. drive_folders rows for those
 * subfolders are removed in the same transaction.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Sets, aplus2Versions, driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { setId } = await params;

  const versionRows = await db
    .select({
      versionId: aplus2Versions.id,
      folderRowId: aplus2Versions.driveFolderId,
      folderGid: driveFolders.driveFolderId,
    })
    .from(aplus2Versions)
    .leftJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .where(eq(aplus2Versions.setId, setId));

  const [setRow] = await db
    .select({ id: aplus2Sets.id })
    .from(aplus2Sets)
    .where(eq(aplus2Sets.id, setId))
    .limit(1);
  if (!setRow) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(aplus2Sets).where(eq(aplus2Sets.id, setId));
    const folderRowIds = versionRows.map((r) => r.folderRowId).filter((id): id is string => !!id);
    if (folderRowIds.length > 0) {
      await tx.delete(driveFolders).where(inArray(driveFolders.id, folderRowIds));
    }
  });

  for (const r of versionRows) {
    if (!r.folderGid) continue;
    try { await driveClient.deleteFile(r.folderGid); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aplus2 DELETE set] folder ${r.folderGid} trash failed: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, versionsDeleted: versionRows.length });
}
