import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { master, seoAsins, seoProjects } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { unauthorized, serverError } from "@/lib/api-utils";
import { listingImagesFor, pickThumbnail } from "@/lib/seo/revision-products";

/**
 * GET /api/seo/projects/[id]/listing-meta
 *
 * Read-only. Summarized title, product id and thumbnail (Hub listing image, else Amazon main
 * image) for each of this project's
 * listings, looked up in the Hub products table (seo_asins stores neither).
 * Keyed `ASIN::SKU`, with an `ASIN` fallback entry for SKU drift.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const [project] = await db
      .select({ clientIdCode: seoProjects.clientIdCode })
      .from(seoProjects)
      .where(eq(seoProjects.id, id))
      .limit(1);
    const listings = await db.select({ asin: seoAsins.asin }).from(seoAsins).where(eq(seoAsins.projectId, id));
    const asins = [...new Set(listings.map((l) => l.asin).filter(Boolean))];
    if (!project || asins.length === 0) return NextResponse.json({ meta: {} });

    const where = project.clientIdCode
      ? and(inArray(master.asin, asins), eq(master.clientIdCode, project.clientIdCode))
      : inArray(master.asin, asins);
    const rows = await db
      .select({ id: master.id, asin: master.asin, sku: master.sku, summarizedTitle: master.summarizedTitle, mainImageUrl: master.mainImageUrl })
      .from(master)
      .where(where);

    // Thumbnails are decoration: a listing-images failure falls back to the Amazon image
    const listing = await listingImagesFor(rows.map((r) => r.id)).catch(() => ({} as Record<string, Record<string, string>>));
    const meta: Record<string, { productId: string; summarizedTitle: string | null; thumbnailUrl: string | null }> = {};
    // An ASIN often has several records (FBA / merchant SKUs) and only some carry an image: any
    // same-ASIN image is better than none
    const thumbOf = (r: (typeof rows)[number]) => pickThumbnail(listing[r.id]?.MainImageURL, r.mainImageUrl);
    const asinThumb = new Map<string, string>();
    for (const r of rows) { const t = r.asin ? thumbOf(r) : null; if (r.asin && t && !asinThumb.has(r.asin)) asinThumb.set(r.asin, t); }
    for (const r of rows) {
      if (!r.asin) continue;
      const entry = { productId: r.id, summarizedTitle: r.summarizedTitle || null, thumbnailUrl: thumbOf(r) ?? asinThumb.get(r.asin) ?? null };
      meta[`${r.asin}::${r.sku ?? ""}`] = entry;
      if (!meta[r.asin] || (!meta[r.asin].summarizedTitle && entry.summarizedTitle)) meta[r.asin] = entry;
    }
    return NextResponse.json({ meta });
  } catch (err) {
    return serverError(err);
  }
}
