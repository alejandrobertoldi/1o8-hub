import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { planNewSubtasks, planSubtaskSync } from "./plan";
import type { AsanaLinkSubtask } from "@/lib/db/schema";

const dir = [
  { name: "Hamid Zeb", email: "hamid@marketfoundry.agency" },
  { name: "Amir Zeb", email: "amir@marketfoundry.agency" },
  { name: "Jake Kosten", email: "jake@marketfoundry.agency" },
];
const rep = (code: string, status: string) => ({ clientIdCode: code, status, rawData: { ProjectManager_MF: "Hamid Zeb", AccountManager_MF: "Amir Zeb" } });
const sub = (gid: string, stage: "pm" | "am" | "ceo", email: string, completed: boolean): AsanaLinkSubtask =>
  ({ gid, url: `u${gid}`, stage, email, name: email, dueOn: "2026-10-05", completed });
const stored = [sub("p", "pm", "hamid@marketfoundry.agency", false), sub("a", "am", "amir@marketfoundry.agency", false), sub("c", "ceo", "jake@marketfoundry.agency", false)];

describe("planSubtaskSync", () => {
  it("completes the PM subtask once no report waits on the PM", () => {
    expect(planSubtaskSync(stored, [rep("A", "am_review")], dir, false)).toEqual({ complete: ["p"], reopen: [], parent: null });
  });
  it("reopens AM subtask after a send-back (CEO → AM) and keeps CEO open", () => {
    const s = [sub("p", "pm", "hamid@marketfoundry.agency", true), sub("a", "am", "amir@marketfoundry.agency", true), sub("c", "ceo", "jake@marketfoundry.agency", false)];
    expect(planSubtaskSync(s, [rep("A", "am_review"), rep("B", "jake_review")], dir, false)).toEqual({ complete: [], reopen: ["a"], parent: null });
  });
  it("completes everything and the parent when all reports are sent", () => {
    expect(planSubtaskSync(stored, [rep("A", "sent"), rep("B", "sent")], dir, false)).toEqual({ complete: ["p", "a", "c"], reopen: [], parent: "complete" });
  });
  it("no writes when state already matches", () => {
    const done = stored.map((s) => ({ ...s, completed: true }));
    expect(planSubtaskSync(done, [rep("A", "sent")], dir, true)).toEqual({ complete: [], reopen: [], parent: null });
  });
  it("reopens the parent if a report leaves sent", () => {
    const done = stored.map((s) => ({ ...s, completed: true }));
    expect(planSubtaskSync(done, [rep("A", "failed")], dir, true).parent).toBe("reopen");
  });
});

describe("planSubtaskSync extras", () => {
  it("PM-for-A / AM-for-B are independent subtasks", () => {
    const reports = [
      { clientIdCode: "A", status: "am_review", rawData: { ProjectManager_MF: "Hamid Zeb", AccountManager_MF: null } },
      { clientIdCode: "B", status: "pm_review", rawData: { ProjectManager_MF: null, AccountManager_MF: "Amir Zeb" } },
    ];
    // PM's only report is past PM; AM's only report hasn't reached AM
    expect(planSubtaskSync(stored, reports, dir, false)).toEqual({ complete: ["p"], reopen: [], parent: null });
  });
  it("am_review -> pm_review send-back reopens the PM subtask", () => {
    const s = [sub("p", "pm", "hamid@marketfoundry.agency", true), sub("a", "am", "amir@marketfoundry.agency", false), sub("c", "ceo", "jake@marketfoundry.agency", false)];
    expect(planSubtaskSync(s, [rep("A", "pm_review")], dir, false)).toEqual({ complete: [], reopen: ["p"], parent: null });
  });
  it("parent completes when all non-blocked reports are sent", () => {
    expect(planSubtaskSync([], [rep("A", "sent"), rep("B", "blocked")], dir, false).parent).toBe("complete");
  });
  it("parent stays null when every report is blocked", () => {
    expect(planSubtaskSync([], [rep("A", "blocked")], dir, false).parent).toBeNull();
  });
});

describe("planNewSubtasks", () => {
  it("returns only reviewers without a stored subtask for the same stage+email", () => {
    const reviewers = [
      { stage: "pm" as const, email: "hamid@marketfoundry.agency", name: "Hamid Zeb", clientIdCodes: ["A"] },
      { stage: "pm" as const, email: "sohail@marketfoundry.agency", name: "Sohail Asghar", clientIdCodes: ["B"] },
    ];
    expect(planNewSubtasks(stored, reviewers).map((r) => r.email)).toEqual(["sohail@marketfoundry.agency"]);
  });
});
