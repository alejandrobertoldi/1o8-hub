import { describe, expect, it } from "vitest";
import { addedByType, parseFt3, storageTypeOf, summarizeCapacity, type CapacityRow, type StorageType } from "./capacity";

const row = (sku: string, asin: string, size: string, over: Partial<CapacityRow> = {}): CapacityRow => ({
  sku, asin, unitStorageSize: size, available: 0, fcTransfer: 0, fcProcessing: 0, customerOrder: 0, unfulfillable: 0,
  working: 0, shipped: 0, receiving: 0, ...over,
});

describe("capacity", () => {
  it("parses the report's ft3 strings", () => {
    expect(parseFt3("0.2527 ft3")).toBe(0.2527);
    expect(parseFt3(null)).toBe(0);
  });

  it("maps size tier + dangerous goods to Amazon's storage types", () => {
    expect(storageTypeOf("Standard-Size", null)).toBe("Standard-size");
    expect(storageTypeOf("Oversize", null)).toBe("Oversize");
    expect(storageTypeOf("Standard-Size", "FLAMMABLES")).toBe("Flammable");
    expect(storageTypeOf(undefined, undefined)).toBe("Standard-size");
  });

  it("sums on-hand and open shipments in ft3 per type, skipping types without stock", () => {
    const rows = [
      row("A", "B0A", "0.25 ft3", { available: 100, fcTransfer: 10, fcProcessing: 5, customerOrder: 3, unfulfillable: 2, working: 4, shipped: 40, receiving: 6 }),
      row("B", "B0B", "2 ft3", { available: 3 }),
      row("C", "B0C", "1 ft3"),
    ];
    const type = (asin: string): StorageType => (asin === "B0B" ? "Oversize" : asin === "B0C" ? "Flammable" : "Standard-size");
    const { types, skus } = summarizeCapacity(rows, type);
    expect(types).toEqual([
      { type: "Standard-size", onhandUnits: 120, onhandFt3: 30, openUnits: 50, openFt3: 12.5 },
      { type: "Oversize", onhandUnits: 3, onhandFt3: 6, openUnits: 0, openFt3: 0 },
    ]);
    expect(skus.C).toEqual({ ft3PerUnit: 1, type: "Flammable" });
  });

  it("sizes a recommendation by type, ignoring overstock and unknown SKUs", () => {
    const skus = { A: { ft3PerUnit: 0.25, type: "Standard-size" as const }, B: { ft3PerUnit: 2, type: "Oversize" as const } };
    const added = addedByType([{ sku: "A", qty: 100 }, { sku: "B", qty: -5 }, { sku: "Z", qty: 10 }], skus);
    expect([...added.entries()]).toEqual([["Standard-size", { units: 100, ft3: 25 }]]);
  });
});

describe("capacity limits", () => {
  it("outlook is this month and the next two, across the year end", async () => {
    const { outlookMonths } = await import("./capacity");
    expect(outlookMonths("2026-10-09")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(outlookMonths("2026-12-01")).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
  it("validates the PUT body; null deletes", async () => {
    const { validateLimitBody } = await import("./capacity");
    const ok = { clientIdCode: "HAL_SC_US", storageType: "Standard-size", month: "2026-10", limitFt3: 6706.57 };
    expect(validateLimitBody(ok).ok).toBe(true);
    expect(validateLimitBody({ ...ok, limitFt3: null }).ok).toBe(true);
    for (const bad of [{ ...ok, month: "2026-13" }, { ...ok, storageType: "Apparel" }, { ...ok, limitFt3: -1 }, { ...ok, limitFt3: "6706" }, { ...ok, clientIdCode: "a b" }]) {
      expect(validateLimitBody(bad).ok).toBe(false);
    }
  });
});

describe("parseLimitInput", () => {
  it("reads a comma decimal from an EU numpad (the 670,657 bug)", async () => {
    const { parseLimitInput } = await import("./capacity");
    expect(parseLimitInput("6706,57")).toBe(6706.57);
    expect(parseLimitInput("6.706,57")).toBe(6706.57);
    expect(parseLimitInput("5331,9")).toBe(5331.9);
  });
  it("still reads US formats and plain integers", async () => {
    const { parseLimitInput } = await import("./capacity");
    expect(parseLimitInput("6,706.57")).toBe(6706.57);
    expect(parseLimitInput("6706.57")).toBe(6706.57);
    expect(parseLimitInput("6,706")).toBe(6706); // 3 digits after the separator = thousands
    expect(parseLimitInput("1890")).toBe(1890);
    expect(parseLimitInput(" 1 890,50 ")).toBe(1890.5);
    expect(parseLimitInput("6\u202F706,57")).toBe(6706.57); // French narrow no-break space
    expect(parseLimitInput("6'706.57")).toBe(6706.57); // Swiss
    expect(parseLimitInput("1,23,456.78")).toBe(123456.78); // Indian grouping
    expect(parseLimitInput("\u0666\u0667\u0660\u0666,\u0665\u0667")).toBe(6706.57); // Arabic-Indic digits
  });
  it("rejects anything that isn't a number", async () => {
    const { parseLimitInput } = await import("./capacity");
    for (const bad of ["", "abc", "-5", "12a"]) expect(parseLimitInput(bad)).toBeNull();
  });
});


describe("validateLimitBody status", () => {
  it("accepts confirmed / estimate, rejects anything else", async () => {
    const { validateLimitBody } = await import("./capacity");
    const ok = { clientIdCode: "HAL_SC_US", storageType: "Standard-size", month: "2026-10", limitFt3: 6706.57 };
    expect(validateLimitBody({ ...ok, status: "confirmed" })).toMatchObject({ ok: true, value: { status: "confirmed" } });
    expect(validateLimitBody(ok)).toMatchObject({ ok: true, value: { status: undefined } }); // keep the stored one
    expect(validateLimitBody({ ...ok, status: "maybe" }).ok).toBe(false);
  });
});
