// Catalog rows for a revision's review page: one row per ASIN (the project's
// SKU — see pick-product-by-asin) plus Design → Listing Images, which the PDP
// shows ahead of the Amazon image URLs (Amazon fills slots with no upload).
import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoKeywords } from "@/lib/db/schema";

/** The SKU each ASIN of a project is for (seo_asins.sku). */
export async function projectSkus(projectId: string) {
  return db.select({ asin: seoAsins.asin, sku: seoAsins.sku }).from(seoAsins).where(eq(seoAsins.projectId, projectId));
}

// Listing Images slot → PDP image field
const SLOT_FIELD: Record<string, string> = {
  MAIN: "MainImageURL",
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`PT0${i + 1}`, `OtherImageURL${i + 1}`])),
};

/** productId → { MainImageURL, OtherImageURL1..8 } served through the Drive thumbnail route. */
export function listingImagesByProduct(
  rows: { productId: string; slot: string; driveFileId: string | null }[],
  urlFor: (r: { productId: string; slot: string; driveFileId: string }) => string = (r) => `/api/design/listing-images/image?driveFileId=${encodeURIComponent(r.driveFileId)}`,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const field = SLOT_FIELD[r.slot];
    if (!field || !r.driveFileId) continue;
    (out[r.productId] ??= {})[field] = urlFor({ productId: r.productId, slot: r.slot, driveFileId: r.driveFileId });
  }
  return out;
}

/** Newest Listing Images version per (product, slot) — same rule as the Listing Images grid. */
async function newestListingImageRows(productIds: string[]) {
  if (productIds.length === 0) return [];
  const res = await db.execute(sql`
    SELECT DISTINCT ON (v.product_id, v.slot)
      v.product_id AS "productId", v.slot AS "slot", df.drive_file_id AS "driveFileId"
    FROM listing_image_slot_versions v
    JOIN drive_files df ON df.id = v.drive_file_id
    WHERE v.product_id IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY v.product_id, v.slot, v.version_number DESC
  `);
  return (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as { productId: string; slot: string; driveFileId: string | null }[];
}

export async function listingImagesFor(productIds: string[], urlFor?: Parameters<typeof listingImagesByProduct>[1]) {
  return listingImagesByProduct(await newestListingImageRows(productIds), urlFor);
}

/** The Drive file behind one product's Listing Images slot (newest version), or null. */
export async function listingImageDriveId(productId: string, slot: string): Promise<string | null> {
  const row = (await newestListingImageRows([productId])).find((r) => r.slot === slot);
  return row?.driveFileId ?? null;
}

/** The project's S2 keywords (positive only) in the shape keywordTierMap() reads. */
export async function projectKeywordList(projectId: string) {
  const rows = await db.select({ text: seoKeywords.text, tier: seoKeywords.priorityTier, negative: seoKeywords.isNegative })
    .from(seoKeywords).where(eq(seoKeywords.projectId, projectId));
  return rows.filter((k) => !k.negative && k.text).map((k) => ({ KeywordText: k.text, KeywordPriorityTier: k.tier }));
}

/** Product thumbnail: the Hub Listing Images MAIN when uploaded, else the Amazon MainImageURL. */
export function pickThumbnail(listingMain: string | null | undefined, amazonMain: string | null | undefined): string | null {
  return (listingMain && listingMain.trim()) || (amazonMain && amazonMain.trim()) || null;
}
