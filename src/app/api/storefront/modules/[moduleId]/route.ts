/**
 * PATCH  /api/storefront/modules/[moduleId]
 *   Body: any subset of { title, linkUrl, linkLabel, position }
 *   Partial update. If position is present and changed, renumbers siblings
 *   within the same page inside a transaction to satisfy unique(pageId, position).
 *   Returns the updated module row.
 *
 * DELETE /api/storefront/modules/[moduleId]
 *   Best-effort trashes the Drive file (if present), then deletes the row.
 *   Returns { ok: true }.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt, gte, lte, lt, count, sql, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontModules, storefrontModuleTiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { SECTION_LAYOUTS, SPLIT_LAYOUTS, splitTileCount } from "@/lib/storefront/module-specs";

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Load the module
  const [mod] = await db
    .select()
    .from(storefrontModules)
    .where(eq(storefrontModules.id, moduleId))
    .limit(1);

  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  // Build scalar field updates (title / linkUrl / linkLabel / containsAiPeople / sectionLayout)
  const scalarUpdates: Partial<typeof storefrontModules.$inferInsert> = {};
  if ("title" in body) scalarUpdates.title = body.title ?? null;
  if ("linkUrl" in body) scalarUpdates.linkUrl = body.linkUrl ?? null;
  if ("linkLabel" in body) scalarUpdates.linkLabel = body.linkLabel ?? null;
  if ("containsAiPeople" in body) scalarUpdates.containsAiPeople = Boolean(body.containsAiPeople);
  if ("sectionLayout" in body) {
    if (body.sectionLayout !== null && body.sectionLayout !== undefined) {
      const allowed =
        mod.moduleType === "split_section"
          ? (Object.keys(SPLIT_LAYOUTS) as string[])
          : (SECTION_LAYOUTS as readonly string[]);
      if (!allowed.includes(body.sectionLayout)) {
        return NextResponse.json(
          { error: `Invalid sectionLayout. Must be one of: ${allowed.join(", ")}` },
          { status: 400 }
        );
      }
      scalarUpdates.sectionLayout = body.sectionLayout;
    } else {
      scalarUpdates.sectionLayout = null;
    }
  }

  // Handle position reorder
  const newPosRaw: number | undefined = typeof body.position === "number" ? body.position : undefined;

  if (newPosRaw !== undefined && newPosRaw !== mod.position) {
    // Count total modules on this page to clamp
    const [{ total }] = await db
      .select({ total: count() })
      .from(storefrontModules)
      .where(eq(storefrontModules.pageId, mod.pageId));

    const count_ = Number(total);
    const newPos = Math.max(1, Math.min(newPosRaw, count_));
    const oldPos = mod.position;

    if (newPos !== oldPos) {
      // Fetch all affected rows so we can compute final positions and park
      // each at a distinct negative slot. This two-phase approach guarantees
      // the unique(pageId, position) constraint is never transiently violated
      // regardless of the row-processing order Postgres chooses within an UPDATE.
      const affectedRows = await db
        .select({ id: storefrontModules.id, position: storefrontModules.position })
        .from(storefrontModules)
        .where(
          and(
            eq(storefrontModules.pageId, mod.pageId),
            newPos > oldPos
              ? and(gt(storefrontModules.position, oldPos), lte(storefrontModules.position, newPos))
              : and(gte(storefrontModules.position, newPos), lt(storefrontModules.position, oldPos))
          )
        );

      // Build the final-position map: moved row → newPos; siblings shift by ±1.
      const finalPos = new Map<string, number>();
      finalPos.set(moduleId, newPos);
      for (const r of affectedRows) {
        if (r.id === moduleId) continue;
        finalPos.set(r.id, newPos > oldPos ? r.position - 1 : r.position + 1);
      }

      // All rows that need to move (moved row + affected siblings).
      const allChanged = [{ id: moduleId, position: oldPos }, ...affectedRows.filter(r => r.id !== moduleId)];

      await db.transaction(async (tx) => {
        // Phase A: park every affected row at a distinct negative position.
        // Using -(index+1) guarantees uniqueness within this set; negatives
        // never collide with the ≥1 live positions of unchanged rows.
        for (let i = 0; i < allChanged.length; i++) {
          await tx
            .update(storefrontModules)
            .set({ position: -(i + 1) })
            .where(eq(storefrontModules.id, allChanged[i].id));
        }

        // Phase B: set every affected row to its computed final position.
        for (const r of allChanged) {
          const fp = finalPos.get(r.id)!;
          const extra = r.id === moduleId ? { ...scalarUpdates, updatedAt: new Date() } : {};
          await tx
            .update(storefrontModules)
            .set({ position: fp, ...extra })
            .where(eq(storefrontModules.id, r.id));
        }
      });

      // Re-fetch and return the updated row
      const [updated] = await db
        .select()
        .from(storefrontModules)
        .where(eq(storefrontModules.id, moduleId))
        .limit(1);

      return NextResponse.json(updated);
    }
  }

  // No reorder — just apply scalar updates
  const [updated] = await db
    .update(storefrontModules)
    .set({ ...scalarUpdates, updatedAt: new Date() })
    .where(eq(storefrontModules.id, moduleId))
    .returning();

  if (
    mod.moduleType === "split_section" &&
    typeof scalarUpdates.sectionLayout === "string" &&
    scalarUpdates.sectionLayout !== mod.sectionLayout
  ) {
    await syncSplitTiles(moduleId, scalarUpdates.sectionLayout);
  }

  return NextResponse.json(updated);
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId } = await params;

  const [mod] = await db
    .select({
      id: storefrontModules.id,
      pageId: storefrontModules.pageId,
      position: storefrontModules.position,
      driveFileId: storefrontModules.driveFileId,
    })
    .from(storefrontModules)
    .where(eq(storefrontModules.id, moduleId))
    .limit(1);

  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  // Capture before delete (needed for Drive trash + renumber)
  const { pageId, position: deletedPos, driveFileId } = mod;

  // Delete the row + renumber remaining modules contiguously inside a transaction
  await db.transaction(async (tx) => {
    // 1. Delete the target row
    await tx.delete(storefrontModules).where(eq(storefrontModules.id, moduleId));

    // 2. Park remaining rows (those after the deleted position) to position + 1000
    //    to vacate their slots before a clean 1..N renumber.
    await tx
      .update(storefrontModules)
      .set({ position: sql`${storefrontModules.position} + 1000` })
      .where(
        and(
          eq(storefrontModules.pageId, pageId),
          gt(storefrontModules.position, deletedPos)
        )
      );

    // 3. Decrement those parked rows back by 1001 (net: -1 from original) to
    //    close the gap, yielding a contiguous 1..N sequence.
    await tx
      .update(storefrontModules)
      .set({ position: sql`${storefrontModules.position} - 1001` })
      .where(
        and(
          eq(storefrontModules.pageId, pageId),
          gt(storefrontModules.position, 1000)
        )
      );
  });

  // Best-effort: trash the Drive file
  if (driveFileId) {
    try {
      await driveClient.deleteFile(driveFileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[storefront DELETE module] Drive trash failed for ${driveFileId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true });
}

async function syncSplitTiles(moduleId: string, layoutKey: string) {
  const needed = splitTileCount(layoutKey);
  const existing = await db
    .select({
      id: storefrontModuleTiles.id,
      position: storefrontModuleTiles.position,
      driveFileId: storefrontModuleTiles.driveFileId,
    })
    .from(storefrontModuleTiles)
    .where(eq(storefrontModuleTiles.moduleId, moduleId));

  const have = new Set(existing.map((t) => t.position));
  const missing: { moduleId: string; position: number }[] = [];
  for (let p = 1; p <= needed; p++) {
    if (!have.has(p)) missing.push({ moduleId, position: p });
  }
  const extras = existing.filter((t) => t.position > needed);

  if (missing.length > 0) {
    await db.insert(storefrontModuleTiles).values(missing);
  }

  if (extras.length > 0) {
    for (const t of extras) {
      if (!t.driveFileId) continue;
      try {
        await driveClient.deleteFile(t.driveFileId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[storefront syncSplitTiles] Drive trash failed for ${t.driveFileId}: ${msg}`);
      }
    }
    await db
      .delete(storefrontModuleTiles)
      .where(inArray(storefrontModuleTiles.id, extras.map((t) => t.id)));
  }
}
