/**
 * GET  /api/storefront/[clientIdCode]/pages?version=N
 *   Ensures the client has a current version and that version has a Homepage.
 *   Returns pages+modules for the requested version (default = current).
 *
 * POST /api/storefront/[clientIdCode]/pages
 *   Body: { name: string, version?: number }
 *   Creates a new page under the selected version (default current).
 *   Returns the created page DTO (modules: []).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, asc, max, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontPages, storefrontModules, storefrontModuleTiles } from "@/lib/db/schema";
import {
  ensureStorefrontVersion,
  getStorefrontVersions,
  resolveStorefrontPageFolder,
} from "@/lib/storefront/drive";

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "page";
}

/** Ensure a unique slug within a version by appending -2, -3, … on collision. */
async function uniqueSlug(versionId: string, base: string, excludePageId?: string): Promise<string> {
  const slugRows = await db
    .select({ id: storefrontPages.id, slug: storefrontPages.slug })
    .from(storefrontPages)
    .where(eq(storefrontPages.versionId, versionId))
    .limit(200);

  const taken = new Set(
    slugRows.filter((r) => r.id !== excludePageId).map((r) => r.slug)
  );

  let candidate = base;
  let attempt = 1;
  while (taken.has(candidate)) {
    attempt++;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

/** Return all pages + nested modules for a version in position order. */
async function getPagesWithModules(versionId: string) {
  const pages = await db
    .select()
    .from(storefrontPages)
    .where(eq(storefrontPages.versionId, versionId))
    .orderBy(asc(storefrontPages.position));

  if (pages.length === 0) return [];

  const pageIds = pages.map((p) => p.id);

  // Fetch all modules for these pages in one query, then group in-memory
  const allModules = await Promise.all(
    pageIds.map((pid) =>
      db
        .select()
        .from(storefrontModules)
        .where(eq(storefrontModules.pageId, pid))
        .orderBy(asc(storefrontModules.position))
    )
  );

  // Gather tiles for any split_section modules (one query, grouped in-memory).
  const flatModules = allModules.flat();
  const splitModuleIds = flatModules
    .filter((m) => m.moduleType === "split_section")
    .map((m) => m.id);

  const tilesByModule = new Map<
    string,
    { id: string; position: number; title: string | null; linkUrl: string | null; linkLabel: string | null; driveFileId: string | null; assetMimeType: string | null; assetFilename: string | null }[]
  >();
  if (splitModuleIds.length > 0) {
    const tileRows = await db
      .select()
      .from(storefrontModuleTiles)
      .where(inArray(storefrontModuleTiles.moduleId, splitModuleIds))
      .orderBy(asc(storefrontModuleTiles.position));
    for (const t of tileRows) {
      const arr = tilesByModule.get(t.moduleId) ?? [];
      arr.push({
        id: t.id,
        position: t.position,
        title: t.title,
        linkUrl: t.linkUrl,
        linkLabel: t.linkLabel,
        driveFileId: t.driveFileId,
        assetMimeType: t.assetMimeType,
        assetFilename: t.assetFilename,
      });
      tilesByModule.set(t.moduleId, arr);
    }
  }

  return pages.map((page, i) => ({
    id: page.id,
    name: page.name,
    slug: page.slug,
    metaDescription: page.metaDescription,
    isHomepage: page.isHomepage,
    position: page.position,
    modules: allModules[i].map((m) => ({
      id: m.id,
      position: m.position,
      moduleType: m.moduleType,
      title: m.title,
      linkUrl: m.linkUrl,
      linkLabel: m.linkLabel,
      driveFileId: m.driveFileId,
      assetMimeType: m.assetMimeType,
      assetFilename: m.assetFilename,
      containsAiPeople: m.containsAiPeople,
      sectionLayout: m.sectionLayout,
      posterDriveFileId: m.posterDriveFileId,
      posterMimeType: m.posterMimeType,
      posterFilename: m.posterFilename,
      ...(m.moduleType === "split_section"
        ? { tiles: tilesByModule.get(m.id) ?? [] }
        : {}),
    })),
  }));
}

/** Ensure the client has a current version and that version has a Homepage. */
async function ensureVersionAndHomepage(
  clientIdCode: string
): Promise<{ id: string; versionNumber: number }> {
  const version = await ensureStorefrontVersion(clientIdCode);
  const existing = await db
    .select({ id: storefrontPages.id })
    .from(storefrontPages)
    .where(eq(storefrontPages.versionId, version.id))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(storefrontPages).values({
      clientIdCode,
      versionId: version.id,
      name: "Homepage",
      slug: "homepage",
      isHomepage: true,
      position: 0,
    });
  }
  return version;
}

/** Resolve a version row id for the client by number; falls back to current. */
async function resolveVersionId(
  clientIdCode: string,
  versionParam: string | null
): Promise<{ id: string; versionNumber: number } | null> {
  const versions = await getStorefrontVersions(clientIdCode);
  if (versions.length === 0) return null;
  const num = versionParam ? parseInt(versionParam, 10) : NaN;
  const match = Number.isInteger(num) ? versions.find((v) => v.versionNumber === num) : undefined;
  const chosen = match ?? versions[versions.length - 1]; // highest = current default
  return { id: chosen.id, versionNumber: chosen.versionNumber };
}

// ── handlers ──────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode } = await params;
  await ensureVersionAndHomepage(clientIdCode);

  const versionParam = new URL(req.url).searchParams.get("version");
  const target = await resolveVersionId(clientIdCode, versionParam);
  if (!target) return NextResponse.json([]);

  const pages = await getPagesWithModules(target.id);
  return NextResponse.json(pages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Invalid body: name is required" }, { status: 400 });
  }

  await ensureVersionAndHomepage(clientIdCode);
  const versionParam = body.version !== undefined ? String(body.version) : null;
  const target = await resolveVersionId(clientIdCode, versionParam);
  if (!target) return NextResponse.json({ error: "No version" }, { status: 400 });

  const [{ maxPos }] = await db
    .select({ maxPos: max(storefrontPages.position) })
    .from(storefrontPages)
    .where(eq(storefrontPages.versionId, target.id));

  const nextPosition = (maxPos ?? 0) + 1;
  const baseSlug = slugify(body.name);
  const slug = await uniqueSlug(target.id, baseSlug);

  const [created] = await db
    .insert(storefrontPages)
    .values({
      clientIdCode,
      versionId: target.id,
      name: body.name.trim(),
      slug,
      isHomepage: false,
      position: nextPosition,
    })
    .returning();

  // Eager-create the page's Drive folder (+ empty Master_Files) under the
  // current version so manual PSD uploads have a home. Best-effort — a Drive
  // hiccup must not block page creation; asset upload re-creates lazily.
  try {
    await resolveStorefrontPageFolder({
      clientIdCode,
      slug: created.slug,
      version: target.versionNumber,
    });
  } catch (err) {
    console.error(
      `[storefront POST page] eager folder create failed for ${created.slug}:`,
      err instanceof Error ? err.message : String(err)
    );
  }

  return NextResponse.json({
    id: created.id,
    name: created.name,
    slug: created.slug,
    metaDescription: created.metaDescription,
    isHomepage: created.isHomepage,
    position: created.position,
    modules: [],
  });
}
