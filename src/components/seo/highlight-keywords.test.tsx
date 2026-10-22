import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { highlightKeywords, keywordTierMap } from "./highlight-keywords";

describe("keywordTierMap", () => {
  it("lowercases, reads T-tiers, skips 1-char and duplicate keywords", () => {
    const m = keywordTierMap([
      { KeywordText: "Charcoal for Dogs", KeywordPriorityTier: "T2" },
      { KeywordText: "charcoal for dogs", KeywordPriorityTier: "T4" },
      { KeywordText: "x" },
      { KeywordText: "dog first aid kit", KeywordTier: 3 },
    ]);
    expect([...m.entries()]).toEqual([["charcoal for dogs", 2], ["dog first aid kit", 3]]);
  });
});

describe("highlightKeywords", () => {
  it("marks whole-word keyword matches, longest first, case-insensitive", () => {
    const m = new Map([["charcoal", 4], ["activated charcoal for dogs", 1]]);
    const { container } = render(<p>{highlightKeywords("ReadyRESCUE Activated Charcoal for Dogs works; charcoals no.", m)}</p>);
    const marks = [...container.querySelectorAll("mark")].map((x) => x.textContent);
    expect(marks).toEqual(["Activated Charcoal for Dogs"]);
  });
});

describe("highlightKeywords light", () => {
  it("uses darker red on white backgrounds", () => {
    const { container } = render(<p>{highlightKeywords("charcoal", new Map([["charcoal", 1]]), undefined, true)}</p>);
    expect(container.querySelector("mark")?.className).toContain("text-red-600");
  });
});
