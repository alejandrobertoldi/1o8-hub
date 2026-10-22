/* eslint-disable react-doctor/js-set-map-lookups */
/**
 * Parser for Amazon All Listings Reports (ALR).
 *
 * ALR is tab-separated with a header row. We expose a strongly-typed AlrRow
 * for the columns we map to master core columns, plus a verbatim `raw` map
 * holding every column for zero-data-loss into master.rawColumnValues.
 */

export interface AlrRow {
  /** ALR `item-name` → master.itemName */
  itemName: string;
  /** ALR `item-description` → rawColumnValues only */
  itemDescription: string;
  /** ALR `listing-id` → rawColumnValues only */
  listingId: string;
  /** ALR `seller-sku` → master.sku */
  sellerSku: string;
  /** ALR `price` → master.listPrice */
  price: string;
  /** ALR `quantity` → rawColumnValues only */
  quantity: string;
  /** ALR `asin1` → master.asin */
  asin1: string;
  /** ALR `status` → master.status (Active / Inactive / Incomplete) */
  status: string;
  /** ALR `fulfillment-channel` → rawColumnValues (AMAZON_NA = FBA, DEFAULT = FBM) */
  fulfillmentChannel: string;
  /** ALR `open-date` → rawColumnValues */
  openDate: string;
  /** ALR `image-url` → master.mainImageUrl */
  imageUrl: string;
  /** Verbatim header → cell map for the row, used for rawColumnValues */
  raw: Record<string, string>;
  /** Zero-based index of this data row (for error reporting and stable IDs) */
  rowIndex: number;
}

/**
 * Parse an ALR TSV string. Throws on a missing header row or required columns.
 * Required columns: seller-sku, asin1, item-name, status.
 */
export function parseAlr(text: string): AlrRow[] {
  // Strip a leading UTF-8 BOM (real Amazon Seller Central exports occasionally
  // ship as UTF-8-with-BOM, which would otherwise corrupt the first header).
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = cleaned.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() === "") {
    throw new Error("ALR file is empty");
  }
  const header = lines[0].split("\t").map((h) => h.trim());
  const required = ["seller-sku", "asin1", "item-name", "status"];
  for (const col of required) {
    if (!header.includes(col)) {
      throw new Error(`ALR is missing required column: ${col}`);
    }
  }
  const idx = (col: string) => header.indexOf(col);

  const rows: AlrRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === "") continue;
    const cells = line.split("\t");
    const raw: Record<string, string> = {};
    for (let h = 0; h < header.length; h++) {
      raw[header[h]] = (cells[h] ?? "").trim();
    }
    const get = (col: string) => (cells[idx(col)] ?? "").trim();
    rows.push({
      itemName: get("item-name"),
      itemDescription: get("item-description"),
      listingId: get("listing-id"),
      sellerSku: get("seller-sku"),
      price: get("price"),
      quantity: get("quantity"),
      asin1: get("asin1"),
      status: get("status"),
      fulfillmentChannel: get("fulfillment-channel"),
      openDate: get("open-date"),
      imageUrl: get("image-url"),
      raw,
      rowIndex: rows.length,
    });
  }
  return rows;
}

import type { AlrFieldMap } from "./alr-field-map-loader";

/**
 * Master-table fields derived from an ALR row. The `coreFields` shape mirrors
 * the columns we project onto master.* (asin/sku/marketplace/itemName/etc.);
 * everything also lands in rawColumnValues for zero-data-loss.
 *
 * The mapping from ALR header → master field is now data-driven via the
 * `attributes.alr_label` column. Pass the loaded `AlrFieldMap` (from
 * loadAlrFieldMap()) as the second argument; the function is pure.
 */
export interface AlrMasterFields {
  asin: string | null;
  sku: string | null;
  marketplace: string;
  status: string | null;
  itemName: string | null;
  mainImageUrl: string | null;
  listPrice: string | null;
  rawColumnValues: Record<string, string>;
}

export const DEFAULT_MARKETPLACE = "US";

// sb_label values we map to AlrMasterFields keys. New ALR-mapped attributes
// land in rawColumnValues only unless explicitly handled here. Keeping this
// map small and explicit avoids a runtime decision about which JSON path on
// master should hold each value (core column vs JSONB blob).
const SB_TO_CORE_FIELD: Record<string, keyof AlrMasterFields> = {
  asin: "asin",
  sku: "sku",
  status: "status",
  item_name: "itemName",
  main_image_url: "mainImageUrl",
  list_price: "listPrice",
};

export function alrRowToMasterFields(row: AlrRow, fieldMap: AlrFieldMap): AlrMasterFields {
  const out: AlrMasterFields = {
    asin: null,
    sku: null,
    marketplace: DEFAULT_MARKETPLACE,
    status: null,
    itemName: null,
    mainImageUrl: null,
    listPrice: null,
    rawColumnValues: row.raw,
  };
  for (const [header, value] of Object.entries(row.raw)) {
    const entry = fieldMap[header];
    if (!entry || !entry.sbLabel) continue;
    const coreKey = SB_TO_CORE_FIELD[entry.sbLabel];
    if (!coreKey || coreKey === "rawColumnValues") continue;
    if (coreKey === "marketplace") continue; // marketplace handled separately
    if (value && value.length > 0) {
      // narrow back to string (everything but rawColumnValues is `string | null`)
      (out as unknown as Record<string, string | null>)[coreKey] = value;
    }
  }
  return out;
}
