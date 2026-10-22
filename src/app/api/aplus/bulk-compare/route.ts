import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, aplusModules, aplusModuleImages } from "@/lib/db/schema";
import { eq, sql, asc, inArray, and, isNotNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import type { RainforestProduct } from "@/types/rainforest";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

// Normalize text for comparison: lowercase + trim whitespace
function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

type SnapshotRow = {
  id: string;
  product_id: string;
  asin: string;
  provider: string;
  snapshot_data: unknown;
  fetched_at: Date;
};

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { clientIdCode } = body as { clientIdCode?: string };

  if (!clientIdCode) {
    return NextResponse.json(
      { error: "clientIdCode is required" },
      { status: 400 }
    );
  }

  // 1. Fetch all active, non-parent products for this client that have an ASIN
  const productRows = await db
    .select({
      id: master.id,
      asin: master.asin,
      itemName: master.itemName,
    })
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, clientIdCode),
        eq(master.status, "Active"),
        isNotNull(master.asin),
        sql`lower(coalesce(${master.parentageLevel}, '')) <> 'parent'`
      )
    )
    .orderBy(asc(master.itemName));

  if (productRows.length === 0) {
    return NextResponse.json({
      clientIdCode,
      totalProducts: 0,
      productsWithSnapshot: 0,
      productsWithAplus: 0,
      overallMatchRate: 0,
      perProduct: [],
    });
  }

  const productIds = productRows.map((p) => p.id);

  // 2. Bulk fetch modules and images to avoid N+1
  const moduleRows = await db
    .select()
    .from(aplusModules)
    .where(inArray(aplusModules.productId, productIds));

  const moduleIds = moduleRows.map((m) => m.id);
  const imageRows =
    moduleIds.length > 0
      ? await db
          .select()
          .from(aplusModuleImages)
          .where(inArray(aplusModuleImages.moduleId, moduleIds))
      : [];

  // 3. Bulk fetch latest snapshot per product using DISTINCT ON
  const rawSnapshotResult = productIds.length > 0
    ? await db.execute(
        sql`SELECT DISTINCT ON (product_id) id, product_id, asin, provider, snapshot_data, fetched_at
            FROM amazon_sync_snapshots
            WHERE product_id = ANY(${sql.raw(`ARRAY[${productIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
              AND provider = 'rainforest'
            ORDER BY product_id, fetched_at DESC`
      )
    : [];
  const snapshotRows: SnapshotRow[] = Array.from(rawSnapshotResult as Iterable<SnapshotRow>);

  // Build lookup maps
  const snapshotByProductId = new Map<string, SnapshotRow>(
    snapshotRows.map((s) => [s.product_id, s])
  );

  // moduleNumberMap: moduleId -> moduleNumber
  const moduleNumberMap = new Map<string, number>(
    moduleRows.map((m) => [m.id, m.moduleNumber])
  );

  // modulesByProductId: productId -> module ids
  const modulesByProductId = new Map<string, string[]>();
  for (const m of moduleRows) {
    const existing = modulesByProductId.get(m.productId) ?? [];
    existing.push(m.id);
    modulesByProductId.set(m.productId, existing);
  }

  // imagesByModuleId: moduleId -> image rows
  const imagesByModuleId = new Map<string, typeof imageRows>();
  for (const img of imageRows) {
    const existing = imagesByModuleId.get(img.moduleId) ?? [];
    existing.push(img);
    imagesByModuleId.set(img.moduleId, existing);
  }

  // 4. Compute per-product compare results
  let totalMatchCount = 0;
  let totalHubImages = 0;
  let productsWithSnapshot = 0;
  let productsWithAplus = 0;

  const perProduct = productRows.map((product) => {
    const snapshot = snapshotByProductId.get(product.id);
    const hasSnapshot = !!snapshot;
    if (hasSnapshot) productsWithSnapshot++;

    const snapshotData = snapshot?.snapshot_data as RainforestProduct | undefined;
    const hasAmazonAplus =
      hasSnapshot && (snapshotData?.a_plus_content?.has_a_plus_content ?? false);
    if (hasAmazonAplus) productsWithAplus++;

    const amazonImages: { link: string; name: string }[] =
      snapshotData?.a_plus_content?.all_images ?? [];

    // Get all images for this product
    const productModuleIds = modulesByProductId.get(product.id) ?? [];
    const allProductImages = productModuleIds.flatMap(
      (moduleId) => imagesByModuleId.get(moduleId) ?? []
    );

    const hubImageCount = allProductImages.length;
    const amazonImageCount = hasSnapshot ? amazonImages.length : null;

    // Compute match rate
    const matchedAmazonIndices = new Set<number>();
    let matchCount = 0;

    for (const image of allProductImages) {
      const normalizedHub = normalizeText(image.altText);
      if (!hasSnapshot || !normalizedHub) continue;

      for (let i = 0; i < amazonImages.length; i++) {
        if (matchedAmazonIndices.has(i)) continue;
        if (normalizeText(amazonImages[i].name) === normalizedHub) {
          matchedAmazonIndices.add(i);
          matchCount++;
          break;
        }
      }
    }

    const matchRate =
      hubImageCount > 0 ? Math.round((matchCount / hubImageCount) * 100) : 0;

    totalHubImages += hubImageCount;
    totalMatchCount += matchCount;

    return {
      productId: product.id,
      asin: product.asin ?? "",
      productName: product.itemName ?? "",
      hubImageCount,
      amazonImageCount,
      matchRate,
      hasSnapshot,
    };
  });

  const overallMatchRate =
    totalHubImages > 0
      ? Math.round((totalMatchCount / totalHubImages) * 100)
      : 0;

  return NextResponse.json({
    clientIdCode,
    totalProducts: productRows.length,
    productsWithSnapshot,
    productsWithAplus,
    overallMatchRate,
    perProduct,
  });
}
