/**
 * Maps a parsed CLR row + the matching ALR link → a master-row insert payload.
 *
 * Flow:
 *   1. Re-key CLR-format attributes via the alias bridge (clr-attribute-aliases)
 *      to canonical bqNames.
 *   2. Inject ALR-sourced ASIN + Status (always overrides CLR-side equivalents).
 *   3. Funnel through `mapBqRowToProduct` to populate master core columns +
 *      categorized JSONB blobs.
 *   4. Override `rawColumnValues` with the original CLR-format attributes so the
 *      raw blob preserves the source-of-truth keys (zero-loss for Option B
 *      backfill or forensics).
 *
 * Caller (merge-master route) sets `clientIdCode` + `isDirty: false` on the
 * returned object before insert.
 */
import type { ParsedClrRow } from "./clr-row-parser";
import { mapBqRowToProduct } from "./product-mapper";
import { clrAttributesToBqRow } from "./onboarding/clr-attribute-aliases";
import type { Alias } from "./onboarding/clr-attribute-aliases";
import { loadClrAliases } from "./onboarding/clr-aliases-loader";
import type { NewProduct } from "./db/schema";

export interface AlrLinkFields {
  asin: string | null;
  status: string | null;
}

export async function clrRowToMasterFields(
  row: ParsedClrRow,
  link: AlrLinkFields,
  aliases?: Alias[]
): Promise<NewProduct> {
  const effectiveAliases = aliases ?? (await loadClrAliases());
  const bqRow = clrAttributesToBqRow(row.attributes, effectiveAliases);

  // SKU/ProductType: parser extracts these as first-class fields, so trust
  // them as the floor when the alias bridge couldn't match a key.
  if (!bqRow.SKU && row.sku) bqRow.SKU = row.sku;
  if (!bqRow.ProductType && row.productType) bqRow.ProductType = row.productType;
  // FeedProductType historically mirrors ProductType when absent.
  if (!bqRow.FeedProductType && bqRow.ProductType) {
    bqRow.FeedProductType = bqRow.ProductType;
  }

  // ALR fields are authoritative for SKU↔ASIN linkage and listing status.
  if (link.asin) bqRow.ASIN = link.asin;
  if (link.status) bqRow.Status = link.status;

  const product = mapBqRowToProduct(bqRow);

  // Preserve original CLR-format keys for zero-loss / future backfill.
  product.rawColumnValues = { ...row.attributes };

  return product;
}
