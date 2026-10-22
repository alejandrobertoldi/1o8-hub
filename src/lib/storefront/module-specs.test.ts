import { describe, it, expect } from "vitest";
import {
  STOREFRONT_MODULE_SPECS,
  validateAsset,
  SPLIT_LAYOUTS,
  SPLIT_PICKER_GROUPS,
  DEFAULT_SPLIT_LAYOUT,
  splitLayoutRatio,
  splitTileCount,
  getSplitLayout,
  collectSplitTiles,
  isSplitLayout,
  isFlippedSplitLayout,
  canonicalSplitLayoutKey,
  flipSplitLayoutKey,
  flipSplitNode,
  isSplitTile,
  isSingleRowSplit,
} from "./module-specs";

describe("validateAsset", () => {
  it("accepts a header at min size with no warnings", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.header, { width: 3000, height: 600, bytes: 1000, mime: "image/png" });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
  it("warns (but ok) when below min size", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.header, { width: 2000, height: 400, bytes: 1000, mime: "image/png" });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("rejects wrong mime kind (image file in video module)", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.video, { width: 1280, height: 640, bytes: 1000, mime: "image/png" });
    expect(r.ok).toBe(false);
  });
  it("warns when video exceeds 500MB", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.video, { width: 1280, height: 640, bytes: 600 * 1024 * 1024, mime: "video/mp4" });
    expect(r.warnings.some((w) => /500/.test(w))).toBe(true);
  });
  it("image module only constrains width", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.image, { width: 1500, height: 200, bytes: 1, mime: "image/jpeg" });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});

describe("splitLayoutRatio", () => {
  it("returns the equal ratio for split_2_equal", () => {
    expect(splitLayoutRatio("split_2_equal")).toEqual([1, 1]);
  });
  it("returns the left-heavy ratio for split_2_left", () => {
    expect(splitLayoutRatio("split_2_left")).toEqual([62, 38]);
  });
  it("returns the right-heavy ratio for split_2_right", () => {
    expect(splitLayoutRatio("split_2_right")).toEqual([38, 62]);
  });
  it("falls back to the equal ratio for null / unknown keys", () => {
    expect(splitLayoutRatio(null)).toEqual([1, 1]);
    expect(splitLayoutRatio("fill")).toEqual([1, 1]);
    expect(splitLayoutRatio(undefined)).toEqual([1, 1]);
  });
  it("default layout is split_2_equal and exists in SPLIT_LAYOUTS", () => {
    expect(DEFAULT_SPLIT_LAYOUT).toBe("split_2_equal");
    expect(SPLIT_LAYOUTS[DEFAULT_SPLIT_LAYOUT]).toBeDefined();
    expect(splitTileCount(DEFAULT_SPLIT_LAYOUT)).toBe(2);
  });
});

describe("split layout catalog", () => {
  it("every layout tree uses tiles 1..N exactly once", () => {
    for (const [key, def] of Object.entries(SPLIT_LAYOUTS)) {
      const ids = collectSplitTiles(def.tree).sort((a, b) => a - b);
      expect(ids, key).toEqual(Array.from({ length: def.tiles }, (_, i) => i + 1));
    }
  });

  it("every mobile tree uses tiles 1..N exactly once", () => {
    for (const [key, def] of Object.entries(SPLIT_LAYOUTS)) {
      const ids = collectSplitTiles(def.mobileTree).sort((a, b) => a - b);
      expect(ids, `${key} mobile`).toEqual(Array.from({ length: def.tiles }, (_, i) => i + 1));
    }
  });

  it("flipped mobile trees use the dedicated mobile flip arrangement", () => {
    expect(getSplitLayout("basic_3_flip").mobileTree).toEqual(getSplitLayout("basic_3").mobileFlipTree);
    expect(getSplitLayout("var_3_flip").mobileTree).toEqual(getSplitLayout("var_3").mobileFlipTree);
    expect(getSplitLayout("grid_6_flip").mobileTree).toEqual(getSplitLayout("grid_6").mobileFlipTree);
  });

  it("picker groups list every picker layout and no unknown keys", () => {
    const grouped = SPLIT_PICKER_GROUPS.flatMap((g) => g.keys);
    const pickerKeys = Object.entries(SPLIT_LAYOUTS)
      .filter(([, d]) => d.picker)
      .map(([k]) => k)
      .sort();
    expect([...grouped].sort()).toEqual(pickerKeys);
  });

  it("reports tile counts for Amazon-style layouts", () => {
    expect(splitTileCount("split_2_equal")).toBe(2);
    expect(splitTileCount("basic_3")).toBe(3);
    expect(splitTileCount("basic_4")).toBe(4);
    expect(splitTileCount("basic_5")).toBe(5);
    expect(splitTileCount("grid_4")).toBe(4);
    expect(splitTileCount("grid_6")).toBe(6);
    expect(splitTileCount("grid_7")).toBe(7);
    expect(splitTileCount("grid_8")).toBe(8);
    expect(splitTileCount("var_2")).toBe(2);
    expect(splitTileCount("var_3")).toBe(3);
    expect(splitTileCount("var_4")).toBe(4);
  });

  it("registers flipped variants for flippable layouts", () => {
    expect(isSplitLayout("basic_3_flip")).toBe(true);
    expect(isSplitLayout("grid_6_flip")).toBe(true);
    expect(isSplitLayout("var_3_flip")).toBe(true);
    expect(isSplitLayout("grid_4_flip")).toBe(false);
    expect(isFlippedSplitLayout("basic_3_flip")).toBe(true);
    expect(isFlippedSplitLayout("basic_3")).toBe(false);
  });

  it("canonical / flip key helpers round-trip", () => {
    expect(canonicalSplitLayoutKey("basic_3_flip")).toBe("basic_3");
    expect(flipSplitLayoutKey("basic_3")).toBe("basic_3_flip");
    expect(flipSplitLayoutKey("basic_3_flip")).toBe("basic_3");
    expect(flipSplitLayoutKey("split_2_equal")).toBe("split_2_equal");
  });

  it("flip moves the large cell of basic_3 to the opposite side", () => {
    const unflipped = getSplitLayout("basic_3").tree;
    const flipped = getSplitLayout("basic_3_flip").tree;
    expect(flipSplitNode(unflipped)).toEqual(flipped);
    expect(isSplitTile(unflipped) || unflipped.dir !== "col").toBe(false);
    if (!isSplitTile(unflipped) && !isSplitTile(flipped)) {
      expect(isSplitTile(unflipped.children[0])).toBe(true);
      expect(isSplitTile(flipped.children[1])).toBe(true);
    }
  });

  it("falls back to the default layout for unknown keys", () => {
    expect(getSplitLayout(null)).toBe(SPLIT_LAYOUTS[DEFAULT_SPLIT_LAYOUT]);
    expect(getSplitLayout("nope")).toBe(SPLIT_LAYOUTS[DEFAULT_SPLIT_LAYOUT]);
    expect(splitTileCount("fill")).toBe(2);
  });
});

describe("isSingleRowSplit", () => {
  it("is true for 2-up and other single-axis tile rows", () => {
    expect(isSingleRowSplit("split_2_equal")).toBe(true);
    expect(isSingleRowSplit("var_2")).toBe(true);
    expect(isSingleRowSplit("var_3")).toBe(true);
    expect(isSingleRowSplit("var_4")).toBe(true);
  });

  it("is false for nested basic/grid splits on desktop", () => {
    expect(isSingleRowSplit("basic_3")).toBe(false);
    expect(isSingleRowSplit("basic_4")).toBe(false);
    expect(isSingleRowSplit("grid_4")).toBe(false);
    expect(isSingleRowSplit("grid_6")).toBe(false);
  });

  it("treats mobile 2-up as a stacked single-axis", () => {
    expect(isSingleRowSplit("split_2_equal", "mobile")).toBe(true);
  });
});
