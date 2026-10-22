/**
 * GET /api/portal/design/listing-images   (whitelisted for client/prospect roles)
 *
 * Client-scoped, read-only mirror of the Hub's Listing Images grid data
 * (/api/products + /api/design/listing-images) for the one client the caller
 * is allowed to see (own session, or admin preview via ?client=). Returns all
 * catalog products (variations first, then standalones) plus the latest (or
 * live) image version per product/slot. Images are fetched through the
 * portal-scoped /api/portal/design/listing-images/image proxy. Internal-only
 * fields (Drive folder links, upload metadata) are never exposed.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, asc, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { resolvePortalClient } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { aac, master, variations } from "@/lib/db/schema";
import { CLIENT_NAMES } from "@/lib/constants";

type ProductDto = {
  id: string;
  asin: string | null;
  sku: string | null;
  status: string | null;
  parentageLevel: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  variationId: string | null;
  variationName: string | null;
};

type ImageDto = {
  id: string;
  driveFileId: string;
  displayName: string;
  versionNumber: number;
  status: string;
  productId: string;
  slot: string;
};

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prospects see the demo portal — no real listing image data.
  if (session.user?.clientStatus === "Prospect") {
    return NextResponse.json({
      clientIdCode: "DEMO",
      clientName: "Demo Brand",
      products: [],
      images: [],
    });
  }

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientCode = resolved.clientIdCode;

  const [clientRow] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientCode))
    .limit(1);
  const clientName = clientRow?.clientName || CLIENT_NAMES[clientCode] || clientCode;

  const variationIdExpr = sql<string | null>`COALESCE(${master.variations}->>'VariationID', ${master.otherAttributes}->>'VariationID', ${master.rawColumnValues}->>'VariationID')`;

  // Catalog layout: variation members first (variationRef matched), then
  // standalones (nulls last on VariationID). Same family ordering as Hub.
  const products: ProductDto[] = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      status: master.status,
      parentageLevel: master.parentageLevel,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      variationId: variationIdExpr,
      variationName: variations.name,
    })
    .from(master)
    .leftJoin(variations, eq(master.variationRef, variations.id))
    .where(eq(master.clientIdCode, clientCode))
    .orderBy(
      asc(sql`${master.variationRef} IS NULL`),
      asc(sql`${variationIdExpr} IS NULL`),
      asc(variationIdExpr),
      asc(sql`CASE WHEN ${master.parentageLevel} ILIKE 'parent' THEN 0 WHEN ${master.parentageLevel} ILIKE 'child' THEN 1 ELSE 2 END`),
      asc(sql`${master.variationGroup} IS NULL`),
      asc(master.variationGroup),
      asc(master.asin)
    );

  // Per (product_id, slot): newest version — same rule as the Hub grid.
  const images = (await db.execute(sql`
    SELECT DISTINCT ON (v.product_id, v.slot)
      df.id            AS "id",
      df.drive_file_id AS "driveFileId",
      df.display_name  AS "displayName",
      v.version_number AS "versionNumber",
      v.status         AS "status",
      v.product_id     AS "productId",
      v.slot           AS "slot"
    FROM listing_image_slot_versions v
    JOIN drive_files df ON df.id = v.drive_file_id
    WHERE v.client_id_code = ${clientCode}
    ORDER BY v.product_id, v.slot, v.version_number DESC
  `)) as unknown as ImageDto[];

  return NextResponse.json({ clientIdCode: clientCode, clientName, products, images });
}
