import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { reviewersForPeriod, stageDone } from "./reviewers";

const dir = [
  { name: "Hamid Zeb", email: "hamid@marketfoundry.agency" },
  { name: "Amir Zeb", email: "amir@marketfoundry.agency" },
  { name: "Jake Kosten", email: "jake@marketfoundry.agency" },
];
const rep = (code: string, status: string, pm: string | null, am: string | null) =>
  ({ clientIdCode: code, status, rawData: { ProjectManager_MF: pm, AccountManager_MF: am } });

describe("reviewersForPeriod", () => {
  it("one reviewer per distinct PM/AM email plus the CEO, with their clients", () => {
    const { reviewers } = reviewersForPeriod([rep("A", "pm_review", "Hamid Zeb", "Amir Zeb"), rep("B", "generated", "hamid zeb", "Amir Zeb")], dir);
    expect(reviewers).toEqual([
      { stage: "pm", email: "hamid@marketfoundry.agency", name: "Hamid Zeb", clientIdCodes: ["A", "B"] },
      { stage: "am", email: "amir@marketfoundry.agency", name: "Amir Zeb", clientIdCodes: ["A", "B"] },
      { stage: "ceo", email: "jake@marketfoundry.agency", name: "Jake Kosten", clientIdCodes: ["A", "B"] },
    ]);
  });
  it("unresolved names are reported, not dropped silently", () => {
    const { reviewers, unresolved } = reviewersForPeriod([rep("A", "pm_review", "Ghost Person", "Amir Zeb")], dir);
    expect(reviewers.map((r) => r.stage)).toEqual(["am", "ceo"]);
    expect(unresolved).toEqual([{ stage: "pm", name: "Ghost Person", clientIdCodes: ["A"] }]);
  });
  it("blank PM/AM fields are ignored (no unresolved entry)", () => {
    expect(reviewersForPeriod([rep("A", "pm_review", null, "")], dir).unresolved).toEqual([]);
  });
});

describe("reviewersForPeriod hardening", () => {
  it("prefers @marketfoundry.agency over a duplicate @1o8 row listed first", () => {
    const d = [{ name: "Hamid Zeb", email: "hamid@1o8.agency" }, ...dir];
    expect(reviewersForPeriod([rep("A", "pm_review", "Hamid Zeb", null)], d).reviewers[0].email).toBe("hamid@marketfoundry.agency");
  });
  it("skips blocked reports (no subtask for a PM whose only clients are blocked)", () => {
    const { reviewers } = reviewersForPeriod([rep("A", "blocked", "Hamid Zeb", "Amir Zeb")], dir);
    expect(reviewers).toEqual([]);
  });
});

describe("stageDone (done = all of this reviewer's reports are PAST their stage)", () => {
  const reports = [rep("A", "am_review", "Hamid Zeb", "Amir Zeb"), rep("B", "sent", "Hamid Zeb", "Amir Zeb")];
  it("PM done once all their reports moved past PM", () => expect(stageDone("pm", "hamid@marketfoundry.agency", reports, dir)).toBe(true));
  it("AM not done while a client of theirs is at am_review", () => expect(stageDone("am", "amir@marketfoundry.agency", reports, dir)).toBe(false));
  it("AM not done while a report hasn't reached AM yet", () => expect(stageDone("am", "amir@marketfoundry.agency", [rep("C", "pm_review", "Hamid Zeb", "Amir Zeb")], dir)).toBe(false));
  it("CEO not done until every report is sent", () => {
    for (const s of ["generated", "pm_review", "am_review", "jake_review", "ready", "failed"]) expect(stageDone("ceo", "jake@marketfoundry.agency", [rep("C", s, null, null)], dir)).toBe(false);
    expect(stageDone("ceo", "jake@marketfoundry.agency", [rep("C", "sent", null, null)], dir)).toBe(true);
  });
  it("blocked reports are ignored (never hold a subtask open)", () => expect(stageDone("pm", "hamid@marketfoundry.agency", [rep("D", "blocked", "Hamid Zeb", null), rep("E", "sent", "Hamid Zeb", null)], dir)).toBe(true));
});

describe("stageDone empty match", () => {
  it("never ticks when the reviewer matches zero reports", () => {
    expect(stageDone("pm", "someone-else@marketfoundry.agency", [rep("A", "sent", "Hamid Zeb", "Amir Zeb")], dir)).toBe(false);
  });
});
