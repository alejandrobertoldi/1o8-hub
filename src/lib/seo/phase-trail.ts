// "Who" column for project cards: one row per phase S1–S8. S1–S6 only record an approval date,
// so they show the project's assignee; S7 lists each review stage with its person; S8 who pushed.

export interface TrailEvent { step: string; action: string; actorName: string | null; createdAt: string }
export type TrailState = "done" | "waiting" | "changes" | "pending";
export interface TrailStage { title: string; who: string; state: TrailState; at: string | null }
export interface TrailRow { code: string; who: string | null; at: string | null; stages?: TrailStage[] }

const DONE = new Set(["submit", "approve", "send_to_client", "approve_final"]);
const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);

export function phaseTrail(p: {
  assigneeName: string | null;
  approvedAt: Record<"S1" | "S2" | "S3" | "S4" | "S5" | "S6", string | null>;
  revision: { status: string; events: TrailEvent[] } | null;
  approvers: { pm: { name: string } | null; am: { name: string } | null };
  push: { by: string; at: string } | null;
}): TrailRow[] {
  const rows: TrailRow[] = (["S1", "S2", "S3", "S4", "S5", "S6"] as const).map((code) => ({
    code, who: p.approvedAt[code] ? p.assigneeName : null, at: day(p.approvedAt[code]),
  }));

  const ev = p.revision?.events ?? [];
  const last = (step: string) => [...ev].reverse().find((e) => e.step === step) ?? null;
  const active = p.revision?.status === "pm_review" ? "pm" : p.revision?.status === "am_review" ? "am" : p.revision?.status === "client_review" ? "client" : null;
  const stage = (step: string, title: string, fallback: string): TrailStage => {
    const e = last(step);
    if (e && DONE.has(e.action)) return { title, who: e.actorName ?? fallback, state: "done", at: day(e.createdAt) };
    if (e?.action === "request_changes") return { title, who: e.actorName ?? fallback, state: "changes", at: day(e.createdAt) };
    return { title, who: fallback, state: active === step ? "waiting" : "pending", at: null };
  };
  const stages: TrailStage[] = p.revision ? [
    stage("submit", "SEO Manager", p.assigneeName ?? "—"),
    stage("pm", "Project Manager", p.approvers.pm?.name ?? "No PM set"),
    stage("am", "Account Manager", p.approvers.am?.name ?? "No AM set"),
    ...(active === "client" || ev.some((e) => e.action === "send_to_client") ? [stage("client", "Client", "Client")] : []),
  ] : [];
  rows.push({ code: "S7", who: null, at: null, stages });
  rows.push({ code: "S8", who: p.push?.by ?? null, at: day(p.push?.at) });
  return rows;
}
