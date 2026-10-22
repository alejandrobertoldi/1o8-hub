import { describe, expect, it } from "vitest";
import {
  aplusGroupLabelFromFilters,
  aplusGroupSelectionError,
  aplus2DriveScopeToken,
  filterAplusGroupMembers,
  isAplus2ParentProduct,
  nextAplusGroupIdentifier,
  pickStoredCoveredProducts,
  sameAsinSet,
  uniqueAsins,
  uniqueCoveredProducts,
  uniqueRowsByAsin,
} from "./variation-scope";

describe("isAplus2ParentProduct", () => {
  it("accepts Parent regardless of case", () => {
    expect(isAplus2ParentProduct("Parent")).toBe(true);
    expect(isAplus2ParentProduct("parent")).toBe(true);
    expect(isAplus2ParentProduct("PARENT")).toBe(true);
  });
  it("rejects children and empty", () => {
    expect(isAplus2ParentProduct("Child")).toBe(false);
    expect(isAplus2ParentProduct(null)).toBe(false);
    expect(isAplus2ParentProduct("")).toBe(false);
  });
});

describe("uniqueAsins", () => {
  it("keeps parent first and drops empties/dupes", () => {
    expect(uniqueAsins(["B0PARENT", "B0CHILD", "B0PARENT", null, ""])).toEqual([
      "B0PARENT",
      "B0CHILD",
    ]);
  });
});

describe("uniqueRowsByAsin", () => {
  it("returns one row per ASIN regardless of casing", () => {
    const first = { id: "1", asin: "B0DWMQ0XX1" };
    const duplicate = { id: "2", asin: "b0dwmq0xx1" };
    const second = { id: "3", asin: "B0DNJ3BGM5" };

    expect(uniqueRowsByAsin([first, duplicate, second])).toEqual([first, second]);
  });
});

describe("uniqueCoveredProducts", () => {
  it("puts the parent first and drops duplicate ASINs", () => {
    expect(
      uniqueCoveredProducts(
        [
          {
            id: "c1",
            asin: "B0CHILD1",
            parentageLevel: "Child",
            summarizedTitle: "Child tee",
            itemName: "Child item",
          },
          {
            id: "p1",
            asin: "B0PARENT",
            parentageLevel: "Parent",
            summarizedTitle: "Parent tee",
            itemName: "Parent item",
          },
          { id: "c2", asin: "B0CHILD1", parentageLevel: "Child" },
          { id: "c3", asin: null },
        ],
        "B0PARENT",
      ),
    ).toEqual([
      {
        id: "p1",
        asin: "B0PARENT",
        parentageLevel: "Parent",
        summarizedTitle: "Parent tee",
        itemName: "Parent item",
      },
      {
        id: "c1",
        asin: "B0CHILD1",
        parentageLevel: "Child",
        summarizedTitle: "Child tee",
        itemName: "Child item",
      },
    ]);
  });
});

describe("aplus2DriveScopeToken", () => {
  it("uses Variation ID for PARENT scope", () => {
    expect(
      aplus2DriveScopeToken({
        scopeType: "PARENT",
        scopeIdentifier: "B0DSHV9N8H",
        variationId: "TRT_SC_US_02",
      })
    ).toBe("TRT_SC_US_02");
  });
  it("falls back to the parent ASIN when Variation ID is missing", () => {
    expect(
      aplus2DriveScopeToken({
        scopeType: "PARENT",
        scopeIdentifier: "B0DSHV9N8H",
        variationId: null,
      })
    ).toBe("B0DSHV9N8H");
  });
  it("keeps the ASIN for ASIN scope even if a Variation ID is present", () => {
    expect(
      aplus2DriveScopeToken({
        scopeType: "ASIN",
        scopeIdentifier: "B0C441781M",
        variationId: "TRT_SC_US_02",
      })
    ).toBe("B0C441781M");
  });
  it("uses the generated group identifier for GROUP scope", () => {
    expect(
      aplus2DriveScopeToken({
        scopeType: "GROUP",
        scopeIdentifier: "G01_Nordic_Dreams",
        variationId: "TRT_SC_US_02",
      }),
    ).toBe("G01_Nordic_Dreams");
  });
});

describe("A+ group helpers", () => {
  it("rejects single-ASIN and out-of-client selections but allows multiple variations", () => {
    expect(aplusGroupSelectionError(["B01"], ["B01", "B02"])).toBe(
      "Group scope requires at least two ASINs",
    );
    expect(aplusGroupSelectionError(["B01", "OUTSIDE"], ["B01", "B02"])).toBe(
      "Every group ASIN must belong to the selected client",
    );
    expect(
      aplusGroupSelectionError(
        ["VARIATION_A_CHILD", "VARIATION_B_CHILD"],
        ["VARIATION_A_CHILD", "VARIATION_B_CHILD"],
      ),
    ).toBeNull();
  });

  it("compares ASIN membership without depending on order", () => {
    expect(sameAsinSet(["B02", "B01"], ["B01", "B02"])).toBe(true);
    expect(sameAsinSet(["B01"], ["B01", "B02"])).toBe(false);
  });

  it("allocates a global group number and includes the filter label", () => {
    expect(
      nextAplusGroupIdentifier("Nordic Dreams", [
        "TRT_SC_US_02_G01",
        "G02_Mustard",
      ]),
    ).toBe("G03_Nordic_Dreams");
  });

  it("derives the folder label from active theme filters", () => {
    expect(aplusGroupLabelFromFilters({ Color: ["Nordic Dreams"] })).toBe(
      "Nordic_Dreams",
    );
    expect(aplusGroupLabelFromFilters({})).toBe("Selected_ASINs");
  });

  it("ANDs selected axes and compares values case-insensitively", () => {
    const members = [
      { asin: "B01", color: "Black", size: "Large", flavor: null, style: null },
      { asin: "B02", color: "black", size: "Small", flavor: null, style: null },
      { asin: "B03", color: "Red", size: "Large", flavor: null, style: null },
    ];
    expect(
      filterAplusGroupMembers(members, { Color: ["BLACK"], Size: ["large"] }),
    ).toEqual([members[0]]);
  });

  it("keeps only stored GROUP members instead of expanding the live family", () => {
    const family = [
      { id: "1", asin: "B01", parentageLevel: "Parent", summarizedTitle: null, itemName: null },
      { id: "2", asin: "B02", parentageLevel: "Child", summarizedTitle: null, itemName: null },
      { id: "3", asin: "B03", parentageLevel: "Child", summarizedTitle: null, itemName: null },
    ];
    expect(pickStoredCoveredProducts(["B03", "B01"], family).map((p) => p.asin)).toEqual([
      "B03",
      "B01",
    ]);
  });
});
