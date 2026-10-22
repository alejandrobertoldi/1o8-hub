import { describe, expect, it } from "vitest";
import { applyParentVariationFill, parentThemeBqNames, applyParentThemeFillToProductUpdates } from "./parent-variation-fill";

describe("applyParentVariationFill", () => {
  it("leaves Child rows untouched", () => {
    const row = { parentageLevel: "Child", variationThemeName: "SizeColor", size: "Large", color: "Red", flavor: null, style: null };
    expect(applyParentVariationFill(row)).toEqual(row);
  });

  it("leaves Parent rows with null theme untouched", () => {
    const row = { parentageLevel: "Parent", variationThemeName: null, size: null, color: null, flavor: null, style: null };
    expect(applyParentVariationFill(row)).toEqual(row);
  });

  it("fills only fields named in the theme (SizeColor)", () => {
    const row = { parentageLevel: "Parent", variationThemeName: "SizeColor", size: null, color: null, flavor: null, style: null };
    expect(applyParentVariationFill(row)).toEqual({
      parentageLevel: "Parent",
      variationThemeName: "SizeColor",
      size: "Parent",
      color: "Parent",
      flavor: null,
      style: null,
    });
  });

  it("handles STYLE_NAME", () => {
    const row = { parentageLevel: "Parent", variationThemeName: "STYLE_NAME", size: null, color: null, flavor: null, style: null };
    expect(applyParentVariationFill(row).style).toBe("Parent");
    expect(applyParentVariationFill(row).size).toBeNull();
  });

  it("handles FLAVOR/SIZE separator variants", () => {
    const row = { parentageLevel: "Parent", variationThemeName: "FLAVOR/SIZE", size: null, color: null, flavor: null, style: null };
    const out = applyParentVariationFill(row);
    expect(out.flavor).toBe("Parent");
    expect(out.size).toBe("Parent");
    expect(out.color).toBeNull();
    expect(out.style).toBeNull();
  });

  it("overwrites existing values on Parent rows (theme is authoritative)", () => {
    const row = { parentageLevel: "Parent", variationThemeName: "Size", size: "Large", color: "Red", flavor: null, style: null };
    const out = applyParentVariationFill(row);
    expect(out.size).toBe("Parent");
    expect(out.color).toBe("Red"); // not in theme, untouched
  });

  it("is case-insensitive on theme matching", () => {
    const row = { parentageLevel: "Parent", variationThemeName: "color", size: null, color: null, flavor: null, style: null };
    expect(applyParentVariationFill(row).color).toBe("Parent");
  });

  it("preserves extra fields on the row", () => {
    const row = { parentageLevel: "Parent", variationThemeName: "Size", size: null, color: null, flavor: null, style: null, asin: "B0X", sku: "Y" };
    const out = applyParentVariationFill(row);
    expect(out.asin).toBe("B0X");
    expect(out.sku).toBe("Y");
  });
});

describe("parentThemeBqNames", () => {
  it("returns Flavor and Size for FLAVOR/SIZE", () => {
    expect(parentThemeBqNames("FLAVOR/SIZE")).toEqual(["Flavor", "Size"]);
  });

  it("returns Size for SIZE/SET", () => {
    expect(parentThemeBqNames("SIZE/SET")).toEqual(["Size"]);
  });

  it("returns empty when theme is missing", () => {
    expect(parentThemeBqNames(null)).toEqual([]);
    expect(parentThemeBqNames("")).toEqual([]);
  });
});

describe("applyParentThemeFillToProductUpdates", () => {
  it("fills Flavor and Size when ParentageLevel is set to Parent", () => {
    const updates: Record<string, unknown> = { parentageLevel: "Parent" };
    const rawValues: Record<string, string | null | undefined> = { ParentageLevel: "Parent" };
    const changeLog: Array<{ field: string; oldValue: string | null; newValue: string | null; changedBy: string; changedAt: string }> = [];
    applyParentThemeFillToProductUpdates({
      product: {
        parentageLevel: null,
        variations: { VariationThemeName: "FLAVOR/SIZE", Flavor: "Mixed Berry", Size: "12 oz" },
        rawColumnValues: { VariationThemeName: "FLAVOR/SIZE" },
      },
      bqName: "ParentageLevel",
      value: "Parent",
      updates,
      rawValues,
      changeLog,
      changedBy: "a@b.com",
      changedAt: "2026-09-02T00:00:00.000Z",
    });
    expect((updates.variations as Record<string, string>).Flavor).toBe("Parent");
    expect((updates.variations as Record<string, string>).Size).toBe("Parent");
    expect(rawValues.Flavor).toBe("Parent");
    expect(rawValues.Size).toBe("Parent");
    expect(changeLog.map((e) => e.field)).toEqual(["Flavor", "Size"]);
  });

  it("does not fill Child products", () => {
    const updates: Record<string, unknown> = { parentageLevel: "Child" };
    const rawValues: Record<string, string | null | undefined> = {};
    applyParentThemeFillToProductUpdates({
      product: { parentageLevel: null, variations: { VariationThemeName: "FLAVOR/SIZE" } },
      bqName: "ParentageLevel",
      value: "Child",
      updates,
      rawValues,
      changeLog: [],
      changedBy: "a@b.com",
      changedAt: "2026-09-02T00:00:00.000Z",
    });
    expect(updates.variations).toBeUndefined();
  });
});
