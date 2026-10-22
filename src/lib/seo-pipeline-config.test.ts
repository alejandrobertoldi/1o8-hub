import { describe, it, expect } from "vitest";
import { CHAR_LIMITS, validateCharLimit } from "./seo-pipeline-config";

describe("CHAR_LIMITS — Amazon 75/125 mandate", () => {
  it("title max is 75 with no 190 floor", () => {
    expect(CHAR_LIMITS.title.max).toBe(75);
    expect(CHAR_LIMITS.title.min).toBe(1);
  });
  it("item_highlight is 1-125 chars", () => {
    expect(CHAR_LIMITS.item_highlight).toEqual({ min: 1, max: 125, unit: "chars" });
  });
  it("validateCharLimit passes a 75-char title and fails at 76", () => {
    expect(validateCharLimit("a".repeat(75), "title").valid).toBe(true);
    expect(validateCharLimit("a".repeat(76), "title").valid).toBe(false);
  });
  it("validateCharLimit passes a 125-char item_highlight and fails at 126", () => {
    expect(validateCharLimit("a".repeat(125), "item_highlight").valid).toBe(true);
    expect(validateCharLimit("a".repeat(126), "item_highlight").valid).toBe(false);
  });
});
