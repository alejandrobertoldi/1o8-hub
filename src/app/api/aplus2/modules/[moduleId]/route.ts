import { hasAdminPowers } from "@/lib/roles";
/**
 * PATCH  /api/aplus2/modules/[moduleId]
 *   Partial update of shared text columns, status, layout knobs.
 *   Validated via validateModulePatch() — caps + allowed-fields per
 *   module type.
 *
 * DELETE /api/aplus2/modules/[moduleId]
 *   Cascade-deletes items + assets, trashes the module's Drive files
 *   best-effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Assets, aplus2Modules, aplus2Versions, driveFiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { validateModulePatch, type ModulePatchInput } from "@/lib/aplus2/zod-schemas";
import type { Aplus2ModuleType } from "@/lib/aplus2/module-specs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const body = (await req.json().catch(() => null)) as ModulePatchInput | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const [moduleRow] = await db
    .select({ id: aplus2Modules.id, versionId: aplus2Modules.versionId, moduleType: aplus2Modules.moduleType })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!moduleRow) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const check = validateModulePatch(moduleRow.moduleType as Aplus2ModuleType, body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "headlineText", "subheadlineText", "bodyText", "overlayText",
    "altText", "mobileAltText", "imageDescription", "aiImagePrompt", "cosmoRelationType",
    "videoTitle", "videoDescription", "videoDriveFileId",
    "textPosition", "fontColor", "figmaUrl", "markupUrl", "status",
  ] as const) {
    const v = body[key];
    if (v !== undefined) updates[key] = v;
  }

  await db.transaction(async (tx) => {
    await tx.update(aplus2Modules).set(updates).where(eq(aplus2Modules.id, moduleId));
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, moduleRow.versionId));
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  // Collect drive_files attached to this module's assets before cascade.
  const assets = await db
    .select({ driveFileRowId: aplus2Assets.driveFileId, driveFileGid: driveFiles.driveFileId })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(eq(aplus2Assets.moduleId, moduleId));

  const [moduleRow] = await db
    .select({ id: aplus2Modules.id, versionId: aplus2Modules.versionId })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!moduleRow) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const driveFileRowIds = assets.map((a) => a.driveFileRowId);
  const driveGids = assets.map((a) => a.driveFileGid);

  await db.transaction(async (tx) => {
    if (driveFileRowIds.length > 0) {
      await tx.delete(driveFiles).where(inArray(driveFiles.id, driveFileRowIds));
    }
    await tx.delete(aplus2Modules).where(eq(aplus2Modules.id, moduleId));
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, moduleRow.versionId));
  });

  for (const gid of driveGids) {
    try { await driveClient.deleteFile(gid); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aplus2 DELETE module] file ${gid} trash failed: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true });
}
