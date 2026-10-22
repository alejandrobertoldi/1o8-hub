/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, aplusModules } from "@/lib/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {

  const { searchParams } = new URL(req.url);
  const clientFilter = searchParams.get("client") ?? null;

  // Build query for active products
  const productRows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      productName: master.itemName,
      clientIdCode: master.clientIdCode,
      parentageLevel: master.parentageLevel,
      parentAsin: master.parentAsin,
      variationGroup: master.variationGroup,
      variations: master.variations,
      mainImageUrl: master.mainImageUrl,
    })
    .from(master)
    .where(
      clientFilter
        ? sql`${master.status} = 'Active' AND ${master.clientIdCode} = ${clientFilter}`
        : sql`${master.status} = 'Active'`
    )
    .orderBy(asc(master.clientIdCode), asc(master.itemName));

  if (productRows.length === 0) {
    // Still return distinct client list even if no products match filter
    const allActiveProducts = clientFilter
      ? []
      : await db
          .select({ clientIdCode: master.clientIdCode })
          .from(master)
          .where(eq(master.status, "Active"))
          .orderBy(asc(master.clientIdCode));

    const clients = [
      ...new Set(
        allActiveProducts
          .map((p) => p.clientIdCode)
          .filter((c): c is string => c !== null)
      ),
    ];

    return NextResponse.json({ products: [], clients, role: session.user.role ?? "viewer" });
  }

  // Fetch module counts grouped by productId
  const moduleCounts = await db
    .select({
      productId: aplusModules.productId,
      moduleCount: sql<number>`cast(count(*) as int)`,
      approvedCount: sql<number>`cast(count(*) filter (where ${aplusModules.status} = 'approved') as int)`,
    })
    .from(aplusModules)
    .groupBy(aplusModules.productId);

  // Build a map from productId -> counts
  const countMap = new Map<string, { moduleCount: number; approvedCount: number }>();
  for (const row of moduleCounts) {
    countMap.set(row.productId, {
      moduleCount: row.moduleCount,
      approvedCount: row.approvedCount,
    });
  }

  // Fetch first A+ module image (driveFileId) per product for thumbnails
  const thumbRows = await db
    .select({
      productId: aplusModules.productId,
      driveFileId: sql<string | null>`(
        select img."drive_file_id" from "aplus_module_images" img
        where img."module_id" = ${aplusModules.id}
          and img."drive_file_id" is not null
        order by img."image_slot" asc
        limit 1
      )`,
    })
    .from(aplusModules)
    .where(eq(aplusModules.moduleNumber, 1));

  // Map productId -> first driveFileId
  const thumbMap = new Map<string, string>();
  for (const row of thumbRows) {
    if (row.driveFileId) {
      thumbMap.set(row.productId, row.driveFileId);
    }
  }

  // Merge counts + thumbnails into product rows
  const productsWithCounts = productRows.map((p) => {
    const counts = countMap.get(p.id) ?? { moduleCount: 0, approvedCount: 0 };
    const v = p.variations as Record<string, string | undefined> | null;
    const driveFileId = thumbMap.get(p.id);
    const thumbnailUrl = driveFileId
      ? `/api/drive/file/${driveFileId}`
      : p.mainImageUrl || null;
    return {
      id: p.id,
      asin: p.asin,
      sku: p.sku,
      productName: p.productName,
      clientIdCode: p.clientIdCode,
      parentageLevel: p.parentageLevel,
      parentAsin: p.parentAsin,
      variationGroup: p.variationGroup,
      variationId: v?.VariationID || null,
      variationTheme: v?.VariationThemeName || null,
      flavor: v?.Flavor || null,
      color: v?.Color || null,
      style: v?.Style || null,
      size: v?.Size || null,
      moduleCount: counts.moduleCount,
      approvedCount: counts.approvedCount,
      thumbnailUrl,
    };
  });

  // Extract distinct client list from all active products (for filter dropdown)
  const allClientsRows = await db
    .select({ clientIdCode: master.clientIdCode })
    .from(master)
    .where(eq(master.status, "Active"))
    .orderBy(asc(master.clientIdCode));

  const clients = [
    ...new Set(
      allClientsRows
        .map((p) => p.clientIdCode)
        .filter((c): c is string => c !== null)
    ),
  ];

  return NextResponse.json({
    products: productsWithCounts,
    clients,
    role: session.user.role ?? "viewer",
  });

  } catch (err) {
    console.error("[aplus products GET] Error:", err);
    return NextResponse.json({ error: "Failed to load A+ products" }, { status: 500 });
  }
}
