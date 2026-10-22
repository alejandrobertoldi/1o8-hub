// ═══════════════════════════════════════════════════════════════
// Shared Drive upload helpers
// — buildFileName: deterministic, collision-resistant naming
// — buildAplusFileName: SOP-compliant A+ Content naming
// — resolveUploadFolder: finds or creates ASIN subfolder on demand
//   with race-condition safety via unique index + onConflictDoNothing
// — resolveAplusFolder: creates full PA+/scope/version hierarchy
// ═══════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { eq, and } from "drizzle-orm";
import {
  MODULE_TYPE_CODES,
  buildScopeSegment,
  getFixedSlotKey,
  getRepeatableSlotKey,
  type AplusDevice,
  type AplusPlatform,
  type AplusScopeType,
} from "@/lib/aplus-file-naming";
import type { AplusModuleType } from "@/lib/aplus-module-specs";

// ── MIME → extension map ──────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/csv": "csv",
};

function extFromMime(mimeType: string): string {
  const mapped = MIME_TO_EXT[mimeType.toLowerCase()];
  if (mapped) return mapped;
  // Fallback: extract subtype (e.g. "image/webp" → "webp")
  const sub = mimeType.split("/")[1] ?? "bin";
  // Normalize "jpeg" to "jpg"
  return sub === "jpeg" ? "jpg" : sub;
}

// ── buildFileName ──────────────────────────────────────────────

export interface BuildFileNameOptions {
  clientIdCode: string;
  asin?: string | null;
  folderType: string;
  imageSlot?: string | null;
  mimeType: string;
}

/**
 * Build a deterministic, collision-resistant file name.
 * Convention: {clientIdCode}_{ASIN}_{folderType}_{slot}_{unix_ts}.{ext}
 *
 * - asin: "noa" placeholder if not provided
 * - imageSlot: "0" placeholder if not provided
 * - timestamp: seconds since epoch (not milliseconds)
 *
 * Example: ABC_B08XYZ_aplus_01_1710000000.jpg
 */
export function buildFileName(opts: BuildFileNameOptions): string {
  const { clientIdCode, asin, folderType, imageSlot, mimeType } = opts;
  const asinPart = asin?.trim() || "noa";
  const slotPart = imageSlot?.trim() || "0";
  const ts = Math.floor(Date.now() / 1000);
  const ext = extFromMime(mimeType);
  return `${clientIdCode}_${asinPart}_${folderType}_${slotPart}_${ts}.${ext}`;
}

// ── resolveUploadFolder ────────────────────────────────────────

export interface ResolveUploadFolderOptions {
  clientIdCode: string;
  folderType: string;
  asin?: string | null;
}

export interface ResolvedFolder {
  id: string;
  driveFolderId: string;
}

/**
 * Resolve the target Drive folder for an upload.
 *
 * 1. Look up the base typed folder (e.g. "aplus") for the client.
 *    Returns null if not found — client not onboarded.
 * 2. If no ASIN provided, return the base folder directly.
 * 3. Check for an existing ASIN subfolder by path.
 * 4. If found, return it.
 * 5. If not found, create it in Drive and insert a DB row.
 *    Uses onConflictDoNothing() to handle concurrent creation.
 *    On conflict, re-fetches the existing row.
 */
export async function resolveUploadFolder(
  opts: ResolveUploadFolderOptions
): Promise<ResolvedFolder | null> {
  const { clientIdCode, folderType, asin } = opts;

  // Step 1: Find the base typed folder for this client
  const baseFolders = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, clientIdCode),
        eq(driveFolders.folderType, folderType)
      )
    )
    .limit(1);

  let baseFolder = baseFolders[0] ?? null;

  // Auto-create the typed folder if it doesn't exist but the client root does
  if (!baseFolder) {
    const clientRootRows = await db
      .select({
        id: driveFolders.id,
        driveFolderId: driveFolders.driveFolderId,
        path: driveFolders.path,
      })
      .from(driveFolders)
      .where(
        and(
          eq(driveFolders.clientIdCode, clientIdCode),
          eq(driveFolders.folderType, "client")
        )
      )
      .limit(1);

    const clientRoot = clientRootRows[0] ?? null;
    if (!clientRoot) return null; // No client root at all — truly not onboarded

    // Build intermediate folders: client root → Graphics → A+ Content (for aplus type)
    // Convention: displayName for Drive + path, dbName = "{clientIdCode}_{displayName}"
    const foldersToCreate =
      folderType === "aplus"
        ? [
            { displayName: "Graphics", dbName: `${clientIdCode}_Graphics`, type: "graphics" },
            { displayName: "A+ Content", dbName: `${clientIdCode}_A+ Content`, type: "aplus" },
          ]
        : folderType === "brand_guidelines"
        ? [{ displayName: "Brand Guidelines", dbName: `${clientIdCode}_Brand Guidelines`, type: "brand_guidelines" }]
        : folderType === "client_logos"
        ? [
            { displayName: "Client Resources", dbName: `${clientIdCode}_Client Resources`, type: "client_resources" },
            { displayName: "Images", dbName: `${clientIdCode}_Images`, type: "resource_images" },
            { displayName: "Logos", dbName: `${clientIdCode}_Logos`, type: "client_logos" },
          ]
        : [{ displayName: folderType, dbName: `${clientIdCode}_${folderType}`, type: folderType }];

    let parentDriveId = clientRoot.driveFolderId;
    let parentPath = clientRoot.path;
    let parentDbId = clientRoot.id;

    for (const level of foldersToCreate) {
      const levelPath = `${parentPath}/${level.displayName}`;

      // Check if this level already exists
      const existingRows = await db
        .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path })
        .from(driveFolders)
        .where(eq(driveFolders.path, levelPath))
        .limit(1);

      if (existingRows[0]) {
        parentDriveId = existingRows[0].driveFolderId;
        parentPath = existingRows[0].path;
        parentDbId = existingRows[0].id;
        continue;
      }

      // Create in Drive (prefixed name, e.g. "C23_SC_US_Graphics")
      const driveFolder = await driveClient.createFolder(level.dbName, parentDriveId);

      // Insert DB row with race-condition safety
      const inserted = await db
        .insert(driveFolders)
        .values({
          clientIdCode,
          driveFolderId: driveFolder.id,
          folderType: level.type,
          path: levelPath,
          parentFolderId: parentDbId,
          name: level.dbName,
        })
        .onConflictDoNothing()
        .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path });

      if (inserted[0]) {
        parentDriveId = inserted[0].driveFolderId;
        parentPath = inserted[0].path;
        parentDbId = inserted[0].id;
      } else {
        const refetched = await db
          .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId, path: driveFolders.path })
          .from(driveFolders)
          .where(eq(driveFolders.path, levelPath))
          .limit(1);
        if (!refetched[0]) return null;
        parentDriveId = refetched[0].driveFolderId;
        parentPath = refetched[0].path;
        parentDbId = refetched[0].id;
      }
    }

    baseFolder = { id: parentDbId, driveFolderId: parentDriveId, path: parentPath };
  }

  // Step 2: No ASIN → return base folder
  if (!asin?.trim()) {
    return { id: baseFolder.id, driveFolderId: baseFolder.driveFolderId };
  }

  const asinTrimmed = asin.trim();
  const asinPath = `${baseFolder.path}/${asinTrimmed}`;

  // Step 3: Check for existing ASIN subfolder
  const existingRows = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, asinPath))
    .limit(1);

  // Step 4: Found existing ASIN subfolder — return it
  if (existingRows[0]) {
    return existingRows[0];
  }

  // Step 5: Create ASIN subfolder in Drive
  const driveFolder = await driveClient.createFolder(
    `${clientIdCode} - ${asinTrimmed}`,
    baseFolder.driveFolderId
  );

  // Step 6: Insert DB row — onConflictDoNothing handles race condition
  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode,
      driveFolderId: driveFolder.id,
      folderType: "asin",
      path: asinPath,
      parentFolderId: baseFolder.id,
      name: `${clientIdCode} - ${asinTrimmed}`,
    })
    .onConflictDoNothing()
    .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId });

  // Step 7: If insert succeeded, return new row; else re-fetch (concurrent creation won the race)
  if (inserted[0]) {
    return inserted[0];
  }

  // Re-fetch the row that won the race
  const refetchedRows = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, asinPath))
    .limit(1);

  return refetchedRows[0] ?? null;
}

// ── A+ Content SOP naming ──────────────────────────────────────

/** Zero-pad a number to 2 digits */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export interface BuildAplusFileNameOptions {
  clientIdCode: string;
  version: number;
  scopeType: AplusScopeType;
  modulePosition: number;
  moduleType: AplusModuleType;
  /** The file slot key (e.g. "MAIN", "BG", "COMP3", "SL2") */
  slotKey: string;
  device: AplusDevice;
  /** true = video file (.mp4), false = image (.png) */
  isVideo?: boolean;
  /** Specific ASIN — required for ASIN scope */
  asin?: string;
  /** Group number — required for GRP scope */
  groupNumber?: number;
}

/**
 * Build an SOP-compliant A+ Content filename.
 *
 * Images:
 *   VAR:  DRC_SC_US_V01_M3_PSIC_PAN1_DV_IMG.png
 *   GRP:  DRC_SC_US_V01G01_M3_PSIC_PAN1_DV_IMG.png
 *   ASIN: DRC_SC_US_V01_B0DCLWMB4Y_M3_PSIC_PAN1_DV_IMG.png
 *
 * Videos: DRC_SC_US_V01_M3_PFV_VIDEO.mp4
 */
export function buildAplusFileName(opts: BuildAplusFileNameOptions): string {
  const { clientIdCode, version, scopeType, modulePosition, moduleType, slotKey, device, isVideo, asin, groupNumber } = opts;
  const typeCode = MODULE_TYPE_CODES[moduleType];
  const scopeSeg = buildScopeSegment(version, scopeType, asin, groupNumber);
  const prefix = `${clientIdCode}_${scopeSeg}_M${modulePosition}`;

  if (isVideo) {
    return `${prefix}_${typeCode}_VIDEO.mp4`;
  }

  return `${prefix}_${typeCode}_${slotKey}_${device}_IMG.png`;
}

export interface ResolveAplusFolderOptions {
  clientIdCode: string;
  marketplace: string;
  platform: AplusPlatform;
  scopeType: AplusScopeType;
  version: number;
  contentType?: "PA+" | "BA+";
  /** Specific ASIN — for ASIN scope */
  asin?: string;
  /** Group number — for GRP scope */
  groupNumber?: number;
}

/**
 * Resolve (find or create) the full A+ folder hierarchy in Drive.
 *
 * Hierarchy (under existing client root folder):
 *   Graphics/
 *     A+ Content/
 *       PA+/
 *         {scopeFolder}/
 *           (files go here — no version subfolder, version is in the scope segment)
 *
 * DB name convention: "{clientIdCode}_{DisplayName}" (e.g. "C23_SC_US_Graphics")
 * Drive folder name + path: uses display name only (e.g. "Graphics")
 *
 * Scope folder examples:
 *   VAR:  V01
 *   GRP:  V01G01
 *   ASIN: V01_B0DCLWMB4Y
 */
export async function resolveAplusFolder(
  opts: ResolveAplusFolderOptions
): Promise<ResolvedFolder | null> {
  const {
    clientIdCode,
    scopeType,
    version,
    contentType = "PA+",
    asin,
    groupNumber,
  } = opts;

  const scopeFolder = buildScopeSegment(version, scopeType, asin, groupNumber);

  // Build the folder chain (each level depends on the parent)
  // Drive name uses "{clientIdCode}_{DisplayName}" convention; path uses just the display name
  const folderChain = [
    { name: clientIdCode, displayName: clientIdCode, type: "client" },
    { name: `${clientIdCode}_Graphics`, displayName: "Graphics", type: "graphics" },
    { name: `${clientIdCode}_A+ Content`, displayName: "A+ Content", type: "aplus" },
    { name: `${clientIdCode}_A+ - Content for Upload`, displayName: "A+ - Content for Upload", type: "aplus_upload" },
    { name: `${clientIdCode}_${contentType}`, displayName: contentType, type: "aplus-tier" },
    { name: `${clientIdCode}_${scopeFolder}`, displayName: scopeFolder, type: "aplus-scope" },
  ];

  // Start from the client's base folder in Drive
  const clientRootRows = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, clientIdCode),
        eq(driveFolders.folderType, "client")
      )
    )
    .limit(1);

  const clientRoot = clientRootRows[0] ?? null;
  if (!clientRoot) {
    return null;
  }

  // Walk / create each level of the hierarchy
  let currentParentDriveId = clientRoot.driveFolderId;
  let currentPath = clientRoot.path;
  let currentDbId = clientRoot.id;

  // Skip the first level (client root) since it already exists
  for (let i = 1; i < folderChain.length; i++) {
    const level = folderChain[i];
    // Path uses displayName (e.g. "Graphics"), DB name uses full name (e.g. "C23_SC_US_Graphics")
    const levelPath = `${currentPath}/${level.displayName}`;

    // Check if this level exists
    const existingRows = await db
      .select({
        id: driveFolders.id,
        driveFolderId: driveFolders.driveFolderId,
        path: driveFolders.path,
      })
      .from(driveFolders)
      .where(eq(driveFolders.path, levelPath))
      .limit(1);

    if (existingRows[0]) {
      currentParentDriveId = existingRows[0].driveFolderId;
      currentPath = existingRows[0].path;
      currentDbId = existingRows[0].id;
      continue;
    }

    // Create folder in Drive (prefixed name, e.g. "C23_SC_US_PA+")
    const driveFolder = await driveClient.createFolder(
      level.name,
      currentParentDriveId
    );

    // Insert DB row with race-condition safety
    const inserted = await db
      .insert(driveFolders)
      .values({
        clientIdCode,
        driveFolderId: driveFolder.id,
        folderType: level.type,
        path: levelPath,
        parentFolderId: currentDbId,
        name: level.name,
      })
      .onConflictDoNothing()
      .returning({
        id: driveFolders.id,
        driveFolderId: driveFolders.driveFolderId,
        path: driveFolders.path,
      });

    if (inserted[0]) {
      currentParentDriveId = inserted[0].driveFolderId;
      currentPath = inserted[0].path;
      currentDbId = inserted[0].id;
    } else {
      // Race condition: another request created it first — re-fetch
      const refetched = await db
        .select({
          id: driveFolders.id,
          driveFolderId: driveFolders.driveFolderId,
          path: driveFolders.path,
        })
        .from(driveFolders)
        .where(eq(driveFolders.path, levelPath))
        .limit(1);

      if (!refetched[0]) return null;
      currentParentDriveId = refetched[0].driveFolderId;
      currentPath = refetched[0].path;
      currentDbId = refetched[0].id;
    }
  }

  return { id: currentDbId, driveFolderId: currentParentDriveId };
}

/**
 * Resolve (find or create) the Brand Guidelines/Archive/ subfolder.
 * Called lazily on first re-upload (when there's a previous active version).
 * Returns null if the client has no Drive root onboarded yet.
 */
export async function resolveBrandGuidelinesArchiveFolder(
  clientIdCode: string
): Promise<ResolvedFolder | null> {
  const parent = await resolveUploadFolder({ clientIdCode, folderType: "brand_guidelines" });
  if (!parent) return null;

  const parentRow = await db
    .select({ path: driveFolders.path })
    .from(driveFolders)
    .where(eq(driveFolders.id, parent.id))
    .limit(1);
  if (!parentRow[0]) return null;
  const archivePath = `${parentRow[0].path}/Archive`;

  const existing = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, archivePath))
    .limit(1);
  if (existing[0]) return existing[0];

  const driveFolder = await driveClient.createFolder(
    `${clientIdCode}_Brand Guidelines Archive`,
    parent.driveFolderId
  );

  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode,
      driveFolderId: driveFolder.id,
      folderType: "brand_guidelines_archive",
      path: archivePath,
      parentFolderId: parent.id,
      name: `${clientIdCode}_Brand Guidelines Archive`,
    })
    .onConflictDoNothing()
    .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId });

  if (inserted[0]) return inserted[0];

  const refetched = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, archivePath))
    .limit(1);
  return refetched[0] ?? null;
}
