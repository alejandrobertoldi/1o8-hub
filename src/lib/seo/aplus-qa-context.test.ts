import { expect, it } from "vitest";
import { productTextLines } from "./aplus-qa-context";

it("sends the title, all five bullets and the full description", () => {
  const long = "x".repeat(1100);
  const lines = productTextLines({
    Title: "T", DetailedBulletPoint_1: "a", DetailedBulletPoint_2: "b", DetailedBulletPoint_3: "c",
    DetailedBulletPoint_4: "d", DetailedBulletPoint_5: "e", ProductDescription: long,
  });
  expect(lines).toEqual(["Title: T", "B1: a", "B2: b", "B3: c", "B4: d", "B5: e", `Description: ${long}`]);
});
it("skips empty fields", () => {
  expect(productTextLines({ Title: "T", DetailedBulletPoint_4: "  " })).toEqual(["Title: T"]);
});

import { readFileSync } from "node:fs";
it("brand guidelines reach S6.7 untrimmed (no cut on the page or in the route)", () => {
  const route = readFileSync("src/app/api/seo/claude/aplus-qa/route.ts", "utf8");
  expect(route).toContain("Brand guidelines: ${guidelines}`");
  expect(route).not.toMatch(/guidelines\.substring/);
  const page = readFileSync("src/components/seo/phases/seo-phase.tsx", "utf8");
  expect(page).not.toMatch(/guidelines\?\.substring\(0,\s*400\)/);
});
