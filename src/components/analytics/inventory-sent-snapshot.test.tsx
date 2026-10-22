import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { InventorySentSnapshot } from "./inventory-sent-snapshot";

const header = {
  id: "s1", clientIdCode: "POO_SC_US", sentBy: "", sentAt: "2026-10-07T14:00:00.000Z",
  method: "recent" as const, recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0,
  skuCount: 2, unitsToSend: 200, overstockSkus: 1, overstockUnits: 14,
};
const rows = [
  { asin: "B1", sku: "S1", productName: "One", mainImageUrl: "", available: 1, inbound: 0, reserved: 0, awdAvailable: 0, awdInbound: 0, stockPosition: 1, basisUnits: 100, final: 200 },
  { asin: "B2", sku: "S2", productName: "Two", mainImageUrl: "", available: 124, inbound: 0, reserved: 0, awdAvailable: 0, awdInbound: 0, stockPosition: 124, basisUnits: 100, final: -14 },
];

describe("InventorySentSnapshot", () => {
  it("shows the send date, finals and overstock", () => {
    render(<InventorySentSnapshot header={header} rows={rows} />);
    expect(screen.getByText("Recommendation sent 2026-10-07")).toBeTruthy();
    expect(screen.getAllByText("200").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Overstock")).toBeTruthy();
    expect(screen.getByText("−14")).toBeTruthy();
    // Same Recommendation cell as the hub, without AWD (not stored when sent)
    expect(screen.getByRole("columnheader", { name: "Recommendation" })).toBeTruthy();
    expect(screen.getAllByText("AWD")).toHaveLength(2); // stored AWD shown (— when the row has none)
    expect(screen.getAllByText("Result")).toHaveLength(2);
    expect(screen.queryByText(/override/)).toBeNull();
  });
  it("contains no hub orange", () => {
    const src = readFileSync("src/components/analytics/inventory-sent-snapshot.tsx", "utf8");
    expect(src).not.toMatch(/brand|FF751F|amber|orange/i);
  });

  it("groups sent rows by variation and shows status and title lines from live data", () => {
    const products = [
      { asin: "B1", sku: "S1", listing_status: "Active", summarized_title: "Iced Tea | Lemon", size: "12 fl oz", variation_name: "Singles", variation_id: "HAL_SC_US_02" },
      { asin: "B2", sku: "S2", listing_status: "Inactive", summarized_title: "Iced Tea | Variety", size: "12 fl oz", variation_name: "Packs", variation_id: "HAL_SC_US_01" },
    ];
    render(<InventorySentSnapshot header={header} rows={rows} products={products} />);
    expect(screen.getByText("Singles")).toBeTruthy();
    expect(screen.getByText("HAL_SC_US_01")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(screen.getByText("Lemon")).toBeTruthy();
    expect(screen.getAllByText("12 fl oz")).toHaveLength(2);
  });
});

