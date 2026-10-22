import { describe, expect, it } from "vitest";
import { clientServices, parseTermDate, sowStatus } from "./sow";

const today = "2026-10-22";

describe("parseTermDate", () => {
  it.each([
    ["April 30, 2026", "2026-04-30"],
    ["October 31 2026", "2026-10-31"],
    ["October 31", "2026-10-31"],
    ["3/31/2027", "2027-03-31"],
    ["2027-03-31", "2027-03-31"],
    ["Month To Month 30 day notice", null],
    ["TBD (one-time project, no end date)", null],
  ])("%s → %s", (text, date) => expect(parseTermDate(text, today)).toBe(date));
});

describe("sowStatus", () => {
  const s = (lastDay: string, sheet = "", sow = "Retainer") => sowStatus({ "Last Day of Term": lastDay, "SOW Status": sheet, SOW: sow }, today);
  it("active, expiring and expired from the last day of term", () => {
    expect(s("December 31, 2026", "Active")).toMatchObject({ state: "active", tone: "green", daysLeft: 70, sheetMismatch: null });
    expect(s("October 27, 2026", "Active")).toMatchObject({ state: "expiring", label: "Expires in 5 days", tone: "orange", sheetMismatch: null });
    expect(s("April 30, 2026", "Expired")).toMatchObject({ state: "expired", label: "Expired Apr 30, 2026", tone: "red", sheetMismatch: null });
  });
  it("flags the sheet when it contradicts the date", () => {
    expect(s("October 14, 2026", "Active")).toMatchObject({ state: "expired", label: "Expired 8 days ago", sheetMismatch: "Active" });
    expect(s("October 31 2026", "Expring Soon").sheetMismatch).toBeNull();
  });
  it("handles month-to-month, open-ended and no scope", () => {
    expect(s("Month To Month 30 day notice", "Active").state).toBe("rolling");
    expect(s("TBD (launch + 48 hours)", "Active").state).toBe("open");
    expect(s("No Scope", "No Scope", "No Scope").state).toBe("none");
  });
});

describe("clientServices", () => {
  it("lists checked services once", () => {
    expect(clientServices({ "Service: SEO": "SEO", "Service: Meta": "Meta", "Service: CRO": "", Other: "x" })).toEqual(["Meta", "SEO"]);
  });
});
