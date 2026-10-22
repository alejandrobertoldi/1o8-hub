import { MONTHLY_REPORT_FINAL_REVIEWER_EMAIL } from "@/lib/constants";
import type { MonthlyReportStatus } from "./report-store";

export type ReviewAction = "approve" | "send_back";

export type ReviewPermissions = {
  pm: boolean;
  am: boolean;
  jake: boolean;
  override: boolean;
};

export function namesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const left = norm(a);
  const right = norm(b);
  return left.length > 0 && left === right;
}

export function emailsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function isFinalReviewerEmail(email: string | null | undefined): boolean {
  return emailsMatch(email, MONTHLY_REPORT_FINAL_REVIEWER_EMAIL);
}

export function reviewPermissions(opts: {
  userName: string | null | undefined;
  userEmail?: string | null;
  projectManager: string | null;
  accountManager: string | null;
  canOverride: boolean;
}): ReviewPermissions {
  return {
    pm: namesMatch(opts.userName, opts.projectManager),
    am: namesMatch(opts.userName, opts.accountManager),
    jake: isFinalReviewerEmail(opts.userEmail),
    override: opts.canOverride,
  };
}

type Stage = "pm" | "am" | "jake";

function stageForStatus(status: MonthlyReportStatus): Stage | null {
  if (status === "generated" || status === "pm_review") return "pm";
  if (status === "am_review") return "am";
  if (status === "jake_review") return "jake";
  return null;
}

function canAct(stage: Stage, perms: ReviewPermissions): boolean {
  if (stage === "pm") return perms.pm;
  if (stage === "am") return perms.am;
  if (stage === "jake") return perms.jake;
  return false;
}

export function nextReviewStatus(
  status: MonthlyReportStatus,
  action: ReviewAction,
  perms: ReviewPermissions,
): { ok: true; status: MonthlyReportStatus } | { ok: false; statusCode: 403 | 409; error: string } {
  const stage = stageForStatus(status);

  if (!stage) {
    return { ok: false, statusCode: 409, error: `Report is ${status}, not awaiting review` };
  }

  if (!canAct(stage, perms)) {
    const error =
      stage === "pm" ? "Waiting for PM review"
        : stage === "am" ? "Waiting for AM review"
          : "Waiting for CEO review";
    return { ok: false, statusCode: 403, error };
  }

  if (action === "send_back") {
    if (stage === "jake") return { ok: true, status: "am_review" };
    return { ok: true, status: "generated" };
  }
  if (stage === "pm") return { ok: true, status: "am_review" };
  if (stage === "am") return { ok: true, status: "jake_review" };
  return { ok: true, status: "ready" };
}

export function reviewStatusLabel(status: string): string {
  if (status === "generated" || status === "pm_review") return "PM review";
  if (status === "am_review") return "AM review";
  if (status === "jake_review") return "CEO review";
  if (status === "ready") return "Ready to send";
  if (status === "sent") return "Sent";
  if (status === "blocked") return "Blocked";
  if (status === "failed") return "Send failed";
  return status;
}

export function isWaitingForReviewer(status: string, perms: ReviewPermissions): boolean {
  if (status === "generated" || status === "pm_review") return perms.pm;
  if (status === "am_review") return perms.am;
  if (status === "jake_review") return perms.jake;
  return false;
}

/** CEO retries after a failed auto-send. Ready is a crash-recovery send. */
export function canSend(status: string, perms: ReviewPermissions): boolean {
  if (status !== "ready" && status !== "failed") return false;
  return perms.jake;
}

/** AM, CEO, or admin can write client-facing section notes. PMs cannot. */
export function canComment(perms: ReviewPermissions): boolean {
  return perms.am || perms.jake || perms.override;
}

export function commenterRole(perms: ReviewPermissions): "am" | "ceo" | "admin" | null {
  if (perms.jake) return "ceo";
  if (perms.am) return "am";
  if (perms.override) return "admin";
  return null;
}

export type PipelineStepId = "generated" | "pm" | "am" | "jake" | "sent";
export type PipelineStepState = "complete" | "current" | "upcoming" | "error";

export const REVIEW_PIPELINE: Array<{ id: PipelineStepId; label: string }> = [
  { id: "generated", label: "Generated" },
  { id: "pm", label: "PM" },
  { id: "am", label: "AM" },
  { id: "jake", label: "CEO" },
  { id: "sent", label: "Sent" },
];

/** Which pipeline index is current (0-based). -1 = not started. */
export function pipelineCurrentIndex(status: string | undefined): number {
  switch (status) {
    case "generated":
    case "pm_review":
      return 1;
    case "am_review":
      return 2;
    case "jake_review":
      return 3;
    case "ready":
    case "failed":
      return 4;
    case "sent":
      return 5;
    default:
      return -1;
  }
}

export function pipelineSteps(status: string | undefined): Array<{
  id: PipelineStepId;
  label: string;
  state: PipelineStepState;
}> {
  if (status === "blocked") {
    return REVIEW_PIPELINE.map((step, i) => ({
      ...step,
      state: i === 0 ? "error" : "upcoming",
    }));
  }
  const current = pipelineCurrentIndex(status);
  return REVIEW_PIPELINE.map((step, i) => {
    if (current < 0) return { ...step, state: "upcoming" as const };
    if (status === "failed" && step.id === "sent") {
      return { ...step, state: "error" as const };
    }
    if (i < current) return { ...step, state: "complete" as const };
    if (i === current) return { ...step, state: "current" as const };
    return { ...step, state: "upcoming" as const };
  });
}
