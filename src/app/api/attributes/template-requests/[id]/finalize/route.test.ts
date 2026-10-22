// @vitest-environment node
//
// Smoke test for finalize/route.ts row-routing behavior. Per the Task 7 plan,
// we DO NOT spin up the full route handler — Drive/Sheets/DB mocks would dwarf
// the surface under test. Instead we assert the classifier helper used by the
// route (resolveRowIdentity) handles the four canonical buckets, and we assert
// pickAttributesForLevels emits identity cols in slots 0..3 so the route's
// col-index assumption is sound.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({ user: { email: "t@x", role: "editor" } })),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({
  attributeTemplateRequests: {},
  categoryDefinitions: {},
  driveFolders: {},
  master: {},
}));
vi.mock("@/lib/drive-client", () => ({ driveClient: {} }));
vi.mock("@/lib/sheets-client", () => ({ sheetsClient: {} }));
vi.mock("@/lib/template-sheet-builder", () => ({
  buildCreateRequests: () => ({ title: "", requests: [] }),
}));
vi.mock("@/lib/product-mapper", () => ({
  getProductFieldValue: () => "",
  setProductFieldValue: () => ({}),
}));
vi.mock("@/lib/constants", () => ({ CLIENT_NAMES: {} }));

import { resolveRowIdentity } from "@/lib/onboarding/identity-resolver";
import * as queries from "@/lib/category-meta-queries";
import { pickAttributesForLevels } from "@/lib/template-attributes";

describe("finalize row routing (smoke)", () => {
  it("classifies fixture rows into update / insert / reject buckets", () => {
    const candidates = [
      { id: "p1", sku: "EXISTING-SKU", asin: "B00ABC" },
      { id: "p2", sku: "ONLY-SKU",     asin: null  },
    ];
    // ASIN match → update (sku irrelevant)
    expect(resolveRowIdentity({ sku: "anything", asin: "B00ABC" }, candidates).action).toBe("update");
    // SKU match within client, no ASIN → update
    expect(resolveRowIdentity({ sku: "ONLY-SKU", asin: "" }, candidates).action).toBe("update");
    // No SKU and no ASIN match → reject
    expect(resolveRowIdentity({ sku: "", asin: "" }, candidates).action).toBe("reject");
    // No catalog hit but SKU present → insert
    expect(resolveRowIdentity({ sku: "BRANDNEW", asin: "" }, candidates).action).toBe("insert");
  });

  it("SKU-matched row with new ASIN signals backfill", () => {
    const candidates = [{ id: "p1", sku: "SKU1", asin: null }];
    const r = resolveRowIdentity({ sku: "SKU1", asin: "NEW-ASIN" }, candidates);
    expect(r.action).toBe("update");
    if (r.action === "update") {
      expect(r.productId).toBe("p1");
      expect(r.backfillAsin).toBe(true);
    }
  });
});

describe("finalize column layout (smoke)", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("Min+Necessary mode places SKU/ASIN/ItemName/ProductType at slots 0..3", async () => {
    vi.spyOn(queries, "getMinimumNecessaryAttributes").mockResolvedValue([
      {
        id: -1, generalLabel: "SKU", referenceGroup: "", requirement: null,
        validValues: null, description: null, example: null, isKey: false, isEssential: false,
      },
      {
        id: -1, generalLabel: "ASIN", referenceGroup: "", requirement: null,
        validValues: null, description: null, example: null, isKey: false, isEssential: false,
      },
      {
        id: -1, generalLabel: "ItemName", referenceGroup: "", requirement: null,
        validValues: null, description: null, example: null, isKey: false, isEssential: false,
      },
      {
        id: -1, generalLabel: "ProductType", referenceGroup: "", requirement: null,
        validValues: null, description: null, example: null, isKey: false, isEssential: false,
      },
      {
        id: 7, generalLabel: "color", referenceGroup: "general", requirement: "Required",
        validValues: null, description: null, example: null, isKey: false, isEssential: false,
      },
    ]);

    const { attrs, useIdentityHeaders } = await pickAttributesForLevels(
      "ATVPDKIKX0DER", "HAT", ["Essential"],
    );
    expect(useIdentityHeaders).toBe(true);
    expect(attrs.slice(0, 4).map((a) => a.generalLabel)).toEqual([
      "SKU", "ASIN", "ItemName", "ProductType",
    ]);
    // col 4+ are filtered attrs in canonical order
    expect(attrs[4]?.generalLabel).toBe("color");
  });
});
