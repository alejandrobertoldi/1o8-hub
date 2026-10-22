/**
 * Print-mode image rewrite. The Design image proxies stream either a Drive thumbnail or the
 * full-resolution original (A+ and brand-story stream originals, ~2.5 MB each). A deck prints
 * ~39 of them, so the browser's "Save as PDF" would embed tens of MB. In print mode every Design
 * proxy URL is pointed at /api/case-studies/print-image, which always returns a Drive-generated
 * JPEG at PRINT_IMAGE_WIDTH px. Anything else (manual external URLs, bundled assets) passes
 * through unchanged.
 */
export const PRINT_IMAGE_WIDTH = 1600;
export const PRINT_IMAGE_MIN_WIDTH = 400;
export const PRINT_IMAGE_MAX_WIDTH = 2000;

export const DESIGN_IMAGE_PROXIES: readonly string[] = [
  "/api/design/listing-images/image",
  "/api/storefront/image",
  "/api/aplus2/image",
  "/api/design-status/brand-story-image",
];

/** Drive file ids are URL-safe base64-ish; anything else is rejected rather than forwarded. */
export const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function printImageUrl(src: string, width: number = PRINT_IMAGE_WIDTH): string {
  if (!src.startsWith("/")) return src; // external https (manual override), data:, etc.
  let parsed: URL;
  try {
    parsed = new URL(src, "http://local.invalid");
  } catch {
    return src;
  }
  if (!DESIGN_IMAGE_PROXIES.includes(parsed.pathname)) return src;
  const gid = parsed.searchParams.get("driveFileId");
  if (!gid || !DRIVE_FILE_ID_RE.test(gid)) return src;
  return `/api/case-studies/print-image?driveFileId=${encodeURIComponent(gid)}&w=${width}`;
}

/** Clamp a requested width to the allowed band; non-numeric → default. */
export function clampPrintWidth(raw: string | null): number {
  if (raw === null || raw.trim() === "") return PRINT_IMAGE_WIDTH;
  const n = Number(raw);
  if (!Number.isFinite(n)) return PRINT_IMAGE_WIDTH;
  return Math.min(PRINT_IMAGE_MAX_WIDTH, Math.max(PRINT_IMAGE_MIN_WIDTH, Math.round(n)));
}
