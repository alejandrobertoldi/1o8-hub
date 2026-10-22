import { canSend, isWaitingForReviewer, reviewPermissions, reviewStatusLabel } from "@/lib/monthly-report/review";
import { accountManagerFromRaw, projectManagerFromRaw } from "@/lib/monthly-report/resolve-client";
import type { ReviewItem } from "./types";

/** Statuses that can be waiting on someone — the rest (sent, blocked) never are. */
export const OPEN_REVIEW_STATUSES = ["generated", "pm_review", "am_review", "jake_review", "ready", "failed"];

export interface ReviewSourceRow {
  id: string;
  clientIdCode: string;
  clientName: string | null;
  period: string; // YYYY-MM
  status: string;
  updatedAt: Date;
  rawData: unknown; // aac.rawData — PM/AM names live here
}

const periodLabel = (period: string) =>
  new Date(`${period}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Monthly reports waiting on this person — the same rule as "Waiting for me" on /reports/monthly
 * (PM/AM by client team name, CEO by email), so the two views never disagree.
 */
export function reportsWaitingOn(person: { name: string | null; email: string }, rows: ReviewSourceRow[], today: string): ReviewItem[] {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return rows
    .filter((r) => {
      const perms = reviewPermissions({
        userName: person.name,
        userEmail: person.email,
        projectManager: projectManagerFromRaw(r.rawData),
        accountManager: accountManagerFromRaw(r.rawData),
        canOverride: false,
      });
      return isWaitingForReviewer(r.status, perms) || canSend(r.status, perms);
    })
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .map((r) => ({
      id: r.id,
      clientIdCode: r.clientIdCode,
      clientName: r.clientName ?? r.clientIdCode,
      period: r.period,
      periodLabel: periodLabel(r.period),
      stageLabel: reviewStatusLabel(r.status),
      waitingDays: Math.max(0, Math.ceil((todayMs - r.updatedAt.getTime()) / 86_400_000)),
      url: "/reports/monthly",
    }));
}

/** Clients whose generation hit the retry cap — shown to the client's PM, who has to step in. */
export function generationFailedItems(
  person: { name: string | null; email: string },
  capped: { clientIdCode: string; clientName: string | null; rawData: unknown; period: string }[],
  today: string,
): ReviewItem[] {
  void today;
  return capped
    .filter((r) => reviewPermissions({
      userName: person.name,
      userEmail: person.email,
      projectManager: projectManagerFromRaw(r.rawData),
      accountManager: accountManagerFromRaw(r.rawData),
      canOverride: false,
    }).pm)
    .map((r) => ({
      id: `fail-${r.clientIdCode}-${r.period}`,
      clientIdCode: r.clientIdCode,
      clientName: r.clientName ?? r.clientIdCode,
      period: r.period,
      periodLabel: periodLabel(r.period),
      stageLabel: "Generation failed (3×)",
      waitingDays: 0,
      url: "/reports/monthly",
    }));
}
