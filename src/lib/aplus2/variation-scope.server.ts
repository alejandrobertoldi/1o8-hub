import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { master, variations } from "@/lib/db/schema";
import {
  pickStoredCoveredProducts,
  uniqueCoveredProducts,
  type AplusCoveredProduct,
} from "@/lib/aplus2/variation-scope";

export const aplus2VariationIdSql = sql<string | null>`NULLIF(COALESCE(
  ${variations.code},
  ${master.variations}->>'VariationID',
  ${master.otherAttributes}->>'VariationID',
  ${master.rawColumnValues}->>'VariationID',
  ${variations.amazonVariationId}
), '')`;

export async function lookupAplus2VariationId(productId: string): Promise<string | null> {
  const [row] = await db
    .select({ variationId: aplus2VariationIdSql })
    .from(master)
    .leftJoin(variations, eq(variations.id, master.variationRef))
    .where(eq(master.id, productId))
    .limit(1);
  return row?.variationId ?? null;
}

/**
 * Members of a hub variation — same definition as Catalog's Variation ID filter.
 * Do not OR by Amazon parentAsin: that pulls every child of the parent listing,
 * including products that belong to other hub Variation IDs.
 */
export async function loadVariationFamilyMembers(args: {
  clientIdCode: string;
  parentAsin: string;
  variationId: string | null;
}): Promise<AplusCoveredProduct[]> {
  const familyMatch = args.variationId
    ? sql`${aplus2VariationIdSql} = ${args.variationId}`
    : or(eq(master.parentAsin, args.parentAsin), eq(master.asin, args.parentAsin));

  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      parentageLevel: master.parentageLevel,
      summarizedTitle: master.summarizedTitle,
      itemName: master.itemName,
    })
    .from(master)
    .leftJoin(variations, eq(variations.id, master.variationRef))
    .where(and(eq(master.clientIdCode, args.clientIdCode), familyMatch));

  return uniqueCoveredProducts(rows, args.parentAsin);
}

/** Parent ASIN plus every child that belongs to the same hub Variation ID. */
export async function loadVariationFamilyAsins(args: {
  clientIdCode: string;
  parentAsin: string;
  variationRef: string | null;
  variationId: string | null;
}): Promise<string[]> {
  const members = await loadVariationFamilyMembers({
    clientIdCode: args.clientIdCode,
    parentAsin: args.parentAsin,
    variationId: args.variationId,
  });
  return members.map((m) => m.asin);
}

/** Resolve a stored ASIN list without expanding it to the current variation family. */
export async function loadCoveredProductsByAsins(args: {
  clientIdCode: string;
  asins: string[];
}): Promise<AplusCoveredProduct[]> {
  const asins = [...new Set(args.asins.map((asin) => asin.trim()).filter(Boolean))];
  if (asins.length === 0) return [];

  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      parentageLevel: master.parentageLevel,
      summarizedTitle: master.summarizedTitle,
      itemName: master.itemName,
    })
    .from(master)
    .where(and(eq(master.clientIdCode, args.clientIdCode), inArray(master.asin, asins)));

  return pickStoredCoveredProducts(asins, uniqueCoveredProducts(rows));
}

export async function loadVariationFamiliesByVariationId(args: {
  clientIdCode: string;
  variationIds: string[];
}): Promise<Map<string, AplusCoveredProduct[]>> {
  const ids = [...new Set(args.variationIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, AplusCoveredProduct[]>();
  if (ids.length === 0) return map;

  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      parentageLevel: master.parentageLevel,
      summarizedTitle: master.summarizedTitle,
      itemName: master.itemName,
      variationId: aplus2VariationIdSql,
    })
    .from(master)
    .leftJoin(variations, eq(variations.id, master.variationRef))
    .where(
      and(
        eq(master.clientIdCode, args.clientIdCode),
        sql`${aplus2VariationIdSql} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
      ),
    );

  const grouped = new Map<string, Array<{
    id: string;
    asin: string | null;
    parentageLevel: string | null;
    summarizedTitle: string | null;
    itemName: string | null;
  }>>();
  for (const row of rows) {
    if (!row.variationId) continue;
    const list = grouped.get(row.variationId) ?? [];
    list.push({
      id: row.id,
      asin: row.asin,
      parentageLevel: row.parentageLevel,
      summarizedTitle: row.summarizedTitle,
      itemName: row.itemName,
    });
    grouped.set(row.variationId, list);
  }
  for (const [vid, list] of grouped) {
    map.set(vid, uniqueCoveredProducts(list));
  }
  return map;
}
