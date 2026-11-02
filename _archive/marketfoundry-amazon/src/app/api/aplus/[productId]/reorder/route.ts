import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusModules, aplusModuleImages, driveFiles } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";

export const maxDuration = 60;

/** Replace _M{#}_ segment in a filename with a new module number */
function renameModSegment(filename: string, newModNum: number): string {
  return filename.replace(/_M\d+_/, `_M${newModNum}_`);
}

/** Check if a filename follows SOP naming (contains _M{#}_ segment) */
function isSopNamed(filename: string): boolean {
  return /_M\d+_/.test(filename);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;
  const body = await req.json();
  const { order } = body as { order: Array<{ id: string; moduleNumber: number }> };

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json(
      { error: "order must be a non-empty array" },
      { status: 400 }
    );
  }

  // ── Step 1: Read current module positions (before reorder) ──
  const moduleIds = order.map((o) => o.id);
  const currentModules = await db
    .select({
      id: aplusModules.id,
      moduleNumber: aplusModules.moduleNumber,
    })
    .from(aplusModules)
    .where(inArray(aplusModules.id, moduleIds));

  const oldPositionById = new Map(
    currentModules.map((m) => [m.id, m.moduleNumber])
  );

  // ── Step 2: Update DB positions (two-pass to avoid unique constraint) ──
  await db.transaction(async (tx) => {
    // Pass 1: set temporary negative values
    for (let i = 0; i < order.length; i++) {
      const { id } = order[i];
      await tx
        .update(aplusModules)
        .set({ moduleNumber: -(i + 1) })
        .where(
          and(eq(aplusModules.id, id), eq(aplusModules.productId, productId))
        );
    }

    // Pass 2: set final moduleNumber values
    for (const { id, moduleNumber } of order) {
      await tx
        .update(aplusModules)
        .set({ moduleNumber, updatedAt: new Date() })
        .where(
          and(eq(aplusModules.id, id), eq(aplusModules.productId, productId))
        );
    }
  });

  // ── Step 3: Rename Drive files for modules whose position changed ──
  const renameErrors: string[] = [];
  let renameCount = 0;

  for (const { id, moduleNumber: newPosition } of order) {
    const oldPosition = oldPositionById.get(id);
    if (oldPosition === newPosition) continue; // Position unchanged

    // Get all images for this module that have Drive files
    const images = await db
      .select({
        driveFileId: aplusModuleImages.driveFileId,
        mobileDriveFileId: aplusModuleImages.mobileDriveFileId,
      })
      .from(aplusModuleImages)
      .where(eq(aplusModuleImages.moduleId, id));

    // Collect all Drive file IDs to rename
    const driveFileIds: string[] = [];
    for (const img of images) {
      if (img.driveFileId) driveFileIds.push(img.driveFileId);
      if (img.mobileDriveFileId) driveFileIds.push(img.mobileDriveFileId);
    }

    // Rename each file in Drive
    for (const fileId of driveFileIds) {
      try {
        const file = await driveClient.getFile(fileId, "id,name");
        if (!isSopNamed(file.name)) continue; // Skip non-SOP files

        const newName = renameModSegment(file.name, newPosition);
        if (newName !== file.name) {
          await driveClient.renameFile(fileId, newName);

          // Update display name in driveFiles DB table
          await db
            .update(driveFiles)
            .set({ displayName: newName })
            .where(eq(driveFiles.driveFileId, fileId));

          renameCount++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[reorder] Failed to rename Drive file ${fileId}:`, msg);
        renameErrors.push(fileId);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    driveRenames: renameCount,
    driveRenameErrors: renameErrors.length > 0 ? renameErrors : undefined,
  });
}
