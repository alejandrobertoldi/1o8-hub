/**
 * Storefront asset MIME helpers. Safe to import from client and server.
 *
 * Image modules POST used to send the whole file through a Hub route.
 * Vercel caps those bodies at ~4.5 MB (`FUNCTION_PAYLOAD_TOO_LARGE`), so a
 * 5.7 MB PNG never reaches Drive. The UI now PUTs straight to Drive; this
 * module only names and classifies the file.
 */

export const STOREFRONT_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "video/quicktime": "mov",
  "video/mpeg": "mpg",
  "video/x-msvideo": "avi",
};

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  avi: "video/x-msvideo",
};

/** Drive JPEG preview edge length — stays under Vercel's 4.5 MB response cap. */
export const STOREFRONT_IMAGE_PREVIEW_PX = 1600;

export function storefrontExtFromMime(mime: string, filename?: string): string {
  const fromMime = STOREFRONT_MIME_EXT[mime.toLowerCase()];
  if (fromMime) return fromMime;
  const fromName = filename?.split(".").pop()?.toLowerCase();
  return fromName || "bin";
}

/**
 * Browsers sometimes leave File.type empty on drag-drop. Infer from the
 * extension so a PNG is not rejected as "Unsupported file type".
 */
export function inferStorefrontMime(file: { type: string; name: string }): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (ext && EXT_MIME[ext]) || "";
}
