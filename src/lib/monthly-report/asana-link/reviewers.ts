import { MONTHLY_REPORT_FINAL_REVIEWER_EMAIL } from "@/lib/constants";
import { accountManagerFromRaw, projectManagerFromRaw } from "@/lib/monthly-report/resolve-client";
import { namesMatch } from "@/lib/monthly-report/review";

export type Stage = "pm" | "am" | "ceo";
export type PeriodReport = { clientIdCode: string; status: string; rawData: unknown };
export type Reviewer = { stage: Stage; email: string; name: string; clientIdCodes: string[] };
type Directory = { name: string | null; email: string }[];

// Review order. A reviewer's stage is DONE when none of their reports sits at their stage or any earlier one.
const STAGE_ORDER: Record<string, number> = { generated: 0, pm_review: 0, am_review: 1, jake_review: 2, ready: 2, failed: 2, sent: 3 };
const STAGE_INDEX: Record<Stage, number> = { pm: 0, am: 1, ceo: 2 };

/**
 * Name -> email over the staff directory. The rebrand left duplicate users rows (old @1o8.agency with the
 * same names), so prefer @marketfoundry.agency; otherwise the first other match by email (deterministic).
 */
export function resolveStaffEmail(directory: Directory, name: string | null): string | null {
  if (!name) return null;
  const hits = directory.filter((p) => namesMatch(p.name, name) && p.email.includes("@")).map((p) => p.email.toLowerCase());
  if (!hits.length) return null;
  const mf = hits.filter((e) => e.endsWith("@marketfoundry.agency")).sort();
  return mf[0] ?? hits.sort()[0];
}

function nameFor(stage: "pm" | "am", raw: unknown): string | null {
  return stage === "pm" ? projectManagerFromRaw(raw) : accountManagerFromRaw(raw);
}

export function reviewersForPeriod(reports: PeriodReport[], directory: Directory) {
  const byKey = new Map<string, Reviewer>();
  const unresolvedByName = new Map<string, { stage: "pm" | "am"; name: string; clientIdCodes: string[] }>();
  const active = reports.filter((r) => r.status !== "blocked");
  for (const stage of ["pm", "am"] as const) {
    for (const r of active) {
      const name = nameFor(stage, r.rawData);
      if (!name) continue;
      const email = resolveStaffEmail(directory, name);
      if (!email) {
        const k = `${stage}|${name.trim().toLowerCase()}`;
        const u = unresolvedByName.get(k) ?? { stage, name: name.trim(), clientIdCodes: [] };
        u.clientIdCodes.push(r.clientIdCode);
        unresolvedByName.set(k, u);
        continue;
      }
      const k = `${stage}|${email.toLowerCase()}`;
      const rv = byKey.get(k) ?? { stage, email: email.toLowerCase(), name: directory.find((d) => d.email.toLowerCase() === email.toLowerCase())?.name ?? name, clientIdCodes: [] };
      rv.clientIdCodes.push(r.clientIdCode);
      byKey.set(k, rv);
    }
  }
  const ceoEmail = MONTHLY_REPORT_FINAL_REVIEWER_EMAIL.toLowerCase();
  const reviewers = [...byKey.values()];
  if (active.length) {
    reviewers.push({ stage: "ceo", email: ceoEmail, name: directory.find((d) => d.email.toLowerCase() === ceoEmail)?.name ?? "CEO", clientIdCodes: active.map((r) => r.clientIdCode) });
  }
  return { reviewers, unresolved: [...unresolvedByName.values()] };
}

/** True when every one of this reviewer's (non-blocked) reports has moved past their stage. */
export function stageDone(stage: Stage, email: string, reports: PeriodReport[], directory: Directory): boolean {
  const target = email.toLowerCase();
  const mine = reports.filter((r) => {
    if (!Object.hasOwn(STAGE_ORDER, r.status)) return false; // blocked / unknown statuses never hold a subtask open
    if (stage === "ceo") return target === MONTHLY_REPORT_FINAL_REVIEWER_EMAIL.toLowerCase();
    const name = nameFor(stage, r.rawData);
    return !!name && resolveStaffEmail(directory, name) === target;
  });
  if (stage !== "ceo" && mine.length === 0) return false; // never tick on an empty match
  return mine.every((r) => STAGE_ORDER[r.status] > STAGE_INDEX[stage]);
}
