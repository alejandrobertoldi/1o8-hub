export type Stage = "drafting" | "in_review" | "approved" | "sent";
export const STAGES: readonly Stage[] = ["drafting", "in_review", "approved", "sent"];
export const STAGE_LABELS: Record<Stage | "not_started", string> = {
  not_started: "Not started", drafting: "Drafting", in_review: "In review", approved: "Approved", sent: "Sent",
};
const ALLOWED: Record<Stage, Stage[]> = {
  drafting: ["in_review"], in_review: ["drafting", "approved"], approved: ["drafting", "sent"], sent: ["drafting"],
};
export function canTransition(from: Stage, to: Stage): boolean { return ALLOWED[from].includes(to); }
export function stageAfterEdit(s: Stage): Stage { return s === "approved" || s === "sent" ? "drafting" : s; }
