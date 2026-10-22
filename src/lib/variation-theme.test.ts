import { describe, it, expect } from "vitest";
import { parseVariationTheme, isVariationAttribute, variationAttributeSlots } from "./variation-theme";

describe("parseVariationTheme", () => {
  it("returns [] for null/empty", () => {
    expect(parseVariationTheme(null)).toEqual([]);
    expect(parseVariationTheme("")).toEqual([]);
  });
  it("splits 'Color/Size' on slash", () => {
    expect(parseVariationTheme("Color/Size")).toEqual(["Color", "Size"]);
  });
  it("splits 'ColorSize' (Amazon PascalCase) on word boundaries", () => {
    expect(parseVariationTheme("ColorSize")).toEqual(["Color", "Size"]);
  });
  it("returns single-token themes verbatim", () => {
    expect(parseVariationTheme("Flavor")).toEqual(["Flavor"]);
  });
});

describe("isVariationAttribute", () => {
  it("returns true when the attribute's general label is in the theme set", () => {
    expect(
      isVariationAttribute(
        { variationThemeName: "Color/Size" },
        { generalLabel: "Color" },
      ),
    ).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(
      isVariationAttribute(
        { variationThemeName: "Flavor" },
        { generalLabel: "Color" },
      ),
    ).toBe(false);
  });
});

describe("variationAttributeSlots", () => {
  it("returns empty slots when theme is missing", () => {
    expect(variationAttributeSlots(null)).toEqual(["", "", ""]);
    expect(variationAttributeSlots("")).toEqual(["", "", ""]);
  });
  it("maps COLOR/SIZE onto VarAttr1=Color, VarAttr2=Size", () => {
    expect(variationAttributeSlots("COLOR/SIZE")).toEqual(["Color", "Size", ""]);
  });
  it("preserves theme order for SIZE/COLOR", () => {
    expect(variationAttributeSlots("SIZE/COLOR")).toEqual(["Size", "Color", ""]);
  });
  it("normalizes COLOR_NAME/SIZE_NAME suffixes", () => {
    expect(variationAttributeSlots("COLOR_NAME/SIZE_NAME")).toEqual(["Color", "Size", ""]);
  });
  it("splits hyphenated themes", () => {
    expect(variationAttributeSlots("color-size")).toEqual(["Color", "Size", ""]);
  });
  it("fills a third slot when the theme has three axes", () => {
    expect(variationAttributeSlots("COLOR/SIZE/STYLE")).toEqual(["Color", "Size", "Style"]);
  });
  it("maps a single-axis theme onto VarAttr1 only", () => {
    expect(variationAttributeSlots("FLAVOR")).toEqual(["Flavor", "", ""]);
  });
});
