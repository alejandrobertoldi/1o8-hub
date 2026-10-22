import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { generationFailedItems, reportsWaitingOn, type ReviewSourceRow } from "./reviews";

const row = (over: Partial<ReviewSourceRow>): ReviewSourceRow => ({
  id: "r1", clientIdCode: "SOP_SC_US", clientName: "Sopreme", period: "2026-09", status: "pm_review",
  updatedAt: new Date("2026-10-04T10:00:00Z"),
  rawData: { ProjectManager_MF: "Jo C.", AccountManager_MF: "Aqib Abbasi" },
  ...over,
});
const jo = { name: "Jo  c.", email: "jo@marketfoundry.agency" };
const aqib = { name: "Aqib Abbasi", email: "aqib@marketfoundry.agency" };
const jake = { name: "Jake Kosten", email: "jake@marketfoundry.agency" };

describe("reportsWaitingOn", () => {
  it("PM stage (generated and pm_review) is waiting on the client's PM, matched by normalised name", () => {
    const items = reportsWaitingOn(jo, [row({ id: "a", status: "generated" }), row({ id: "b", status: "pm_review" })], "2026-10-07");
    expect(items.map((i) => [i.id, i.stageLabel])).toEqual([["a", "PM review"], ["b", "PM review"]]);
    expect(reportsWaitingOn(aqib, [row({ status: "pm_review" })], "2026-10-07")).toEqual([]);
  });

  it("AM stage is waiting on the AM only", () => {
    expect(reportsWaitingOn(aqib, [row({ status: "am_review" })], "2026-10-07").map((i) => i.stageLabel)).toEqual(["AM review"]);
    expect(reportsWaitingOn(jo, [row({ status: "am_review" })], "2026-10-07")).toEqual([]);
  });

  it("CEO stage, ready and failed are waiting on the final reviewer (by email), whatever the client team", () => {
    const items = reportsWaitingOn(jake, [row({ id: "c", status: "jake_review" }), row({ id: "d", status: "ready" }), row({ id: "e", status: "failed" })], "2026-10-07");
    expect(items.map((i) => [i.id, i.stageLabel])).toEqual([["c", "CEO review"], ["d", "Ready to send"], ["e", "Send failed"]]);
  });

  it("ignores sent and blocked reports", () => {
    expect(reportsWaitingOn(jake, [row({ status: "sent" }), row({ status: "blocked" })], "2026-10-07")).toEqual([]);
  });

  it("reports days waiting since the last status change, oldest first, and labels the period", () => {
    const items = reportsWaitingOn(jo, [
      row({ id: "new", updatedAt: new Date("2026-10-06T23:00:00Z") }),
      row({ id: "old", period: "2026-08", updatedAt: new Date("2026-09-30T08:00:00Z") }),
    ], "2026-10-07");
    expect(items.map((i) => [i.id, i.waitingDays, i.periodLabel])).toEqual([["old", 7, "Aug 2026"], ["new", 1, "Sep 2026"]]);
    expect(items[0].url).toBe("/reports/monthly");
  });
});

describe("generationFailedItems", () => {
  const failed = [{ clientIdCode: "SOP_SC_US", clientName: "Sopreme", rawData: { ProjectManager_MF: "Jo C.", AccountManager_MF: "Aqib Abbasi" }, period: "2026-09" }];
  it("shows a capped client to its PM only", () => {
    const items = generationFailedItems(jo, failed, "2026-10-07");
    expect(items).toEqual([{
      id: "fail-SOP_SC_US-2026-09", clientIdCode: "SOP_SC_US", clientName: "Sopreme", period: "2026-09",
      periodLabel: "Sep 2026", stageLabel: "Generation failed (3\u00d7)", waitingDays: 0, url: "/reports/monthly",
    }]);
    expect(generationFailedItems(aqib, failed, "2026-10-07")).toEqual([]);
  });
});
