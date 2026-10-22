import type { ParsedClrRow } from "@/lib/clr-row-parser";
import {
  extractClrSeoV0,
  matchSkusToAlrAsins,
} from "@/lib/product-excel-import";

export type ClrHubListing = {
  sku: string;
  productType: string;
  asin: string;
  itemName: string;
  inHub: boolean;
};

export type ClrHubUnmatched = {
  sku: string;
  productType: string;
  itemName: string;
};

export type ClrHubPlan = {
  hasAlr: boolean;
  matched: ClrHubListing[];
  unmatched: ClrHubUnmatched[];
};

function itemNameFromClr(row: ParsedClrRow): string {
  return extractClrSeoV0(row.attributes).ItemName ?? "";
}

/**
 * Join CLR SKUs to ALR seller-sku → asin1. CLR has no ASIN column.
 */
export function planClrListingsForHub(
  clrRows: ParsedClrRow[],
  alrLinks: Array<{ sku: string; asin?: string | null }>,
  hubSkus: Iterable<string>
): ClrHubPlan {
  const hub = new Set(
    [...hubSkus].map((sku) => sku.trim().toLowerCase()).filter(Boolean)
  );
  const alrRows = alrLinks
    .map((row) => ({
      sellerSku: row.sku ?? "",
      asin1: (row.asin ?? "").trim().toUpperCase(),
    }))
    .filter((row) => row.sellerSku.trim() && row.asin1.length === 10);

  const { matched, unmatched } = matchSkusToAlrAsins(
    clrRows.map((row) => row.sku),
    alrRows
  );
  const clrBySku = new Map(
    clrRows.map((row) => [row.sku.trim().toLowerCase(), row])
  );

  return {
    hasAlr: alrLinks.some((row) => row.sku.trim() !== ""),
    matched: matched.map((link) => {
      const clr = clrBySku.get(link.sku.trim().toLowerCase());
      return {
        sku: link.sku,
        productType: clr?.productType ?? "",
        asin: link.asin,
        itemName: clr ? itemNameFromClr(clr) : "",
        inHub: hub.has(link.sku.trim().toLowerCase()),
      };
    }),
    unmatched: unmatched.map((sku) => {
      const clr = clrBySku.get(sku.trim().toLowerCase());
      return {
        sku,
        productType: clr?.productType ?? "",
        itemName: clr ? itemNameFromClr(clr) : "",
      };
    }),
  };
}
