/* eslint-disable react-doctor/js-set-map-lookups */
/**
 * Bidirectional mapping between BigQuery flat rows and the app's hybrid DB schema.
 *
 * BQ flat row (972 STRING columns) ↔ App schema (core cols + JSONB blobs + raw)
 */

import { CORE_COLUMNS, getAllColumns } from "./column-registry";
import { COLUMN_GROUPS } from "./column-groups";
import type { NewProduct, Product } from "./db/schema";

/** A flat row from BigQuery — all values are strings */
export type BqRow = Record<string, string>;

/**
 * Map of group ID → JSONB DB field name (for groups stored in JSONB blobs).
 */
const groupToDbField: Record<string, string> = {};
for (const group of COLUMN_GROUPS) {
  if (group.dbField) {
    groupToDbField[group.id] = group.dbField;
  }
}

/**
 * Map a BigQuery flat row to the app's product schema for DB insertion.
 */
export function mapBqRowToProduct(row: BqRow): NewProduct {
  const product: Record<string, unknown> = {};

  // 1. Map core columns
  for (const col of CORE_COLUMNS) {
    if (col.coreField && row[col.bqName] !== undefined) {
      product[col.coreField] = row[col.bqName] || null;
    }
  }

  // 2. Build categorized JSONB blobs
  const jsonbBlobs: Record<string, Record<string, string>> = {};
  const allColumns = getAllColumns();
  const bqNameToCol = new Map(allColumns.map((c) => [c.bqName, c]));

  for (const [bqName, value] of Object.entries(row)) {
    const colDef = bqNameToCol.get(bqName);

    if (!colDef) {
      // Unknown column → goes to "other" blob
      if (!jsonbBlobs["otherAttributes"]) jsonbBlobs["otherAttributes"] = {};
      if (value) jsonbBlobs["otherAttributes"][bqName] = value;
      continue;
    }

    // Skip core columns (already mapped above)
    if (colDef.coreField) continue;

    // Find which JSONB blob this group maps to
    const dbField = groupToDbField[colDef.group];
    if (dbField) {
      if (!jsonbBlobs[dbField]) jsonbBlobs[dbField] = {};
      if (value) jsonbBlobs[dbField][bqName] = value;
    }
  }

  // 3. Assign JSONB blobs to product
  for (const [dbField, blob] of Object.entries(jsonbBlobs)) {
    if (Object.keys(blob).length > 0) {
      product[dbField] = blob;
    }
  }

  // 4. Store the complete raw row for zero-data-loss guarantee
  product.rawColumnValues = row;

  // 5. Set defaults for change tracking
  product.isDirty = false;
  product.changeLog = [];

  return product as NewProduct;
}

/**
 * Map a product from the app's DB schema back to a BigQuery flat row.
 * Uses rawColumnValues as the base, then overlays any changes from core cols + JSONB blobs.
 */
export function mapProductToBqRow(product: Product): BqRow {
  // Start with raw values as base (guarantees all 972 columns are present)
  const row: BqRow = { ...(product.rawColumnValues ?? {}) };

  // Overlay core column values (may have been edited)
  for (const col of CORE_COLUMNS) {
    if (col.coreField) {
      const value = (product as Record<string, unknown>)[col.coreField];
      if (value !== undefined && value !== null) {
        row[col.bqName] = String(value);
      }
    }
  }

  // Overlay JSONB blob values (may have been edited)
  const jsonbFields = [
    "contentSeo",
    "variations",
    "packaging",
    "targetAudience",
    "fulfillment",
    "productAttributes",
    "nutritionSupplements",
    "complianceSafety",
    "images",
    "dimensionsWeight",
    "otherAttributes",
  ] as const;

  for (const field of jsonbFields) {
    const blob = (product as Record<string, unknown>)[field] as
      | Record<string, string>
      | null
      | undefined;
    if (blob) {
      for (const [bqName, value] of Object.entries(blob)) {
        row[bqName] = value;
      }
    }
  }

  return row;
}

/**
 * Get a single field value from a product, checking core fields first, then JSONB blobs.
 * Supports nested paths with # as array index delimiter (e.g., "nutritional_info#1.carbohydrate#1.total")
 */
export function getProductFieldValue(
  product: Product,
  bqName: string
): string | null {
  // Check core columns first
  const coreDef = CORE_COLUMNS.find((c) => c.bqName === bqName);
  if (coreDef?.coreField) {
    const val = (product as Record<string, unknown>)[coreDef.coreField];
    if (val != null) return String(val);
  }

  // Check JSONB blobs
  const jsonbFields = [
    "contentSeo",
    "variations",
    "packaging",
    "targetAudience",
    "fulfillment",
    "productAttributes",
    "nutritionSupplements",
    "complianceSafety",
    "images",
    "dimensionsWeight",
    "otherAttributes",
  ] as const;

  for (const field of jsonbFields) {
    const blob = (product as Record<string, unknown>)[field] as
      | Record<string, unknown>
      | null
      | undefined;
    if (blob) {
      // Direct key match
      if (bqName in blob) {
        const val = blob[bqName];
        return val != null ? String(val) : null;
      }
      // Nested path support (e.g., "nutritional_info#1.carbohydrate#1.total")
      if (bqName.includes("#") || bqName.includes(".")) {
        const nestedVal = getNestedValue(blob, bqName);
        if (nestedVal != null) return String(nestedVal);
      }
    }
  }

  // Fall back to raw
  return product.rawColumnValues?.[bqName] ?? null;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(/[.#]/);
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a single field value on a product. Returns an updated partial product.
 */
export function setProductFieldValue(
  product: Product,
  bqName: string,
  value: string | null
): Partial<Product> {
  const updates: Record<string, unknown> = {};

  // Check if it's a core column
  const coreDef = CORE_COLUMNS.find((c) => c.bqName === bqName);
  if (coreDef?.coreField) {
    updates[coreDef.coreField] = value;
    return updates as Partial<Product>;
  }

  // Find which JSONB blob it belongs to
  const allColumns = getAllColumns();
  const colDef = allColumns.find((c) => c.bqName === bqName);
  const groupId = colDef?.group ?? "other";
  const dbField = COLUMN_GROUPS.find((g) => g.id === groupId)?.dbField ?? "otherAttributes";

  if (dbField) {
    const currentBlob =
      ((product as Record<string, unknown>)[dbField] as Record<string, string>) ?? {};
    updates[dbField] = {
      ...currentBlob,
      ...(value != null ? { [bqName]: value } : {}),
    };
    // Remove key if value is null
    if (value == null) {
      const blob = { ...currentBlob };
      delete blob[bqName];
      updates[dbField] = blob;
    }
  }

  return updates as Partial<Product>;
}
