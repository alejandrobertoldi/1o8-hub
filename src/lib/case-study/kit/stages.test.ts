import { describe, it, expect } from "vitest";
import { canTransition, stageAfterEdit } from "./stages";

describe("stages", () => {
  it.each([
    ["drafting", "in_review", true], ["drafting", "approved", false], ["drafting", "sent", false],
    ["in_review", "drafting", true], ["in_review", "approved", true], ["in_review", "sent", false],
    ["approved", "drafting", true], ["approved", "sent", true], ["approved", "in_review", false],
    ["sent", "drafting", true], ["sent", "approved", false],
  ] as const)("%s → %s = %s", (a, b, ok) => expect(canTransition(a, b)).toBe(ok));
  it("edits drop approved/sent to drafting only", () => {
    expect(stageAfterEdit("approved")).toBe("drafting");
    expect(stageAfterEdit("sent")).toBe("drafting");
    expect(stageAfterEdit("in_review")).toBe("in_review");
    expect(stageAfterEdit("drafting")).toBe("drafting");
  });
});
