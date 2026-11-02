import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard against the failure class found on 2026-08-04: this route projected three
 * columns that DO NOT EXIST in Redshift (`variation_name`, `flavor`, `size`).
 * Redshift answered 42703 "column r.variation_name does not exist" in ~361ms,
 * `queryRedshift` swallowed the error and returned [] (src/lib/redshift.ts:81),
 * and the route replied **200** with `{ items: [], maxDate }`. Both
 * /reports/inventory and /portal/reports/inventory therefore rendered
 * "No inventory data available" for every client from 2026-05-26 until the fix —
 * a hard SQL error wearing the costume of an empty dataset.
 *
 * A source-level guard is the only cheap option: the failure is invisible at
 * runtime (200 + empty array, no thrown error) and unit tests cannot reach
 * Redshift. Lives in its own file because route.test.ts is stale (it mocks a
 * caching/requireAuthOrCron version of this route that no longer exists).
 *
 * Column snapshot captured 2026-08-04 by a READ-ONLY probe. To re-capture:
 *   SELECT * FROM amazon_source_data.<table> LIMIT 1
 * and read the result's field names — pg_table_def returns nothing for these
 * tables, so information_schema/pg_table_def is not a usable source here.
 */
const REAL_COLUMNS: Record<string, Set<string>> = {
  // alias r — amazon_source_data.sellercentral_restockinventory_report
  r: new Set([
    "account_id", "account_name", "seller_id", "country", "product_name", "fnsku",
    "merchant_sku", "asin", "condition", "supplier", "supplier_part_no",
    "currency_code", "price", "sales_last_30_days", "units_sold_last_30_days",
    "total_units", "inbound", "available", "fc_transfer", "fc_processing",
    "customer_order", "unfulfillable", "fulfilled_by", "days_of_supply", "alert",
    "recommended_replenishment_qty", "recommended_ship_date",
    "inventory_level_thresholds_published_current_month",
    "current_month_very_low_inventory_threshold",
    "current_month_minimum_inventory_threshold",
    "current_month_maximum_inventory_threshold",
    "current_month_very_high_inventory_threshold",
    "inventory_level_thresholds_published_next_month",
    "next_month_very_low_inventory_threshold",
    "next_month_minimum_inventory_threshold",
    "next_month_maximum_inventory_threshold",
    "next_month_very_high_inventory_threshold",
    "utilization", "maximum_shipment_quantity", "report_date", "download_date",
    "working", "shipped", "receiving", "total_days_of_supply",
    "days_of_supply_at_amazon", "unit_storage_size",
  ]),
  // alias i — amazon_source_data.catalog_item_images
  i: new Set(["variant", "link", "height", "width", "ctlg_master_id", "account_id", "asin"]),
  // alias l — amazon_source_data.sellercentral_alllistings_report
  l: new Set([
    "account_name", "account_id", "currency_code", "item_name", "item_description",
    "listing_id", "seller_sku", "price", "quantity", "open_date", "image_url",
    "item_is_marketplace", "product_id_type", "zshop_shipping_fee", "item_note",
    "item_condition", "zshop_category1", "zshop_browse_path",
    "zshop_storefront_feature", "asin1", "asin2", "asin3",
    "will_ship_internationally", "expedited_shipping", "zshop_boldface",
    "product_id", "bid_for_featured_placement", "add_delete", "pending_quantity",
    "fulfillment_channel", "merchant_shipping_group", "status", "report_date",
    "download_date",
  ]),
};

const SOURCE = readFileSync(
  join(process.cwd(), "src/app/api/reports/inventory/route.ts"),
  "utf8",
);

/** Only the SQL template literals. The JS row mapper also writes `r.<key>`, but
 *  those are *result* field names and legitimately include i/l columns. */
function sqlText(): string {
  return (SOURCE.match(/`[^`]*`/g) ?? []).join("\n");
}

function aliasRefs(): { alias: string; column: string }[] {
  const out: { alias: string; column: string }[] = [];
  for (const m of sqlText().matchAll(/\b([ril])\.([a-z_][a-z0-9_]*)/g)) {
    out.push({ alias: m[1], column: m[2] });
  }
  return out;
}

describe("inventory route SQL — every projected column must exist in Redshift", () => {
  it("still finds the route's SQL (guards the regex, not the SQL)", () => {
    const sql = sqlText();
    expect(sql).toContain("sellercentral_restockinventory_report");
    expect(sql.length).toBeGreaterThan(500);
    expect(aliasRefs().length).toBeGreaterThan(20);
  });

  it("the captured Redshift schema snapshot is intact", () => {
    expect(REAL_COLUMNS.r.size).toBe(47);
    expect(REAL_COLUMNS.i.size).toBe(7);
    expect(REAL_COLUMNS.l.size).toBe(34);
  });

  it("references no column that is absent from its table", () => {
    const violations = [
      ...new Set(
        aliasRefs()
          .filter(({ alias, column }) => !REAL_COLUMNS[alias].has(column))
          .map(({ alias, column }) => `${alias}.${column}`),
      ),
    ];
    expect(violations).toEqual([]);
  });

  it("the three phantom columns from the 2026-08-04 bug stay gone", () => {
    const sql = sqlText();
    for (const phantom of ["r.variation_name", "r.flavor", "r.size"]) {
      expect(sql).not.toContain(phantom);
    }
  });
});
