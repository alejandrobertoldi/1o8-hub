import { describe, it, expect } from "vitest";
import { postS6Dots, postS6Status } from "./post-s6-phases";

describe("postS6Status", () => {
  const cfg = (o: Partial<{ currentStep: string; completed: string[]; isApproved: boolean }>) =>
    ({ currentStep: o.currentStep, completedSteps: new Set(o.completed ?? []), isApproved: o.isApproved });
  it("locked until S6 is approved (or S6 itself is locked / not mounted)", () => {
    expect(postS6Status("active", cfg({ isApproved: false }), "review")).toBe("locked");
    expect(postS6Status("locked", cfg({ isApproved: true }), "review")).toBe("locked");
    expect(postS6Status("approved", undefined, "review")).toBe("locked");
  });
  it("approved when done, active when it's S6's current step, otherwise waiting", () => {
    expect(postS6Status("approved", cfg({ isApproved: true, completed: ["review"] }), "review")).toBe("approved");
    expect(postS6Status("approved", cfg({ isApproved: true, currentStep: "push" }), "push")).toBe("active");
    expect(postS6Status("approved", cfg({ isApproved: true, currentStep: "review" }), "push")).toBe("completed");
  });
});

describe("postS6Dots", () => {
  it("S7 active once S6 is locked or a revision is in review, done when approved; S8 follows", () => {
    expect(postS6Dots({ s6Approved: false, reviewApproved: false, inReview: false, pushed: false })).toEqual({ S7: "pending", S8: "pending" });
    expect(postS6Dots({ s6Approved: true, reviewApproved: false, inReview: true, pushed: false })).toEqual({ S7: "active", S8: "pending" });
    expect(postS6Dots({ s6Approved: true, reviewApproved: true, inReview: false, pushed: false })).toEqual({ S7: "done", S8: "active" });
    expect(postS6Dots({ s6Approved: true, reviewApproved: true, inReview: false, pushed: true })).toEqual({ S7: "done", S8: "done" });
  });
});

import { effectivePhase } from "./post-s6-phases";
describe("effectivePhase", () => {
  it("S6 locked → S7; approved revision → S8; otherwise the stored phase", () => {
    expect(effectivePhase({ current_phase: "S3" })).toBe("S3");
    expect(effectivePhase({ current_phase: "S6", s6_approved_at: null })).toBe("S6");
    expect(effectivePhase({ current_phase: "S6", s6_approved_at: "2026-10-01", review_approved: false })).toBe("S7");
    expect(effectivePhase({ current_phase: "S6", s6_approved_at: "2026-10-01", review_approved: true })).toBe("S8");
  });
});
