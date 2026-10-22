/**
 * Utility functions for column attribute metadata.
 */

import type { ColumnAttribute } from "@/lib/db/schema";
import type { FieldType } from "@/lib/column-registry";

/**
 * Fields that should render as a <Select> with predefined options.
 * Keyed by bqLabel (BQ column name).
 */
const SELECT_FIELD_OPTIONS: Record<string, string[]> = {
  Status: [
    "Active",
    "Inactive",
    "Incomplete",
    "Out of Stock",
    "Closed",
    "Discontinued",
  ],
  ParentageLevel: ["Parent", "Child", "Standalone"],
};

/**
 * Get predefined select options for a column attribute, if any.
 */
export function getSelectOptions(attr: ColumnAttribute): string[] | null {
  const bqLabel = attr.bqLabel || "";
  return SELECT_FIELD_OPTIONS[bqLabel] ?? null;
}

/**
 * Infer form field type from column attribute metadata.
 * Uses bqDataType + label heuristics to pick the best input type.
 */
export function inferFieldType(attr: ColumnAttribute): FieldType {
  // Select fields with predefined options
  if (attr.bqLabel && SELECT_FIELD_OPTIONS[attr.bqLabel]) {
    return "select";
  }

  const label = (attr.generalLabel || "").toLowerCase();
  const dataType = (attr.bqDataType || "STRING").toUpperCase();

  // URL detection
  if (
    label.includes("url") ||
    label.includes("image") ||
    label.includes("link")
  ) {
    return "url";
  }

  // Number detection
  if (
    dataType === "FLOAT" ||
    dataType === "INTEGER" ||
    dataType === "NUMERIC" ||
    dataType === "INT64" ||
    dataType === "FLOAT64"
  ) {
    return "number";
  }

  // Textarea detection — long text fields
  if (
    label.includes("description") ||
    label.includes("bullet") ||
    label.includes("keyword") ||
    label.includes("feature") ||
    label.includes("note") ||
    label.includes("detail")
  ) {
    return "textarea";
  }

  return "text";
}

/**
 * Get the maximum character length for a field, if known.
 * Checks column_attributes.labelMaxOptions first, then falls back to
 * Amazon-known defaults based on the field label.
 */
export function getFieldMaxLength(attr: ColumnAttribute): number | null {
  if (attr.labelMaxOptions && /^\d+$/.test(attr.labelMaxOptions.trim())) {
    return parseInt(attr.labelMaxOptions.trim());
  }
  const label = (attr.generalLabel || "").toLowerCase();
  if (label.includes("item_name") || label === "itemname") return 200;
  if (label.includes("bullet") || label.includes("keyfeature")) return 500;
  if (
    label.includes("generickeyword") ||
    label.includes("generic_keyword") ||
    label.includes("search_term") ||
    label.includes("platinumkeyword")
  )
    return 250;
  if (label.includes("description")) return 2000;
  return null;
}
