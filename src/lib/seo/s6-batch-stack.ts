// S6 batch stack (S6.2 Titles → S6.5 Backend): which steps show the stacked
// collapsible cards, and which card starts open.

/** The stack shows on every S6 step except the pre-batch config step. */
export function showBatchStack(step: string): boolean {
  return step !== "config";
}

/** A card starts open when it is the current batch step, or its batch is not approved yet. */
export function batchCardStartsOpen(step: string, batchKey: string, status: string): boolean {
  return step === `batch-${batchKey}` || status !== "approved";
}

// The non-batch S6 sections (S6.1 config, S6.6 audit, S6.7 A+ Q&A, S6.8 final) are stacked cards too.
export type S6SectionKey = "config" | "audit" | "aplus-qa" | "final" | "review" | "push";
export type S6SectionState = "done" | "current" | "pending" | "locked";

const S6_ORDER = ["config", "batch-titles", "batch-bullets", "batch-description", "batch-backend", "audit", "aplus-qa", "final", "review", "push"];

export function s6SectionState(
  key: S6SectionKey,
  ctx: { step: string; batchStatuses: Record<string, string>; isApproved: boolean; reviewApproved?: boolean; pushed?: boolean },
): S6SectionState {
  const { step, batchStatuses, isApproved, reviewApproved, pushed } = ctx;
  if (key === "config") return step === "config" ? "current" : "done";
  // S6.9 review & client sharing: the active step from the moment S6.8 is locked until a revision is approved
  if (key === "review") return !isApproved ? "locked" : reviewApproved ? "done" : "current";
  // S6.10 push to products: active once a revision is approved (an owner may still push without review)
  if (key === "push") return !isApproved ? "locked" : pushed ? "done" : reviewApproved ? "current" : "pending";
  // Audit, Q&A and final need every batch approved first
  if (!Object.values(batchStatuses).every((s) => s === "approved")) return "locked";
  // Locked = S6.8 finished, even though the page sits on the final step
  if (key === "final") return isApproved ? "done" : step === key ? "current" : "pending";
  if (step === key) return "current";
  return isApproved || S6_ORDER.indexOf(step) > S6_ORDER.indexOf(key) ? "done" : "pending";
}

/** Only the current section starts open — except S6.8–S6.10 once S6 is locked (content, review/sharing and push live there). */
export function s6SectionStartsOpen(key: S6SectionKey, state: S6SectionState, isApproved: boolean): boolean {
  if (state === "locked") return false;
  if (state === "current") return true;
  return (key === "final" || key === "review" || key === "push") && isApproved;
}

/** Card pill: a finished step (approved batch / done step) is LOCKED; anything else is UNLOCKED. */
export function lockState(status: string): "locked" | "unlocked" {
  return status === "approved" || status === "done" ? "locked" : "unlocked";
}
