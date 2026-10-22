/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
/**
 * GET /api/portal/design   (whitelisted for client/prospect roles)
 *
 * Client-scoped mirror of the Hub's /api/design-status, returning only the
 * one client the caller is allowed to see (own session, or admin preview via
 * ?client=). Hands over Drive file IDs already wrapped as /api/drive/file/{id}
 * URLs (the only image proxy client-role users can reach), so the portal
 * landing page can render the same rich thumbnails the Hub does.
 *
 * Read-only. Never exposes other clients' data.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { resolvePortalClient } from "@/lib/api-utils";
import { db } from "@/lib/db";
import {
  aac,
  aplus2Assets,
  aplus2Sets,
  aplus2Versions,
  designStatus,
  driveFiles,
  master,
  variations,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { CLIENT_NAMES } from "@/lib/constants";
import { PORTAL_DEMO } from "@/lib/portal-demo";

const CATEGORIES = ["brand_story", "aplus", "listing_images", "storefront"] as const;

type ListingImage = {
  url: string;
  slot: string;
  productId: string;
  asin: string | null;
  title: string | null;
  variationName: string | null;
};

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user?.clientStatus === "Prospect") return NextResponse.json(PORTAL_DEMO.design);

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientCode = resolved.clientIdCode;

  // Client name
  const [clientRow] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientCode))
    .limit(1);
  const clientName = clientRow?.clientName || CLIENT_NAMES[clientCode] || clientCode;

  // design_status rows for this client
  const statuses = await db
    .select()
    .from(designStatus)
    .where(eq(designStatus.clientIdCode, clientCode));
  const statusByCat = new Map(statuses.map((s) => [s.category, s]));

  // Brand Story: the "winning" version (status priority, then highest
  // versionNumber) is the source of truth — same as the Hub. Grab its
  // screenview Drive GID + status.
  const bsWinnerRows = await db.execute(sql`
    SELECT DISTINCT ON (v.client_id_code)
      v.status        AS version_status,
      df.drive_file_id AS drive_gid
    FROM brand_story_versions v
    LEFT JOIN brand_story_assets a
      ON a.version_id = v.id AND a.kind = 'screenview'
    LEFT JOIN drive_files df
      ON df.id = a.drive_file_id
    WHERE v.client_id_code = ${clientCode}
    ORDER BY
      v.client_id_code,
      CASE v.status
        WHEN 'live' THEN 4
        WHEN 'approved' THEN 3
        WHEN 'in_review' THEN 2
        WHEN 'in_progress' THEN 1
        ELSE 0
      END DESC,
      v.version_number DESC
  `);
  const bsWinner = bsWinnerRows[0] as
    | { version_status: string; drive_gid: string | null }
    | undefined;
  const brandStoryScreenviewUrl = bsWinner?.drive_gid
    ? `/api/drive/file/${bsWinner.drive_gid}`
    : null;

  // A+2 set counts for this client (derived "X/Y approved" subtitle). A set's
  // state is its latest version's status; "approved" counts approved sets.
  const aplusCountRows = await db.execute<{ total: number; approved: number }>(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE lv.status = 'approved')::int AS approved
    FROM ${aplus2Sets} s
    LEFT JOIN LATERAL (
      SELECT status FROM ${aplus2Versions}
      WHERE set_id = s.id ORDER BY version_number DESC LIMIT 1
    ) lv ON true
    WHERE s.client_id_code = ${clientCode}
  `);
  const aplusCount = aplusCountRows[0] as { total: number; approved: number } | undefined;

  // A+2 thumbnails: one representative image per set (latest version that has
  // images), scoped to this client. Served via the client-safe drive proxy.
  const aplusThumbRows = await db.execute<{ gid: string | null }>(sql`
    SELECT DISTINCT ON (s.id) df.drive_file_id AS gid
    FROM ${aplus2Sets} s
    JOIN ${aplus2Versions} v ON v.set_id = s.id
    JOIN ${aplus2Assets} a ON a.version_id = v.id AND a.kind = 'image'
    JOIN ${driveFiles} df ON df.id = a.drive_file_id
    WHERE s.client_id_code = ${clientCode}
    ORDER BY s.id, v.version_number DESC, a.created_at ASC
  `);
  const aplusThumbs = aplusThumbRows
    .map((r) => (r.gid ? `/api/drive/file/${r.gid}` : null))
    .filter((u): u is string => !!u);

  let listingImages: ListingImage[] = [];
  const products = await db
    .select({
      id: master.id,
      asin: master.asin,
      summarizedTitle: master.summarizedTitle,
      itemName: master.itemName,
      variationName: variations.name,
    })
    .from(master)
    .leftJoin(variations, eq(master.variationRef, variations.id))
    .where(eq(master.clientIdCode, clientCode));
  // All products (variation members + standalones) — mirrors Hub catalog layout.
  const productById = new Map(products.map((p) => [p.id, p]));
  // Newest version per (product_id, slot). Mirrors GET /api/design/listing-images.
  const liveRows = await db.execute<{
    gid: string | null;
    productId: string;
    slot: string;
  }>(sql`
    SELECT DISTINCT ON (v.product_id, v.slot)
      df.drive_file_id AS gid,
      v.product_id     AS "productId",
      v.slot           AS slot
    FROM listing_image_slot_versions v
    JOIN drive_files df ON df.id = v.drive_file_id
    WHERE v.client_id_code = ${clientCode}
    ORDER BY v.product_id, v.slot, v.version_number DESC
  `);
  listingImages = liveRows
    .map((r): ListingImage | null => {
      const p = productById.get(r.productId);
      if (!p || !r.gid) return null;
      return {
        url: `/api/drive/file/${r.gid}`,
        slot: r.slot ?? "MAIN",
        productId: p.id,
        asin: p.asin,
        title: p.summarizedTitle ?? p.itemName ?? null,
        variationName: p.variationName,
      };
    })
    .filter((x): x is ListingImage => !!x);

  // Categories (read-only statuses; brand_story derived from winning version)
  const categories = CATEGORIES.map((cat) => {
    const row = statusByCat.get(cat);
    const isBrandStoryDerived = cat === "brand_story" && bsWinner;
    const status = isBrandStoryDerived
      ? bsWinner.version_status
      : (row?.status ?? "not_started");
    return {
      category: cat,
      status,
      ...(cat === "aplus"
        ? {
            aplusTotal: aplusCount?.total ?? 0,
            aplusApproved: aplusCount?.approved ?? 0,
          }
        : {}),
    };
  });

  return NextResponse.json({
    clientIdCode: clientCode,
    clientName,
    categories,
    brandStoryScreenviewUrl,
    aplusThumbs,
    listingImages,
  });
}
