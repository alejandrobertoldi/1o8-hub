import { hasAdminPowers } from "@/lib/roles";
/**
 * POST   /api/storefront/modules/[moduleId]/tiles/[tileId]/asset
 *   multipart/form-data: file (+ optional width/height). Uploads the tile image
 *   to the page folder, writes the asset columns on the tile row, trashes the
 *   old file. Validates against the image spec. Returns { driveFileId, warnings }.
 * DELETE /api/storefront/modules/[moduleId]/tiles/[tileId]/asset
 *   Trashes the tile's Drive file (best-effort) and nulls its asset columns.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontModuleTiles, storefrontModules, storefrontPages, storefrontVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { resolveStorefrontPageFolder } from "@/lib/storefront/drive";
import { STOREFRONT_MODULE_SPECS, validateAsset } from "@/lib/storefront/module-specs";
import { storefrontAssetFilename } from "@/lib/storefront/drive-naming";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function extFromFilename(name: string): string | undefined {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : undefined;
}

async function authorize() {
  const session = await getAuthSession();
  if (!session) return null;
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") return null;
  return session;
}

async function loadTile(moduleId: string, tileId: string) {
  const [row] = await db
    .select({
      tileId: storefrontModuleTiles.id,
      tilePosition: storefrontModuleTiles.position,
      tileDriveFileId: storefrontModuleTiles.driveFileId,
      modulePosition: storefrontModules.position,
      clientIdCode: storefrontPages.clientIdCode,
      slug: storefrontPages.slug,
      versionNumber: storefrontVersions.versionNumber,
    })
    .from(storefrontModuleTiles)
    .innerJoin(storefrontModules, eq(storefrontModules.id, storefrontModuleTiles.moduleId))
    .innerJoin(storefrontPages, eq(storefrontPages.id, storefrontModules.pageId))
    .innerJoin(storefrontVersions, eq(storefrontVersions.id, storefrontPages.versionId))
    .where(and(eq(storefrontModuleTiles.id, tileId), eq(storefrontModuleTiles.moduleId, moduleId)))
    .limit(1);
  return row ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string; tileId: string }> }
) {
  const session = await authorize();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId, tileId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const widthRaw = formData.get("width");
  const heightRaw = formData.get("height");
  const width = widthRaw !== null && widthRaw !== "" ? Number(widthRaw) : undefined;
  const height = heightRaw !== null && heightRaw !== "" ? Number(heightRaw) : undefined;

  const tile = await loadTile(moduleId, tileId);
  if (!tile) return NextResponse.json({ error: "Tile not found" }, { status: 404 });

  const spec = STOREFRONT_MODULE_SPECS["image"];
  const bytes = file.size;
  const mime = file.type;

  const { ok, warnings } = validateAsset(spec, { width, height, bytes, mime });
  if (!ok) {
    return NextResponse.json({ error: warnings[0] ?? "Unsupported file type" }, { status: 400 });
  }

  const ext = MIME_EXT[mime.toLowerCase()] ?? extFromFilename(file.name) ?? "bin";

  const filename = storefrontAssetFilename({
    clientIdCode: tile.clientIdCode,
    slug: tile.slug,
    position: tile.modulePosition,
    moduleType: "split_section",
    ext,
    tilePosition: tile.tilePosition,
  });

  let folderGid: string;
  try {
    folderGid = await resolveStorefrontPageFolder({
      clientIdCode: tile.clientIdCode,
      slug: tile.slug,
      version: tile.versionNumber,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive folder error: ${msg}` }, { status: 502 });
  }

  const oldGid = tile.tileDriveFileId ?? null;

  const buffer = Buffer.from(await file.arrayBuffer());
  let uploadedGid: string;
  try {
    const uploaded = await driveClient.uploadFile(filename, folderGid, buffer, mime);
    uploadedGid = uploaded.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive upload failed: ${msg}` }, { status: 502 });
  }

  try {
    await db
      .update(storefrontModuleTiles)
      .set({ driveFileId: uploadedGid, assetMimeType: mime, assetFilename: filename, updatedAt: new Date() })
      .where(eq(storefrontModuleTiles.id, tileId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[storefront POST tile asset] DB update failed:", msg);
    try { await driveClient.deleteFile(uploadedGid); }
    catch (cleanupErr) { console.error("[storefront POST tile asset] orphan cleanup failed:", cleanupErr); }
    return NextResponse.json({ error: `DB update failed: ${msg}` }, { status: 500 });
  }

  if (oldGid) {
    try { await driveClient.deleteFile(oldGid); }
    catch (cleanupErr) {
      const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      console.error(`[storefront POST tile asset] old file ${oldGid} trash failed: ${m}`);
    }
  }

  return NextResponse.json({ driveFileId: uploadedGid, warnings });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string; tileId: string }> }
) {
  const session = await authorize();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId, tileId } = await params;

  const tile = await loadTile(moduleId, tileId);
  if (!tile) return NextResponse.json({ error: "Tile not found" }, { status: 404 });

  if (tile.tileDriveFileId) {
    try { await driveClient.deleteFile(tile.tileDriveFileId); }
    catch (cleanupErr) {
      const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      console.error(`[storefront DELETE tile asset] Drive trash failed for ${tile.tileDriveFileId}: ${m}`);
    }
  }

  try {
    await db
      .update(storefrontModuleTiles)
      .set({ driveFileId: null, assetMimeType: null, assetFilename: null, updatedAt: new Date() })
      .where(eq(storefrontModuleTiles.id, tileId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[storefront DELETE tile asset] DB update failed:", msg);
    return NextResponse.json({ error: "Failed to clear tile asset" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
