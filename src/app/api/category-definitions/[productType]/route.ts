import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryDefinitions, master } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import { getAttributesForCategory } from "@/lib/category-meta-queries";
import { categoryDefinitionColumns } from "@/lib/category-definitions/columns";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productType: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productType } = await params;
  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const marketplaceId =
    req.nextUrl.searchParams.get("marketplaceId") || "ATVPDKIKX0DER";
  const productId = req.nextUrl.searchParams.get("productId");

  if (!clientIdCode) {
    return NextResponse.json(
      { error: "clientIdCode is required" },
      { status: 400 }
    );
  }

  // Find the definition
  const [definition] = await db
    .select(categoryDefinitionColumns)
    .from(categoryDefinitions)
    .where(
      and(
        eq(categoryDefinitions.clientIdCode, clientIdCode),
        eq(
          categoryDefinitions.productType,
          decodeURIComponent(productType)
        ),
        eq(categoryDefinitions.marketplaceId, marketplaceId)
      )
    )
    .limit(1);

  if (!definition) {
    return NextResponse.json({ definition: null, groups: [] });
  }

  // Fetch all attributes for this (marketplace, productType) from
  // attributes.category_meta. Group/sort metadata lives on the
  // attributes row's referenceGroup column.
  const attrs = await getAttributesForCategory(
    definition.marketplaceId,
    definition.productType
  );

  // Optionally resolve current product values
  let product = null;
  if (productId) {
    const [p] = await db
      .select()
      .from(master)
      .where(eq(master.id, productId))
      .limit(1);
    product = p ?? null;
  }

  // Group attributes by referenceGroup. attributes.generalLabel is UNIQUE,
  // so the old (bibleFieldMatch, amazonFieldName) dedupe is no longer
  // needed — getAttributesForCategory cannot return duplicates.
  const groupMap = new Map<
    string,
    Array<{
      id: number;
      generalLabel: string;
      description: string | null;
      example: string | null;
      requirement: string | null;
      validValues: string[] | null;
      currentValue: string | null;
      isKey: boolean;
    }>
  >();

  for (const attr of attrs) {
    const group = attr.referenceGroup;
    if (!groupMap.has(group)) groupMap.set(group, []);

    let currentValue: string | null = null;
    if (product) {
      currentValue = getProductFieldValue(product, attr.generalLabel);
    }

    groupMap.get(group)!.push({
      id: attr.id,
      generalLabel: attr.generalLabel,
      description: attr.description,
      example: attr.example,
      requirement: attr.requirement,
      validValues: attr.validValues,
      currentValue,
      isKey: attr.isKey,
    });
  }

  // Convert to ordered array
  const groups = Array.from(groupMap.entries()).map(([name, attributes]) => ({
    name,
    attributes,
  }));

  return NextResponse.json({ definition, groups });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productType: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { productType } = await params;
  // The param is used as the definition ID for delete
  const defId = parseInt(productType, 10);
  if (isNaN(defId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await db
    .delete(categoryDefinitions)
    .where(eq(categoryDefinitions.id, defId));

  return NextResponse.json({ success: true });
}
