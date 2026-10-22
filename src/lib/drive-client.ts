// ═══════════════════════════════════════════════════════════════
// Google Drive REST client
// — Built on shared gcp-auth.ts token caching
// — No googleapis dependency: raw fetch only
// — All methods include supportsAllDrives=true
// — GOOGLE_SHARED_DRIVE_ID is read at call time (not module init)
// ═══════════════════════════════════════════════════════════════

import { getAccessToken } from "@/lib/gcp-auth";

// ── Constants ────────────────────────────────────────────────

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

/**
 * When Drive has no thumbnailLink, getThumbnail used to download the original.
 * Listing-image PNGs are often larger than Vercel's ~4.5 MB function payload
 * cap, which surfaces as FUNCTION_PAYLOAD_TOO_LARGE. Only fall back to the
 * original when it will fit in a Vercel response with headroom for headers.
 */
export const DRIVE_THUMBNAIL_FALLBACK_MAX_BYTES = 4_000_000;

// ── Types ────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  parents?: string[];
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function driveToken(): Promise<string> {
  return getAccessToken([DRIVE_SCOPE]);
}

/** Read GOOGLE_SHARED_DRIVE_ID at call time — never at module init */
export function sharedDriveId(): string {
  const id = process.env.GOOGLE_SHARED_DRIVE_ID?.trim();
  if (!id) {
    throw new Error(
      "GOOGLE_SHARED_DRIVE_ID environment variable is not set. " +
      "Add it to your environment before calling Drive methods."
    );
  }
  return id;
}

async function checkResponse(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "(could not read response body)");
    throw new Error(`Drive API error in ${context} (${res.status} ${res.statusText}): ${text}`);
  }
}

// ── driveClient ───────────────────────────────────────────────

export const driveClient = {
  /**
   * Create a folder in Google Drive.
   * @param name - Folder name
   * @param parentDriveId - Parent folder or shared drive ID
   */
  async createFolder(name: string, parentDriveId: string): Promise<DriveFile> {
    const token = await driveToken();
    const res = await fetch(`${DRIVE_BASE}/files?supportsAllDrives=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentDriveId],
      }),
    });
    await checkResponse(res, "createFolder");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Find a child folder by exact name. If Drive has duplicates (a create race),
   * returns the oldest so later uploads reuse the folder that already has files.
   */
  async findChildFolder(parentDriveId: string, name: string): Promise<DriveFile | null> {
    const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const listed = await driveClient.listFiles(
      `'${parentDriveId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder'`
    );
    const folders = [...(listed.files ?? [])].sort((a, b) =>
      (a.createdTime ?? "").localeCompare(b.createdTime ?? "")
    );
    return folders[0] ?? null;
  },

  /**
   * List files in the shared drive matching a query.
   * Always scoped to the shared drive (corpora=drive, includeItemsFromAllDrives=true).
   * @param query - Drive query string (e.g. "'folderId' in parents and trashed=false")
   * @param pageToken - Optional pagination token
   */
  async listFiles(query: string, pageToken?: string): Promise<DriveFileList> {
    const token = await driveToken();
    const driveId = sharedDriveId();
    const safeQuery = query.includes("trashed") ? query : `${query} and trashed = false`;
    const params = new URLSearchParams({
      q: safeQuery,
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "drive",
      driveId,
      fields: "files(id,name,mimeType,size,createdTime),nextPageToken",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_BASE}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await checkResponse(res, "listFiles");
    return res.json() as Promise<DriveFileList>;
  },

  /**
   * Get file metadata by ID.
   * @param fileId - Drive file or folder ID
   * @param fields - Comma-separated fields to return (defaults to id,name,mimeType,size,createdTime,parents)
   */
  async getFile(fileId: string, fields?: string): Promise<DriveFile> {
    const token = await driveToken();
    const resolvedFields = fields || "id,name,mimeType,size,createdTime,parents";
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(resolvedFields)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await checkResponse(res, "getFile");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Check whether a Drive folder is alive (exists + not trashed).
   * Returns false on 404 (permanently deleted) or trashed:true.
   * Throws on auth/network errors — real failures must not be swallowed.
   *
   * Use before reusing a cached driveFolderId so uploads never inherit a
   * trashed parent.
   * @param folderId - Drive folder ID
   */
  async isFolderAlive(folderId: string): Promise<boolean> {
    const token = await driveToken();
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 404) return false;
    await checkResponse(res, "isFolderAlive");
    const meta = (await res.json()) as { trashed?: boolean };
    return !meta.trashed;
  },

  /**
   * Download a file's binary content from Drive.
   * Used by server routes that need the bytes back from Drive
   * after a browser-resumable upload (Vercel body-size limit
   * means we never see the bytes during upload).
   * @param fileId - Drive file ID
   * @returns Buffer of the file content
   */
  async downloadFileContent(fileId: string): Promise<Buffer> {
    const token = await driveToken();
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await checkResponse(res, "downloadFileContent");
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  },

  /**
   * Fetch a small thumbnail for a Drive file. Tries Drive's `thumbnailLink`
   * first (PDFs render their cover; SVGs don't get one). Falls back to the
   * raw file bytes for image/* mime types only when the original is small
   * enough to return from a Vercel function (~4 MB). Larger originals without
   * a thumbnailLink fail rather than triggering FUNCTION_PAYLOAD_TOO_LARGE.
   *
   * @param fileId - Drive file ID
   * @param size   - Desired thumbnail dimension passed as the `=sNNN` suffix.
   *                 e.g. 400 → "=s400". Drive will scale accordingly.
   * @param opts.forceJpeg - Append Google's `-rj` image option so the thumbnail is always a
   *                 JPEG. Without it a PNG source comes back as a PNG (and, when the original is
   *                 already ≤ size, as the full original) — which a browser "Save as PDF" embeds
   *                 losslessly at several MB per image.
   * @returns      - { bytes, contentType } suitable for streaming to the client
   */
  async getThumbnail(
    fileId: string,
    size = 400,
    opts: { forceJpeg?: boolean } = {}
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const token = await driveToken();
    const metaRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=thumbnailLink,mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await checkResponse(metaRes, "getThumbnail:metadata");
    const meta = (await metaRes.json()) as {
      thumbnailLink?: string;
      mimeType?: string;
      size?: string;
    };

    if (meta.thumbnailLink) {
      const link = meta.thumbnailLink.replace(/=s\d+$/, `=s${size}${opts.forceJpeg ? "-rj" : ""}`);
      const r = await fetch(link, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const ab = await r.arrayBuffer();
        return {
          bytes: Buffer.from(ab),
          contentType: r.headers.get("content-type") ?? "image/jpeg",
        };
      }
    }

    const fileSize = meta.size ? parseInt(meta.size, 10) : 0;
    if (
      meta.mimeType &&
      meta.mimeType.startsWith("image/") &&
      fileSize > 0 &&
      fileSize <= DRIVE_THUMBNAIL_FALLBACK_MAX_BYTES
    ) {
      const r = await fetch(
        `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await checkResponse(r, "getThumbnail:imageFallback");
      const ab = await r.arrayBuffer();
      return { bytes: Buffer.from(ab), contentType: meta.mimeType };
    }

    throw new Error(`No thumbnail available for ${fileId}`);
  },

  /**
   * Remove a file or folder from its folder view.
   *
   * Tries permanent DELETE first (requires Content Manager+ role on the shared
   * drive), verifies the file is actually gone, and falls back to PATCH
   * `trashed:true` if it isn't. The trash fallback works for any role with
   * edit access and removes the file from folder listings.
   *
   * @param fileId - Drive file or folder ID
   */
  async deleteFile(fileId: string): Promise<void> {
    const token = await driveToken();

    const delRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    // Verify the file is actually gone after DELETE. Google's Drive API can
    // return 204 No Content for shared-drive items even when the service
    // account lacks permanent-delete permission and the file remains visible.
    if (delRes.ok || delRes.status === 404) {
      const verifyRes = await fetch(
        `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,trashed`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (verifyRes.status === 404) return;
      if (verifyRes.ok) {
        const meta = (await verifyRes.json()) as { trashed?: boolean };
        if (meta.trashed) return;
        console.warn(
          `[driveClient.deleteFile] DELETE returned ${delRes.status} for ${fileId} but file still exists and is not trashed — falling back to PATCH trashed:true`
        );
      }
    } else {
      const body = await delRes.text().catch(() => "(unreadable)");
      console.warn(
        `[driveClient.deleteFile] DELETE returned ${delRes.status} ${delRes.statusText} for ${fileId}: ${body} — falling back to PATCH trashed:true`
      );
    }

    const trashRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,trashed`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trashed: true }),
      }
    );

    if (!trashRes.ok) {
      const body = await trashRes.text().catch(() => "(unreadable)");
      throw new Error(
        `Drive API error in deleteFile: DELETE returned ${delRes.status}, ` +
          `PATCH trashed:true returned ${trashRes.status} ${trashRes.statusText}: ${body}`
      );
    }
  },

  /**
   * Move a file from one folder to another.
   * @param fileId - Drive file ID
   * @param newParentId - Destination folder ID
   * @param oldParentId - Source folder ID (required by Drive API to remove old parent)
   */
  async moveFile(
    fileId: string,
    newParentId: string,
    oldParentId: string
  ): Promise<DriveFile> {
    const token = await driveToken();
    const params = new URLSearchParams({
      addParents: newParentId,
      removeParents: oldParentId,
      supportsAllDrives: "true",
    });
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?${params}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );
    await checkResponse(res, "moveFile");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Rename a file in Google Drive.
   * @param fileId - Drive file ID
   * @param newName - New file name
   */
  async renameFile(fileId: string, newName: string): Promise<DriveFile> {
    const token = await driveToken();
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName }),
      }
    );
    await checkResponse(res, "renameFile");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Upload a file using multipart upload.
   * @param name - File name in Drive
   * @param parentId - Parent folder ID
   * @param buffer - File content as Buffer
   * @param mimeType - Content MIME type (e.g. "image/jpeg")
   */
  /**
   * Initiate a resumable upload session for a large file.
   * The server creates the session; the browser uploads bytes directly to the
   * returned URI — no file data passes through Next.js.
   * Drive names the file `name` and places it under `parentId`.
   * Returns the upload URI (valid for 24h, no auth needed to use it).
   */
  async createResumableSession(
    name: string,
    parentId: string,
    mimeType: string,
    fileSize: number,
    origin?: string
  ): Promise<string> {
    const token = await driveToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(fileSize),
    };
    // Including Origin tells Drive to add CORS headers to the upload URI responses,
    // allowing the browser to PUT the file bytes directly.
    if (origin) headers["Origin"] = origin;
    const res = await fetch(
      `${UPLOAD_BASE}/files?uploadType=resumable&supportsAllDrives=true`,
      { method: "POST", headers, body: JSON.stringify({ name, parents: [parentId] }) }
    );
    await checkResponse(res, "createResumableSession");
    const uploadUri = res.headers.get("Location");
    if (!uploadUri) throw new Error("Drive did not return a resumable upload URI");
    return uploadUri;
  },

  async uploadFile(
    name: string,
    parentId: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<DriveFile> {
    const token = await driveToken();
    const metadata = JSON.stringify({ name, parents: [parentId] });
    const boundary = "----driveupload" + Date.now();
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(
      `${UPLOAD_BASE}/files?uploadType=multipart&supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    await checkResponse(res, "uploadFile");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Upload an xlsx buffer into a folder, converting it to a Google Sheet.
   * Uses multipart upload with target mimeType=application/vnd.google-apps.spreadsheet —
   * Drive auto-converts the xlsx payload during ingest.
   * @param name - Spreadsheet title in Drive
   * @param parentId - Destination folder ID (must be in a Shared Drive)
   * @param xlsxBuffer - File content as an .xlsx Buffer
   */
  async uploadAsSheet(
    name: string,
    parentId: string,
    xlsxBuffer: Buffer
  ): Promise<DriveFile> {
    const token = await driveToken();
    const metadata = JSON.stringify({
      name,
      parents: [parentId],
      mimeType: "application/vnd.google-apps.spreadsheet",
    });
    const boundary = "----driveupload" + Date.now();
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
      ),
      xlsxBuffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(
      `${UPLOAD_BASE}/files?uploadType=multipart&supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    await checkResponse(res, "uploadAsSheet");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Replace the content of an existing Drive file (keeps fileId, version history).
   * @param fileId - Existing Drive file ID
   * @param buffer - New content
   * @param mimeType - Content MIME type
   */
  async updateFileContent(fileId: string, buffer: Buffer, mimeType: string): Promise<DriveFile> {
    const token = await driveToken();
    const res = await fetch(
      `${UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": mimeType,
        },
        body: new Uint8Array(buffer),
      }
    );
    await checkResponse(res, "updateFileContent");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Copy an existing Drive file into a specific folder with a new name.
   * Used for attribute-template provisioning: the master template has an
   * onEdit Apps Script container-bound to it, and copy preserves that
   * binding — unlike create+attach-via-API, which is impossible for
   * service accounts (Apps Script API requires a per-user opt-in that
   * service accounts have no UI to enable).
   * @param fileId - Source Drive file ID
   * @param newName - Name for the copied file
   * @param parentId - Destination folder ID (must be in a Shared Drive)
   */
  async copyFile(fileId: string, newName: string, parentId: string): Promise<DriveFile> {
    const token = await driveToken();
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName, parents: [parentId] }),
      }
    );
    await checkResponse(res, "copyFile");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Create an empty Google Sheet inside a specific folder.
   * Uses Drive API (supportsAllDrives=true) so service accounts can create
   * files in Shared Drives — unlike the Sheets API which requires "My Drive".
   * @param name - Spreadsheet title
   * @param parentId - Destination folder ID (must be in a Shared Drive)
   */
  async createSpreadsheet(name: string, parentId: string): Promise<DriveFile> {
    const token = await driveToken();
    const res = await fetch(`${DRIVE_BASE}/files?supportsAllDrives=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [parentId],
      }),
    });
    await checkResponse(res, "createSpreadsheet");
    return res.json() as Promise<DriveFile>;
  },

  /**
   * Grant "anyone with the link" writer permission on a file.
   * Used for attribute-template Sheets so clients can edit without per-email invites.
   * @param fileId - Drive file ID (Sheet or any supported file)
   */
  async setAnyoneLinkWriter(fileId: string): Promise<void> {
    const token = await driveToken();
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "writer",
          type: "anyone",
          allowFileDiscovery: false,
        }),
      }
    );
    await checkResponse(res, "setAnyoneLinkWriter");
  },

  /**
   * Ping the shared drive by creating and immediately deleting a test folder.
   * Verifies that credentials and drive access are correctly configured.
   */
  async ping(): Promise<{ ok: true; driveId: string }> {
    const driveId = sharedDriveId();
    const testName = `__ping_test_${Date.now()}__`;
    const folder = await driveClient.createFolder(testName, driveId);
    await driveClient.deleteFile(folder.id);
    return { ok: true, driveId };
  },
};
