import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as queries from "./category-meta-queries";
import { getMinimumNecessaryAttributes } from "./category-meta-queries";

const ID_COLS = ["SKU", "ASIN", "ItemName", "ProductType"];

const baseRow = (over: Partial<{
  generalLabel: string;
  requirement: string | null;
  isEssential: boolean;
  isKey: boolean;
}> = {}) => ({
  id: 1,
  generalLabel: over.generalLabel ?? "x",
  referenceGroup: "",
  description: null,
  requirement: over.requirement ?? null,
  validValues: null,
  example: null,
  isEssential: over.isEssential ?? false,
  isKey: over.isKey ?? false,
});

describe("getMinimumNecessaryAttributes", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns empty (except identity cols) when no schema attrs match", async () => {
    vi.spyOn(queries, "getAttributesForCategory").mockResolvedValue([]);
    const out = await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT");
    expect(out.map((r) => r.generalLabel)).toEqual(ID_COLS);
  });

  it("includes Required, Conditionally Required, isEssential and excludes others", async () => {
    vi.spyOn(queries, "getAttributesForCategory").mockResolvedValue([
      baseRow({ generalLabel: "color",         requirement: "Required" }),
      baseRow({ generalLabel: "size",          requirement: "Conditionally Required" }),
      baseRow({ generalLabel: "bullet_1",      requirement: null, isEssential: true }),
      baseRow({ generalLabel: "ignored_recom", requirement: "Recommended" }),
      baseRow({ generalLabel: "ignored_opt",   requirement: "Optional" }),
    ]);
    const labels = (await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT"))
      .map((r) => r.generalLabel);
    expect(labels).toEqual([...ID_COLS, "color", "size", "bullet_1"]);
  });

  it("orders Required → Cond.Required → Essential-only, alpha within bucket", async () => {
    vi.spyOn(queries, "getAttributesForCategory").mockResolvedValue([
      baseRow({ generalLabel: "z_req",   requirement: "Required" }),
      baseRow({ generalLabel: "a_req",   requirement: "Required" }),
      baseRow({ generalLabel: "z_cond",  requirement: "Conditionally Required" }),
      baseRow({ generalLabel: "a_cond",  requirement: "Conditionally Required" }),
      baseRow({ generalLabel: "z_ess",   isEssential: true }),
      baseRow({ generalLabel: "a_ess",   isEssential: true }),
    ]);
    const labels = (await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT"))
      .map((r) => r.generalLabel);
    expect(labels).toEqual([...ID_COLS, "a_req", "z_req", "a_cond", "z_cond", "a_ess", "z_ess"]);
  });

  it("de-duplicates an attribute that is both Required and isEssential", async () => {
    vi.spyOn(queries, "getAttributesForCategory").mockResolvedValue([
      baseRow({ generalLabel: "color", requirement: "Required", isEssential: true }),
    ]);
    const labels = (await getMinimumNecessaryAttributes("ATVPDKIKX0DER", "HAT"))
      .map((r) => r.generalLabel);
    expect(labels.filter((l) => l === "color")).toHaveLength(1);
  });
});
