/**
 * GET /api/portal/design/brand-story   (whitelisted for client/prospect roles)
 *
 * Client-scoped, read-only mirror of the Hub's
 * /api/design-status/brand-story-versions: every brand story version for the
 * one client the caller is allowed to see (own session, or admin preview via
 * ?client=), hydrated with modules, ASIN/Q&A items, and image assets. Images
 * are handed over as /api/drive/file/{id} URLs — the only image proxy
 * client-role users can reach. Internal-only fields (Drive folder links,
 * alt-text drafts, master-file counts) are never exposed. Versions are
 * newest-first (highest versionNumber on top).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, asc, desc } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { resolvePortalClient } from "@/lib/api-utils";
import { db } from "@/lib/db";
import {
  aac,
  brandStoryAsinItems,
  brandStoryAssets,
  brandStoryModules,
  brandStoryQaItems,
  brandStoryVersions,
  driveFiles,
} from "@/lib/db/schema";
import { CLIENT_NAMES } from "@/lib/constants";

type AssetDto = {
  url: string;
  filename: string;
};

type AsinItemDto = {
  id: string;
  position: number;
  asin: string;
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
  focusAsset: AssetDto | null;
  logoAsset: AssetDto | null;
  asinItems: AsinItemDto[];
  qaItems: QaItemDto[];
};

type VersionDto = {
  id: string;
  versionNumber: number;
  status: string;
  screenview: AssetDto | null;
  bgDesktop: AssetDto | null;
  bgMobile: AssetDto | null;
  modules: ModuleDto[];
};

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prospects see the demo portal — no real brand story data.
  if (session.user?.clientStatus === "Prospect") {
    return NextResponse.json({ clientIdCode: "DEMO", clientName: "Demo Brand", versions: [] });
  }

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientCode = resolved.clientIdCode;

  const [clientRow] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientCode))
    .limit(1);
  const clientName = clientRow?.clientName || CLIENT_NAMES[clientCode] || clientCode;

  // 1. Versions for this client only.
  const versionRows = await db
    .select({
      id: brandStoryVersions.id,
      versionNumber: brandStoryVersions.versionNumber,
      status: brandStoryVersions.status,
    })
    .from(brandStoryVersions)
    .where(eq(brandStoryVersions.clientIdCode, clientCode))
    .orderBy(desc(brandStoryVersions.versionNumber));

  if (versionRows.length === 0) {
    return NextResponse.json({ clientIdCode: clientCode, clientName, versions: [] });
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

  // 4. Assets across all versions, joined to drive_files for the Drive GID
  //    that the client-safe /api/drive/file proxy needs.
  const assetRows = await db
    .select({
      versionId: brandStoryAssets.versionId,
      moduleId: brandStoryAssets.moduleId,
      asinItemId: brandStoryAssets.asinItemId,
      kind: brandStoryAssets.kind,
      filename: brandStoryAssets.filename,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(brandStoryAssets)
    .innerJoin(driveFiles, eq(driveFiles.id, brandStoryAssets.driveFileId))
    .where(inArray(brandStoryAssets.versionId, versionIds));

  // ─── Stitch ─────────────────────────────────────────────────────────
  const asinItemsByModule = new Map<string, AsinItemDto[]>();
  for (const it of asinItemRows) {
    const arr = asinItemsByModule.get(it.moduleId) ?? [];
    arr.push({ id: it.id, position: it.position, asin: it.asin, asset: null });
    asinItemsByModule.set(it.moduleId, arr);
  }

  const qaItemsByModule = new Map<string, QaItemDto[]>();
  for (const it of qaItemRows) {
    const arr = qaItemsByModule.get(it.moduleId) ?? [];
    arr.push({ id: it.id, position: it.position, question: it.question, answer: it.answer });
    qaItemsByModule.set(it.moduleId, arr);
  }

  const modulesByVersion = new Map<string, ModuleDto[]>();
  const moduleById = new Map<string, ModuleDto>();
  for (const m of moduleRows) {
    const mod: ModuleDto = {
      id: m.id,
      position: m.position,
      type: m.type as ModuleDto["type"],
      headline: m.headline,
      body: m.body,
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
  const assetByAsinItemId = new Map<string, AssetDto>();

  for (const a of assetRows) {
    const dto: AssetDto = {
      url: `/api/drive/file/${a.driveFileGid}`,
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
    }
    // "master_file" assets are internal working files — never sent to clients.
  }
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
    return {
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      screenview: slot.screenview,
      bgDesktop: slot.bgDesktop,
      bgMobile: slot.bgMobile,
      modules: modulesByVersion.get(v.id) ?? [],
    };
  });

  return NextResponse.json({ clientIdCode: clientCode, clientName, versions });
}
