// @vitest-environment node
//
// Unit tests for `pickAttributesForLevels`, the level-merge helper that lives
// in @/lib/template-attributes (extracted from this route's create-Sheet
// handler so the finalize route can reuse it without crossing route
// boundaries). Lives here historically; consumes nothing from the route
// itself — pure level-merge logic.
//
// Test cases:
//   1. levels=["Essential"] — identity-headers mode, SKU first.
//   2. levels=["Key","Essential"] — identity mode AND a Key-only attr
//      survives the merge (the CRITICAL bug being fixed).
//   3. levels=["Required"] — non-identity mode, no SKU prepended.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import * as queries from "@/lib/category-meta-queries";
import { pickAttributesForLevels } from "@/lib/template-attributes";

type Row = queries.AttributeCategoryRow;

const row = (over: Partial<Row> & { id: number; generalLabel: string }): Row => ({
  referenceGroup: "",
  description: null,
  example: null,
  requirement: null,
  validValues: null,
  isKey: false,
  isEssential: false,
  ...over,
});

const IDENTITY = ["SKU", "ASIN", "ItemName", "ProductType"];

describe("pickAttributesForLevels", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("levels=[Essential]: identity-headers mode with SKU first, no key extras", async () => {
    vi.spyOn(queries, "getMinimumNecessaryAttributes").mockResolvedValue([
      row({ id: -1, generalLabel: "SKU" }),
      row({ id: -1, generalLabel: "ASIN" }),
      row({ id: -1, generalLabel: "ItemName" }),
      row({ id: -1, generalLabel: "ProductType" }),
      row({ id: 10, generalLabel: "color", requirement: "Required" }),
    ]);
    // getAttributesForCategory should NOT be called when there are no extra levels.
    const spyAll = vi.spyOn(queries, "getAttributesForCategory");

    const { attrs, useIdentityHeaders } = await pickAttributesForLevels(
      "ATVPDKIKX0DER",
      "HAT",
      ["Essential"],
    );

    expect(useIdentityHeaders).toBe(true);
    expect(attrs.map((a) => a.generalLabel)).toEqual([...IDENTITY, "color"]);
    expect(spyAll).not.toHaveBeenCalled();
  });

  it("levels=[Key,Essential]: identity mode AND merges Key-only attrs", async () => {
    vi.spyOn(queries, "getMinimumNecessaryAttributes").mockResolvedValue([
      row({ id: -1, generalLabel: "SKU" }),
      row({ id: -1, generalLabel: "ASIN" }),
      row({ id: -1, generalLabel: "ItemName" }),
      row({ id: -1, generalLabel: "ProductType" }),
      row({ id: 10, generalLabel: "color", requirement: "Required" }),
    ]);
    vi.spyOn(queries, "getAttributesForCategory").mockResolvedValue([
      // Required attr already in Min+Necessary — must NOT be duplicated.
      row({ id: 10, generalLabel: "color", requirement: "Required" }),
      // Key-only attr — must be merged in.
      row({ id: 20, generalLabel: "key_attr", isKey: true }),
      // Recommended — not selected, must be excluded.
      row({ id: 30, generalLabel: "rec_attr", requirement: "Recommended" }),
      // Another key-only — checks alphabetical order on extras.
      row({ id: 40, generalLabel: "another_key", isKey: true }),
    ]);

    const { attrs, useIdentityHeaders } = await pickAttributesForLevels(
      "ATVPDKIKX0DER",
      "HAT",
      ["Key", "Essential"],
    );

    expect(useIdentityHeaders).toBe(true);
    const labels = attrs.map((a) => a.generalLabel);
    // Min+Necessary first (preserves canonical order), then key-only attrs
    // sorted alphabetically.
    expect(labels).toEqual([...IDENTITY, "color", "another_key", "key_attr"]);
    // Bug-regression assertion: the Key-only attr must be present.
    expect(labels).toContain("key_attr");
    // Required attr already covered must not appear twice.
    expect(labels.filter((l) => l === "color")).toHaveLength(1);
    // Non-selected levels must be excluded.
    expect(labels).not.toContain("rec_attr");
  });

  it("levels=[Required] only: non-identity mode, no SKU prepended", async () => {
    vi.spyOn(queries, "getAttributesForCategory").mockResolvedValue([
      row({ id: 1, generalLabel: "color", requirement: "Required" }),
      row({ id: 2, generalLabel: "size", requirement: "Recommended" }),
      row({ id: 3, generalLabel: "key_attr", isKey: true }),
    ]);
    const spyMin = vi.spyOn(queries, "getMinimumNecessaryAttributes");

    const { attrs, useIdentityHeaders } = await pickAttributesForLevels(
      "ATVPDKIKX0DER",
      "HAT",
      ["Required"],
    );

    expect(useIdentityHeaders).toBe(false);
    expect(attrs.map((a) => a.generalLabel)).toEqual(["color"]);
    // Min+Necessary path must not be taken when "Essential" is not selected.
    expect(spyMin).not.toHaveBeenCalled();
  });
});
