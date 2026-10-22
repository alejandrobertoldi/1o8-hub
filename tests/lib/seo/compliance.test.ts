import { describe, it, expect } from "vitest";
import { scanCompliance, mergeBypass } from "@/lib/seo/compliance";

describe("compliance scanner", () => {
  it("flags an Amazon prohibited word with replacement", () => {
    const r = scanCompliance({
      field: "title",
      text: "This product treats inflammation",
      brandWordsToAvoid: [],
    });
    expect(r).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title", word: "treats", auto_corrected_to: "supports" }),
      ])
    );
  });

  it("flags a brand-only word with no auto-correct", () => {
    const r = scanCompliance({
      field: "bullets.detailed.0",
      text: "Made with proprietary blend",
      brandWordsToAvoid: ["proprietary"],
    });
    expect(r).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "bullets.detailed.0", word: "proprietary", type: "brand_words_to_avoid", auto_corrected_to: undefined }),
      ])
    );
  });

  it("Amazon §6 wins on overlap with brand-allowed words (cannot un-ban with brand list)", () => {
    // Brand says "treats" is fine — Amazon still blocks it.
    const r = scanCompliance({
      field: "title",
      text: "treats sensitive skin",
      brandWordsToAvoid: [],
      brandAllowList: ["treats"], // even if explicitly allowed
    });
    expect(r.find((v) => v.word === "treats")).toBeDefined();
  });

  it("mergeBypass preserves bypassed flag on existing violations", () => {
    const fresh = [{ field: "title", word: "treats", type: "amazon_prohibited" as const, bypassed: false }];
    const prior = [{ field: "title", word: "treats", type: "amazon_prohibited" as const, bypassed: true }];
    const merged = mergeBypass(fresh, prior);
    expect(merged[0].bypassed).toBe(true);
  });

  it("dedupes the same Amazon prohibited word repeated in one field", () => {
    const r = scanCompliance({
      field: "title",
      text: "treats and treats again",
      brandWordsToAvoid: [],
    });
    const treatsHits = r.filter((v) => v.word.toLowerCase() === "treats");
    expect(treatsHits.length).toBe(1);
  });

  it("mergeBypass leaves bypassed:false when prior has no matching violation", () => {
    const fresh = [
      { field: "title", word: "treats", type: "amazon_prohibited" as const, bypassed: false },
    ];
    const prior = [
      { field: "bullets.0", word: "something_else", type: "amazon_prohibited" as const, bypassed: true },
    ];
    const merged = mergeBypass(fresh, prior);
    expect(merged[0].bypassed).toBe(false);
  });
});
