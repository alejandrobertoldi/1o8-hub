import { describe, it, expect } from "vitest";
import { normalizePhrase, listingTextFromBqRow, matchListingKeywords, type ListingText } from "./listing-match";

const text: ListingText = {
  title: "ReadyRESCUE Dog First-Aid Kit, 100 pcs",
  bullets: "Activated charcoal for dogs included. Great for camping.",
  description: "A travel first aid kit for your pet.",
  backend: "pet emergency kit kittens",
};

describe("normalizePhrase", () => {
  it("lowercases, turns punctuation into spaces, collapses", () => {
    expect(normalizePhrase("  Dog First-Aid Kit, 100 pcs ")).toBe("dog first aid kit 100 pcs");
  });
});

describe("listingTextFromBqRow", () => {
  it("concatenates bullets 1-5 and GenericKeyword1-5, tolerating nulls", () => {
    const t = listingTextFromBqRow({
      ItemName: "T", DetailedBulletPoint1: "b1", DetailedBulletPoint2: null, DetailedBulletPoint5: "b5",
      ProductDescription: "D", GenericKeyword1: "k1", GenericKeyword3: "k3",
    });
    expect(t).toEqual({ title: "T", bullets: "b1 b5", description: "D", backend: "k1 k3" });
  });
});

describe("matchListingKeywords", () => {
  it("matches whole phrases across fields with field pills", () => {
    const out = matchListingKeywords(
      [{ text: "dog first aid kit", tier: "T1" }, { text: "Activated Charcoal", tier: "T2" }, { text: "first aid kit", tier: "T2" }],
      text,
    );
    expect(out).toEqual([
      { keyword: "dog first aid kit", tier: "T1", fields: ["T"] },
      { keyword: "activated charcoal", tier: "T2", fields: ["B"] },
      { keyword: "first aid kit", tier: "T2", fields: ["T", "D"] },
    ]);
  });
  it("does not match inside a longer word (Review Focus 2)", () => {
    // T1 so the O4 single-word filter keeps them and this still tests word boundaries.
    expect(matchListingKeywords([{ text: "kitten", tier: "T1" }, { text: "dog", tier: "T1" }, { text: "kit", tier: "T1" }], {
      title: "dogs", bullets: "", description: "", backend: "kittens",
    })).toEqual([]);
  });
  it("skips empty and ASIN-shaped keywords, dedupes", () => {
    expect(matchListingKeywords([{ text: "  ", tier: "T1" }, { text: "B0CLMBGMS6", tier: "T1" }, { text: "pet kit", tier: "T3" }, { text: "PET KIT", tier: "T1" }], {
      title: "b0clmbgms6 pet kit", bullets: "", description: "", backend: "",
    })).toEqual([{ keyword: "pet kit", tier: "T3", fields: ["T"] }]);
  });
  it("keys a hyphenated keyword by normalizePhrase so it lines up with its unpunctuated search term (M1 fix)", () => {
    const out = matchListingKeywords([{ text: "first-aid kit", tier: "T1" }], text);
    expect(out).toEqual([{ keyword: "first aid kit", tier: "T1", fields: ["T", "D"] }]);
  });
  it("O4: single-word keywords are tracked only at T1; phrases of 2+ words at every tier", () => {
    const out = matchListingKeywords(
      [{ text: "tequila", tier: "T1" }, { text: "alcohol", tier: "T4" }, { text: "spirits", tier: "T2" }, { text: "zero-proof", tier: "T2" }, { text: "zero proof tequila", tier: "T4" }, { text: "gin", tier: null }],
      { title: "Zero Proof Tequila spirits", bullets: "no alcohol gin", description: "", backend: "" },
    );
    expect(out.map((k) => k.keyword)).toEqual(["tequila", "zero proof", "zero proof tequila"]);
  });
});
