/** Amazon listing-image slots shown in Design and stored on slot version rows. */
export const IMAGE_SLOTS = [
  "MAIN",
  "PT01",
  "PT02",
  "PT03",
  "PT04",
  "PT05",
  "PT06",
  "PT07",
  "PT08",
  "PT09",
] as const;

export type ListingImageSlot = (typeof IMAGE_SLOTS)[number];

/** Hub Drive slot ↔ CLR / catalog image URL field (Amazon side of Images PDP). */
export const LISTING_IMAGE_SLOT_FIELDS = [
  { slot: "MAIN", label: "Main Image", bqName: "MainImageURL", hubLabel: "Main Image URL" },
  { slot: "PT01", label: "Other Image 1", bqName: "OtherImageURL1", hubLabel: "Other Image URL 1" },
  { slot: "PT02", label: "Other Image 2", bqName: "OtherImageURL2", hubLabel: "Other Image URL 2" },
  { slot: "PT03", label: "Other Image 3", bqName: "OtherImageURL3", hubLabel: "Other Image URL 3" },
  { slot: "PT04", label: "Other Image 4", bqName: "OtherImageURL4", hubLabel: "Other Image URL 4" },
  { slot: "PT05", label: "Other Image 5", bqName: "OtherImageURL5", hubLabel: "Other Image URL 5" },
  { slot: "PT06", label: "Other Image 6", bqName: "OtherImageURL6", hubLabel: "Other Image URL 6" },
  { slot: "PT07", label: "Other Image 7", bqName: "OtherImageURL7", hubLabel: "Other Image URL 7" },
  { slot: "PT08", label: "Other Image 8", bqName: "OtherImageURL8", hubLabel: "Other Image URL 8" },
  { slot: "PT09", label: "Swatch Image", bqName: "SwatchImageURL", hubLabel: "Swatch Image URL" },
] as const satisfies ReadonlyArray<{
  slot: ListingImageSlot;
  label: string;
  bqName: string;
  hubLabel: string;
}>;

export function isListingImageSlot(value: string): value is ListingImageSlot {
  return (IMAGE_SLOTS as readonly string[]).includes(value);
}

/**
 * Largest file a leftover direct POST to /api/design/listing-images/upload
 * can carry. The Listing Images UI no longer uses that route — it PUTs
 * straight to Drive — so this only guards any remaining caller.
 *
 * Vercel rejects serverless request/response bodies over ~4.5 MB at the edge
 * (`FUNCTION_PAYLOAD_TOO_LARGE`).
 */
export const MAX_LISTING_IMAGE_BYTES = 4_500_000;

/** Drive thumbnail edge length for grid tiles. */
export const LISTING_IMAGE_THUMB_PX = 400;

/**
 * Drive thumbnail edge length for the lightbox / "full" preview.
 *
 * The raw listing PNG regularly exceeds Vercel's 4.5 MB function response
 * cap, so the image proxy never streams the original. s1600 is sharp in the
 * lightbox (max-w-lg ≈ 512 CSS px) and the JPEG Drive returns stays well
 * under that cap.
 */
export const LISTING_IMAGE_PREVIEW_PX = 1600;

export function listingImageThumbPx(thumb: boolean): number {
  return thumb ? LISTING_IMAGE_THUMB_PX : LISTING_IMAGE_PREVIEW_PX;
}

/**
 * Human-readable MB for an error message, e.g. 6500000 -> "6.5".
 *
 * Decimal MB, not MiB, so the number matches what Finder shows for the same file
 * and what Vercel's 4.5 MB limit is quoted in. A designer comparing the toast to
 * their file listing should see the same figure.
 */
export function bytesToMb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}
