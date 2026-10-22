import { describe, it, expect } from "vitest";

/**
 * Tests for the variation key normalization logic used in migration 0020.
 * Validates the CASE-based key mapping without requiring a DB connection.
 */

/** Mirrors the SQL CASE logic from 0020_variation_group_and_normalize.sql */
function normalizeVariationKeys(
  input: Record<string, string>
): Record<string, string> {
  const keyMap: Record<string, string> = {
    variationid: "VariationID",
    variationproduct: "VariationProduct",
    variationthemename: "VariationThemeName",
    childrelationshiptype: "ChildRelationshipType",
    color: "Color",
    size: "Size",
    flavor: "Flavor",
    style: "Style",
  };

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = keyMap[key.toLowerCase()] ?? key;
    result[normalized] = value;
  }
  return result;
}

describe("normalizeVariationKeys", () => {
  it("normalizes lowercase keys to PascalCase", () => {
    const input = { color: "Red", size: "Large", flavor: "Vanilla" };
    const result = normalizeVariationKeys(input);
    expect(result).toEqual({ Color: "Red", Size: "Large", Flavor: "Vanilla" });
  });

  it("normalizes camelCase variationId to VariationID", () => {
    const input = { variationId: "CLIENT01_00" };
    const result = normalizeVariationKeys(input);
    expect(result).toEqual({ VariationID: "CLIENT01_00" });
  });

  it("preserves already-correct PascalCase keys", () => {
    const input = {
      VariationID: "CLIENT01_00",
      Color: "Blue",
      Size: "Medium",
      VariationThemeName: "Size/Color",
    };
    const result = normalizeVariationKeys(input);
    expect(result).toEqual(input);
  });

  it("preserves unknown keys unchanged", () => {
    const input = {
      Color: "Red",
      Scent: "Lavender",
      Material: "Cotton",
      CustomDimension: "XYZ",
    };
    const result = normalizeVariationKeys(input);
    expect(result).toEqual({
      Color: "Red",
      Scent: "Lavender",
      Material: "Cotton",
      CustomDimension: "XYZ",
    });
  });

  it("handles mixed casing across all known keys", () => {
    const input = {
      variationid: "V001",
      variationproduct: "Footies",
      variationthemename: "Size/Color",
      childrelationshiptype: "Variation",
      color: "Red",
      size: "Large",
      flavor: "Vanilla",
      style: "Classic",
    };
    const result = normalizeVariationKeys(input);
    expect(result).toEqual({
      VariationID: "V001",
      VariationProduct: "Footies",
      VariationThemeName: "Size/Color",
      ChildRelationshipType: "Variation",
      Color: "Red",
      Size: "Large",
      Flavor: "Vanilla",
      Style: "Classic",
    });
  });

  it("handles empty object", () => {
    expect(normalizeVariationKeys({})).toEqual({});
  });

  it("deduplicates when both cases exist (last wins, matching SQL behavior)", () => {
    // If both "color" and "Color" exist, both map to "Color" — last one wins
    const input = { color: "Red", Color: "Blue" };
    const result = normalizeVariationKeys(input);
    expect(result.Color).toBe("Blue");
    expect(Object.keys(result)).toEqual(["Color"]);
  });
});
