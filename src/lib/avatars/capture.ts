import { getDirectoryPhoto } from "./directory";
import { uploadAvatar } from "./storage";

export const ORG_EMAIL_DOMAIN = "@marketfoundry.agency";

export function isOrgEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(ORG_EMAIL_DOMAIN);
}

export type CaptureResult =
  | { status: "stored"; url: string }
  | { status: "would-store"; contentType: string; byteLength: number }
  | { status: "no-photo" }
  | { status: "skipped"; reason: "non-org-email" };

export interface CaptureDeps {
  getDirectoryPhoto: typeof getDirectoryPhoto;
  uploadAvatar: typeof uploadAvatar;
}

/**
 * Fetch an org member's Workspace photo and store it. Does NOT touch the DB —
 * the caller decides whether to write users.image. Errors propagate.
 */
export async function captureUserAvatar(
  user: { id: string; email: string },
  opts: { dryRun?: boolean } = {},
  deps: CaptureDeps = { getDirectoryPhoto, uploadAvatar }
): Promise<CaptureResult> {
  if (!isOrgEmail(user.email)) return { status: "skipped", reason: "non-org-email" };
  const photo = await deps.getDirectoryPhoto(user.email);
  if (!photo) return { status: "no-photo" };
  if (opts.dryRun) {
    return { status: "would-store", contentType: photo.contentType, byteLength: photo.bytes.length };
  }
  const url = await deps.uploadAvatar(user.id, photo.bytes, photo.contentType);
  return { status: "stored", url };
}
