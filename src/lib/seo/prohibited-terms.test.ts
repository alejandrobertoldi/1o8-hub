import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { COMPLIANCE, findRestrictedWords } from "@/lib/seo-pipeline-config";

it("one prohibited list covers medical, guarantee, superlative and promotional terms", () => {
  for (const t of ["medicine", "cure", "FDA approved", "guaranteed", "best", "#1", "free shipping", "sale", "% off", "click here"]) {
    expect(COMPLIANCE.restricted_words).toContain(t);
  }
  expect(COMPLIANCE.restricted_words).not.toContain("off"); // bare "off" flagged "off-leash"
});

it("S6's compliance check reads that same list (no second hard-coded copy)", () => {
  const src = readFileSync("src/components/seo/phases/seo-phase.tsx", "utf8");
  expect(src).toContain("const RESTRICTED_WORDS: readonly string[] = COMPLIANCE.restricted_words;");
  expect(src).not.toMatch(/const RESTRICTED_WORDS = \[/);
});

it("matches whole words only", () => {
  expect(findRestrictedWords("Our best kit")).toEqual(["best"]);
  expect(findRestrictedWords("A bestseller sold wholesale")).toEqual([]);
  expect(findRestrictedWords("Save 20% off today")).toContain("% off");
});
