import { describe, it, expect } from "vitest";
import { AMAZON_PROHIBITED_WORDS, findProhibitedHits } from "@/lib/seo/prompts/amazon-prohibited-words";

describe("amazon-prohibited-words", () => {
  it("loads the full v5 §6.3 list (>= 180 entries)", () => {
    expect(AMAZON_PROHIBITED_WORDS.length).toBeGreaterThanOrEqual(180);
  });

  it("each entry has a string word and a string|null replacement", () => {
    for (const e of AMAZON_PROHIBITED_WORDS) {
      expect(typeof e.word).toBe("string");
      expect(e.word.length).toBeGreaterThan(0);
      expect(e.replacement === null || typeof e.replacement === "string").toBe(true);
    }
  });

  it("scanner finds 'cures' as standalone word but not inside 'cured ham'", () => {
    const a = findProhibitedHits("This product cures eczema.");
    expect(a.find((h) => h.word === "cures")).toBeDefined();

    // 'cured' is a different word — must NOT match 'cures' rule
    const b = findProhibitedHits("Made with cured ham.");
    expect(b.find((h) => h.word === "cures")).toBeUndefined();
  });

  it("scanner returns offset positions in original text", () => {
    const r = findProhibitedHits("This treats acne.");
    const hit = r.find((h) => h.word === "treats");
    expect(hit?.position).toBe(5);
  });
});
