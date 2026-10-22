/**
 * Comparison engine: diffs Hub product data against normalized Amazon SP-API data.
 */

import { getProductFieldValue } from "@/lib/product-mapper";
import type { Product } from "@/lib/db/schema";
import type { NormalizedAmazonData } from "./normalizer";

// ─── Types ──────────────────────────────────────────────────────────

export type DiffStatus =
  | "match"
  | "mismatch"
  | "bible_only"
  | "amazon_only"
  | "both_empty";

export interface FieldDiff {
  fieldLabel: string;
  bqName: string;
  bibleValue: string | null;
  amazonValue: string | null;
  status: DiffStatus;
  similarity: number; // 0-1
  category:
    | "title"
    | "brand"
    | "bullets"
    | "description"
    | "images"
    | "price"
    | "keywords"
    | "features";
}

export interface ComparisonResult {
  productId: string;
  asin: string;
  overallMatch: number; // 0-100
  totalFields: number;
  matchingFields: number;
  mismatchedFields: number;
  bibleOnlyFields: number;
  amazonOnlyFields: number;
  diffs: FieldDiff[];
  fetchedAt: string;
}

// ─── Field mapping ──────────────────────────────────────────────────

interface ComparisonFieldDef {
  bqName: string;
  fieldLabel: string;
  normalizedKey: keyof NormalizedAmazonData;
  category: FieldDiff["category"];
}

const COMPARISON_FIELDS: ComparisonFieldDef[] = [
  {
    bqName: "ItemName",
    fieldLabel: "Item Name",
    normalizedKey: "itemName",
    category: "title",
  },
  {
    bqName: "BrandName",
    fieldLabel: "Brand Name",
    normalizedKey: "brandName",
    category: "brand",
  },
  {
    bqName: "DetailedBulletPoint1",
    fieldLabel: "Bullet Point 1",
    normalizedKey: "bulletPoint1",
    category: "bullets",
  },
  {
    bqName: "DetailedBulletPoint2",
    fieldLabel: "Bullet Point 2",
    normalizedKey: "bulletPoint2",
    category: "bullets",
  },
  {
    bqName: "DetailedBulletPoint3",
    fieldLabel: "Bullet Point 3",
    normalizedKey: "bulletPoint3",
    category: "bullets",
  },
  {
    bqName: "DetailedBulletPoint4",
    fieldLabel: "Bullet Point 4",
    normalizedKey: "bulletPoint4",
    category: "bullets",
  },
  {
    bqName: "DetailedBulletPoint5",
    fieldLabel: "Bullet Point 5",
    normalizedKey: "bulletPoint5",
    category: "bullets",
  },
  {
    bqName: "ProductDescription",
    fieldLabel: "Product Description",
    normalizedKey: "productDescription",
    category: "description",
  },
  {
    bqName: "ListPrice",
    fieldLabel: "List Price",
    normalizedKey: "listPrice",
    category: "price",
  },
  {
    bqName: "MainImageURL",
    fieldLabel: "Main Image URL",
    normalizedKey: "mainImageUrl",
    category: "images",
  },
  {
    bqName: "GenericKeyword1",
    fieldLabel: "Generic Keywords",
    normalizedKey: "genericKeywords",
    category: "keywords",
  },
  {
    bqName: "PlatinumKeywords",
    fieldLabel: "Platinum Keywords",
    normalizedKey: "platinumKeywords",
    category: "keywords",
  },
];

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Strip HTML tags, collapse whitespace, remove zero-width characters, trim.
 * Returns null for empty/null/whitespace-only values.
 */
export function normalizeForComparison(value: string | null | undefined): string | null {
  if (value == null) return null;

  let s = value
    // Strip HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove zero-width characters (U+200B, U+200C, U+200D, U+FEFF)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();

  return s.length === 0 ? null : s;
}

/**
 * Dice coefficient on lowercased character bigrams. Returns 0-1.
 */
export function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1;
  if (aLower.length < 2 || bLower.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < aLower.length - 1; i++) {
    const bigram = aLower.substring(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
  }

  let intersectionSize = 0;
  for (let i = 0; i < bLower.length - 1; i++) {
    const bigram = bLower.substring(i, i + 2);
    const count = bigramsA.get(bigram);
    if (count && count > 0) {
      bigramsA.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  const totalBigrams = aLower.length - 1 + (bLower.length - 1);
  return totalBigrams === 0 ? 0 : (2 * intersectionSize) / totalBigrams;
}

/**
 * Classify the diff status between two values.
 */
function classifyDiff(
  bibleNorm: string | null,
  amazonNorm: string | null
): { status: DiffStatus; similarity: number } {
  const bibleEmpty = bibleNorm == null;
  const amazonEmpty = amazonNorm == null;

  if (bibleEmpty && amazonEmpty) {
    return { status: "both_empty", similarity: 0 };
  }
  if (!bibleEmpty && amazonEmpty) {
    return { status: "bible_only", similarity: 0 };
  }
  if (bibleEmpty && !amazonEmpty) {
    return { status: "amazon_only", similarity: 0 };
  }

  // Both have values
  if (bibleNorm!.toLowerCase() === amazonNorm!.toLowerCase()) {
    return { status: "match", similarity: 1 };
  }

  return {
    status: "mismatch",
    similarity: calculateSimilarity(bibleNorm!, amazonNorm!),
  };
}

// ─── Color helper ───────────────────────────────────────────────────

export function getMatchColor(match: number): string {
  if (match >= 90) return "#10b981"; // emerald
  if (match >= 70) return "#FAC800"; // yellow
  if (match >= 50) return "#f97316"; // orange
  return "#ef4444"; // red
}

// ─── Main comparison ────────────────────────────────────────────────

/**
 * Compare a Hub product against normalized Amazon data.
 */
export function compareProductWithAmazon(
  product: Product,
  amazonData: NormalizedAmazonData
): ComparisonResult {
  const diffs: FieldDiff[] = [];

  // Compare standard fields
  for (const def of COMPARISON_FIELDS) {
    const bibleRaw = getProductFieldValue(product, def.bqName);
    const amazonRaw = amazonData[def.normalizedKey] as string | null;

    const bibleNorm = normalizeForComparison(bibleRaw);
    const amazonNorm = normalizeForComparison(amazonRaw);

    const { status, similarity } = classifyDiff(bibleNorm, amazonNorm);

    diffs.push({
      fieldLabel: def.fieldLabel,
      bqName: def.bqName,
      bibleValue: bibleRaw,
      amazonValue: amazonRaw,
      status,
      similarity,
      category: def.category,
    });
  }

  // Compare other image URLs (OtherImageURL1-8 vs amazonData.otherImageUrls[0-7])
  for (let i = 0; i < 8; i++) {
    const bqName = `OtherImageURL${i + 1}`;
    const bibleRaw = getProductFieldValue(product, bqName);
    const amazonRaw = amazonData.otherImageUrls[i] ?? null;

    const bibleNorm = normalizeForComparison(bibleRaw);
    const amazonNorm = normalizeForComparison(amazonRaw);

    const { status, similarity } = classifyDiff(bibleNorm, amazonNorm);

    diffs.push({
      fieldLabel: `Other Image ${i + 1}`,
      bqName,
      bibleValue: bibleRaw,
      amazonValue: amazonRaw,
      status,
      similarity,
      category: "images",
    });
  }

  // Compute aggregate stats
  const nonEmpty = diffs.filter((d) => d.status !== "both_empty");
  const matching = nonEmpty.filter((d) => d.status === "match");
  const mismatched = nonEmpty.filter((d) => d.status === "mismatch");
  const bibleOnly = nonEmpty.filter((d) => d.status === "bible_only");
  const amazonOnly = nonEmpty.filter((d) => d.status === "amazon_only");

  const overallMatch =
    nonEmpty.length > 0
      ? Math.round((matching.length / nonEmpty.length) * 100)
      : 100;

  return {
    productId: product.id,
    asin: amazonData.asin,
    overallMatch,
    totalFields: nonEmpty.length,
    matchingFields: matching.length,
    mismatchedFields: mismatched.length,
    bibleOnlyFields: bibleOnly.length,
    amazonOnlyFields: amazonOnly.length,
    diffs,
    fetchedAt: amazonData.lastFetchedAt,
  };
}
