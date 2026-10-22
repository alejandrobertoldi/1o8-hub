import { describe, it, expect } from "vitest";
import { buildExportAoa, exportFilename } from "./export-xlsx";

const header = {
  id: "s1", clientIdCode: "POO_SC_US", sentBy: "ana@marketfoundry.agency", sentAt: "2026-10-07T14:00:00.000Z",
  method: "seasonal" as const, recentDays: 90, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30,
  skuCount: 2, unitsToSend: 200, overstockSkus: 1, overstockUnits: 14,
};
const rows = [
  { asin: "B1", sku: "S1", productName: "One", mainImageUrl: "", available: 1, inbound: 2, reserved: 3, awdAvailable: 0, awdInbound: 0, stockPosition: 6, basisUnits: 100, final: 200 },
  { asin: "B2", sku: "S2", productName: "Two", mainImageUrl: "", available: 124, inbound: 0, reserved: 0, awdAvailable: 0, awdInbound: 0, stockPosition: 124, basisUnits: 100, final: -14 },
];

describe("buildExportAoa", () => {
  it("title row, header row in sheet order, negatives kept, no notes", () => {
    const aoa = buildExportAoa(header, "Poochie", rows, "2026-10-07");
    expect(aoa[0][0]).toBe("Poochie — sent 2026-10-07 by ana@marketfoundry.agency · Seasonal 2024-10-01→2025-01-31 · +30%");
    expect(aoa[2]).toEqual(["Product", "ASIN", "SKU", "On-hand", "Inbound", "Reserved", "AWD available", "AWD inbound", "Stock position",
      "Units 2024-10-01→2025-01-31", "Recommended to send"]);
    expect(aoa[3]).toEqual(["One", "B1", "S1", 1, 2, 3, 0, 0, 6, 100, 200]); // no AWD stored ⇒ 0; no calculated number
    expect(aoa[4].at(-1)).toBe(-14);
    expect(JSON.stringify(aoa)).not.toMatch(/note|internal/i);
  });
  it("labels the recent basis by its day count", () => {
    const aoa = buildExportAoa({ ...header, method: "recent", upliftPct: 0 }, "Poochie", rows, "2026-10-07");
    expect(aoa[2][9]).toBe("Units last 90d");
    expect(aoa[2][10]).toBe("Recommended to send");
  });
  it("labels the greater-of basis", () => {
    const aoa = buildExportAoa({ ...header, method: "greater", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 }, "Poochie", rows, "2026-10-07");
    expect(aoa[2][9]).toBe("Units (greater) 90d & 2025-10-01→2025-12-31");
  });
});

describe("exportFilename", () => {
  it("uses code and send date", () => {
    expect(exportFilename("POO_SC_US", "2026-10-07T14:00:00.000Z")).toBe("POO_SC_US-inventory-recommendation-2026-10-07.xlsx");
  });
});
