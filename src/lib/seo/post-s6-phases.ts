// S7 Review & Share and S8 Push Content: shown as their own phases, but they live inside
// the S6 page (its review and push sections) and are derived — no phase columns of their own.

export type MenuStatus = "approved" | "active" | "completed" | "locked";

export const POST_S6 = [
  { id: "S7", key: "review", label: "Review & Share" },
  { id: "S8", key: "push", label: "Push Content" },
] as const;

/** Menu status of S7 / S8 from what the S6 page reports about its review / push sections. */
export function postS6Status(
  s6: MenuStatus,
  cfg: { currentStep?: string; completedSteps: Set<string>; isApproved?: boolean } | undefined,
  key: string,
): MenuStatus {
  if (s6 === "locked" || !cfg?.isApproved) return "locked";
  if (cfg.completedSteps.has(key)) return "approved";
  return cfg.currentStep === key ? "active" : "completed";
}

export type DotState = "done" | "active" | "pending";

/** Project-card dots: S7 done once a revision is approved (active while one is in review); S8 done once pushed. */
export function postS6Dots(p: { s6Approved: boolean; reviewApproved: boolean; inReview: boolean; pushed: boolean }): { S7: DotState; S8: DotState } {
  return {
    S7: p.reviewApproved ? "done" : p.inReview || p.s6Approved ? "active" : "pending",
    S8: p.pushed ? "done" : p.reviewApproved ? "active" : "pending",
  };
}

/**
 * Where a project really is. The stored current_phase stops at S6; once S6 is locked the
 * project is in S7 Review & Share, and once a revision is approved it is in S8 Push Content.
 */
export function effectivePhase(p: { current_phase: string; s6_approved_at?: string | null; review_approved?: boolean }): string {
  if (p.current_phase !== "S6" || !p.s6_approved_at) return p.current_phase;
  return p.review_approved ? "S8" : "S7";
}
