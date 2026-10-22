// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  inventoryRecSettings,
  inventoryRecOverrides,
  inventoryRecSnapshots,
  inventoryRecSnapshotRows,
} from "@/lib/db/schema";

const cols = (t: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(t).columns.map((c) => c.name).sort();

describe("inventory rec schema", () => {
  it("extends inventory_rec_settings additively", () => {
    expect(cols(inventoryRecSettings)).toEqual(
      ["client_id_code", "method", "pct_90d", "pct_avg", "pct_q1", "recent_days",
       "seasonal_end", "seasonal_start", "updated_at", "updated_by", "uplift_pct"].sort(),
    );
  });
  it("defines overrides", () => {
    expect(getTableConfig(inventoryRecOverrides).name).toBe("inventory_rec_overrides");
    expect(cols(inventoryRecOverrides)).toEqual(
      ["asin", "client_id_code", "id", "note", "qty", "set_at", "set_by", "sku"].sort(),
    );
  });
  it("defines snapshots and rows", () => {
    expect(cols(inventoryRecSnapshots)).toEqual(
      ["client_id_code", "id", "method", "overstock_skus", "overstock_units", "recent_days",
       "seasonal_end", "seasonal_start", "sent_at", "sent_by", "sku_count", "units_to_send",
       "uplift_pct"].sort(),
    );
    expect(cols(inventoryRecSnapshotRows)).toEqual(
      ["asin", "available", "awd_available", "awd_inbound", "basis_units", "final", "id", "inbound", "live_calc",
       "main_image_url", "note", "override_qty", "product_name", "reserved", "sku",
       "snapshot_id", "stock_position"].sort(),
    );
  });
});
