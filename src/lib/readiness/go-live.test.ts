import { describe, expect, it } from "vitest";
import { addDays, daysBetween, goLiveWindow } from "./go-live";

const task = (gid: string, goLiveDate: string, dueOn: string | null, department = "Email") => ({
  gid, name: gid, url: "", clientIdCode: "BRN", assignee: "Tiffani", department, dueOn, goLiveDate,
});

describe("goLiveWindow", () => {
  const today = "2026-10-27";
  it("keeps Go Lives up to 3 days ahead and up to 7 days passed, passed first", () => {
    const out = goLiveWindow(
      [task("in3", "2026-10-30", "2026-10-28"), task("in4", "2026-10-31", "2026-10-28"), task("late2", "2026-10-25", "2026-10-23"),
        task("late8", "2026-10-19", "2026-10-15"), task("today", "2026-10-27", "2026-10-26")],
      today,
    );
    expect(out.map((t) => [t.gid, t.daysLeft])).toEqual([["late2", -2], ["today", 0], ["in3", 3]]);
  });
  it("flags a due date after Go Live, or none", () => {
    const out = goLiveWindow([task("ok", "2026-10-29", "2026-10-28"), task("after", "2026-10-29", "2026-10-30"), task("none", "2026-10-29", null)], today);
    expect(Object.fromEntries(out.map((t) => [t.gid, t.dueAfterGoLive]))).toEqual({ ok: false, after: true, none: true });
  });
  it("counts calendar days", () => {
    expect(daysBetween("2026-10-27", "2026-11-02")).toBe(6);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});
