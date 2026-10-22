import { google } from "googleapis";

/** Admin SDK scope granted to the service account via domain-wide delegation. */
export const DIRECTORY_PHOTO_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.user.readonly";

export type DirectoryPhoto = { bytes: Buffer; contentType: string };

/** Google's photoData uses a web-safe base64 variant: - → +, _ → /, * or . → = */
export function decodeWebSafeBase64(s: string): Buffer {
  return Buffer.from(
    s.replace(/-/g, "+").replace(/_/g, "/").replace(/[*.]/g, "="),
    "base64"
  );
}

function directoryClient() {
  // Read env at call time — never at module init.
  const email = process.env.GCP_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GCP_PRIVATE_KEY?.trim();
  const subject = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL?.trim();
  const missing = [
    !email && "GCP_CLIENT_EMAIL",
    !rawKey && "GCP_PRIVATE_KEY",
    !subject && "GOOGLE_WORKSPACE_ADMIN_EMAIL",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Directory photo source not configured. Missing: ${missing.join(", ")}`);
  }
  const auth = new google.auth.JWT({
    email,
    key: rawKey!.replace(/\\n/g, "\n"),
    scopes: [DIRECTORY_PHOTO_SCOPE],
    subject,
  });
  return google.admin({ version: "directory_v1", auth });
}

/**
 * The Workspace profile photo for an org account, or null when the user has no
 * custom photo or is not in the directory (the API answers 404 for both).
 * Note: the API serves a 96×96 thumbnail.
 */
export async function getDirectoryPhoto(email: string): Promise<DirectoryPhoto | null> {
  const dir = directoryClient();
  try {
    const res = await dir.users.photos.get({ userKey: email });
    const { photoData, mimeType } = res.data;
    if (!photoData) return null;
    return { bytes: decodeWebSafeBase64(photoData), contentType: mimeType || "image/jpeg" };
  } catch (e) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}
