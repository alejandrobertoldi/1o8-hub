import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { aplus2Assets, aplus2Sets, aplus2Versions, aplusModuleImages, aplusModules, driveFiles, master } from "@/lib/db/schema";
import { parseClientIdCodes } from "@/lib/client-codes";
import { isHubStaff } from "@/lib/roles";

/**
 * Whether this signed-in user may read a Google Drive file through one of our
 * proxy routes. The service account can open far more than any one client
 * should see, so knowing a file id is never enough:
 *  - hub staff (viewer and up) may read files the hub serves;
 *  - client / prospect users only files their own A+ content references
 *    (legacy A+ images or A+ v2 assets of their client codes);
 *  - anyone else (pending, unknown) nothing.
 */
export async function canReadDriveFile(
  user: { role: string; clientIdCode?: string | null },
  driveFileId: string,
): Promise<boolean> {
  if (isHubStaff(user.role)) return true;
  if (user.role !== "client" && user.role !== "prospect") return false;
  const codes = parseClientIdCodes(user.clientIdCode);
  if (!codes.length) return false;

  // Legacy A+ module images: the slot row carries the client code, and its
  // module's product does too (older rows left the slot's code empty).
  const [legacy] = await db
    .select({ id: aplusModuleImages.id })
    .from(aplusModuleImages)
    .innerJoin(aplusModules, eq(aplusModuleImages.moduleId, aplusModules.id))
    .innerJoin(master, eq(aplusModules.productId, master.id))
    .where(
      and(
        or(eq(aplusModuleImages.driveFileId, driveFileId), eq(aplusModuleImages.mobileDriveFileId, driveFileId)),
        inArray(master.clientIdCode, codes),
      ),
    )
    .limit(1);
  if (legacy) return true;

  // A+ v2: drive_files → aplus2_assets → aplus2_versions → aplus2_sets.
  const [v2] = await db
    .select({ id: aplus2Assets.id })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(aplus2Assets.driveFileId, driveFiles.id))
    .innerJoin(aplus2Versions, eq(aplus2Assets.versionId, aplus2Versions.id))
    .innerJoin(aplus2Sets, eq(aplus2Versions.setId, aplus2Sets.id))
    .where(and(eq(driveFiles.driveFileId, driveFileId), inArray(aplus2Sets.clientIdCode, codes)))
    .limit(1);
  return !!v2;
}

/** Types a browser may render inline from our origin: they can't run script. */
const INLINE_SAFE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;

/**
 * Response headers for bytes we proxy from Drive. Uploaded files are untrusted:
 * an HTML or SVG file opened from our domain would run its scripts as the
 * signed-in user. So anything that isn't a plain image/video/audio/PDF is sent
 * as a download, nothing is MIME-sniffed, and a sandboxing CSP blocks script
 * even if the browser renders it anyway. <img src> still shows SVGs: images
 * ignore Content-Disposition and never run script.
 */
export function untrustedFileHeaders(mimeType: string | null | undefined, filename?: string): Record<string, string> {
  const type = (mimeType || "application/octet-stream").split(";")[0].trim();
  const inline = INLINE_SAFE.test(type);
  const safeName = (filename || "file").replace(/["\\\n\r]/g, "_");
  return {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    // Chrome's PDF viewer won't open under `sandbox`; it runs PDFs off-origin anyway.
    "Content-Security-Policy":
      type === "application/pdf"
        ? "default-src 'none'; script-src 'none'; object-src 'none'"
        : "default-src 'none'; img-src data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
  };
}
