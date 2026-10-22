import { describe, it, expect } from "vitest";
import { accumulateClientProductStats } from "./client-product-stats";

describe("accumulateClientProductStats", () => {
  it("groups by client and matches the old ILIKE filters", () => {
    const map = accumulateClientProductStats([
      { clientIdCode: "DRE_SC_US", status: "Active", count: 10 },
      { clientIdCode: "DRE_SC_US", status: "INACTIVE", count: 2 },
      { clientIdCode: "DRE_SC_US", status: "Out of Stock", count: 1 },
      { clientIdCode: "DRE_SC_US", status: "Replacement ASIN", count: 3 },
      { clientIdCode: "DRE_SC_US", status: null, count: 4 },
      { clientIdCode: "PURA_SC_US", status: "Closed", count: 5 },
    ]);

    const dre = map.get("DRE_SC_US")!;
    expect(dre.count).toBe(20);
    expect(dre.activeCount).toBe(10);
    expect(dre.inactiveCount).toBe(2);
    expect(dre.outOfStockCount).toBe(1);
    expect(dre.replacementCount).toBe(3);
    expect(dre.closedCount).toBe(0);

    expect(map.get("PURA_SC_US")).toEqual(
      expect.objectContaining({ count: 5, closedCount: 5, activeCount: 0 }),
    );
  });

  it("skips rows with no client code", () => {
    const map = accumulateClientProductStats([
      { clientIdCode: null, status: "Active", count: 9 },
      { clientIdCode: "", status: "Active", count: 9 },
    ]);
    expect(map.size).toBe(0);
  });
});
