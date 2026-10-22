/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-combine-iterations */
/**
 * Aggregates all data needed for a client report:
 * product counts, completeness scores, recent activity, and field coverage.
 */
import { db } from "./db";
import {
  master,
  attributes,
  activityLog,
  aac,
} from "./db/schema";
import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { calculateCompleteness, getScoreBucket } from "./completeness";
import { getProductFieldValue } from "./product-mapper";
import { strongestRequirement } from "./category-requirement";
import type { Product, ColumnAttribute } from "./db/schema";

export interface FieldCoverageEntry {
  fieldLabel: string;
  requirementLevel: string;
  filledCount: number;
  totalCount: number;
  fillRate: number;
}

export interface RecentChange {
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
  editType: string;
}

export interface ProductScore {
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  status: string | null;
  score: number;
  missingRequired: string[];
  missingConditionallyRequired: string[];
}

export interface ClientReportData {
  clientIdCode: string;
  clientName: string;
  generatedAt: string;
  dateRange: { from: string; to: string };
  summary: {
    totalProducts: number;
    activeProducts: number;
    averageScore: number;
    distribution: {
      ready: number;
      good: number;
      incomplete: number;
      poor: number;
    };
  };
  products: ProductScore[];
  recentChanges: RecentChange[];
  fieldCoverage: FieldCoverageEntry[];
}

export async function aggregateClientReport(
  clientIdCode: string,
  from: Date,
  to: Date
): Promise<ClientReportData> {
  // 1. Fetch client name
  const clientRow = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  const clientName = clientRow[0]?.clientName || clientIdCode;

  // 2. Fetch all products for this client
  const productList = await db
    .select()
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  // 3. Fetch column attributes
  const attrs = await db.select().from(attributes);

  // Build the union of productTypes the client uses (drives "relevant" filtering)
  const clientProductTypes = new Set(
    productList
      .map((p) => p.productType)
      .filter((pt): pt is string => !!pt)
  );

  // 4. Calculate completeness scores (per-product, using each product's own productType)
  const distribution = { ready: 0, good: 0, incomplete: 0, poor: 0 };
  let totalScore = 0;

  const productScores: ProductScore[] = productList.map(
    (product: Product) => {
      const result = calculateCompleteness(product, attrs);
      totalScore += result.score;
      distribution[getScoreBucket(result.score)]++;
      return {
        asin: product.asin,
        sku: product.sku,
        itemName: product.itemName,
        status: product.status,
        score: result.score,
        missingRequired: result.missingRequired,
        missingConditionallyRequired: result.missingConditionallyRequired,
      };
    }
  );

  const activeCount = productList.filter(
    (p) => p.status?.toLowerCase() === "active"
  ).length;

  const averageScore =
    productList.length > 0
      ? Math.round(totalScore / productList.length)
      : 0;

  // 5. Fetch recent activity in date range
  const activityRows = await db
    .select({
      asin: activityLog.asin,
      sku: activityLog.sku,
      itemName: activityLog.itemName,
      fieldLabel: activityLog.fieldLabel,
      oldValue: activityLog.oldValue,
      newValue: activityLog.newValue,
      changedBy: activityLog.changedBy,
      changedAt: activityLog.changedAt,
      editType: activityLog.editType,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.clientIdCode, clientIdCode),
        gte(activityLog.changedAt, from),
        lte(activityLog.changedAt, to)
      )
    )
    .orderBy(desc(activityLog.changedAt))
    .limit(500);

  const recentChanges: RecentChange[] = activityRows.map((r) => ({
    asin: r.asin,
    sku: r.sku,
    itemName: r.itemName,
    fieldLabel: r.fieldLabel,
    oldValue: r.oldValue,
    newValue: r.newValue,
    changedBy: r.changedBy,
    changedAt: r.changedAt.toISOString(),
    editType: r.editType,
  }));

  // 6. Calculate field coverage across all products
  const fieldCoverage: FieldCoverageEntry[] = [];
  const totalProducts = productList.length;

  if (totalProducts > 0) {
    // Include any attr that has a non-empty requirement for any of the client's productTypes
    const allRelevantAttrs = attrs.filter((a: ColumnAttribute) => {
      const r = strongestRequirement(a, clientProductTypes);
      return !!r && r !== "Not Required";
    });

    for (const attr of allRelevantAttrs) {
      const bqName = attr.bqLabel || attr.generalLabel;
      const level = strongestRequirement(attr, clientProductTypes) || "Unknown";

      // Count how many products have this field filled
      let filledCount = 0;
      for (const product of productList) {
        const value = getProductFieldValue(product, bqName);
        if (
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
        ) {
          filledCount++;
        }
      }

      fieldCoverage.push({
        fieldLabel: attr.generalLabel,
        requirementLevel: level,
        filledCount,
        totalCount: totalProducts,
        fillRate: Math.round((filledCount / totalProducts) * 100),
      });
    }

    // Sort by requirement level priority, then fill rate ascending
    const levelOrder: Record<string, number> = {
      Required: 0,
      "Conditionally Required": 1,
      Recommended: 2,
      Optional: 3,
    };
    fieldCoverage.sort((a, b) => {
      const la = levelOrder[a.requirementLevel] ?? 9;
      const lb = levelOrder[b.requirementLevel] ?? 9;
      if (la !== lb) return la - lb;
      return a.fillRate - b.fillRate;
    });
  }

  return {
    clientIdCode,
    clientName,
    generatedAt: new Date().toISOString(),
    dateRange: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      totalProducts,
      activeProducts: activeCount,
      averageScore,
      distribution,
    },
    products: productScores,
    recentChanges,
    fieldCoverage,
  };
}
