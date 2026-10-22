// ═══════════════════════════════════════════════════════════════
// Hub client logos — stored in Drive, served at /client-logos/{CODE}.png
// — Source of truth: <shared drive root>/1o8 Hub_Backend/Client Logos/
//   one file per client, named "{CLIENT_ID_CODE}.png" (jpg/webp/svg also accepted)
// — Deliberately NOT the per-client "Client Resources/Images/Logos" folder:
//   that one holds the client's brand files for design work. These are the
//   Hub's display marks only.
// — Both folders are created on first use if they don't exist.
// ═══════════════════════════════════════════════════════════════

import { driveClient, sharedDriveId, type DriveFile } from "@/lib/drive-client";

export const BACKEND_FOLDER_NAME = "1o8 Hub_Backend";
export const LOGOS_FOLDER_NAME = "Client Logos";

/** Image types the route will serve, in preference order when a code has several. */
const LOGO_MIME_PREFERENCE = ["image/png", "image/webp", "image/jpeg", "image/svg+xml"] as const;

/**
 * Parse the requested file segment ("REA_SC_US.png") into a client code.
 * Returns null for anything that isn't a plain client code — the code is
 * interpolated into a Drive query, so the allowed alphabet is strict.
 */
export function parseLogoRequest(file: string): string | null {
  const m = /^([A-Za-z0-9_-]{1,64})\.png$/.exec(file);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Choose the logo for a client from the folder listing: exact "{CODE}.<ext>"
 * name match (case-insensitive), preferring PNG, then the newest upload.
 */
export function pickLogoFile(files: DriveFile[], code: string): DriveFile | null {
  const want = code.toUpperCase();
  const candidates = files.filter((f) => {
    const dot = f.name.lastIndexOf(".");
    const base = dot > 0 ? f.name.slice(0, dot) : f.name;
    return (
      base.toUpperCase() === want &&
      (LOGO_MIME_PREFERENCE as readonly string[]).includes(f.mimeType)
    );
  });
  candidates.sort((a, b) => {
    const pa = LOGO_MIME_PREFERENCE.indexOf(a.mimeType as (typeof LOGO_MIME_PREFERENCE)[number]);
    const pb = LOGO_MIME_PREFERENCE.indexOf(b.mimeType as (typeof LOGO_MIME_PREFERENCE)[number]);
    if (pa !== pb) return pa - pb;
    return (b.createdTime ?? "").localeCompare(a.createdTime ?? "");
  });
  return candidates[0] ?? null;
}

async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const existing = await driveClient.findChildFolder(parentId, name);
  if (existing) return existing.id;
  const created = await driveClient.createFolder(name, parentId);
  return created.id;
}

// Folder ids never change once created; memoise per server instance.
let logosFolderIdPromise: Promise<string> | null = null;

/** Resolve (creating if needed) 1o8 Hub_Backend/Client Logos. */
export function resolveLogosFolderId(): Promise<string> {
  if (!logosFolderIdPromise) {
    logosFolderIdPromise = (async () => {
      const backendId = await findOrCreateFolder(sharedDriveId(), BACKEND_FOLDER_NAME);
      return findOrCreateFolder(backendId, LOGOS_FOLDER_NAME);
    })().catch((err) => {
      logosFolderIdPromise = null; // don't memoise a failure
      throw err;
    });
  }
  return logosFolderIdPromise;
}

export interface ClientLogo {
  bytes: Buffer;
  mimeType: string;
}

// List the whole folder (one file per client, so small) rather than a
// `name contains` query: Drive tokenises names, so "REA_SC_US" matching is
// unreliable. pickLogoFile does the exact-name match.
async function listLogoFolder(): Promise<DriveFile[]> {
  const folderId = await resolveLogosFolderId();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = await driveClient.listFiles(`'${folderId}' in parents`, pageToken);
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

/** Upper-cased client codes that have a servable logo in the folder. */
export async function listClientLogoCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  for (const f of await listLogoFolder()) {
    const dot = f.name.lastIndexOf(".");
    const code = parseLogoRequest(`${dot > 0 ? f.name.slice(0, dot) : f.name}.png`);
    if (code && pickLogoFile([f], code)) codes.add(code);
  }
  return codes;
}

/** Fetch a client's logo from Drive, or null when the folder has none for it. */
export async function fetchClientLogo(code: string): Promise<ClientLogo | null> {
  const file = pickLogoFile(await listLogoFolder(), code);
  if (!file) return null;
  const bytes = await driveClient.downloadFileContent(file.id);
  return { bytes, mimeType: file.mimeType };
}

/** For tests only. */
export function __resetLogosFolderCache(): void {
  logosFolderIdPromise = null;
}
