/* eslint-disable react-doctor/async-await-in-loop */
// ═══════════════════════════════════════════════════════════════
// Client onboarding — Create Drive folder tree
// Recursively creates the full folder hierarchy in Google Drive
// and records each folder in the drive_folders table.
// ═══════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { driveFolders, folderTreeConfig } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { eq, and } from "drizzle-orm";
import { CLIENT_FOLDER_TREE, type FolderNode } from "./folder-tree";

/**
 * Load the folder tree from DB if configured, otherwise fall back to the
 * static default in folder-tree.ts (used as a seed for first-time setup).
 */
async function loadFolderTree(): Promise<FolderNode[]> {
  const [row] = await db
    .select({ tree: folderTreeConfig.tree })
    .from(folderTreeConfig)
    .where(eq(folderTreeConfig.id, 1))
    .limit(1);
  return (row?.tree as FolderNode[] | undefined) ?? CLIENT_FOLDER_TREE;
}

interface CreatedFolder {
  name: string;
  type: string;
  driveFolderId: string;
  path: string;
}

/**
 * Create the full Drive folder tree for a client.
 * Idempotent: skips folders that already exist in drive_folders table.
 *
 * Root folder: "{clientIdCode}_{clientName}"
 * Child folders: "{clientIdCode}_{FolderName}"
 *
 * @param clientIdCode - The client identifier
 * @param rootParentFolderId - The Drive folder the client root folder is created under
 *   (resolved from client status: Prospect / shared-drive root / Inactive)
 * @param clientName - The client display name (used in root folder)
 * @returns List of all created (or already existing) folders
 */
export async function createClientDriveFolders(
  clientIdCode: string,
  rootParentFolderId: string,
  clientName?: string
): Promise<{ created: CreatedFolder[]; skipped: number }> {
  const created: CreatedFolder[] = [];
  let skipped = 0;

  // Root folder name: "ELK_SC_US_Elk Wellness"
  const rootName = clientName
    ? `${clientIdCode}_${clientName}`
    : clientIdCode;

  // Step 1: Ensure root folder exists
  const rootFolder = await ensureFolder({
    clientIdCode,
    name: rootName,
    type: "client",
    parentDriveId: rootParentFolderId,
    parentDbId: null,
    path: clientIdCode,
  });

  if (rootFolder.wasNew) {
    created.push({
      name: rootName,
      type: "client",
      driveFolderId: rootFolder.driveFolderId,
      path: clientIdCode,
    });
  } else {
    skipped++;
  }

  // Step 2: Recursively create children (prefixed with clientIdCode).
  // Tree comes from DB if admin has customised it, otherwise from the static default.
  const tree = await loadFolderTree();
  const skippedRef = { count: skipped };
  await createChildren({
    clientIdCode,
    nodes: tree,
    parentDriveId: rootFolder.driveFolderId,
    parentDbId: rootFolder.dbId,
    pathPrefix: clientIdCode,
    created,
    skippedRef,
  });

  return { created, skipped: skippedRef.count };
}

// ── Internal helpers ─────────────────────────────────────────────

interface EnsureFolderOpts {
  clientIdCode: string;
  name: string;
  type: string;
  parentDriveId: string;
  parentDbId: string | null;
  path: string;
}

interface EnsureFolderResult {
  driveFolderId: string;
  dbId: string;
  wasNew: boolean;
}

async function ensureFolder(opts: EnsureFolderOpts): Promise<EnsureFolderResult> {
  const existing = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, opts.clientIdCode),
        eq(driveFolders.path, opts.path)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Verify the folder still exists AND is not trashed — stale records are left
    // behind if a folder is deleted from Drive without going through the app. A
    // TRASHED folder still resolves via getFile, so we must check `trashed`
    // explicitly; otherwise re-running would reuse the folder sitting in trash.
    const liveFile = await driveClient
      .getFile(existing[0].driveFolderId, "id,trashed")
      .catch(() => null);
    const stillExists =
      liveFile !== null && (liveFile as { trashed?: boolean }).trashed !== true;

    if (stillExists) {
      return {
        driveFolderId: existing[0].driveFolderId,
        dbId: existing[0].id,
        wasNew: false,
      };
    }

    // Stale record — remove it and fall through to re-create below.
    await db
      .delete(driveFolders)
      .where(eq(driveFolders.id, existing[0].id));
  }

  // Create in Drive
  const driveFolder = await driveClient.createFolder(opts.name, opts.parentDriveId);

  // Record in DB
  const [row] = await db
    .insert(driveFolders)
    .values({
      clientIdCode: opts.clientIdCode,
      driveFolderId: driveFolder.id,
      folderType: opts.type,
      path: opts.path,
      parentFolderId: opts.parentDbId,
      name: opts.name,
    })
    .returning({ id: driveFolders.id });

  return {
    driveFolderId: driveFolder.id,
    dbId: row.id,
    wasNew: true,
  };
}

interface CreateChildrenOpts {
  clientIdCode: string;
  nodes: FolderNode[];
  parentDriveId: string;
  parentDbId: string;
  pathPrefix: string;
  created: CreatedFolder[];
  skippedRef: { count: number };
}

async function createChildren(opts: CreateChildrenOpts): Promise<void> {
  for (const node of opts.nodes) {
    const path = `${opts.pathPrefix}/${node.name}`;
    const driveName = `${opts.clientIdCode}_${node.name}`;

    const result = await ensureFolder({
      clientIdCode: opts.clientIdCode,
      name: driveName,
      type: node.type,
      parentDriveId: opts.parentDriveId,
      parentDbId: opts.parentDbId,
      path,
    });

    if (result.wasNew) {
      opts.created.push({
        name: driveName,
        type: node.type,
        driveFolderId: result.driveFolderId,
        path,
      });
    } else {
      opts.skippedRef.count++;
    }

    // Recurse into children
    if (node.children?.length) {
      await createChildren({
        ...opts,
        nodes: node.children,
        parentDriveId: result.driveFolderId,
        parentDbId: result.dbId,
        pathPrefix: path,
      });
    }
  }
}
