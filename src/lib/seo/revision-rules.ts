/** SEO review revision rules (spec §3). Pure — no DB, no session. */
import { hasSuperPowers } from "@/lib/roles";

export const REVISION_STATUSES = ["pm_review", "am_review", "client_review", "approved", "changes_requested"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];
export const OPEN_STATUSES: readonly RevisionStatus[] = ["pm_review", "am_review", "client_review"];
export type RevisionAction = "approve" | "request_changes" | "send_to_client" | "approve_final";
export type RevisionStep = "pm" | "am" | "client";
export type ActedAs = "assigned" | "override" | "client";

export interface Approver { name: string; email: string | null }
export interface Approvers { pm: Approver | null; am: Approver | null; /** Executive Strategist — top of the client team ladder. */ es?: Approver | null }

const TRANSITIONS: Record<string, Partial<Record<RevisionAction, RevisionStatus>>> = {
  pm_review: { approve: "am_review", request_changes: "changes_requested" },
  am_review: { send_to_client: "client_review", approve_final: "approved", request_changes: "changes_requested" },
  client_review: { approve: "approved", request_changes: "changes_requested" },
};

export function isOpen(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function stepFor(status: string): RevisionStep | null {
  if (status === "pm_review") return "pm";
  if (status === "am_review") return "am";
  if (status === "client_review") return "client";
  return null;
}

export function actionsFor(step: RevisionStep): RevisionAction[] {
  if (step === "am") return ["send_to_client", "approve_final", "request_changes"];
  return ["approve", "request_changes"];
}

export function nextStatus(status: string, action: RevisionAction): RevisionStatus | null {
  return TRANSITIONS[status]?.[action] ?? null;
}

/** request_changes and approve_final need a written reason (spec §3). */
export function actionNeedsNote(action: RevisionAction): boolean {
  return action === "request_changes" || action === "approve_final";
}

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

// Client team ladder: who sits above each step and may override it (ruled 2026-10-02)
const HIGHER: Record<"pm" | "am", { key: "am" | "es"; label: string }[]> = {
  pm: [{ key: "am", label: "Account Manager" }, { key: "es", label: "Executive Strategist" }],
  am: [{ key: "es", label: "Executive Strategist" }],
};

/** Who an override on this step is "as": a higher client-team role, or Owner (Owner/Super Admin). Null if none. */
export function overrideRole(step: "pm" | "am", actor: { email: string; role: string }, approvers: Approvers): string | null {
  const me = norm(actor.email);
  const higher = HIGHER[step].find((h) => { const a = approvers[h.key]; return !!a?.email && norm(a.email) === me; });
  if (higher) return higher.label;
  return hasSuperPowers(actor.role) ? "Owner" : null;
}

/**
 * Who a staff user acts as on the PM/AM step: the client's assigned person, an override (someone
 * higher on the client team, or an Owner/Super Admin), or nobody. The author may act on their own revision
 * only when they are the client's AM or ES (emergencies).
 */
export function staffActedAs(
  step: "pm" | "am",
  actor: { email: string; role: string },
  approvers: Approvers,
  submittedByEmail: string,
): "assigned" | "override" | null {
  const me = norm(actor.email);
  if (!me) return null;
  if (me === norm(submittedByEmail)) {
    // Emergency rule (2026-10-02): only the client's AM or ES may approve a revision they submitted;
    // from PM downwards (and Owners not on the client team) self-approval is never allowed.
    const senior = [approvers.am, approvers.es].some((a) => !!a?.email && norm(a.email) === me);
    if (!senior) return null;
  }
  const assigned = approvers[step];
  if (assigned?.email && norm(assigned.email) === me) return "assigned";
  return overrideRole(step, actor, approvers) ? "override" : null;
}

export function stageLabel(status: string): string {
  switch (status) {
    case "pm_review": return "PM review";
    case "am_review": return "AM review";
    case "client_review": return "With client";
    case "approved": return "Approved";
    case "changes_requested": return "Changes requested";
    default: return status;
  }
}
