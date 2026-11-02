import { hasAdminPowers } from "@/lib/roles";
/**
 * GET /api/aplus2/sets/[setId]/versions
 *
 * Returns the entire set's editor payload in one round trip:
 *   { set: {...}, versions: [{ ..., modules: [{ ..., items, assets }] }] }
 *
 * POST is defined further down (Task 2.5).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Assets,
  aplus2ModuleItems,
  aplus2Modules,
  aplus2Sets,
  aplus2Versions,
  driveFiles,
  driveFolders,
  master,
  variations,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import {
  APLUS2_MASTER_FOLDER_TYPE,
  aplus2MasterSubfolderName,
  aplus2VersionSlugFromSet,
} from "@/lib/aplus2/drive-naming";
import {
  aplus2VariationIdSql,
  loadCoveredProductsByAsins,
  loadVariationFamilyMembers,
  lookupAplus2VariationId,
} from "@/lib/aplus2/variation-scope.server";

interface AssetDto {
  id: string;
  kind: string;
  slotKey: string;
  variant: "desktop" | "mobile";
  driveFileId: string;
  filename: string;
  moduleId: string | null;
  moduleItemId: string | null;
}

interface ItemDto {
  id: string;
  position: number;
  data: Record<string, unknown>;
}

interface ModuleDto {
  id: string;
  position: number;
  moduleType: string;
  status: string;
  headlineText: string | null;
  subheadlineText: string | null;
  bodyText: string | null;
  overlayText: string | null;
  altText: string | null;
  mobileAltText: string | null;
  imageDescription: string | null;
  aiImagePrompt: string | null;
  cosmoRelationType: string | null;
  videoDriveFileId: string | null;
  videoTitle: string | null;
  videoDescription: string | null;
  textPosition: string | null;
  fontColor: string | null;
  figmaUrl: string | null;
  markupUrl: string | null;
  items: ItemDto[];
  assets: AssetDto[];
}

interface VersionDto {
  id: string;
  versionNumber: number;
  status: string;
  contentType: string;
  driveFolderUrl: string | null;
  createdAt: string;
  updatedAt: string;
  modules: ModuleDto[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { setId } = await params;

  const [setRow] = await db
    .select({
      id: aplus2Sets.id,
      clientIdCode: aplus2Sets.clientIdCode,
      scopeType: aplus2Sets.scopeType,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      marketplace: aplus2Sets.marketplace,
      contentType: aplus2Sets.contentType,
      parentAsin: aplus2Sets.parentAsin,
      coveredAsins: aplus2Sets.coveredAsins,
      productId: aplus2Sets.productId,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      parentageLevel: master.parentageLevel,
      variationId: aplus2VariationIdSql,
      variationName: variations.name,
      createdAt: aplus2Sets.createdAt,
      updatedAt: aplus2Sets.updatedAt,
    })
    .from(aplus2Sets)
    .innerJoin(master, eq(master.id, aplus2Sets.productId))
    .leftJoin(variations, eq(variations.id, master.variationRef))
    .where(eq(aplus2Sets.id, setId))
    .limit(1);
  if (!setRow) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  const variationId =
    setRow.scopeType === "PARENT" || setRow.scopeType === "GROUP"
      ? setRow.variationId
      : null;
  const coveredProducts =
    setRow.scopeType === "PARENT"
      ? await loadVariationFamilyMembers({
          clientIdCode: setRow.clientIdCode,
          parentAsin: setRow.parentAsin ?? setRow.asin ?? "",
          variationId,
        })
      : setRow.scopeType === "GROUP"
        ? await loadCoveredProductsByAsins({
            clientIdCode: setRow.clientIdCode,
            asins: setRow.coveredAsins ?? [],
          })
      : setRow.asin
        ? [{
            id: setRow.productId,
            asin: setRow.asin,
            parentageLevel: setRow.parentageLevel,
            summarizedTitle: setRow.summarizedTitle,
            itemName: setRow.itemName,
          }]
        : [];
  const set = {
    ...setRow,
    variationId,
    coveredProducts,
    coveredAsins:
      coveredProducts.length > 0 ? coveredProducts.map((m) => m.asin) : setRow.coveredAsins,
  };

  const versionRows = await db
    .select({
      id: aplus2Versions.id,
      versionNumber: aplus2Versions.versionNumber,
      status: aplus2Versions.status,
      contentType: aplus2Versions.contentType,
      createdAt: aplus2Versions.createdAt,
      updatedAt: aplus2Versions.updatedAt,
      driveFolderGid: driveFolders.driveFolderId,
    })
    .from(aplus2Versions)
    .leftJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .where(eq(aplus2Versions.setId, setId))
    .orderBy(asc(aplus2Versions.versionNumber));

  if (versionRows.length === 0) {
    return NextResponse.json({ set, versions: [] });
  }

  const versionIds = versionRows.map((v) => v.id);

  const moduleRows = await db
    .select()
    .from(aplus2Modules)
    .where(inArray(aplus2Modules.versionId, versionIds))
    .orderBy(asc(aplus2Modules.position));

  const moduleIds = moduleRows.map((m) => m.id);

  const [itemRows, assetRows] = await Promise.all([
    moduleIds.length
      ? db.select().from(aplus2ModuleItems).where(inArray(aplus2ModuleItems.moduleId, moduleIds)).orderBy(asc(aplus2ModuleItems.position))
      : Promise.resolve([] as (typeof aplus2ModuleItems.$inferSelect)[]),
    db
      .select({
        id: aplus2Assets.id,
        versionId: aplus2Assets.versionId,
        moduleId: aplus2Assets.moduleId,
        moduleItemId: aplus2Assets.moduleItemId,
        kind: aplus2Assets.kind,
        slotKey: aplus2Assets.slotKey,
        variant: aplus2Assets.variant,
        filename: aplus2Assets.filename,
        driveFileGid: driveFiles.driveFileId,
      })
      .from(aplus2Assets)
      .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
      .where(inArray(aplus2Assets.versionId, versionIds)),
  ]);

  const itemsByModule = new Map<string, ItemDto[]>();
  for (const it of itemRows) {
    const arr = itemsByModule.get(it.moduleId) ?? [];
    arr.push({ id: it.id, position: it.position, data: (it.data ?? {}) as Record<string, unknown> });
    itemsByModule.set(it.moduleId, arr);
  }

  const assetsByModule = new Map<string, AssetDto[]>();
  for (const a of assetRows) {
    const dto: AssetDto = {
      id: a.id,
      kind: a.kind,
      slotKey: a.slotKey,
      variant: a.variant as "desktop" | "mobile",
      driveFileId: a.driveFileGid,
      filename: a.filename,
      moduleId: a.moduleId,
      moduleItemId: a.moduleItemId,
    };
    const key = a.moduleId ?? "__no_module__";
    const arr = assetsByModule.get(key) ?? [];
    arr.push(dto);
    assetsByModule.set(key, arr);
  }

  const modulesByVersion = new Map<string, ModuleDto[]>();
  for (const m of moduleRows) {
    const dto: ModuleDto = {
      id: m.id,
      position: m.position,
      moduleType: m.moduleType,
      status: m.status,
      headlineText: m.headlineText,
      subheadlineText: m.subheadlineText,
      bodyText: m.bodyText,
      overlayText: m.overlayText,
      altText: m.altText,
      mobileAltText: m.mobileAltText,
      imageDescription: m.imageDescription,
      aiImagePrompt: m.aiImagePrompt,
      cosmoRelationType: m.cosmoRelationType,
      videoDriveFileId: m.videoDriveFileId,
      videoTitle: m.videoTitle,
      videoDescription: m.videoDescription,
      textPosition: m.textPosition,
      fontColor: m.fontColor,
      figmaUrl: m.figmaUrl,
      markupUrl: m.markupUrl,
      items: itemsByModule.get(m.id) ?? [],
      assets: assetsByModule.get(m.id) ?? [],
    };
    const arr = modulesByVersion.get(m.versionId) ?? [];
    arr.push(dto);
    modulesByVersion.set(m.versionId, arr);
  }

  const versions: VersionDto[] = versionRows.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    contentType: v.contentType,
    driveFolderUrl: v.driveFolderGid ? `https://drive.google.com/drive/folders/${v.driveFolderGid}` : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    modules: modulesByVersion.get(v.id) ?? [],
  }));

  return NextResponse.json({ set, versions });
}

const createVersionSchema = z.strictObject({
  copyFrom: z.string().uuid().optional(),
  contentType: z.enum(["PA+", "BA+"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { setId } = await params;
  const body = createVersionSchema.parse(await req.json().catch(() => ({})));

  const [setRow] = await db
    .select({
      id: aplus2Sets.id,
      clientIdCode: aplus2Sets.clientIdCode,
      contentType: aplus2Sets.contentType,
      scopeType: aplus2Sets.scopeType,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      productId: aplus2Sets.productId,
    })
    .from(aplus2Sets)
    .where(eq(aplus2Sets.id, setId))
    .limit(1);
  if (!setRow) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  // Next version number for this set.
  const [maxRow] = await db
    .select({ maxV: sql<number>`COALESCE(MAX(${aplus2Versions.versionNumber}), 0)::int` })
    .from(aplus2Versions)
    .where(eq(aplus2Versions.setId, setId));
  const versionNumber = (maxRow?.maxV ?? 0) + 1;

  const [latestVersion] = await db
    .select({ contentType: aplus2Versions.contentType })
    .from(aplus2Versions)
    .where(eq(aplus2Versions.setId, setId))
    .orderBy(sql`${aplus2Versions.versionNumber} DESC`)
    .limit(1);
  const contentType = body.contentType ?? latestVersion?.contentType ?? setRow.contentType;

  const variationId =
    setRow.scopeType === "PARENT" || setRow.scopeType === "GROUP"
      ? await lookupAplus2VariationId(setRow.productId)
      : null;
  const slug = aplus2VersionSlugFromSet({
    clientIdCode: setRow.clientIdCode,
    scopeType: setRow.scopeType,
    scopeIdentifier: setRow.scopeIdentifier,
    variationId,
    contentType,
    versionNumber,
  });

  // Find parent Drive folder via the OWN set's existing version (V01) — its
  // drive_folders.parent_folder_id points at the canonical parent.
  const [anchor] = await db
    .select({
      parentFolderRowId: driveFolders.parentFolderId,
      parentPath: sql<string>`(SELECT path FROM ${driveFolders} pf WHERE pf.id = ${driveFolders.parentFolderId})`,
      parentGid: sql<string>`(SELECT drive_folder_id FROM ${driveFolders} pf WHERE pf.id = ${driveFolders.parentFolderId})`,
    })
    .from(driveFolders)
    .innerJoin(aplus2Versions, eq(aplus2Versions.driveFolderId, driveFolders.id))
    .where(eq(aplus2Versions.setId, setId))
    .limit(1);
  if (!anchor?.parentFolderRowId || !anchor.parentGid) {
    return NextResponse.json(
      { error: "Set has no anchor Drive folder — cannot derive parent for the new version" },
      { status: 409 }
    );
  }

  const masterSubfolderName = aplus2MasterSubfolderName(slug);
  let createdDriveFolderId: string | null = null;
  let createdMasterFolderId: string | null = null;
  try {
    const f = await driveClient.createFolder(slug, anchor.parentGid);
    createdDriveFolderId = f.id;
    const masterFolder = await driveClient.createFolder(masterSubfolderName, f.id);
    createdMasterFolderId = masterFolder.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (createdDriveFolderId) {
      try { await driveClient.deleteFile(createdDriveFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /versions] folder cleanup after Drive fail:", cleanupErr); }
    }
    return NextResponse.json({ error: `Drive folder create failed: ${msg}` }, { status: 502 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [folderRow] = await tx
        .insert(driveFolders)
        .values({
          clientIdCode: setRow.clientIdCode,
          driveFolderId: createdDriveFolderId!,
          folderType: "aplus2_version",
          path: `${anchor.parentPath}/${slug}`,
          parentFolderId: anchor.parentFolderRowId!,
          name: slug,
        })
        .returning({ id: driveFolders.id });

      await tx.insert(driveFolders).values({
        clientIdCode: setRow.clientIdCode,
        driveFolderId: createdMasterFolderId!,
        folderType: APLUS2_MASTER_FOLDER_TYPE,
        path: `${anchor.parentPath}/${slug}/${masterSubfolderName}`,
        parentFolderId: folderRow.id,
        name: masterSubfolderName,
      });

      const [versionRow] = await tx
        .insert(aplus2Versions)
        .values({
          setId,
          versionNumber,
          driveFolderId: folderRow.id,
          status: "not_started",
          contentType,
        })
        .returning({ id: aplus2Versions.id, versionNumber: aplus2Versions.versionNumber });

      await tx
        .update(aplus2Sets)
        .set({ contentType, updatedAt: new Date() })
        .where(eq(aplus2Sets.id, setId));

      // copyFrom — clone modules + items (no assets) from the source version.
      // Do not copy across BA+/PA+ — they use different module catalogs.
      if (body.copyFrom) {
        // Validate that copyFrom belongs to this set (prevent cross-set / cross-tenant clone).
        const [src] = await tx
          .select({ id: aplus2Versions.id, contentType: aplus2Versions.contentType })
          .from(aplus2Versions)
          .where(and(eq(aplus2Versions.id, body.copyFrom), eq(aplus2Versions.setId, setId)))
          .limit(1);
        if (!src) {
          throw new Error("copyFrom version does not belong to this set");
        }
        if (src.contentType === contentType) {
          const sourceModules = await tx
            .select()
            .from(aplus2Modules)
            .where(eq(aplus2Modules.versionId, body.copyFrom))
            .orderBy(asc(aplus2Modules.position));

          for (const m of sourceModules) {
            const [newModule] = await tx
              .insert(aplus2Modules)
              .values({
                versionId: versionRow.id,
                position: m.position,
                moduleType: m.moduleType,
                status: "draft",
                headlineText: m.headlineText,
                subheadlineText: m.subheadlineText,
                bodyText: m.bodyText,
                overlayText: m.overlayText,
                altText: m.altText,
                mobileAltText: m.mobileAltText,
                imageDescription: m.imageDescription,
                aiImagePrompt: m.aiImagePrompt,
                cosmoRelationType: m.cosmoRelationType,
                videoTitle: m.videoTitle,
                videoDescription: m.videoDescription,
                textPosition: m.textPosition,
                fontColor: m.fontColor,
                // videoDriveFileId intentionally NOT copied — user re-uploads.
              })
              .returning({ id: aplus2Modules.id });

            const sourceItems = await tx
              .select()
              .from(aplus2ModuleItems)
              .where(eq(aplus2ModuleItems.moduleId, m.id))
              .orderBy(asc(aplus2ModuleItems.position));
            if (sourceItems.length > 0) {
              await tx.insert(aplus2ModuleItems).values(
                sourceItems.map((it) => ({
                  moduleId: newModule.id,
                  position: it.position,
                  data: it.data ?? {},
                }))
              );
            }
          }
        }
      }

      return { versionId: versionRow.id, versionNumber: versionRow.versionNumber };
    });

    return NextResponse.json({ ok: true, ...result, slug });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (createdMasterFolderId) {
      try { await driveClient.deleteFile(createdMasterFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /versions] master folder cleanup failed:", cleanupErr); }
    }
    if (createdDriveFolderId) {
      try { await driveClient.deleteFile(createdDriveFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /versions] folder cleanup failed:", cleanupErr); }
    }
    return NextResponse.json({ error: `Failed to create version: ${msg}` }, { status: 500 });
  }
}
