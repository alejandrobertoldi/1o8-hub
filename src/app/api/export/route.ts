/* eslint-disable react-doctor/js-combine-iterations */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributes, master } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import { isAttributeRelevantForAnyCategory } from "@/lib/category-requirement";
import type { Product } from "@/lib/db/schema";

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

  // Get products for this client first — we need their productTypes to
  // compute the union of relevant attributes via categoryMeta lookups.
  const clientProducts = await db
    .select()
    .from(master)
    .where(eq(master.clientIdCode, client))
    .limit(5000);

  if (clientProducts.length === 0) {
    return NextResponse.json(
      { error: `No products found for client ${client}` },
      { status: 404 }
    );
  }

  const clientProductTypes = new Set(
    clientProducts
      .map((p) => p.productType)
      .filter((pt): pt is string => !!pt)
  );

  // Get column attributes
  const attrs = await db
    .select()
    .from(attributes)
    .orderBy(asc(attributes.referenceGroup), asc(attributes.subgroup), asc(attributes.generalLabel));

  // Single CSV — include any attr where ANY of the client's productTypes has
  // a non-Optional requirement (union across categories).
  const relevantAttrs = attrs.filter((attr) =>
    isAttributeRelevantForAnyCategory(attr, clientProductTypes)
  );

  if (relevantAttrs.length === 0) {
    return NextResponse.json(
      { error: `No relevant columns found for client ${client}` },
      { status: 404 }
    );
  }

  // Build CSV
  const columnNames = relevantAttrs.map((a) => a.generalLabel);
  const header = columnNames.map(escapeCsvField).join(",");

  const rows = clientProducts.map((product) => {
    return columnNames
      .map((colName) => {
        const val = getProductFieldValue(product as Product, colName);
        return escapeCsvField(val || "");
      })
      .join(",");
  });

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${client.replace(/["\\\n\r]/g, "_")}_export.csv"`,
    },
  });
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
