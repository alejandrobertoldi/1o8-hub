import { describe, expect, it } from "vitest";
import {
  coalesceThemeAttrs,
  computeThemeSummarizedTitle,
  displaySummarizedTitle,
} from "./computed-fields";

describe("displaySummarizedTitle", () => {
  it("uses variation name + theme attrs, not Amazon itemName", () => {
    expect(
      displaySummarizedTitle({
        variationThemeName: "COLOR/SIZE",
        variationName: "Convertible Footies - B0DCTWCMQC",
        Color: "Fish & Ships",
        Size: "12-18 Months",
        itemName:
          "Dreamiere Convertible Footies Fish & Ships | Fabric free of harsh chemicals | Two-Way Zipper",
      })
    ).toBe("Convertible Footies - B0DCTWCMQC | Fish & Ships | 12-18 Months");
  });

  it("does not fall back to marketing itemName when theme attrs are empty", () => {
    expect(
      displaySummarizedTitle({
        variationThemeName: "COLOR/SIZE",
        variationName: "Convertible Footies - B0DCTWCMQC",
        summarizedTitle: "Convertible Footies - B0DCTWCMQC",
        itemName:
          "Dreamiere Convertible Footies Fish & Ships | Fabric free of harsh chemicals | Two-Way Zipper | Tagless",
      })
    ).toBe("Convertible Footies - B0DCTWCMQC");
  });

  it("uses itemName only for standalones with no variation name", () => {
    expect(
      displaySummarizedTitle({
        itemName: "Standalone Bottle 32oz",
      })
    ).toBe("Standalone Bottle 32oz");
  });
});

describe("coalesceThemeAttrs", () => {
  it("copies Color/Size from the same-ASIN non-FBM sibling", () => {
    const fba = {
      id: "a",
      asin: "B0DT95MZDG",
      sku: "FISH & SHIPS/CONV FOOTIE/NB",
      variations: { Color: "Fish & Ships", Size: "Newborn" },
    };
    const fbm = {
      id: "b",
      asin: "B0DT95MZDG",
      sku: "FISH & SHIPS/CONV FOOTIE/NB-FBM",
      variations: {},
    };
    expect(coalesceThemeAttrs(fbm, [fba, fbm])).toEqual({
      Color: "Fish & Ships",
      Size: "Newborn",
      Flavor: null,
      Style: null,
    });
  });
});

describe("computeThemeSummarizedTitle", () => {
  it("keeps COLOR/SIZE order", () => {
    expect(
      computeThemeSummarizedTitle("COLOR/SIZE", "Footies", {
        Color: "Fish & Ships",
        Size: "12-18 Months",
        Flavor: "should-ignore",
      })
    ).toBe("Footies | Fish & Ships | 12-18 Months");
  });
});
