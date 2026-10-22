/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, varietyPackItems, activityLog } from "@/lib/db/schema";
import { and, eq, ilike, or, sql, asc, desc, count, type AnyColumn, type SQLWrapper } from "drizzle-orm";
import { PORTAL_DEMO } from "@/lib/portal-demo";
import { listingMainDriveFileIds } from "@/lib/listing-image-main";
import { resolvePortalClient } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user?.clientStatus === "Prospect") return NextResponse.json(PORTAL_DEMO.products);

    const url = req.nextUrl.searchParams;
    const search = url.get("search") || "";
    const statusFilter = url.get("status") || "";
    const sortBy = url.get("sortBy") || "updatedAt";
    const sortOrder = url.get("sortOrder") === "asc" ? "asc" : "desc";
    const page = Math.max(1, parseInt(url.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.get("pageSize") || "50")));

    const resolved = resolvePortalClient(session, url);
    if (resolved.response) return NextResponse.json({ products: [], total: 0 });
    const clientCode = resolved.clientIdCode;

    // Build conditions
    const conditions = [eq(master.clientIdCode, clientCode)];

    if (search) {
      conditions.push(
        or(
          ilike(master.asin, `%${search}%`),
          ilike(master.sku, `%${search}%`),
          ilike(master.itemName, `%${search}%`),
          ilike(master.brandName, `%${search}%`),
        )!,
      );
    }

    if (statusFilter) {
      const statuses = statusFilter.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(ilike(master.status, statuses[0]));
      } else if (statuses.length > 1) {
        conditions.push(or(...statuses.map((s) => ilike(master.status, s)))!);
      }
    }

    const where = and(...conditions);

    // Count total
    const [{ total }] = await db
      .select({ total: count() })
      .from(master)
      .where(where);

    // Variation ID expression (same as hub)
    const variationIdExpr = sql`COALESCE(${master.variations}->>'VariationID', ${master.otherAttributes}->>'VariationID', ${master.rawColumnValues}->>'VariationID')`;

    // Sort columns
    const sortColumns: Record<string, AnyColumn | SQLWrapper> = {
      asin: master.asin,
      sku: master.sku,
      status: master.status,
      updatedAt: master.updatedAt,
      variationId: variationIdExpr,
    };

    const sortKey = sortBy in sortColumns ? sortBy : "updatedAt";
    const orderFn = sortOrder === "desc" ? desc : asc;

    // Fetch page
    const products = await db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        status: master.status,
        itemName: master.itemName,
        summarizedTitle: master.summarizedTitle,
        variationId: sql<string | null>`${variationIdExpr}`,
        variationGroup: master.variationGroup,
        variations: master.variations,
        parentageLevel: master.parentageLevel,
        parentAsin: master.parentAsin,
        mainImageUrl: master.mainImageUrl,
        listPrice: master.listPrice,
        varietyPackItemCount: sql<number>`(SELECT count(*)::int FROM ${varietyPackItems} WHERE ${varietyPackItems.packProductId} = "master"."id")`,
        vpFlavors: sql<string[] | null>`(SELECT json_agg(CASE WHEN vpi.units > 1 THEN vpi.units || '× ' || vpi.flavor ELSE vpi.flavor END ORDER BY vpi.sort_order) FROM ${varietyPackItems} vpi WHERE vpi.pack_product_id = "master"."id" AND vpi.flavor IS NOT NULL)`,
        isVp: master.isVp,
        isPortalSubmission: sql<boolean>`(${master.rawColumnValues}->>'PortalNotes' IS NOT NULL OR (${master.asin} IS NULL AND ${master.status} = 'Incomplete'))`,
      })
      .from(master)
      .where(where)
      .orderBy(
        asc(master.clientIdCode),
        // Group by Variation ID (nulls last)
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

    const listingMains = await listingMainDriveFileIds(products.map((p) => p.id));
    const enriched = products.map((p) => ({
      ...p,
      listingImageDriveFileId: listingMains.get(p.id) ?? null,
    }));

    return NextResponse.json({ products: enriched, total });
  } catch (err) {
    console.error("[portal/products] Error:", err);
    return NextResponse.json(
      { error: "Failed to load products" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Prospects are read-only — block product submissions
    if (session.user.role === "prospect") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
    if (resolved.response) return resolved.response;
    const clientCode = resolved.clientIdCode;

    const body = await req.json();
    const { title, sku, upc, flavor, size, ingredients, notes } = body;

    if (!title?.trim() || !sku?.trim()) {
      return NextResponse.json(
        { error: "Product title and SKU are required" },
        { status: 400 },
      );
    }

    // Build variations JSONB with flavor/size if provided
    const variations: Record<string, string> = {};
    if (flavor) variations.Flavor = flavor;
    if (size) variations.Size = size;

    // Build rawColumnValues for extra fields
    const rawColumnValues: Record<string, string> = {};
    if (upc) rawColumnValues.UPC = upc;
    if (ingredients) rawColumnValues.Ingredients = ingredients;
    if (notes) rawColumnValues["PortalNotes"] = notes;

    const [created] = await db
      .insert(master)
      .values({
        clientIdCode: clientCode,
        itemName: title.trim(),
        sku: sku.trim(),
        status: "Incomplete",
        variations: Object.keys(variations).length > 0 ? variations : undefined,
        rawColumnValues:
          Object.keys(rawColumnValues).length > 0 ? rawColumnValues : undefined,
      })
      .returning({ id: master.id, asin: master.asin, sku: master.sku });

    // Activity log
    await db.insert(activityLog).values({
      productId: created.id,
      asin: created.asin,
      sku: created.sku,
      clientIdCode: clientCode,
      itemName: title.trim(),
      fieldLabel: "Product submitted via portal",
      bqName: "PortalSubmission",
      oldValue: null,
      newValue: `SKU: ${sku.trim()}`,
      changedBy: session.user.email!,
      editType: "single",
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    console.error("[portal/products] POST Error:", err);
    return NextResponse.json(
      { error: "Failed to submit product" },
      { status: 500 },
    );
  }
}
