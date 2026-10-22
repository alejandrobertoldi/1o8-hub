/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Shared upsert service for category_definitions + attributes.category_meta.
 *
 * Used by both the legacy /api/category-definitions admin upload path and
 * the new /api/onboarding/clr-import onboarding path.
 *
 * Behavior (post-unification): for each parsed CLR report
 *   1. Replace any existing category_definitions row for
 *      (clientIdCode, productType, marketplace) with a fresh one carrying a
 *      baseline snapshot of the client's current values for matched fields.
 *   2. For every parsed attribute the matcher resolves to a Hub attribute,
 *      write a per-(marketplace, productType) entry into
 *      `attributes.category_meta` JSONB on that row. Existing `isKey` flags
 *      are preserved across re-uploads (merge in memory, then one UPDATE).
 *   3. Parsed attributes the matcher CANNOT resolve are logged to
 *      `clr_unmatched_fields` (replaces the prior silent-drop behavior).
 *
 * The legacy `category_attributes` table is no longer written here; readers
 * are migrated in subsequent tasks (11/12) and the table is dropped in
 * task 16 of the unification plan.
 */
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  attributes,
  clrUnmatchedFields,
  master,
  type CategoryDefinition,
  type CategoryMeta,
  type CategoryMetaEntry,
} from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import { matchHubFieldsWithIds } from "@/lib/category-attribute-matcher";
import type { ParsedCategoryReport } from "@/lib/category-report-parser";

export interface UpsertCategoryDefinitionsArgs {
  clientIdCode: string;
  uploadedBy: string;
  parsedReports: ParsedCategoryReport[];
}

export interface UpsertCategoryDefinitionsResult {
  definitions: CategoryDefinition[];
  matchCount: number;
}

const WRITE_CHUNK = 200;

function mergeCategoryMeta(
  current: CategoryMeta | null | undefined,
  marketplace: string,
  productType: string,
  entry: CategoryMetaEntry,
): CategoryMeta {
  const meta: CategoryMeta = current ? structuredClone(current) : {};
  if (!meta[marketplace]) meta[marketplace] = {};
  const prev = meta[marketplace][productType];
  meta[marketplace][productType] = {
    ...entry,
    isKey: prev?.isKey ?? false,
  };
  return meta;
}

export async function upsertCategoryDefinitions(
  args: UpsertCategoryDefinitionsArgs,
): Promise<UpsertCategoryDefinitionsResult> {
  const { clientIdCode, uploadedBy, parsedReports } = args;
  if (parsedReports.length === 0) return { definitions: [], matchCount: 0 };

  const allAttrs = await db
    .select({ id: attributes.id, generalLabel: attributes.generalLabel })
    .from(attributes);

  const firstReport = parsedReports[0];
  const matches = matchHubFieldsWithIds(firstReport.attributes, allAttrs);
  const matchCount = matches.size;

  const matchedGeneralLabels = [...new Set([...matches.values()].map((m) => m.generalLabel))];
  const clientProducts = await db
    .select()
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));
  const baselineSnapshot: Record<string, Record<string, string | null>> = {};
  for (const product of clientProducts) {
    const values: Record<string, string | null> = {};
    for (const gl of matchedGeneralLabels) {
      values[gl] = getProductFieldValue(product, gl) ?? null;
    }
    baselineSnapshot[product.id] = values;
  }

  const createdDefs: CategoryDefinition[] = [];
  const unmatchedRows: { uploadId: number; fieldName: string }[] = [];
  const metaPatches: {
    id: number;
    marketplace: string;
    productType: string;
    entry: CategoryMetaEntry;
  }[] = [];

  for (const parsed of parsedReports) {
    const existing = await db
      .select({ id: categoryDefinitions.id })
      .from(categoryDefinitions)
      .where(
        and(
          eq(categoryDefinitions.clientIdCode, clientIdCode),
          eq(categoryDefinitions.productType, parsed.productType),
          eq(categoryDefinitions.marketplaceId, parsed.marketplace),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await db.delete(categoryDefinitions).where(eq(categoryDefinitions.id, existing[0].id));
    }
    const [newDef] = await db
      .insert(categoryDefinitions)
      .values({
        clientIdCode,
        productType: parsed.productType,
        marketplaceId: parsed.marketplace,
        totalAttributes: parsed.summary.total,
        requiredCount: parsed.summary.required,
        conditionalCount: parsed.summary.conditional,
        optionalCount: parsed.summary.optional,
        uploadedBy,
        baselineSnapshot:
          Object.keys(baselineSnapshot).length > 0 ? baselineSnapshot : null,
      })
      .returning();
    createdDefs.push(newDef);

    const writtenIds = new Set<number>();
    for (const attr of parsed.attributes) {
      const matched = matches.get(attr.amazonFieldName);
      if (!matched) {
        unmatchedRows.push({
          uploadId: newDef.id,
          fieldName: attr.amazonFieldName,
        });
        continue;
      }
      // Template repeats (bullet #2, extra images) can map to the same Hub
      // row. Keep the first Template-tab occurrence so sortOrder stays left-to-right.
      if (writtenIds.has(matched.id)) continue;
      writtenIds.add(matched.id);
      metaPatches.push({
        id: matched.id,
        marketplace: parsed.marketplace,
        productType: parsed.productType,
        entry: {
          requirement: attr.requirement,
          validValues: attr.validValues.length > 0 ? attr.validValues : null,
          description: attr.description || null,
          example: attr.example || null,
          isKey: false,
          sortOrder: attr.sortOrder,
          groupName: attr.groupName || null,
        },
      });
    }
  }

  for (let i = 0; i < unmatchedRows.length; i += WRITE_CHUNK) {
    await db
      .insert(clrUnmatchedFields)
      .values(unmatchedRows.slice(i, i + WRITE_CHUNK));
  }

  const patchIds = [...new Set(metaPatches.map((p) => p.id))];
  if (patchIds.length > 0) {
    const currentRows = await db
      .select({ id: attributes.id, categoryMeta: attributes.categoryMeta })
      .from(attributes)
      .where(inArray(attributes.id, patchIds));
    const metaById = new Map<number, CategoryMeta>();
    for (const row of currentRows) {
      metaById.set(row.id, row.categoryMeta ?? {});
    }
    for (const patch of metaPatches) {
      metaById.set(
        patch.id,
        mergeCategoryMeta(
          metaById.get(patch.id),
          patch.marketplace,
          patch.productType,
          patch.entry,
        ),
      );
    }
    const valueFragments = [...metaById.entries()].map(
      ([id, meta]) => sql`(${id}::int, ${JSON.stringify(meta)}::jsonb)`,
    );
    await db.execute(sql`
      UPDATE attributes AS a
      SET category_meta = v.meta
      FROM (VALUES ${sql.join(valueFragments, sql`, `)}) AS v(id, meta)
      WHERE a.id = v.id
    `);
  }

  return { definitions: createdDefs, matchCount };
}
