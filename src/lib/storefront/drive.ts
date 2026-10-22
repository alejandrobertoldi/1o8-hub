import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { driveFolders, storefrontModules, storefrontModuleTiles, storefrontPages, storefrontVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { resolveUploadFolder } from "@/lib/drive-upload";

// ── Storefront Drive folder structure ────────────────────────────────────────
//
//   {client}_Storefront/                            (existing root, folderType "storefront")
//     {client}_Storefront_V01/                      ("storefront_version")
//       {client}_Storefront_V01_{slug}/             ("storefront_page")  ← app uploads land here
//         {client}_Storefront_V01_{slug}_Master_Files/  ("storefront_page_master") ← manual PSDs
//
// Version source of truth: storefront_versions table (not Drive folder-name parsing).

const pad2 = (n: number) => String(n).padStart(2, "0");

const FOLDER_COLS = {
  id: driveFolders.id,
  driveFolderId: driveFolders.driveFolderId,
  path: driveFolders.path,
} as const;

type FolderRow = { id: string; driveFolderId: string; path: string };

const versionFolderName = (c: string, v: number) => `${c}_Storefront_V${pad2(v)}`;
const pageFolderName = (c: string, v: number, slug: string) =>
  `${versionFolderName(c, v)}_${slug}`;
const masterFolderName = (c: string, v: number, slug: string) =>
  `${pageFolderName(c, v, slug)}_Master_Files`;

/** Find or create a child folder by path, tracked in drive_folders. Race-safe. */
async function ensureChildFolder(
  parent: FolderRow,
  clientIdCode: string,
  folderName: string,
  folderType: string
): Promise<FolderRow> {
  const path = `${parent.path}/${folderName}`;

  const [existing] = await db
    .select(FOLDER_COLS)
    .from(driveFolders)
    .where(eq(driveFolders.path, path))
    .limit(1);
  if (existing) return existing;

  const drive = await driveClient.createFolder(folderName, parent.driveFolderId);

  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode,
      driveFolderId: drive.id,
      folderType,
      path,
      parentFolderId: parent.id,
      name: folderName,
    })
    .onConflictDoNothing()
    .returning(FOLDER_COLS);
  if (inserted[0]) return inserted[0];

  // Lost a creation race — re-fetch the row that won.
  const [refetch] = await db
    .select(FOLDER_COLS)
    .from(driveFolders)
    .where(eq(driveFolders.path, path))
    .limit(1);
  if (!refetch) throw new Error(`Failed to resolve Drive folder ${path}`);
  return refetch;
}

/** The client's existing storefront root folder (creates it if truly absent). */
async function getStorefrontRoot(clientIdCode: string): Promise<FolderRow> {
  const [row] = await db
    .select(FOLDER_COLS)
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, clientIdCode),
        eq(driveFolders.folderType, "storefront")
      )
    )
    .limit(1);
  if (row) return row;

  // No storefront root yet — create via the standard resolver, then re-fetch
  // for its path (resolveUploadFolder doesn't return path).
  const created = await resolveUploadFolder({ clientIdCode, folderType: "storefront" });
  if (!created) {
    throw new Error(`No Drive client root for ${clientIdCode} — client not onboarded`);
  }
  const [row2] = await db
    .select(FOLDER_COLS)
    .from(driveFolders)
    .where(eq(driveFolders.id, created.id))
    .limit(1);
  if (!row2) throw new Error("storefront root not found after create");
  return row2;
}

/** Ensure a page folder (+ its empty Master_Files subfolder) exists. */
async function ensurePageFolder(
  versionFolder: FolderRow,
  clientIdCode: string,
  version: number,
  slug: string
): Promise<FolderRow> {
  const page = await ensureChildFolder(
    versionFolder,
    clientIdCode,
    pageFolderName(clientIdCode, version, slug),
    "storefront_page"
  );
  // Eager-create the (empty) Master_Files subfolder so manual PSD uploads have a home.
  await ensureChildFolder(
    page,
    clientIdCode,
    masterFolderName(clientIdCode, version, slug),
    "storefront_page_master"
  );
  return page;
}

/** Create the version's top folder. Page/Master_Files folders are created
 *  lazily per page (resolveStorefrontPageFolder) — NOT enumerated here, since
 *  page slug sets differ per version once content diverges.
 *  Returns the version folder's drive_folders.id (UUID) for linking. */
async function buildVersion(clientIdCode: string, version: number): Promise<string> {
  const root = await getStorefrontRoot(clientIdCode);
  const versionFolder = await ensureChildFolder(
    root,
    clientIdCode,
    versionFolderName(clientIdCode, version),
    "storefront_version"
  );
  return versionFolder.id; // drive_folders.id (UUID), matches storefront_versions.drive_folder_id
}

/** All versions for a client, ascending by version number. */
export async function getStorefrontVersions(clientIdCode: string) {
  return db
    .select({
      id: storefrontVersions.id,
      versionNumber: storefrontVersions.versionNumber,
      status: storefrontVersions.status,
      updatedAt: storefrontVersions.updatedAt,
      driveFolderGid: driveFolders.driveFolderId,
    })
    .from(storefrontVersions)
    .leftJoin(driveFolders, eq(driveFolders.id, storefrontVersions.driveFolderId))
    .where(eq(storefrontVersions.clientIdCode, clientIdCode))
    .orderBy(asc(storefrontVersions.versionNumber));
}

/** The current (highest) version row, creating V01 + its folder tree if none. */
export async function ensureStorefrontVersion(
  clientIdCode: string
): Promise<{ id: string; versionNumber: number }> {
  const [top] = await db
    .select({ id: storefrontVersions.id, versionNumber: storefrontVersions.versionNumber })
    .from(storefrontVersions)
    .where(eq(storefrontVersions.clientIdCode, clientIdCode))
    .orderBy(desc(storefrontVersions.versionNumber))
    .limit(1);
  if (top) return top;

  // No version yet — create V01 row + its Drive folder, link them.
  const versionFolderGid = await buildVersion(clientIdCode, 1);
  const [created] = await db
    .insert(storefrontVersions)
    .values({ clientIdCode, versionNumber: 1, driveFolderId: versionFolderGid })
    .onConflictDoNothing()
    .returning({ id: storefrontVersions.id, versionNumber: storefrontVersions.versionNumber });
  if (created) return created;
  // Lost a race — re-fetch.
  const [row] = await db
    .select({ id: storefrontVersions.id, versionNumber: storefrontVersions.versionNumber })
    .from(storefrontVersions)
    .where(eq(storefrontVersions.clientIdCode, clientIdCode))
    .orderBy(desc(storefrontVersions.versionNumber))
    .limit(1);
  if (!row) throw new Error(`Failed to ensure storefront version for ${clientIdCode}`);
  return row;
}

export async function getCurrentStorefrontVersionNumber(clientIdCode: string): Promise<number> {
  return (await ensureStorefrontVersion(clientIdCode)).versionNumber;
}

/** Bump to the next version: copy current version's pages + modules + Drive
 *  assets into a fresh version folder tree. Returns the new version row. */
export async function createNextStorefrontVersion(
  clientIdCode: string
): Promise<{ id: string; versionNumber: number }> {
  const current = await ensureStorefrontVersion(clientIdCode);
  const nextNum = current.versionNumber + 1;

  // 1. Build the new version's folder tree (page folders are created per-page below).
  const versionFolderGid = await buildVersion(clientIdCode, nextNum);
  const [newVersion] = await db
    .insert(storefrontVersions)
    .values({ clientIdCode, versionNumber: nextNum, driveFolderId: versionFolderGid })
    .returning({ id: storefrontVersions.id, versionNumber: storefrontVersions.versionNumber });

  // 2. Copy each page + its modules forward. If any step throws (e.g. a Drive
  //    copyFile 5xx), delete the new version row so we never leave a half-copied
  //    version as the client's "current" one — cascade removes its pages+modules.
  //    ponytail: Drive copies already made are orphaned (no version-delete flow
  //    exists yet); trash them when one lands.
  try {
    const pages = await db
      .select()
      .from(storefrontPages)
      .where(eq(storefrontPages.versionId, current.id))
      .orderBy(asc(storefrontPages.position));

    for (const page of pages) {
    const [newPage] = await db
      .insert(storefrontPages)
      .values({
        clientIdCode,
        versionId: newVersion.id,
        name: page.name,
        slug: page.slug,
        metaDescription: page.metaDescription,
        isHomepage: page.isHomepage,
        position: page.position,
      })
      .returning();

    const folderGid = await resolveStorefrontPageFolder({
      clientIdCode,
      slug: newPage.slug,
      version: nextNum,
    });

    const mods = await db
      .select()
      .from(storefrontModules)
      .where(eq(storefrontModules.pageId, page.id))
      .orderBy(asc(storefrontModules.position));

    for (const m of mods) {
      // Copy Drive bytes so versions never share a file id.
      let newDriveFileId = m.driveFileId;
      let newPosterDriveFileId = m.posterDriveFileId;
      if (m.driveFileId && m.assetFilename) {
        newDriveFileId = (await driveClient.copyFile(m.driveFileId, m.assetFilename, folderGid)).id;
      }
      if (m.posterDriveFileId && m.posterFilename) {
        newPosterDriveFileId = (await driveClient.copyFile(m.posterDriveFileId, m.posterFilename, folderGid)).id;
      }
      const [newMod] = await db
        .insert(storefrontModules)
        .values({
          pageId: newPage.id,
          position: m.position,
          moduleType: m.moduleType,
          title: m.title,
          linkUrl: m.linkUrl,
          linkLabel: m.linkLabel,
          driveFileId: newDriveFileId,
          assetMimeType: m.assetMimeType,
          assetFilename: m.assetFilename,
          containsAiPeople: m.containsAiPeople,
          sectionLayout: m.sectionLayout,
          posterDriveFileId: newPosterDriveFileId,
          posterMimeType: m.posterMimeType,
          posterFilename: m.posterFilename,
        })
        .returning({ id: storefrontModules.id });

      // Split Section: copy each tile + its Drive bytes forward.
      if (m.moduleType === "split_section") {
        const tiles = await db
          .select()
          .from(storefrontModuleTiles)
          .where(eq(storefrontModuleTiles.moduleId, m.id))
          .orderBy(asc(storefrontModuleTiles.position));
        for (const t of tiles) {
          let tileDriveFileId = t.driveFileId;
          if (t.driveFileId && t.assetFilename) {
            tileDriveFileId = (await driveClient.copyFile(t.driveFileId, t.assetFilename, folderGid)).id;
          }
          await db.insert(storefrontModuleTiles).values({
            moduleId: newMod.id,
            position: t.position,
            title: t.title,
            linkUrl: t.linkUrl,
            linkLabel: t.linkLabel,
            driveFileId: tileDriveFileId,
            assetMimeType: t.assetMimeType,
            assetFilename: t.assetFilename,
          });
        }
      }
    }
    }
  } catch (err) {
    await db.delete(storefrontVersions).where(eq(storefrontVersions.id, newVersion.id));
    throw err;
  }

  return newVersion;
}

/**
 * Resolve the Drive folder gid where a module asset should be uploaded:
 * the page folder under the given version. Creates the version
 * + page + Master_Files folders lazily as needed.
 */
export async function resolveStorefrontPageFolder(opts: {
  clientIdCode: string;
  slug: string;
  version: number;
}): Promise<string> {
  const { clientIdCode, slug, version } = opts;
  const root = await getStorefrontRoot(clientIdCode);
  const versionFolder = await ensureChildFolder(
    root,
    clientIdCode,
    versionFolderName(clientIdCode, version),
    "storefront_version"
  );
  const page = await ensurePageFolder(versionFolder, clientIdCode, version, slug);
  return page.driveFolderId;
}
