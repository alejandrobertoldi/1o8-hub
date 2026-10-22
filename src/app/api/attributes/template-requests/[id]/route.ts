import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryDefinitions,
  master,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import { getAttributesForCategory } from "@/lib/category-meta-queries";
import { categoryDefinitionColumns } from "@/lib/category-definitions/columns";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [request] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch the definition + attributes
  const [def] = await db
    .select(categoryDefinitionColumns)
    .from(categoryDefinitions)
    .where(
      and(
        eq(categoryDefinitions.clientIdCode, request.clientIdCode),
        eq(categoryDefinitions.productType, request.productType)
      )
    )
    .limit(1);

  if (!def) {
    return NextResponse.json(
      { error: "Category definition not found" },
      { status: 404 }
    );
  }

  const attrs = await getAttributesForCategory(def.marketplaceId, def.productType);

  const filteredAttrs = attrs.filter((a) => {
    if (a.requirement && request.levels.includes(a.requirement)) return true;
    if (request.levels.includes("Key") && a.isKey) return true;
    return false;
  });

  // Fetch products
  const products =
    request.productIds && request.productIds.length > 0
      ? await db
          .select()
          .from(master)
          .where(inArray(master.id, request.productIds))
      : [];

  // Build product data with gaps
  const productData = products.map((product) => {
    const fields = filteredAttrs.map((attr) => ({
      attributeName: attr.generalLabel,
      // localLabel is the deprecated per-client display label; it no longer
      // exists on the unified attributes table — fall back to generalLabel.
      localLabel: attr.generalLabel,
      description: attr.description,
      example: attr.example,
      // attr.requirement is now nullable on the JSONB-backed shape; coerce
      // to "" so the API output keeps an always-string contract.
      requirement: attr.isKey ? "Key" : (attr.requirement ?? ""),
      currentValue: getProductFieldValue(product, attr.generalLabel) || "",
      isEmpty:
        !getProductFieldValue(product, attr.generalLabel)?.trim(),
    }));

    return {
      productId: product.id,
      productName: getProductFieldValue(product, "ItemName") || product.id,
      asin: getProductFieldValue(product, "ASIN") || "",
      fields,
      missingCount: fields.filter((f) => f.isEmpty).length,
    };
  });

  return NextResponse.json({
    request,
    productType: def.productType,
    products: productData,
  });
}
