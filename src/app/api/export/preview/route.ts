/* eslint-disable react-doctor/js-combine-iterations */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributes, master } from "@/lib/db/schema";
import { eq, asc, count } from "drizzle-orm";
import {
  isAttributeRelevantForAnyCategory,
  strongestRequirement,
} from "@/lib/category-requirement";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !canAccessSection(session, "export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = req.nextUrl.searchParams.get("client");
  if (!client) {
    return NextResponse.json(
      { error: "client parameter required" },
      { status: 400 }
    );
  }

  // Fetch this client's productTypes to drive categoryMeta-based filtering
  const clientProductRows = await db
    .select({ productType: master.productType })
    .from(master)
    .where(eq(master.clientIdCode, client));

  const clientProductTypes = new Set(
    clientProductRows
      .map((r) => r.productType)
      .filter((pt): pt is string => !!pt)
  );

  // Get column attributes
  const attrs = await db
    .select()
    .from(attributes)
    .orderBy(asc(attributes.referenceGroup), asc(attributes.subgroup), asc(attributes.generalLabel));

  // Single CSV — union across the client's productTypes
  const relevantAttrs = attrs.filter((attr) =>
    isAttributeRelevantForAnyCategory(attr, clientProductTypes)
  );

  // Requirement breakdown uses the strongest level seen across the client's productTypes
  const requirementBreakdown: Record<string, number> = {};
  const columns: string[] = [];
  for (const attr of relevantAttrs) {
    const req = strongestRequirement(attr, clientProductTypes) || "";
    requirementBreakdown[req] = (requirementBreakdown[req] || 0) + 1;
    columns.push(attr.generalLabel);
  }

  // Count products for this client
  const [productCountResult] = await db
    .select({ count: count() })
    .from(master)
    .where(eq(master.clientIdCode, client));

  return NextResponse.json({
    client,
    columnCount: relevantAttrs.length,
    productCount: productCountResult?.count || 0,
    columns,
    requirementBreakdown,
  });
}
