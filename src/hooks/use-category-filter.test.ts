import { describe, expect, it } from "vitest";
import {
  allowsFreeTextWithOptions,
  collectAllValidValueOptions,
  parseValidValues,
} from "./use-category-filter";

describe("allowsFreeTextWithOptions", () => {
  it("is true for Flavor on every product/category", () => {
    expect(allowsFreeTextWithOptions("Flavor")).toBe(true);
  });

  it("is false for other variation attributes", () => {
    expect(allowsFreeTextWithOptions("Size")).toBe(false);
    expect(allowsFreeTextWithOptions("Color")).toBe(false);
    expect(allowsFreeTextWithOptions("Style")).toBe(false);
    expect(allowsFreeTextWithOptions("ParentageLevel")).toBe(false);
  });
});

describe("collectAllValidValueOptions", () => {
  it("returns empty for missing valid-values", () => {
    expect(collectAllValidValueOptions(null)).toEqual([]);
    expect(collectAllValidValueOptions("")).toEqual([]);
    expect(collectAllValidValueOptions("null")).toEqual([]);
  });

  it("unions options across every product-type key", () => {
    const json = JSON.stringify({
      BEVERAGE: "Vanilla, Chocolate",
      SNACK: "Chocolate, Strawberry",
    });
    expect(collectAllValidValueOptions(json)).toEqual([
      "Chocolate",
      "Strawberry",
      "Vanilla",
    ]);
  });

  it("collects ALL-key options even when they would otherwise lock the field to a select", () => {
    const json = JSON.stringify({ ALL: "Apple, Banana, Cherry" });
    expect(collectAllValidValueOptions(json)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("falls back to pipe-separated lists", () => {
    expect(collectAllValidValueOptions("Mint | Peach | Mango")).toEqual([
      "Mango",
      "Mint",
      "Peach",
    ]);
  });
});

describe("parseValidValues Flavor still exposes category options", () => {
  it("returns the category picklist when ALL has values", () => {
    const result = parseValidValues(
      JSON.stringify({ ALL: "Vanilla, Chocolate" }),
      "BEVERAGE"
    );
    expect(result.visible).toBe(true);
    expect(result.options).toEqual(["Vanilla", "Chocolate"]);
  });

  it("keeps Flavor visible as free text when the matched type has an empty list", () => {
    const result = parseValidValues(
      JSON.stringify({ BEVERAGE: "" }),
      "BEVERAGE"
    );
    expect(result.visible).toBe(true);
    expect(result.isFreeText).toBe(true);
    expect(result.options).toBeNull();
  });
});
