import { describe, expect, it } from "vitest";
import { basisName, calcShipIn, fbaParts, stockPosition } from "./inventory-forecast-table";

const current = (available: number, inbound: number, reserved: number, unfulfillable = 0) => ({
  available,
  inbound_quantity: inbound,
  reserved_quantity: reserved,
  unfulfillable_quantity: unfulfillable,
});

describe("stockPosition", () => {
  it("counts available + inbound + reserved once each (no supply-at-FBA double count)", () => {
    // Real FVFMayo1ct shape 2026-10-03: supply_at_fba 768 = 0 available + 768 inbound
    expect(stockPosition({ current: current(0, 768, 0), health: { total_quantity: 768 } })).toBe(768);
  });

  it("excludes unfulfillable units", () => {
    expect(stockPosition({ current: current(100, 0, 10, 177), health: null })).toBe(110);
  });

  it("falls back to health supply-at-FBA alone when the manage-inventory row is missing", () => {
    expect(stockPosition({ current: null, health: { total_quantity: 843 } })).toBe(843);
  });

  it("adds AWD on-hand on top of FBA stock", () => {
    expect(stockPosition({ current: current(100, 20, 10), health: null, awd_onhand: 500 })).toBe(630);
  });

  it("adds AWD inbound alongside AWD on-hand", () => {
    expect(stockPosition({ current: current(100, 0, 0), health: null, awd_onhand: 500, awd_inbound: 200 })).toBe(800);
  });

  it("adds AWD on-hand to the health fallback too", () => {
    expect(stockPosition({ current: null, health: { total_quantity: 843 }, awd_onhand: 57 })).toBe(900);
  });

  it("uses the reserved breakdown when present, so the shown lines add up (4VAR12PCK: 84 vs 76)", () => {
    const c = { available: 21, inbound_quantity: 454, reserved_quantity: 84, reserved_customerorders: 28, reserved_fc_transfers: 0, reserved_fc_processing: 48 };
    expect(stockPosition({ current: c, health: null })).toBe(21 + 454 + 76);
  });

  it("falls back to the report's reserved total when the breakdown is missing", () => {
    const c = { available: 21, inbound_quantity: 454, reserved_quantity: 84, reserved_customerorders: 0, reserved_fc_transfers: 0, reserved_fc_processing: 0 };
    expect(stockPosition({ current: c, health: null })).toBe(21 + 454 + 84);
  });

  it("is 0 with no data at all", () => {
    expect(stockPosition({ current: null, health: null })).toBe(0);
  });
});

describe("calcShipIn", () => {
  it("is basis * 1.1 (rounded up) minus stock on hand", () => {
    expect(calcShipIn(1000, 768)).toBe(332);
  });

  it("never goes negative", () => {
    expect(calcShipIn(100, 5000)).toBe(0);
  });
});

describe("basisName", () => {
  it("names the window the Basis came from", () => {
    expect(basisName("greater", 90, 27, 17, "2025")).toBe("Last 90d");
    expect(basisName("greater", 90, 17, 27, "2025")).toBe("Next 90d 2025");
    expect(basisName("greater", 90, 20, 20, "2025")).toBe("Last 90d");
    expect(basisName("recent", 120, 0, 50, "2025")).toBe("Last 120d");
    expect(basisName("seasonal", 90, 50, 0, "2025")).toBe("Next 90d 2025");
    expect(basisName("average", 90, 50, 10, "2025")).toBe("Average");
  });
});

describe("fbaParts (Amazon FBA inventory hierarchy)", () => {
  const c = {
    product_sales: 0, units_sold: 0, ad_spend: 0, ad_revenue: 0,
    available: 1, inbound_quantity: 420, reserved_quantity: 61, unfulfillable_quantity: 5,
    reserved_customerorders: 25, reserved_fc_transfers: 0, reserved_fc_processing: 36,
    researching_quantity: 65, fba_total_quantity: 552,
  };

  it("matches Seller Central's FBA inventory details (screenshot 2026-10-08)", () => {
    const f = fbaParts(c, 999);
    expect([f.onHand, f.inbound, f.reserved, f.unfulfillable, f.researching, f.total]).toEqual([1, 420, 61, 5, 65, 552]);
    expect(f.onHand + f.inbound + f.reserved + f.unfulfillable + f.researching).toBe(f.total);
  });

  it("moves FC transfer from Reserved to On-hand without changing their sum", () => {
    const f = fbaParts({ ...c, reserved_fc_transfers: 10, reserved_quantity: 71 }, 0);
    expect(f.onHand).toBe(11);
    expect(f.reserved).toBe(61);
    expect(f.onHand + f.reserved).toBe(c.available + 71);
  });

  it("keeps the whole reserved figure when the reserved breakdown is missing", () => {
    const f = fbaParts({ ...c, reserved_customerorders: 0, reserved_fc_processing: 0, reserved_quantity: 40 }, 0);
    expect(f.reserved).toBe(40);
    expect(f.onHand).toBe(1);
  });

  it("falls back to the health total when Amazon's total is absent (older cache)", () => {
    expect(fbaParts({ ...c, fba_total_quantity: undefined }, 487).total).toBe(487);
  });
});
