import { hasAdminPowers } from "@/lib/roles";
/**
 * PATCH  /api/design-status/brand-story-versions/[versionId]
 * DELETE /api/design-status/brand-story-versions/[versionId]
 *
 * PATCH:
 *   Full state replace per version. The body carries the canonical
 *   modules + child-item state plus version-level fields (status, bg alts).
 *
 *   Module identity is by `id`. Modules in the body without an `id` are
 *   inserted at the next position; modules whose `id` is not in the body
 *   are deleted (along with their child items and image assets).
 *
 *   Module `type` is immutable after creation — the API rejects type
 *   changes. Module `position` is also immutable (no reorder per user
 *   decision; positions are append-only with gaps allowed after delete).
 *
 *   Per the locked rules, char limits are enforced here (Zod), not in DB.
 *
 * DELETE:
 *   Removes the version row (CASCADE drops modules + child items + assets),
 *   removes the drive_folders row for the V## subfolder, and trashes the
 *   subfolder in Drive (best-effort).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  brandStoryAsinItems,
  brandStoryAssets,
  brandStoryModules,
  brandStoryQaItems,
  brandStoryVersions,
  driveFiles,
  driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { siblingShouldBecomeDiscontinued } from "@/lib/design-live-versions";

// ─── Zod schemas ─────────────────────────────────────────────────────

const statusValues = ["not_started", "in_progress", "in_review", "approved", "live", "discontinued"] as const;

const asinItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(1).max(4),
  asin: z.string().max(20).default(""),
  imageAlt: z.string().max(100).default(""),
});

const qaItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(1).max(3),
  question: z.string().max(200).default(""),
  answer: z.string().max(600).default(""),
});

const baseModuleSchema = z.object({
  id: z.uuid().optional(), // absent = new module to insert
  type: z.enum(["asin-showcase", "focus-image", "logo-description", "qa"]),
  headline: z.string().max(30).nullable().optional(),
  body: z.string().nullable().optional(),
  imageAlt: z.string().max(100).nullable().optional(),
  brandStoreId: z.string().max(100).nullable().optional(),
  asinItems: z.array(asinItemSchema).max(4).optional(),
  qaItems: z.array(qaItemSchema).max(3).optional(),
});

// Per-type body char limit enforced after parse:
//   focus-image: max 135
//   logo-description: max 450
//   asin-showcase / qa: no module-level body
function moduleBodyLimit(type: z.infer<typeof baseModuleSchema>["type"]): number | null {
  switch (type) {
    case "focus-image":
      return 135;
    case "logo-description":
      return 450;
    case "asin-showcase":
    case "qa":
      return null;
  }
}

const patchSchema = z.strictObject({
  status: z.enum(statusValues).optional(),
  desktopBgAlt: z.string().max(100).optional(),
  mobileBgAlt: z.string().max(100).optional(),
  modules: z.array(baseModuleSchema).max(19).optional(),
});

// ─── PATCH ───────────────────────────────────────────────────────────

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
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  // Per-type body length check (Zod can't easily do conditional max).
  if (body.modules) {
    for (const [i, m] of body.modules.entries()) {
      const lim = moduleBodyLimit(m.type);
      if (lim !== null && m.body && m.body.length > lim) {
        return NextResponse.json(
          { error: `modules[${i}].body exceeds ${lim} chars for type "${m.type}"` },
          { status: 400 }
        );
      }
    }
  }

  // Confirm version exists.
  const [versionRow] = await db
    .select({
      id: brandStoryVersions.id,
      clientIdCode: brandStoryVersions.clientIdCode,
      versionNumber: brandStoryVersions.versionNumber,
    })
    .from(brandStoryVersions)
    .where(eq(brandStoryVersions.id, versionId))
    .limit(1);
  if (!versionRow) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // ─── Module diff (when body.modules is present) ─────────────────────
  let driveFilesToDelete: { gid: string }[] = [];

  if (body.modules) {
    const existingModules = await db
      .select({
        id: brandStoryModules.id,
        type: brandStoryModules.type,
        position: brandStoryModules.position,
      })
      .from(brandStoryModules)
      .where(eq(brandStoryModules.versionId, versionId));

    const existingById = new Map(existingModules.map((m) => [m.id, m]));
    const bodyIds = new Set(body.modules.filter((m) => m.id).map((m) => m.id!));
    const modulesToDelete = existingModules.filter((m) => !bodyIds.has(m.id));

    // Reject type changes on existing modules.
    for (const [i, m] of body.modules.entries()) {
      if (m.id) {
        const ex = existingById.get(m.id);
        if (!ex) {
          return NextResponse.json(
            { error: `modules[${i}].id ${m.id} not found on this version` },
            { status: 400 }
          );
        }
        if (ex.type !== m.type) {
          return NextResponse.json(
            {
              error: `modules[${i}] type is immutable (currently "${ex.type}"); delete and re-add to change type`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Collect Drive files attached to to-be-deleted modules so we can
    // trash them best-effort after the DB tx commits.
    if (modulesToDelete.length > 0) {
      const delModuleIds = modulesToDelete.map((m) => m.id);

      const directAssets = await db
        .select({ gid: driveFiles.driveFileId })
        .from(brandStoryAssets)
        .innerJoin(driveFiles, eq(driveFiles.id, brandStoryAssets.driveFileId))
        .where(inArray(brandStoryAssets.moduleId, delModuleIds));

      // ASIN-item assets attach via asinItemId (no moduleId), so join through.
      const indirectAssets = await db
        .select({ gid: driveFiles.driveFileId })
        .from(brandStoryAssets)
        .innerJoin(driveFiles, eq(driveFiles.id, brandStoryAssets.driveFileId))
        .innerJoin(
          brandStoryAsinItems,
          eq(brandStoryAsinItems.id, brandStoryAssets.asinItemId)
        )
        .where(inArray(brandStoryAsinItems.moduleId, delModuleIds));

      driveFilesToDelete = [...directAssets, ...indirectAssets];
    }

    // Run the write transaction.
    await db.transaction(async (tx) => {
      // Version-level fields.
      const versionUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.status !== undefined) versionUpdates.status = body.status;
      if (body.desktopBgAlt !== undefined) versionUpdates.desktopBgAlt = body.desktopBgAlt;
      if (body.mobileBgAlt !== undefined) versionUpdates.mobileBgAlt = body.mobileBgAlt;
      await tx
        .update(brandStoryVersions)
        .set(versionUpdates)
        .where(eq(brandStoryVersions.id, versionId));

      // Delete modules + their drive_files (cascade clears asset rows).
      if (modulesToDelete.length > 0) {
        const delIds = modulesToDelete.map((m) => m.id);

        // Collect drive_file ids attached to assets of the to-be-deleted
        // modules. Two paths: direct (assets.module_id) and indirect (assets
        // attached to ASIN items belonging to these modules).
        const directRows = await tx
          .select({ id: brandStoryAssets.driveFileId })
          .from(brandStoryAssets)
          .where(inArray(brandStoryAssets.moduleId, delIds));
        const indirectRows = await tx
          .select({ id: brandStoryAssets.driveFileId })
          .from(brandStoryAssets)
          .innerJoin(
            brandStoryAsinItems,
            eq(brandStoryAsinItems.id, brandStoryAssets.asinItemId)
          )
          .where(inArray(brandStoryAsinItems.moduleId, delIds));

        const driveFileIdsToDelete = [
          ...directRows.map((r) => r.id),
          ...indirectRows.map((r) => r.id),
        ];
        if (driveFileIdsToDelete.length > 0) {
          await tx
            .delete(driveFiles)
            .where(inArray(driveFiles.id, driveFileIdsToDelete));
        }

        // Now drop the modules (cascade drops asin_items, qa_items, and any
        // remaining brand_story_assets rows).
        await tx
          .delete(brandStoryModules)
          .where(inArray(brandStoryModules.id, delIds));
      }

      // Allocate next position for new modules.
      const [maxRow] = await tx
        .select({
          maxPos: sql<number>`COALESCE(MAX(${brandStoryModules.position}), 0)::int`,
        })
        .from(brandStoryModules)
        .where(eq(brandStoryModules.versionId, versionId));
      let nextPos = (maxRow?.maxPos ?? 0) + 1;

      for (const m of body.modules!) {
        if (m.id) {
          // UPDATE existing module text fields.
          await tx
            .update(brandStoryModules)
            .set({
              headline: m.headline ?? null,
              body: m.body ?? null,
              imageAlt: m.imageAlt ?? null,
              brandStoreId: m.brandStoreId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(brandStoryModules.id, m.id));

          if (m.asinItems) {
            for (const it of m.asinItems) {
              await tx
                .update(brandStoryAsinItems)
                .set({
                  asin: it.asin ?? "",
                  imageAlt: it.imageAlt ?? "",
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(brandStoryAsinItems.id, it.id),
                    eq(brandStoryAsinItems.moduleId, m.id)
                  )
                );
            }
          }

          if (m.qaItems) {
            for (const it of m.qaItems) {
              await tx
                .update(brandStoryQaItems)
                .set({
                  question: it.question ?? "",
                  answer: it.answer ?? "",
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(brandStoryQaItems.id, it.id),
                    eq(brandStoryQaItems.moduleId, m.id)
                  )
                );
            }
          }
        } else {
          // INSERT new module.
          const [insertedModule] = await tx
            .insert(brandStoryModules)
            .values({
              versionId,
              position: nextPos++,
              type: m.type,
              headline: m.headline ?? null,
              body: m.body ?? null,
              imageAlt: m.imageAlt ?? null,
              brandStoreId: m.brandStoreId ?? null,
            })
            .returning({ id: brandStoryModules.id });

          // Pre-seed child rows by type.
          if (m.type === "asin-showcase") {
            await tx.insert(brandStoryAsinItems).values(
              [1, 2, 3, 4].map((p) => ({
                moduleId: insertedModule.id,
                position: p,
                asin: "",
                imageAlt: "",
              }))
            );
          } else if (m.type === "qa") {
            await tx.insert(brandStoryQaItems).values(
              [1, 2, 3].map((p) => ({
                moduleId: insertedModule.id,
                position: p,
                question: "",
                answer: "",
              }))
            );
          }
        }
      }
    });
  } else {
    // No `modules` in body → just update version-level fields.
    const versionUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) versionUpdates.status = body.status;
    if (body.desktopBgAlt !== undefined) versionUpdates.desktopBgAlt = body.desktopBgAlt;
    if (body.mobileBgAlt !== undefined) versionUpdates.mobileBgAlt = body.mobileBgAlt;

    // Only run UPDATE if something other than updatedAt would change.
    if (Object.keys(versionUpdates).length > 1) {
      await db
        .update(brandStoryVersions)
        .set(versionUpdates)
        .where(eq(brandStoryVersions.id, versionId));
    }
  }

  if (body.status === "live") {
    const siblings = await db
      .select({
        id: brandStoryVersions.id,
        versionNumber: brandStoryVersions.versionNumber,
        status: brandStoryVersions.status,
      })
      .from(brandStoryVersions)
      .where(eq(brandStoryVersions.clientIdCode, versionRow.clientIdCode));
    const discontinueIds = siblings
      .filter(
        (s) =>
          s.id !== versionId &&
          siblingShouldBecomeDiscontinued({
            siblingVersionNumber: s.versionNumber,
            siblingStatus: s.status,
            liveVersionNumber: versionRow.versionNumber,
          })
      )
      .map((s) => s.id);
    if (discontinueIds.length > 0) {
      await db
        .update(brandStoryVersions)
        .set({ status: "discontinued", updatedAt: new Date() })
        .where(inArray(brandStoryVersions.id, discontinueIds));
    }
  }

  // Best-effort Drive cleanup for files attached to deleted modules.
  for (const f of driveFilesToDelete) {
    try {
      await driveClient.deleteFile(f.gid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[brand-story PATCH] Drive cleanup failed for ${f.gid}: ${msg}. ` +
          "DB is consistent; leaving Drive orphan."
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE ──────────────────────────────────────────────────────────

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

  // Look up the version's drive folder so we can trash it after the DB tx.
  const [versionRow] = await db
    .select({
      id: brandStoryVersions.id,
      folderRowId: brandStoryVersions.driveFolderId,
      folderGid: driveFolders.driveFolderId,
    })
    .from(brandStoryVersions)
    .leftJoin(driveFolders, eq(driveFolders.id, brandStoryVersions.driveFolderId))
    .where(eq(brandStoryVersions.id, versionId))
    .limit(1);
  if (!versionRow) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // The Drive folder delete also removes every file inside it, so we don't
  // need to enumerate drive_files row-by-row. The drive_folders row has
  // ON DELETE CASCADE on drive_files, which in turn cascades into
  // brand_story_assets via FK. brand_story_versions has ON DELETE CASCADE
  // into modules → asin_items + qa_items.
  await db.transaction(async (tx) => {
    await tx.delete(brandStoryVersions).where(eq(brandStoryVersions.id, versionId));
    if (versionRow.folderRowId) {
      // Delete child folder rows first (e.g. the {slug}_Master_Files subfolder
      // created by upload-brand-story). drive_folders has NO self-referencing
      // ON DELETE cascade, so nested folder rows must be removed explicitly —
      // otherwise they orphan and later collide on the unique
      // (client_id_code, path) index, permanently blocking re-creation.
      await tx
        .delete(driveFolders)
        .where(eq(driveFolders.parentFolderId, versionRow.folderRowId));
      await tx.delete(driveFolders).where(eq(driveFolders.id, versionRow.folderRowId));
    }
  });

  if (versionRow.folderGid) {
    try {
      await driveClient.deleteFile(versionRow.folderGid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[brand-story DELETE version] Drive folder ${versionRow.folderGid} could not be trashed: ${msg}. ` +
          "DB is consistent."
      );
    }
  }

  return NextResponse.json({ ok: true });
}
