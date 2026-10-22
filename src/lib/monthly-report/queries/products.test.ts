import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));

import { queryRedshift } from "@/lib/redshift";
import { fetchProductRows } from "./products";

describe("fetchProductRows", () => {
  beforeEach(() => { vi.mocked(queryRedshift).mockReset(); });

  it("rolls units from product_quantity, not ordered_units", async () => {
    // Intentwise product_summary.ordered_units is unused (always NULL).
    // Units live in product_quantity — same column account_summary uses.
    vi.mocked(queryRedshift).mockResolvedValueOnce([]);

    await fetchProductRows("3415610", "2026-07-01", "2026-07-31");

    expect(queryRedshift).toHaveBeenCalledTimes(1);
    const sql = String(vi.mocked(queryRedshift).mock.calls[0][0]);
    expect(sql).toMatch(/SUM\(\s*product_quantity\s*\)/);
    expect(sql).not.toMatch(/SUM\(\s*ordered_units\s*\)/);
  });

  it("coerces null unit/sales rollups to 0", async () => {
    vi.mocked(queryRedshift).mockResolvedValueOnce([
      {
        asin: "B09BG4RM85",
        title: "Poochie Peanut Butter",
        sku: "SKU-1",
        sessions: "170",
        units: "57",
        sales: "1308.15",
        order_items: "55",
        buy_box: "71.7",
      },
    ]);

    const rows = await fetchProductRows("3415610", "2026-07-01", "2026-07-31");
    expect(rows).toEqual([
      {
        asin: "B09BG4RM85",
        parent_asin: null,
        title: "Poochie Peanut Butter",
        sku: "SKU-1",
        sessions: 170,
        units: 57,
        sales: 1308.15,
        order_items: 55,
        buy_box: 71.7,
      },
    ]);
  });
});
