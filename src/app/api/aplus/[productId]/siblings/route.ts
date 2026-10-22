import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { eq, and, ne, isNotNull } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

export const maxDuration = 60;

/**
 * GET /api/aplus/{productId}/siblings
 *
 * Returns all sibling ASINs in the same variation family
 * (products sharing the same parentAsin).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;

  // Get this product's parentAsin
  const [product] = await db
    .select({
      id: master.id,
      asin: master.asin,
      parentAsin: master.parentAsin,
      clientIdCode: master.clientIdCode,
    })
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // If no parentAsin, this product is not part of a variation — return just itself
  if (!product.parentAsin) {
    return NextResponse.json({
      siblings: [{
        id: product.id,
        asin: product.asin ?? "",
        itemName: null,
      }],
      parentAsin: null,
    });
  }

  // Find all products with the same parentAsin (including this one)
  const siblings = await db
    .select({
      id: master.id,
      asin: master.asin,
      itemName: master.itemName,
      variationGroup: master.variationGroup,
    })
    .from(master)
    .where(
      and(
        eq(master.parentAsin, product.parentAsin),
        isNotNull(master.asin),
      )
    );

  return NextResponse.json({
    siblings: siblings.map((s) => ({
      id: s.id,
      asin: s.asin ?? "",
      itemName: s.itemName,
      variationGroup: s.variationGroup,
    })),
    parentAsin: product.parentAsin,
  });
}
