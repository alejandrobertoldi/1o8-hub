import { describe, it, expect } from "vitest";
import {
  distributeKeywords,
  computeLeftoverKeywords,
  type S7Keyword,
} from "./keyword-distribution";

const kw = (text: string, location: string, tier = "T2"): S7Keyword => ({
  KeywordText: text,
  KeywordSearchVolume: 1000,
  KeywordPriorityTier: tier,
  KeywordPrimaryUseLocation: location,
});

describe("distributeKeywords", () => {
  it("routes keywords to their KeywordPrimaryUseLocation", () => {
    const kws = [
      kw("brand sleeve", "Title", "T1"),
      kw("knee sleeve compression", "Bullet Points", "T2"),
      kw("knee pain relief", "Description", "T3"),
      kw("knee sleve", "Backend Search Terms", "T4"),
    ];
    const d = distributeKeywords(kws);
    expect(d.title.map((k) => k.KeywordText)).toEqual(["brand sleeve"]);
    expect(d.bullets.map((k) => k.KeywordText)).toEqual(["knee sleeve compression"]);
    expect(d.description.map((k) => k.KeywordText)).toEqual(["knee pain relief"]);
    expect(d.backend.map((k) => k.KeywordText)).toEqual(["knee sleve"]);
  });

  it("falls back to tier mapping when location is missing", () => {
    const kws: S7Keyword[] = [
      { ...kw("a", "", "T1"), KeywordPrimaryUseLocation: "" },
      { ...kw("b", "", "T2"), KeywordPrimaryUseLocation: "" },
      { ...kw("c", "", "T3"), KeywordPrimaryUseLocation: "" },
      { ...kw("d", "", "T4"), KeywordPrimaryUseLocation: "" },
    ];
    const d = distributeKeywords(kws);
    expect(d.title.length).toBe(1);
    expect(d.bullets.length).toBe(1);
    expect(d.description.length).toBe(1);
    expect(d.backend.length).toBe(1);
  });

  it("excludes negative keywords from every section", () => {
    const kws: S7Keyword[] = [
      { ...kw("legit", "Title", "T1") },
      { ...kw("bad term", "Title", "T1"), KeywordIsNegative: true },
    ];
    const d = distributeKeywords(kws);
    expect(d.title.length).toBe(1);
    expect(d.title[0].KeywordText).toBe("legit");
  });

  it("dedupes by KeywordText (case-insensitive)", () => {
    const kws = [
      kw("knee sleeve", "Title", "T1"),
      kw("Knee Sleeve", "Bullet Points", "T2"),
    ];
    const d = distributeKeywords(kws);
    // First wins; the duplicate is dropped, not placed elsewhere
    expect(d.title.length + d.bullets.length).toBe(1);
  });

  it("guarantees no keyword appears in more than one section", () => {
    const kws = [
      kw("x", "Title", "T1"),
      kw("y", "Bullet Points", "T2"),
      kw("z", "Description", "T3"),
      kw("w", "Backend Search Terms", "T4"),
    ];
    const d = distributeKeywords(kws);
    const all = [...d.title, ...d.bullets, ...d.description, ...d.backend];
    const texts = all.map((k) => k.KeywordText.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("computeLeftoverKeywords", () => {
  it("returns keywords not present in any string field of currentRows", () => {
    const allowed = [
      kw("knee sleeve", "Title", "T1"),
      kw("compression support", "Bullet Points", "T2"),
      kw("calf protection", "Bullet Points", "T2"),
    ];
    const currentRows = [
      {
        ASIN: "A1",
        Title: "Brand Knee Sleeve for Sports",
        DetailedBulletPoint_1: "Provides compression support all day",
        DetailedBulletPoint_2: "Stays in place during runs",
      },
    ];
    const leftovers = computeLeftoverKeywords(allowed, currentRows);
    expect(leftovers.map((k) => k.KeywordText)).toEqual(["calf protection"]);
  });

  it("returns [] when all keywords are present", () => {
    const allowed = [kw("knee sleeve", "Title", "T1")];
    const currentRows = [{ ASIN: "A1", Title: "Brand Knee Sleeve" }];
    expect(computeLeftoverKeywords(allowed, currentRows)).toEqual([]);
  });

  it("matching is case-insensitive", () => {
    const allowed = [kw("KNEE SLEEVE", "Title", "T1")];
    const currentRows = [{ ASIN: "A1", Title: "knee sleeve" }];
    expect(computeLeftoverKeywords(allowed, currentRows)).toEqual([]);
  });

  it("ignores the ASIN field", () => {
    const allowed = [kw("A1", "Title", "T1")];
    const currentRows = [{ ASIN: "A1", Title: "Brand Title" }];
    // Should NOT match because we skip the ASIN field
    expect(computeLeftoverKeywords(allowed, currentRows).length).toBe(1);
  });
});
