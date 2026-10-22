import { expect, it } from "vitest";
import { openAfterApproval } from "./phase-open";

it("approving a phase closes its card and opens the next one", () => {
  expect([...openAfterApproval(new Set(["S4"]), "S4", "S5")]).toEqual(["S5"]);
  expect([...openAfterApproval(new Set(["S1", "S4"]), "S4", "S5")].sort()).toEqual(["S1", "S5"]);
});
it("S6 sent for review keeps the S6 card open (S7/S8 live inside it)", () => {
  expect([...openAfterApproval(new Set(["S6"]), "S6", "S7")]).toEqual(["S6"]);
});
