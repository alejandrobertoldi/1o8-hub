/**
 * GET /api/design-status/brand-story-versions?clientIdCode=XYZ
 *
 * Returns every brand story version for the client, hydrated with the
 * modules, child items (ASINs, Q&A), and image assets needed by the editor.
 * Versions are newest-first (highest versionNumber on top).
 *
 * Shape mirrors what the BrandStoryEditor consumes — one round-trip
 * populates the whole page.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, asc, desc } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aac,
  brandStoryAsinItems,
  brandStoryAssets,
  brandStoryModules,
  brandStoryQaItems,
  brandStoryVersions,
  driveFiles,
  driveFolders,
} from "@/lib/db/schema";

type AssetDto = {
  id: string;
  driveFileId: string;
  filename: string;
};

type AsinItemDto = {
  id: string;
  position: number;
  asin: string;
  imageAlt: string;
  asset: AssetDto | null;
};

type QaItemDto = {
  id: string;
  position: number;
  question: string;
  answer: string;
};

type ModuleDto = {
  id: string;
  position: number;
  type: "asin-showcase" | "focus-image" | "logo-description" | "qa";
  headline: string | null;
  body: string | null;
  imageAlt: string | null;
  brandStoreId: string | null;
  focusAsset: AssetDto | null;
  logoAsset: AssetDto | null;
  asinItems: AsinItemDto[];
  qaItems: QaItemDto[];
};

type VersionDto = {
  id: string;
  versionNumber: number;
  status: string;
  desktopBgAlt: string;
  mobileBgAlt: string;
  driveFolderUrl: string | null;
  createdAt: string;
  updatedAt: string;
  screenview: AssetDto | null;
  bgDesktop: AssetDto | null;
  bgMobile: AssetDto | null;
  masterFiles: { count: number; latestAt: string | null };
  modules: ModuleDto[];
};

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  const [clientRow] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  const clientName = clientRow?.clientName ?? clientIdCode;

  // 1. Versions + their Drive folder ID (for the "Drive folder" link).
  const versionRows = await db
    .select({
      id: brandStoryVersions.id,
      versionNumber: brandStoryVersions.versionNumber,
      status: brandStoryVersions.status,
      desktopBgAlt: brandStoryVersions.desktopBgAlt,
      mobileBgAlt: brandStoryVersions.mobileBgAlt,
      createdAt: brandStoryVersions.createdAt,
      updatedAt: brandStoryVersions.updatedAt,
      driveFolderGid: driveFolders.driveFolderId,
    })
    .from(brandStoryVersions)
    .leftJoin(driveFolders, eq(driveFolders.id, brandStoryVersions.driveFolderId))
    .where(eq(brandStoryVersions.clientIdCode, clientIdCode))
    .orderBy(desc(brandStoryVersions.versionNumber));

  if (versionRows.length === 0) {
    return NextResponse.json({ clientName, versions: [] });
  }

  const versionIds = versionRows.map((v) => v.id);

  // 2. Modules across all versions.
  const moduleRows = await db
    .select()
    .from(brandStoryModules)
    .where(inArray(brandStoryModules.versionId, versionIds))
    .orderBy(asc(brandStoryModules.position));

  const moduleIds = moduleRows.map((m) => m.id);

  // 3. ASIN items + Q&A items across all modules.
  const [asinItemRows, qaItemRows] = await Promise.all([
    moduleIds.length
      ? db
          .select()
          .from(brandStoryAsinItems)
          .where(inArray(brandStoryAsinItems.moduleId, moduleIds))
          .orderBy(asc(brandStoryAsinItems.position))
      : Promise.resolve([] as (typeof brandStoryAsinItems.$inferSelect)[]),
    moduleIds.length
      ? db
          .select()
          .from(brandStoryQaItems)
          .where(inArray(brandStoryQaItems.moduleId, moduleIds))
          .orderBy(asc(brandStoryQaItems.position))
      : Promise.resolve([] as (typeof brandStoryQaItems.$inferSelect)[]),
  ]);

  // 4. Assets across all versions, joined to drive_files so we get the
  //    Drive file id (needed by the image-proxy endpoint).
  const assetRows = await db
    .select({
      id: brandStoryAssets.id,
      versionId: brandStoryAssets.versionId,
      moduleId: brandStoryAssets.moduleId,
      asinItemId: brandStoryAssets.asinItemId,
      kind: brandStoryAssets.kind,
      filename: brandStoryAssets.filename,
      createdAt: brandStoryAssets.createdAt,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(brandStoryAssets)
    .innerJoin(driveFiles, eq(driveFiles.id, brandStoryAssets.driveFileId))
    .where(inArray(brandStoryAssets.versionId, versionIds));

  // ─── Stitch ─────────────────────────────────────────────────────────
  const asinItemsByModule = new Map<string, AsinItemDto[]>();
  for (const it of asinItemRows) {
    const arr = asinItemsByModule.get(it.moduleId) ?? [];
    arr.push({
      id: it.id,
      position: it.position,
      asin: it.asin,
      imageAlt: it.imageAlt,
      asset: null, // filled in below
    });
    asinItemsByModule.set(it.moduleId, arr);
  }

  const qaItemsByModule = new Map<string, QaItemDto[]>();
  for (const it of qaItemRows) {
    const arr = qaItemsByModule.get(it.moduleId) ?? [];
    arr.push({
      id: it.id,
      position: it.position,
      question: it.question,
      answer: it.answer,
    });
    qaItemsByModule.set(it.moduleId, arr);
  }

  type StitchedModule = ModuleDto;
  const modulesByVersion = new Map<string, StitchedModule[]>();
  const moduleById = new Map<string, StitchedModule>();
  for (const m of moduleRows) {
    const mod: StitchedModule = {
      id: m.id,
      position: m.position,
      type: m.type as ModuleDto["type"],
      headline: m.headline,
      body: m.body,
      imageAlt: m.imageAlt,
      brandStoreId: m.brandStoreId,
      focusAsset: null,
      logoAsset: null,
      asinItems: asinItemsByModule.get(m.id) ?? [],
      qaItems: qaItemsByModule.get(m.id) ?? [],
    };
    moduleById.set(m.id, mod);
    const arr = modulesByVersion.get(m.versionId) ?? [];
    arr.push(mod);
    modulesByVersion.set(m.versionId, arr);
  }

  const assetsByVersion = new Map<
    string,
    { screenview: AssetDto | null; bgDesktop: AssetDto | null; bgMobile: AssetDto | null }
  >();
  for (const v of versionIds) {
    assetsByVersion.set(v, { screenview: null, bgDesktop: null, bgMobile: null });
  }
  // Index asin-item assets by asin_item_id so we can attach them below.
  const assetByAsinItemId = new Map<string, AssetDto>();
  const masterFilesByVersion = new Map<string, { count: number; latestAt: Date | null }>();

  for (const a of assetRows) {
    const dto: AssetDto = {
      id: a.id,
      driveFileId: a.driveFileGid,
      filename: a.filename,
    };
    if (a.kind === "screenview" || a.kind === "bg_desktop" || a.kind === "bg_mobile") {
      const slot = assetsByVersion.get(a.versionId);
      if (slot) {
        if (a.kind === "screenview") slot.screenview = dto;
        else if (a.kind === "bg_desktop") slot.bgDesktop = dto;
        else if (a.kind === "bg_mobile") slot.bgMobile = dto;
      }
    } else if (a.kind === "focus" && a.moduleId) {
      const mod = moduleById.get(a.moduleId);
      if (mod) mod.focusAsset = dto;
    } else if (a.kind === "logo" && a.moduleId) {
      const mod = moduleById.get(a.moduleId);
      if (mod) mod.logoAsset = dto;
    } else if (a.kind === "asin" && a.asinItemId) {
      assetByAsinItemId.set(a.asinItemId, dto);
    } else if (a.kind === "master_file") {
      const mf = masterFilesByVersion.get(a.versionId) ?? { count: 0, latestAt: null };
      mf.count++;
      if (!mf.latestAt || a.createdAt > mf.latestAt) mf.latestAt = a.createdAt;
      masterFilesByVersion.set(a.versionId, mf);
    }
  }
  // Attach asin assets to their items.
  for (const mod of moduleById.values()) {
    for (const item of mod.asinItems) {
      item.asset = assetByAsinItemId.get(item.id) ?? null;
    }
  }

  const versions: VersionDto[] = versionRows.map((v) => {
    const slot = assetsByVersion.get(v.id) ?? {
      screenview: null,
      bgDesktop: null,
      bgMobile: null,
    };
    const mf = masterFilesByVersion.get(v.id) ?? { count: 0, latestAt: null };
    return {
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      desktopBgAlt: v.desktopBgAlt,
      mobileBgAlt: v.mobileBgAlt,
      driveFolderUrl: v.driveFolderGid
        ? `https://drive.google.com/drive/folders/${v.driveFolderGid}`
        : null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      screenview: slot.screenview,
      bgDesktop: slot.bgDesktop,
      bgMobile: slot.bgMobile,
      masterFiles: { count: mf.count, latestAt: mf.latestAt ? mf.latestAt.toISOString() : null },
      modules: modulesByVersion.get(v.id) ?? [],
    };
  });

  return NextResponse.json({ clientName, versions });
}
