import { expect, it } from "vitest";
import { priorUsageCols, usedInPrior } from "./keyword-usage";

it("every table shows the other steps in one fixed order: Title · Item Highlight · Bullets · Description · Backend", () => {
  expect(priorUsageCols("titles")).toEqual(["Bullets", "ProductDescription", "BackendSearchTerms"]);
  expect(priorUsageCols("bullets")).toEqual(["Title", "ItemHighlight", "ProductDescription", "BackendSearchTerms"]);
  expect(priorUsageCols("description")).toEqual(["Title", "ItemHighlight", "Bullets", "BackendSearchTerms"]);
  expect(priorUsageCols("backend")).toEqual(["Title", "ItemHighlight", "Bullets", "ProductDescription"]);
});
it("usage is read from the live text: Bullets = any BP1–BP5; other columns by field", () => {
  const rows = [{ DetailedBulletPoint_1: "X", BackendSearchTerms: "dog charcoal" }, { DetailedBulletPoint_4: "Activated CHARCOAL for dogs" }];
  expect(usedInPrior(rows, "Bullets", "activated charcoal")).toBe(true);
  expect(usedInPrior(rows, "Bullets", "pet poison")).toBe(false);
  expect(usedInPrior(rows, "BackendSearchTerms", "dog charcoal")).toBe(true);
  expect(usedInPrior([{ ItemHighlight: "ready rescue" }], "ItemHighlight", "ready rescue")).toBe(true);
});

import { willBeUsed, pendingForAll } from "./keyword-usage";
it("first-column tick shows the text after pending changes", () => {
  expect(willBeUsed(true, false)).toBe(true);   // used, untouched → ticked
  expect(willBeUsed(true, true)).toBe(false);   // used, marked for removal → unticked
  expect(willBeUsed(false, false)).toBe(false); // unused → unticked
  expect(willBeUsed(false, true)).toBe(true);   // unused, marked to add → ticked
});
it("tick all = add every unused, keep every used; untick all = remove every used, drop pending adds", () => {
  const rows = [{ key: "a", used: true }, { key: "b", used: false }];
  expect(pendingForAll(rows, true)).toEqual({ add: ["b"], remove: [], clearAdd: [], clearRemove: ["a"] });
  expect(pendingForAll(rows, false)).toEqual({ add: [], remove: ["a"], clearAdd: ["b"], clearRemove: [] });
});
