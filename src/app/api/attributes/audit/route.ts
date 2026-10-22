/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  productKeyOverrides,
  master,
  attributes,
} from "@/lib/db/schema";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import { categoryDefinitionColumns } from "@/lib/category-definitions/columns";

interface AuditGap {
  attributeName: string;
  localLabel: string;
  requirement: string | null;
  isKey: boolean;
  effectiveLevel: "Required" | "Conditionally Required" | "Key";
}

interface ProductAudit {
  productId: string;
  productName: string;
  asin: string;
  gaps: AuditGap[];
}

interface CategoryAudit {
  definitionId: number;
  productType: string;
  totalAuditable: number;
  productCount: number;
  productsWithGaps: number;
  gapBreakdown: { required: number; conditional: number; key: number };
  totalGaps: number;
  products?: ProductAudit[];
}

interface ClientAudit {
  clientIdCode: string;
  categories: CategoryAudit[];
  totalProducts: number;
  totalGaps: number;
  healthPercent: number;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const productType = req.nextUrl.searchParams.get("productType");
  const includeProducts =
    req.nextUrl.searchParams.get("includeProducts") === "true";

  // 1. Fetch category definitions
  const defFilter = clientIdCode
    ? eq(categoryDefinitions.clientIdCode, clientIdCode)
    : undefined;
  // Never select baseline_snapshot here — see categoryDefinitionColumns. With no
  // clientIdCode this is an unfiltered read of the whole table.
  const defs = await db
    .select(categoryDefinitionColumns)
    .from(categoryDefinitions)
    .where(defFilter)
    .orderBy(categoryDefinitions.clientIdCode, categoryDefinitions.productType);

  const filteredDefs = productType
    ? defs.filter((d) => d.productType === productType)
    : defs;

  // 2. Build audit per client
  const clientMap = new Map<string, ClientAudit>();

  for (const def of filteredDefs) {
    // Read auditable attributes from attributes.category_meta:
    //   - requirement IN ('Required', 'Conditionally Required')
    //   - OR isKey === true
    const auditableRows = await db
      .select({
        id: attributes.id,
        generalLabel: attributes.generalLabel,
        requirement: sql<string | null>`(${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'requirement')`,
        isKey: sql<boolean>`COALESCE((${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'isKey')::boolean, false)`,
        localLabel: attributes.generalLabel, // backward-compat shim — local label = general label post-merge
      })
      .from(attributes)
      .where(
        and(
          sql`${attributes.categoryMeta} ? ${def.marketplaceId}`,
          sql`(${attributes.categoryMeta}->${def.marketplaceId}) ? ${def.productType}`,
          or(
            sql`(${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'requirement') IN ('Required', 'Conditionally Required')`,
            sql`COALESCE((${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'isKey')::boolean, false) = true`,
          ),
        ),
      );

    if (!clientMap.has(def.clientIdCode)) {
      clientMap.set(def.clientIdCode, {
        clientIdCode: def.clientIdCode,
        categories: [],
        totalProducts: 0,
        totalGaps: 0,
        healthPercent: 100,
      });
    }

    if (auditableRows.length === 0) {
      clientMap.get(def.clientIdCode)!.categories.push({
        definitionId: def.id,
        productType: def.productType,
        totalAuditable: 0,
        productCount: 0,
        productsWithGaps: 0,
        gapBreakdown: { required: 0, conditional: 0, key: 0 },
        totalGaps: 0,
      });
      continue;
    }

    // Get products for this client + productType
    const products = await db
      .select()
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, def.clientIdCode),
          eq(master.productType, def.productType)
        )
      );

    // Get product-level key overrides for these products
    const productIds = products.map((p) => p.id);
    const overrides =
      productIds.length > 0
        ? await db
            .select()
            .from(productKeyOverrides)
            .where(inArray(productKeyOverrides.productId, productIds))
        : [];

    const overrideMap = new Map<string, Map<string, boolean>>();
    for (const ov of overrides) {
      if (!overrideMap.has(ov.productId))
        overrideMap.set(ov.productId, new Map());
      overrideMap.get(ov.productId)!.set(ov.attributeName, ov.isKey);
    }

    // Audit each product
    let productsWithGaps = 0;
    const gapBreakdown = { required: 0, conditional: 0, key: 0 };
    const productAudits: ProductAudit[] = [];

    for (const product of products) {
      const productOverrides = overrideMap.get(product.id);
      const gaps: AuditGap[] = [];

      for (const attr of auditableRows) {
        const fieldName = attr.generalLabel;

        // Determine effective key status
        let effectiveIsKey = attr.isKey;
        if (productOverrides?.has(fieldName)) {
          effectiveIsKey = productOverrides.get(fieldName)!;
        }

        // Determine effective level
        let effectiveLevel: "Required" | "Conditionally Required" | "Key";
        if (attr.requirement === "Required") {
          effectiveLevel = "Required";
        } else if (attr.requirement === "Conditionally Required") {
          effectiveLevel = "Conditionally Required";
        } else if (effectiveIsKey) {
          effectiveLevel = "Key";
        } else {
          // Override turned off isKey for a non-required attribute — skip
          continue;
        }

        const value = getProductFieldValue(product, fieldName);

        if (!value || value.trim() === "") {
          gaps.push({
            attributeName: fieldName,
            localLabel: attr.localLabel,
            requirement: attr.requirement,
            isKey: effectiveIsKey,
            effectiveLevel,
          });

          if (effectiveLevel === "Required") gapBreakdown.required++;
          else if (effectiveLevel === "Conditionally Required")
            gapBreakdown.conditional++;
          else gapBreakdown.key++;
        }
      }

      if (gaps.length > 0) productsWithGaps++;

      if (includeProducts) {
        productAudits.push({
          productId: product.id,
          productName:
            getProductFieldValue(product, "ItemName") || product.id,
          asin: getProductFieldValue(product, "ASIN") || "",
          gaps,
        });
      }
    }

    const totalGaps =
      gapBreakdown.required + gapBreakdown.conditional + gapBreakdown.key;

    const client = clientMap.get(def.clientIdCode)!;

    const catAudit: CategoryAudit = {
      definitionId: def.id,
      productType: def.productType,
      totalAuditable: auditableRows.length,
      productCount: products.length,
      productsWithGaps,
      gapBreakdown,
      totalGaps,
    };
    if (includeProducts) catAudit.products = productAudits;

    client.categories.push(catAudit);
    client.totalProducts += products.length;
    client.totalGaps += totalGaps;
  }

  // Calculate health percentages
  for (const client of clientMap.values()) {
    let totalChecks = 0;
    let totalFilled = 0;
    for (const cat of client.categories) {
      const catChecks = cat.totalAuditable * cat.productCount;
      totalChecks += catChecks;
      totalFilled += catChecks - cat.totalGaps;
    }
    client.healthPercent =
      totalChecks > 0 ? Math.round((totalFilled / totalChecks) * 100) : 100;
  }

  const clients = Array.from(clientMap.values()).toSorted((a, b) =>
    a.clientIdCode.localeCompare(b.clientIdCode)
  );

  return NextResponse.json({ clients });
}
