/**
 * GET /api/portal/design/storefront   (whitelisted for client/prospect roles)
 *
 * Client-scoped, read-only mirror of the Hub's storefront builder data:
 * the CURRENT (highest) storefront version for the one client the caller is
 * allowed to see (own session, or admin preview via ?client=), with its pages
 * and stacked modules. Assets are handed over as /api/drive/file/{gid} URLs —
 * the only file proxy client-role users can reach (storefront rows store raw
 * Drive GIDs, which that proxy accepts directly, Range/video included).
 * Internal-only fields (Drive folders, meta descriptions, AI-people flags,
 * master files) are never exposed. This route never writes — unlike the Hub
 * pages route it does NOT auto-create a version or Homepage.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, asc, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { resolvePortalClient } from "@/lib/api-utils";
import { db } from "@/lib/db";
import {
  aac,
  storefrontModules,
  storefrontModuleTiles,
  storefrontPages,
  storefrontVersions,
} from "@/lib/db/schema";
import { CLIENT_NAMES } from "@/lib/constants";

type TileDto = {
  id: string;
  position: number;
  title: string | null;
  assetUrl: string | null;
  assetFilename: string | null;
};

type ModuleDto = {
  id: string;
  position: number;
  moduleType: string;
  title: string | null;
  assetUrl: string | null;
  assetMimeType: string | null;
  assetFilename: string | null;
  sectionLayout: string | null;
  posterUrl: string | null;
  tiles: TileDto[];
};

type PageDto = {
  id: string;
  name: string;
  slug: string;
  isHomepage: boolean;
  position: number;
  modules: ModuleDto[];
};

const driveUrl = (gid: string | null) =>
  gid ? `/api/drive/file/${encodeURIComponent(gid)}` : null;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prospects see the demo portal — no real storefront data.
  if (session.user?.clientStatus === "Prospect") {
    return NextResponse.json({
      clientIdCode: "DEMO",
      clientName: "Demo Brand",
      version: null,
      pages: [],
    });
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

  // 1. Current (highest) version for this client only. No auto-create.
  const versionRows = await db
    .select({
      id: storefrontVersions.id,
      versionNumber: storefrontVersions.versionNumber,
      status: storefrontVersions.status,
    })
    .from(storefrontVersions)
    .where(eq(storefrontVersions.clientIdCode, clientCode))
    .orderBy(asc(storefrontVersions.versionNumber));

  const current = versionRows[versionRows.length - 1];
  if (!current) {
    return NextResponse.json({
      clientIdCode: clientCode,
      clientName,
      version: null,
      pages: [],
    });
  }

  // 2. Pages of the current version, in position order.
  const pageRows = await db
    .select()
    .from(storefrontPages)
    .where(eq(storefrontPages.versionId, current.id))
    .orderBy(asc(storefrontPages.position));

  const pageIds = pageRows.map((p) => p.id);

  // 3. Modules across all pages, then tiles for the split sections.
  const moduleRows = pageIds.length
    ? await db
        .select()
        .from(storefrontModules)
        .where(inArray(storefrontModules.pageId, pageIds))
        .orderBy(asc(storefrontModules.position))
    : [];

  const splitModuleIds = moduleRows
    .filter((m) => m.moduleType === "split_section")
    .map((m) => m.id);

  const tileRows = splitModuleIds.length
    ? await db
        .select()
        .from(storefrontModuleTiles)
        .where(inArray(storefrontModuleTiles.moduleId, splitModuleIds))
        .orderBy(asc(storefrontModuleTiles.position))
    : [];

  // ─── Stitch ─────────────────────────────────────────────────────────
  const tilesByModule = new Map<string, TileDto[]>();
  for (const t of tileRows) {
    const arr = tilesByModule.get(t.moduleId) ?? [];
    arr.push({
      id: t.id,
      position: t.position,
      title: t.title,
      assetUrl: driveUrl(t.driveFileId),
      assetFilename: t.assetFilename,
    });
    tilesByModule.set(t.moduleId, arr);
  }

  const modulesByPage = new Map<string, ModuleDto[]>();
  for (const m of moduleRows) {
    const arr = modulesByPage.get(m.pageId) ?? [];
    arr.push({
      id: m.id,
      position: m.position,
      moduleType: m.moduleType,
      title: m.title,
      assetUrl: driveUrl(m.driveFileId),
      assetMimeType: m.assetMimeType,
      assetFilename: m.assetFilename,
      sectionLayout: m.sectionLayout,
      posterUrl: driveUrl(m.posterDriveFileId),
      tiles: tilesByModule.get(m.id) ?? [],
    });
    modulesByPage.set(m.pageId, arr);
  }

  const pages: PageDto[] = pageRows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    isHomepage: p.isHomepage,
    position: p.position,
    modules: modulesByPage.get(p.id) ?? [],
  }));

  return NextResponse.json({
    clientIdCode: clientCode,
    clientName,
    version: { versionNumber: current.versionNumber, status: current.status },
    pages,
  });
}
