import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/aplus2/modules/[moduleId]/reorder
 *
 * Body: { positions: [{ moduleId, position }, ...] }
 *
 * Bulk-updates positions for every module on the version. Renames every
 * Drive file whose M## position changed (two-phase, so swaps do not
 * collide). The URL [moduleId] is a holder — the body carries the order.
 *
 * Locking strategy: positions update happens in a single DB transaction
 * using a two-phase swap (set positions to negative first to avoid the
 * UNIQUE(version_id, position) constraint, then to the target values).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Assets,
  aplus2Modules,
  aplus2Versions,
  driveFiles,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import {
  aplus2RenameModuleSegment,
  aplus2TempReorderFilename,
} from "@/lib/aplus2/drive-naming";

const schema = z.strictObject({
  positions: z
    .array(
      z.strictObject({
        moduleId: z.string().uuid(),
        position: z.number().int().min(1).max(7),
      })
    )
    .min(1),
});

export async function POST(
  req: NextRequest,
  { params: _params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid body", details: body.error.flatten() },
      { status: 400 }
    );
  }
  const { positions } = body.data;
  const posNumbers = positions.map((p) => p.position);
  if (new Set(posNumbers).size !== posNumbers.length) {
    return NextResponse.json({ error: "Duplicate positions" }, { status: 400 });
  }

  // Confirm all modules belong to the same version and the payload is complete.
  const ids = positions.map((p) => p.moduleId);
  const existing = await db
    .select({
      id: aplus2Modules.id,
      versionId: aplus2Modules.versionId,
      position: aplus2Modules.position,
      moduleType: aplus2Modules.moduleType,
    })
    .from(aplus2Modules)
    .where(inArray(aplus2Modules.id, ids));
  if (existing.length !== positions.length) {
    return NextResponse.json(
      { error: "Some moduleIds not found" },
      { status: 400 }
    );
  }
  const versionIds = [...new Set(existing.map((m) => m.versionId))];
  if (versionIds.length !== 1) {
    return NextResponse.json(
      { error: "All modules must belong to the same version" },
      { status: 400 }
    );
  }
  const versionId = versionIds[0];

  const allOnVersion = await db
    .select({ id: aplus2Modules.id })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.versionId, versionId));
  if (allOnVersion.length !== positions.length) {
    return NextResponse.json(
      { error: "positions must include every module on the version" },
      { status: 400 }
    );
  }

  const newPosByModule = new Map(
    positions.map((p) => [p.moduleId, p.position] as const)
  );
  const oldPosByModule = new Map(
    existing.map((m) => [m.id, m.position] as const)
  );
  const changed = existing.filter(
    (m) => newPosByModule.get(m.id) !== oldPosByModule.get(m.id)
  );

  if (changed.length === 0) {
    return NextResponse.json({ ok: true, renamed: 0 });
  }

  await db.transaction(async (tx) => {
    for (const m of changed) {
      await tx
        .update(aplus2Modules)
        .set({ position: -1 - existing.indexOf(m), updatedAt: new Date() })
        .where(eq(aplus2Modules.id, m.id));
    }
    for (const m of changed) {
      const newPos = newPosByModule.get(m.id)!;
      await tx
        .update(aplus2Modules)
        .set({ position: newPos, updatedAt: new Date() })
        .where(eq(aplus2Modules.id, m.id));
    }
    await tx
      .update(aplus2Versions)
      .set({ updatedAt: new Date() })
      .where(eq(aplus2Versions.id, versionId));
  });

  const changedIds = [...changed.map((m) => m.id)];
  const assets = await db
    .select({
      assetId: aplus2Assets.id,
      moduleId: aplus2Assets.moduleId,
      filename: aplus2Assets.filename,
      driveFileRowId: aplus2Assets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(
      and(
        eq(aplus2Assets.versionId, versionId),
        inArray(aplus2Assets.moduleId, changedIds)
      )
    );

  const pending = assets.flatMap((a) => {
    const newPosition = newPosByModule.get(a.moduleId!);
    if (!newPosition) return [];
    const newFilename = aplus2RenameModuleSegment(a.filename, newPosition);
    if (newFilename === a.filename) return [];
    return [{ ...a, newFilename }];
  });

  // Phase 1: unique temp names so M01 ↔ M02 swaps do not collide in Drive.
  for (const a of pending) {
    const token = a.assetId.replace(/-/g, "").slice(0, 8);
    const tempName = aplus2TempReorderFilename(a.filename, token);
    if (tempName === a.filename) continue;
    try {
      await driveClient.renameFile(a.driveFileGid, tempName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[aplus2 reorder] temp rename of ${a.driveFileGid} → ${tempName} failed: ${msg}`
      );
    }
  }

  let renamed = 0;
  const renameErrors: string[] = [];
  for (const a of pending) {
    try {
      await driveClient.renameFile(a.driveFileGid, a.newFilename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[aplus2 reorder] rename of ${a.driveFileGid} → ${a.newFilename} failed: ${msg}`
      );
      renameErrors.push(a.driveFileGid);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(aplus2Assets)
        .set({ filename: a.newFilename })
        .where(eq(aplus2Assets.id, a.assetId));
      await tx
        .update(driveFiles)
        .set({ displayName: a.newFilename })
        .where(eq(driveFiles.id, a.driveFileRowId));
    });
    renamed++;
  }

  return NextResponse.json({
    ok: true,
    renamed,
    renameErrors: renameErrors.length > 0 ? renameErrors : undefined,
  });
}
