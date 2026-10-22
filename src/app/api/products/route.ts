/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, amazonSnapshots, aac, varietyPackItems, variations } from "@/lib/db/schema";
import { and, ilike, or, sql, desc, asc, count, inArray, eq, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { mapBqRowToProduct, type BqRow } from "@/lib/product-mapper";
import { computeThemeSummarizedTitle } from "@/lib/computed-fields";
import { listingMainDriveFileIds } from "@/lib/listing-image-main";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(url.get("page") || "1"));
  const pageSize = Math.min(5000, Math.max(1, parseInt(url.get("pageSize") || "50")));
  const search = url.get("search") || "";
  const sortBy = url.get("sortBy") || "updatedAt";
  const sortOrder = url.get("sortOrder") === "asc" ? "asc" : "desc";
  const client = url.get("client") || "";
  const marketplace = url.get("marketplace") || "";
  const status = url.get("status") || "";
  const isDirty = url.get("isDirty");
  const isVp = url.get("isVp");
  const includeInactive = url.get("includeInactive") === "true";
  const fieldsAll = url.get("fields") === "all";
  const parentsOnly = url.get("parentsOnly") === "true";

  // Build where conditions
  const conditions = [];

  // Card view: return parents, standalone products, and orphaned children (variation ID removed)
  if (parentsOnly) {
    conditions.push(
      or(
        ilike(master.parentageLevel, "parent"),
        sql`${master.parentSku} IS NULL`,
        sql`(${master.parentageLevel} = 'Child' AND (${master.variations}->>'VariationID' IS NULL OR ${master.variations}->>'VariationID' = ''))`
      )
    );
  }

  // By default, only show products from active clients (AAC table)
  if (!includeInactive && !client) {
    const activeClientRows = await db
      .select({ code: aac.clientIdCode })
      .from(aac)
      .where(ilike(aac.clientStatus, "active"));
    const activeCodes = activeClientRows.map((r) => r.code);
    if (activeCodes.length > 0) {
      conditions.push(inArray(master.clientIdCode, activeCodes));
    }
  }

  if (search) {
    conditions.push(
      or(
        ilike(master.asin, `%${search}%`),
        ilike(master.sku, `%${search}%`),
        ilike(master.brandName, `%${search}%`),
        ilike(master.itemName, `%${search}%`),
        ilike(master.summarizedTitle, `%${search}%`),
        ilike(master.clientIdCode, `%${search}%`)
      )
    );
  }

  if (client) {
    const clients = client.split(",").map((c) => c.trim()).filter(Boolean);
    if (clients.length === 1) {
      conditions.push(ilike(master.clientIdCode, clients[0]));
    } else if (clients.length > 1) {
      conditions.push(
        or(...clients.map((c) => ilike(master.clientIdCode, c)))
      );
    }
  }

  if (marketplace) {
    conditions.push(ilike(master.marketplace, marketplace));
  }

  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(ilike(master.status, statuses[0]));
    } else if (statuses.length > 1) {
      conditions.push(
        or(...statuses.map((s) => ilike(master.status, s)))
      );
    }
  }

  if (isDirty === "true") {
    conditions.push(sql`${master.isDirty} = true`);
  } else if (isDirty === "false") {
    conditions.push(sql`${master.isDirty} = false`);
  }

  if (isVp === "true") {
    conditions.push(eq(master.isVp, true));
  } else if (isVp === "false") {
    conditions.push(eq(master.isVp, false));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [{ total }] = await db
    .select({ total: count() })
    .from(master)
    .where(where);

  // Build order by clause
  const variationIdExpr = sql`COALESCE(${master.variations}->>'VariationID', ${master.otherAttributes}->>'VariationID', ${master.rawColumnValues}->>'VariationID')`;

  const sortColumns: Record<string, AnyColumn | SQLWrapper> = {
    asin: master.asin,
    sku: master.sku,
    brandName: master.brandName,
    marketplace: master.marketplace,
    status: master.status,
    updatedAt: master.updatedAt,
    clientIdCode: master.clientIdCode,
    variationId: variationIdExpr,
  };

  const sortKey = sortBy in sortColumns ? sortBy : "updatedAt";
  const orderFn = sortOrder === "asc" ? asc : desc;

  // Fetch page of products (core columns only for list view)
  // Group by client → variation family (parent first) → user sort
  const selectFields = {
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      clientIdCode: master.clientIdCode,
      marketplace: master.marketplace,
      country: master.country,
      status: master.status,
      brandName: master.brandName,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      listPrice: master.listPrice,
      mainImageUrl: master.mainImageUrl,
      parentageLevel: master.parentageLevel,
      parentSku: master.parentSku,
      parentAsin: master.parentAsin,
      variationId: sql<string | null>`${variationIdExpr}`,
      variationGroup: master.variationGroup,
      variationName: variations.name,
      variationThemeName: sql<string | null>`COALESCE(${master.variations}->>'VariationThemeName', ${master.otherAttributes}->>'VariationThemeName', ${master.rawColumnValues}->>'VariationThemeName')`,
      variations: sql<Record<string,string> | null>`
        COALESCE(${master.variations}, '{}'::jsonb) ||
        jsonb_strip_nulls(jsonb_build_object(
          'Flavor', COALESCE(${master.variations}->>'Flavor', ${master.contentSeo}->>'Flavor', ${master.packaging}->>'Flavor', ${master.targetAudience}->>'Flavor', ${master.fulfillment}->>'Flavor', ${master.productAttributes}->>'Flavor', ${master.nutritionSupplements}->>'Flavor', ${master.complianceSafety}->>'Flavor', ${master.images}->>'Flavor', ${master.dimensionsWeight}->>'Flavor', ${master.otherAttributes}->>'Flavor', ${master.rawColumnValues}->>'Flavor'),
          'Size',   COALESCE(${master.variations}->>'Size',   ${master.contentSeo}->>'Size',   ${master.packaging}->>'Size',   ${master.targetAudience}->>'Size',   ${master.fulfillment}->>'Size',   ${master.productAttributes}->>'Size',   ${master.nutritionSupplements}->>'Size',   ${master.complianceSafety}->>'Size',   ${master.images}->>'Size',   ${master.dimensionsWeight}->>'Size',   ${master.otherAttributes}->>'Size',   ${master.rawColumnValues}->>'Size'),
          'Color',  COALESCE(${master.variations}->>'Color',  ${master.contentSeo}->>'Color',  ${master.packaging}->>'Color',  ${master.targetAudience}->>'Color',  ${master.fulfillment}->>'Color',  ${master.productAttributes}->>'Color',  ${master.nutritionSupplements}->>'Color',  ${master.complianceSafety}->>'Color',  ${master.images}->>'Color',  ${master.dimensionsWeight}->>'Color',  ${master.otherAttributes}->>'Color',  ${master.rawColumnValues}->>'Color'),
          'Style',  COALESCE(${master.variations}->>'Style',  ${master.contentSeo}->>'Style',  ${master.packaging}->>'Style',  ${master.targetAudience}->>'Style',  ${master.fulfillment}->>'Style',  ${master.productAttributes}->>'Style',  ${master.nutritionSupplements}->>'Style',  ${master.complianceSafety}->>'Style',  ${master.images}->>'Style',  ${master.dimensionsWeight}->>'Style',  ${master.otherAttributes}->>'Style',  ${master.rawColumnValues}->>'Style')
        ))
      `,
      otherAttributes: master.otherAttributes,
      isDirty: master.isDirty,
      changeLog: master.changeLog,
      updatedAt: master.updatedAt,
      varietyPackItemCount: sql<number>`(SELECT count(*)::int FROM ${varietyPackItems} WHERE ${varietyPackItems.packProductId} = "master"."id")`,
      vpFlavors: sql<string[] | null>`(SELECT json_agg(CASE WHEN vpi.units > 1 THEN vpi.units || '× ' || vpi.flavor ELSE vpi.flavor END ORDER BY vpi.sort_order) FROM ${varietyPackItems} vpi WHERE vpi.pack_product_id = "master"."id" AND vpi.flavor IS NOT NULL)`,
      isVp: master.isVp,
      ...(fieldsAll ? { rawColumnValues: master.rawColumnValues } : {}),
  };

  const rows = await db
    .select(selectFields)
    .from(master)
    .leftJoin(variations, eq(master.variationRef, variations.id))
    .where(where)
    .orderBy(
      asc(master.clientIdCode),
      // Variations first, standalones after (hub ref + Amazon VariationID nulls last)
      asc(sql`${master.variationRef} IS NULL`),
      asc(sql`${variationIdExpr} IS NULL`),
      asc(variationIdExpr),
      // Parent first within each variation family
      asc(sql`CASE WHEN ${master.parentageLevel} ILIKE 'parent' THEN 0 WHEN ${master.parentageLevel} ILIKE 'child' THEN 1 ELSE 2 END`),
      // Then by variation group (nulls last)
      asc(sql`${master.variationGroup} IS NULL`),
      asc(master.variationGroup),
      orderFn(sortColumns[sortKey]),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Theme-aware Summarized Title — compute per row and lazy-persist when stored is stale.
  // Shape: {VariationName} | {attr…} dictated by VariationThemeName.
  // See src/lib/variation-themes.ts for the theme→attrs map.
  const titleUpdates: Array<{ id: string; title: string }> = [];
  for (const r of rows) {
    const v = (r.variations ?? {}) as Record<string, string | undefined>;
    const computed = computeThemeSummarizedTitle(r.variationThemeName, r.variationName, {
      Color: v.Color ?? null,
      Size: v.Size ?? null,
      Flavor: v.Flavor ?? null,
      Style: v.Style ?? null,
    });
    // Only overwrite stored value when we have a meaningful computed result.
    if (computed && computed !== r.summarizedTitle) {
      titleUpdates.push({ id: r.id, title: computed });
      r.summarizedTitle = computed;
    }
  }
  if (titleUpdates.length > 0) {
    // Fire-and-forget — don't block the response on the backfill writes.
    Promise.all(
      titleUpdates.map((u) =>
        db.update(master).set({ summarizedTitle: u.title }).where(eq(master.id, u.id))
      )
    ).catch((err) => {
      console.error("[products GET] summarized title backfill failed:", err);
    });
  }

  // Join latest Amazon match scores
  const productIds = rows.map((r) => r.id);
  let enrichedRows = rows as (typeof rows[number] & {
    _amazonMatch?: number | null;
    _amazonFetchedAt?: Date | null;
    listingImageDriveFileId?: string | null;
  })[];

  if (productIds.length > 0) {
    const [snapshots, listingMains] = await Promise.all([
      db
        .selectDistinctOn([amazonSnapshots.productId], {
          productId: amazonSnapshots.productId,
          overallMatch: amazonSnapshots.overallMatch,
          fetchedAt: amazonSnapshots.fetchedAt,
        })
        .from(amazonSnapshots)
        .where(inArray(amazonSnapshots.productId, productIds))
        .orderBy(amazonSnapshots.productId, desc(amazonSnapshots.fetchedAt)),
      listingMainDriveFileIds(productIds),
    ]);

    const snapshotMap = new Map(
      snapshots.map((s) => [s.productId, s])
    );

    enrichedRows = rows.map((r) => ({
      ...r,
      _amazonMatch: snapshotMap.get(r.id)?.overallMatch ?? null,
      _amazonFetchedAt: snapshotMap.get(r.id)?.fetchedAt ?? null,
      listingImageDriveFileId: listingMains.get(r.id) ?? null,
    }));
  }

  return NextResponse.json({
    data: enrichedRows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot create products" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { asin, sku, clientIdCode, marketplace, itemName } = body as {
    asin: string;
    sku: string;
    clientIdCode: string;
    marketplace: string;
    itemName: string;
  };

  // Validate required fields
  if (!asin?.trim() || !sku?.trim() || !clientIdCode?.trim() || !marketplace?.trim() || !itemName?.trim()) {
    return NextResponse.json(
      { error: "ASIN, SKU, Title, Client, and Marketplace are required" },
      { status: 400 }
    );
  }

  if (asin.trim().length !== 10) {
    return NextResponse.json(
      { error: "ASIN must be exactly 10 characters" },
      { status: 400 }
    );
  }

  // Check for duplicate (asin, sku, marketplace)
  const existing = await db
    .select({ id: master.id })
    .from(master)
    .where(
      and(
        eq(master.asin, asin.trim()),
        eq(master.sku, sku.trim()),
        ilike(master.marketplace, marketplace.trim())
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A product with this ASIN, SKU, and Marketplace already exists" },
      { status: 409 }
    );
  }

  // Build product from BQ row mapping
  const bqRow: BqRow = {
    ASIN: asin.trim(),
    SKU: sku.trim(),
    ClientIDCode: clientIdCode.trim(),
    Marketplace: marketplace.trim(),
    ItemName: itemName.trim(),
  };

  const newProduct = mapBqRowToProduct(bqRow);
  newProduct.status = "Active";
  newProduct.isDirty = true;

  const [inserted] = await db
    .insert(master)
    .values(newProduct)
    .returning({ id: master.id });

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
