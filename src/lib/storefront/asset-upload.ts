/**
 * Shared prepare/commit for storefront module and tile assets.
 *
 * Bytes never pass through here — the browser PUTs to a Drive resumable
 * session. These helpers only name the file, resolve the folder, and write
 * the Drive id onto the module/tile row.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { storefrontModules, storefrontModuleTiles, storefrontPages, storefrontVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { storefrontExtFromMime } from "@/lib/storefront/asset-mime";
import { storefrontAssetFilename } from "@/lib/storefront/drive-naming";
import { resolveStorefrontPageFolder } from "@/lib/storefront/drive";
import { STOREFRONT_MODULE_SPECS, validateAsset } from "@/lib/storefront/module-specs";

export type AssetSlot = "main" | "poster";

export type PrepareFailure = { ok: false; status: number; error: string };

export type PreparedModuleAsset = {
  ok: true;
  moduleId: string;
  slot: AssetSlot;
  mime: string;
  filename: string;
  folderGid: string;
  warnings: string[];
  oldGid: string | null;
};

export type PreparedTileAsset = {
  ok: true;
  tileId: string;
  mime: string;
  filename: string;
  folderGid: string;
  warnings: string[];
  oldGid: string | null;
};

function parseSlot(raw: unknown): AssetSlot | PrepareFailure {
  if (raw == null || raw === "" || raw === "main") return "main";
  if (raw === "poster") return "poster";
  return { ok: false, status: 400, error: 'Invalid slot. Must be "main" or "poster"' };
}

async function loadModule(moduleId: string) {
  const [row] = await db
    .select({
      id: storefrontModules.id,
      position: storefrontModules.position,
      moduleType: storefrontModules.moduleType,
      driveFileId: storefrontModules.driveFileId,
      posterDriveFileId: storefrontModules.posterDriveFileId,
      pageId: storefrontModules.pageId,
      clientIdCode: storefrontPages.clientIdCode,
      slug: storefrontPages.slug,
      versionNumber: storefrontVersions.versionNumber,
    })
    .from(storefrontModules)
    .innerJoin(storefrontPages, eq(storefrontPages.id, storefrontModules.pageId))
    .innerJoin(storefrontVersions, eq(storefrontVersions.id, storefrontPages.versionId))
    .where(eq(storefrontModules.id, moduleId))
    .limit(1);
  return row ?? null;
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

export async function prepareModuleAsset(opts: {
  moduleId: string;
  slotRaw: unknown;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  originalName?: string;
}): Promise<PreparedModuleAsset | PrepareFailure> {
  const slot = parseSlot(opts.slotRaw);
  if (typeof slot !== "string") return slot;

  const mod = await loadModule(opts.moduleId);
  if (!mod) return { ok: false, status: 404, error: "Module not found" };

  const spec = slot === "poster"
    ? STOREFRONT_MODULE_SPECS["cover_image"]
    : STOREFRONT_MODULE_SPECS[mod.moduleType];

  const { ok, warnings } = validateAsset(spec, {
    width: opts.width,
    height: opts.height,
    bytes: opts.bytes,
    mime: opts.mime,
  });
  if (!ok) {
    return { ok: false, status: 400, error: warnings[0] ?? "Unsupported file type" };
  }

  const ext = storefrontExtFromMime(opts.mime, opts.originalName);
  const filename = storefrontAssetFilename({
    clientIdCode: mod.clientIdCode,
    slug: mod.slug,
    position: mod.position,
    moduleType: mod.moduleType,
    ext,
    slot: slot === "poster" ? "poster" : undefined,
  });

  let folderGid: string;
  try {
    folderGid = await resolveStorefrontPageFolder({
      clientIdCode: mod.clientIdCode,
      slug: mod.slug,
      version: mod.versionNumber,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `Drive folder error: ${msg}` };
  }

  const oldGid = slot === "poster"
    ? (mod.posterDriveFileId ?? null)
    : (mod.driveFileId ?? null);

  return {
    ok: true,
    moduleId: opts.moduleId,
    slot,
    mime: opts.mime,
    filename,
    folderGid,
    warnings,
    oldGid,
  };
}

export async function commitModuleAsset(
  prepared: PreparedModuleAsset,
  driveFileId: string
): Promise<{ ok: true } | PrepareFailure> {
  try {
    if (prepared.slot === "poster") {
      await db
        .update(storefrontModules)
        .set({
          posterDriveFileId: driveFileId,
          posterMimeType: prepared.mime,
          posterFilename: prepared.filename,
          updatedAt: new Date(),
        })
        .where(eq(storefrontModules.id, prepared.moduleId));
    } else {
      await db
        .update(storefrontModules)
        .set({
          driveFileId,
          assetMimeType: prepared.mime,
          assetFilename: prepared.filename,
          updatedAt: new Date(),
        })
        .where(eq(storefrontModules.id, prepared.moduleId));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[storefront commit asset] DB update failed:", msg);
    try { await driveClient.deleteFile(driveFileId); }
    catch (cleanupErr) { console.error("[storefront commit asset] orphan cleanup failed:", cleanupErr); }
    return { ok: false, status: 500, error: `DB update failed: ${msg}` };
  }

  if (prepared.oldGid) {
    try { await driveClient.deleteFile(prepared.oldGid); }
    catch (cleanupErr) {
      const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      console.error(`[storefront commit asset] old ${prepared.slot} file ${prepared.oldGid} trash failed: ${m}`);
    }
  }
  return { ok: true };
}

export async function prepareTileAsset(opts: {
  moduleId: string;
  tileId: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  originalName?: string;
}): Promise<PreparedTileAsset | PrepareFailure> {
  const tile = await loadTile(opts.moduleId, opts.tileId);
  if (!tile) return { ok: false, status: 404, error: "Tile not found" };

  const spec = STOREFRONT_MODULE_SPECS["image"];
  const { ok, warnings } = validateAsset(spec, {
    width: opts.width,
    height: opts.height,
    bytes: opts.bytes,
    mime: opts.mime,
  });
  if (!ok) {
    return { ok: false, status: 400, error: warnings[0] ?? "Unsupported file type" };
  }

  const ext = storefrontExtFromMime(opts.mime, opts.originalName);
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
    return { ok: false, status: 502, error: `Drive folder error: ${msg}` };
  }

  return {
    ok: true,
    tileId: opts.tileId,
    mime: opts.mime,
    filename,
    folderGid,
    warnings,
    oldGid: tile.tileDriveFileId ?? null,
  };
}

export async function commitTileAsset(
  prepared: PreparedTileAsset,
  driveFileId: string
): Promise<{ ok: true } | PrepareFailure> {
  try {
    await db
      .update(storefrontModuleTiles)
      .set({
        driveFileId,
        assetMimeType: prepared.mime,
        assetFilename: prepared.filename,
        updatedAt: new Date(),
      })
      .where(eq(storefrontModuleTiles.id, prepared.tileId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[storefront commit tile asset] DB update failed:", msg);
    try { await driveClient.deleteFile(driveFileId); }
    catch (cleanupErr) { console.error("[storefront commit tile asset] orphan cleanup failed:", cleanupErr); }
    return { ok: false, status: 500, error: `DB update failed: ${msg}` };
  }

  if (prepared.oldGid) {
    try { await driveClient.deleteFile(prepared.oldGid); }
    catch (cleanupErr) {
      const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      console.error(`[storefront commit tile asset] old file ${prepared.oldGid} trash failed: ${m}`);
    }
  }
  return { ok: true };
}
