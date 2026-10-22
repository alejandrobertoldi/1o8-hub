/**
 * Shared target resolution for listing-image uploads.
 *
 * Both upload paths need the same answers before any bytes move: which Drive
 * folder the file belongs in, what it must be named, and which version number it
 * takes. Extracted from the direct-POST route so the resumable path cannot drift
 * from it.
 *
 * - Browser -> Drive (any size): /api/design/listing-images/upload-session
 *   Bytes never pass through Vercel, so there is no 4.5 MB ceiling.
 * - Direct POST is leftover for small files only and is not used by the UI.
 */

import { db } from "@/lib/db";
import { driveFolders, master, variations, listingImageSlotVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { eq, and, sql } from "drizzle-orm";

export function sanitizeFileName(str: string): string {
  return str.replace(/[\/\\:*?"<>|]/g, "_").trim();
}

/** Drive folder_type for the per-variation Master Files subfolder. */
export const LISTING_IMAGE_MASTER_FOLDER_TYPE = "listing_image_master" as const;

/**
 * Empty Master Files subfolder inside each listing-images variation folder,
 * matching brand story / A+: `{variationFolder}_Master_Files`.
 */
export function listingImageMasterSubfolderName(variationFolderName: string): string {
  return `${variationFolderName}_Master_Files`;
}

type FolderRow = { id: string; driveFolderId: string; path: string };

/**
 * Find or create a child of `parent` in Drive + drive_folders.
 * Parallel listing-image uploads used to each call createFolder, which Drive
 * allows (same name, two folders). The unique path index kept one DB row; the
 * loser left an empty duplicate in Drive.
 */
async function ensureChildFolder(opts: {
  clientIdCode: string;
  parent: FolderRow;
  folderName: string;
  folderType: string;
}): Promise<FolderRow> {
  const path = `${opts.parent.path}/${opts.folderName}`;

  const [existing] = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(and(eq(driveFolders.clientIdCode, opts.clientIdCode), eq(driveFolders.path, path)))
    .limit(1);

  if (existing) {
    const alive = await driveClient.isFolderAlive(existing.driveFolderId);
    if (alive) return existing;
    console.warn(
      `[listing-images] folder ${existing.driveFolderId} (${path}) is trashed or missing — deleting DB row and recreating`
    );
    await db.delete(driveFolders).where(eq(driveFolders.id, existing.id));
  }

  const found = await driveClient.findChildFolder(opts.parent.driveFolderId, opts.folderName);
  const createdNew = !found;
  const driveId = found?.id ?? (await driveClient.createFolder(opts.folderName, opts.parent.driveFolderId)).id;

  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode: opts.clientIdCode,
      driveFolderId: driveId,
      folderType: opts.folderType,
      path,
      parentFolderId: opts.parent.id,
      name: opts.folderName,
    })
    .onConflictDoNothing()
    .returning({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    });
  if (inserted[0]) return inserted[0];

  const [winner] = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(and(eq(driveFolders.clientIdCode, opts.clientIdCode), eq(driveFolders.path, path)))
    .limit(1);
  if (!winner) throw new Error(`Failed to resolve Drive folder ${path}`);

  if (createdNew && winner.driveFolderId !== driveId) {
    try {
      await driveClient.deleteFile(driveId);
    } catch (cleanupErr) {
      console.warn("[listing-images] leftover duplicate folder cleanup failed:", cleanupErr);
    }
  }
  return winner;
}

export function getExt(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  if (m === "image/svg+xml") return "svg";
  const sub = m.split("/")[1] ?? "bin";
  return sub === "jpeg" ? "jpg" : sub;
}

/**
 * Lowest unused positive version for a (product, slot).
 *
 * A number freed by a delete gets reused (delete V02 -> next upload is V02
 * again), so the Drive folder stays gap-free.
 */
export function nextUnusedVersion(used: readonly number[]): number {
  const taken = new Set(used);
  let next = 1;
  while (taken.has(next)) next++;
  return next;
}

export type ResolvedTarget = {
  ok: true;
  /** Drive ID of the per-variation subfolder the file goes in. */
  folderDriveId: string;
  /** drive_folders.id for the same folder, for the drive_files FK. */
  folderDbId: string;
  /** Final Drive file name, e.g. B0GF1QGP4C.PT01.V01.png */
  displayName: string;
  versionNumber: number;
};

export type ResolveFailure = {
  ok: false;
  status: number;
  error: string;
};

/**
 * Resolve (and create, if missing) the Drive folder chain for a listing image
 * and compute its name and version. Performs no writes to drive_files or
 * listing_image_slot_versions — the caller records those once bytes have landed.
 */
export async function resolveListingImageTarget(opts: {
  productId: string;
  clientIdCode: string;
  columnName: string;
  mimeType: string;
}): Promise<ResolvedTarget | ResolveFailure> {
  const { productId, clientIdCode, columnName, mimeType } = opts;

  // Authoritative lookup of variation context from DB (do not trust form fields).
  const [product] = await db
    .select({
      asin: master.asin,
      variationGroup: master.variationGroup,
      variationName: variations.name,
      variationIdJson: sql<string | null>`COALESCE(${master.variations}->>'VariationID', ${master.otherAttributes}->>'VariationID', ${master.rawColumnValues}->>'VariationID')`,
    })
    .from(master)
    .leftJoin(variations, eq(master.variationRef, variations.id))
    .where(eq(master.id, productId))
    .limit(1);

  if (!product || !product.asin) {
    return { ok: false, status: 404, error: `Product ${productId} not found or missing ASIN` };
  }

  const sanitizedAsin = sanitizeFileName(product.asin);
  const varId = product.variationIdJson ?? product.asin;
  const varName = product.variationName ?? product.variationGroup ?? product.asin;
  const folderName = sanitizeFileName(`${varId}_${varName}`);

  const existingVersions = await db
    .select({ versionNumber: listingImageSlotVersions.versionNumber })
    .from(listingImageSlotVersions)
    .where(
      and(
        eq(listingImageSlotVersions.productId, productId),
        eq(listingImageSlotVersions.slot, columnName)
      )
    );
  const versionNumber = nextUnusedVersion(existingVersions.map((r) => r.versionNumber));
  const versionTag = `V${versionNumber.toString().padStart(2, "0")}`;
  const displayName = `${sanitizedAsin}.${columnName}.${versionTag}.${getExt(mimeType)}`;

  // Slot images land in Listing Images/{varFolder}/. An empty Master Files
  // subfolder sits beside them for PSDs.
  const listingImagesFolders = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path })
    .from(driveFolders)
    .where(
      and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "listing_images"))
    )
    .limit(1);

  let listingImagesFolder = listingImagesFolders[0];

  if (!listingImagesFolder) {
    const [clientRoot] = await db
      .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path })
      .from(driveFolders)
      .where(and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "client")))
      .limit(1);

    if (!clientRoot) {
      return { ok: false, status: 404, error: `Client "${clientIdCode}" has no Drive root folder.` };
    }

    const graphicsRows = await db
      .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path })
      .from(driveFolders)
      .where(and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "graphics")))
      .limit(1);

    let graphicsFolder = graphicsRows[0];
    if (!graphicsFolder) {
      const driveGraphics = await driveClient.createFolder(`${clientIdCode}_Graphics`, clientRoot.driveFolderId);
      const [g] = await db
        .insert(driveFolders)
        .values({
          clientIdCode,
          driveFolderId: driveGraphics.id,
          folderType: "graphics",
          path: `${clientRoot.path}/Graphics`,
          parentFolderId: clientRoot.id,
          name: `${clientIdCode}_Graphics`,
        })
        .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path });
      graphicsFolder = g;
    }

    const driveLiFolder = await driveClient.createFolder(`${clientIdCode}_Listing Images`, graphicsFolder.driveFolderId);
    const [li] = await db
      .insert(driveFolders)
      .values({
        clientIdCode,
        driveFolderId: driveLiFolder.id,
        folderType: "listing_images",
        path: `${graphicsFolder.path}/Listing Images`,
        parentFolderId: graphicsFolder.id,
        name: `${clientIdCode}_Listing Images`,
      })
      .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path });
    listingImagesFolder = li;
  }

  const asinFolder = await ensureChildFolder({
    clientIdCode,
    parent: listingImagesFolder,
    folderName,
    folderType: "asin_li",
  });

  await ensureChildFolder({
    clientIdCode,
    parent: asinFolder,
    folderName: listingImageMasterSubfolderName(folderName),
    folderType: LISTING_IMAGE_MASTER_FOLDER_TYPE,
  });

  return {
    ok: true,
    folderDriveId: asinFolder.driveFolderId,
    folderDbId: asinFolder.id,
    displayName,
    versionNumber,
  };
}
