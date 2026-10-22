import { describe, it, expect } from "vitest";
import { phaseTrail } from "./phase-trail";

const approvedAt = { S1: "2026-09-24T10:00:00Z", S2: "2026-09-25T10:00:00Z", S3: null, S4: null, S5: null, S6: null };
const approvers = { pm: { name: "Sohail Asghar" }, am: { name: "Manu Lancharro" } };

describe("phaseTrail", () => {
  it("S1–S6: assignee + date only when approved", () => {
    const rows = phaseTrail({ assigneeName: "Manu", approvedAt, revision: null, approvers, push: null });
    expect(rows[0]).toEqual({ code: "S1", who: "Manu", at: "2026-09-24" });
    expect(rows[2]).toEqual({ code: "S3", who: null, at: null });
    expect(rows.find((r) => r.code === "S7")?.stages).toEqual([]);
    expect(rows.find((r) => r.code === "S8")).toEqual({ code: "S8", who: null, at: null });
  });
  it("S7 stages from review events: override by AM on the PM step, sent to client, client approved; S8 pusher", () => {
    const rows = phaseTrail({
      assigneeName: "Manu", approvedAt, approvers, push: { by: "Ann", at: "2026-10-03T09:00:00Z" },
      revision: { status: "approved", events: [
        { step: "submit", action: "submit", actorName: "Manu Lancharro", createdAt: "2026-10-01T23:30:00Z" },
        { step: "pm", action: "approve", actorName: "Manu Lancharro", createdAt: "2026-10-02T14:44:00Z" },
        { step: "am", action: "send_to_client", actorName: "Manu Lancharro", createdAt: "2026-10-02T15:00:00Z" },
        { step: "client", action: "approve", actorName: "Client User", createdAt: "2026-10-02T15:21:00Z" },
      ] },
    });
    const s7 = rows.find((r) => r.code === "S7")!.stages!;
    expect(s7.map((s) => `${s.title}|${s.who}|${s.state}|${s.at}`)).toEqual([
      "SEO Manager|Manu Lancharro|done|2026-10-01",
      "Project Manager|Manu Lancharro|done|2026-10-02",
      "Account Manager|Manu Lancharro|done|2026-10-02",
      "Client|Client User|done|2026-10-02",
    ]);
    expect(rows.find((r) => r.code === "S8")).toEqual({ code: "S8", who: "Ann", at: "2026-10-03" });
  });
  it("open review: the active step is waiting on the assigned person; no Client row yet", () => {
    const rows = phaseTrail({ assigneeName: "Manu", approvedAt, approvers, push: null,
      revision: { status: "pm_review", events: [{ step: "submit", action: "submit", actorName: "Manu", createdAt: "2026-10-02T15:33:00Z" }] } });
    expect(rows.find((r) => r.code === "S7")!.stages!.map((s) => `${s.title}|${s.who}|${s.state}`)).toEqual([
      "SEO Manager|Manu|done", "Project Manager|Sohail Asghar|waiting", "Account Manager|Manu Lancharro|pending",
    ]);
  });
});
