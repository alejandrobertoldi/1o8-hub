import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { sql, and, eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productType: string; id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { productType, id } = await params;
  const attrId = parseInt(id, 10);
  if (isNaN(attrId)) {
    return NextResponse.json({ error: "Invalid attribute ID" }, { status: 400 });
  }

  const productTypeKey = decodeURIComponent(productType);
  // marketplaceId is supplied as a query string; default mirrors the
  // sibling GET handler (US marketplace).
  const marketplaceId =
    req.nextUrl.searchParams.get("marketplaceId") || "ATVPDKIKX0DER";

  const body = await req.json();

  if (typeof body.isKey !== "boolean") {
    return NextResponse.json(
      { error: "isKey (boolean) is required" },
      { status: 400 }
    );
  }

  // Update only the isKey leaf inside category_meta -> mp -> productType.
  // The 4th arg to jsonb_set is create_if_missing=false — combined with
  // the WHERE-clause `?` guards, this ensures we 404 cleanly when the
  // (mp, productType) entry doesn't already exist on this attribute row.
  // to_jsonb(${body.isKey}::boolean) writes a real JSON boolean (matching
  // the Task 10 upsert pattern at src/lib/category-definitions/upsert.ts:141);
  // a naive ${value}::jsonb cast on a text param would write a JSON string
  // ("true"/"false"), violating the CategoryMetaEntry.isKey: boolean contract.
  const updated = await db
    .update(attributes)
    .set({
      categoryMeta: sql`jsonb_set(${attributes.categoryMeta}, ARRAY[${marketplaceId}::text, ${productTypeKey}::text, 'isKey'], to_jsonb(${body.isKey}::boolean), false)`,
    })
    .where(
      and(
        eq(attributes.id, attrId),
        sql`${attributes.categoryMeta} ? ${marketplaceId}`,
        sql`(${attributes.categoryMeta}->${marketplaceId}) ? ${productTypeKey}`
      )
    )
    .returning({
      id: attributes.id,
      isKey: sql<boolean>`COALESCE((${attributes.categoryMeta}->${marketplaceId}->${productTypeKey}->>'isKey')::boolean, false)`,
    });

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Attribute or category not found for (marketplaceId, productType)" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, ...updated[0] });
}
