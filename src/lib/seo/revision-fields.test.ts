import { describe, it, expect } from "vitest";
import { changedKeys, currentValue, FIELD_LABELS, overlayProduct, PDP_HIDDEN_KEYS, snapshotFields } from "./revision-fields";
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";

const product = { itemName: "Old title", itemHighlight: null, genericKeywords: "old kw", contentSeo: { DetailedBulletPoint1: "old b1", KeyFeature1: "kf" }, extra: 1 };

describe("revision fields", () => {
  it("snapshot keeps only FIELD_MAP keys with non-empty text, trimmed", () => {
    expect(snapshotFields({ Title: " New ", DetailedBulletPoint_1: "b1", _aplusQA: [1], Title_CharLength: 3, ProductDescription: "  " })).toEqual({
      Title: "New", DetailedBulletPoint_1: "b1",
    });
    expect(snapshotFields(null)).toEqual({});
  });
  it("overlay writes core + contentSeo targets and leaves everything else alone", () => {
    const out = overlayProduct(product, { Title: "New title", DetailedBulletPoint_1: "new b1", BackendSearchTerms: "new kw" });
    expect(out.itemName).toBe("New title");
    expect(out.genericKeywords).toBe("new kw");
    expect(out.contentSeo).toEqual({ DetailedBulletPoint1: "new b1", KeyFeature1: "kf" });
    expect(out.extra).toBe(1);
    expect(product.itemName).toBe("Old title"); // not mutated
  });
  it("currentValue and changedKeys read through FIELD_MAP", () => {
    expect(currentValue(product, "DetailedBulletPoint_1")).toBe("old b1");
    expect(currentValue(product, "Title")).toBe("Old title");
    expect(changedKeys(product, { Title: "Old title", DetailedBulletPoint_1: "new b1" })).toEqual(["DetailedBulletPoint_1"]);
  });
  it("every FIELD_MAP key has a label; hidden keys are backend + content bullets", () => {
    for (const k of Object.keys(FIELD_MAP)) expect(FIELD_LABELS[k]).toBeTruthy();
    expect(PDP_HIDDEN_KEYS).toContain("BackendSearchTerms");
    expect(PDP_HIDDEN_KEYS).toContain("ContentBulletPoint_1");
  });
});
