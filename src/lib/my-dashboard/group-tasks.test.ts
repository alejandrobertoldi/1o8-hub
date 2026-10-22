import { describe, expect, it } from "vitest";
import { addDays, dueStrip, endOfWeek, groupTasks, isHighPriority, splitBySource } from "./group-tasks";
import type { DashTask } from "./types";

const t = (id: string, dueOn: string | null, extra: Partial<DashTask> = {}): DashTask => ({
  id, source: "asana", title: id, clientIdCode: null, dueOn, status: null, priority: null, url: "", ...extra,
});

describe("date helpers", () => {
  it("addDays crosses month ends", () => expect(addDays("2026-09-30", 1)).toBe("2026-10-01"));
  it("endOfWeek is the coming Sunday (Wed 2026-10-07 → Sun 2026-10-11)", () => expect(endOfWeek("2026-10-07")).toBe("2026-10-11"));
  it("endOfWeek on a Sunday is that Sunday", () => expect(endOfWeek("2026-10-11")).toBe("2026-10-11"));
});

describe("isHighPriority", () => {
  it.each([["P0 - Critical", true], ["P1 - High", true], ["P2 - Medium", false], ["⏳Waiting Client Approval", false], [null, false]])(
    "%s → %s", (p, e) => expect(isHighPriority(p as string | null)).toBe(e));
});

describe("groupTasks (today = Wed 2026-10-07)", () => {
  const today = "2026-10-07";
  it("puts each task in exactly one group by due date", () => {
    const g = groupTasks([
      t("over", "2026-10-06"), t("today", "2026-10-07"), t("sun", "2026-10-11"),
      t("mon", "2026-10-12"), t("none", null),
    ], today);
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((x) => x.id)]))).toEqual({
      overdue: ["over"], today: ["today"], week: ["sun"], later: ["mon"], nodate: ["none"],
    });
  });
  it("sorts P0/P1 first, then due date, then client", () => {
    const g = groupTasks([
      t("late-low", "2026-10-20"), t("early-low", "2026-10-13", { clientIdCode: "ZZZ_SC_US" }),
      t("early-low-a", "2026-10-13", { clientIdCode: "AAB_SC_US" }), t("late-high", "2026-10-25", { priority: "P1 - High" }),
    ], today);
    expect(g.later.map((x) => x.id)).toEqual(["late-high", "early-low-a", "early-low", "late-low"]);
  });
  it("overdue is oldest first", () => {
    const g = groupTasks([t("b", "2026-09-30"), t("a", "2026-07-31")], today);
    expect(g.overdue.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("dueStrip", () => {
  it("counts tasks per day for the next N days starting today, ignoring overdue and undated", () => {
    const s = dueStrip([t("a", "2026-10-07"), t("b", "2026-10-07"), t("c", "2026-10-09"), t("d", "2026-10-01"), t("e", null), t("f", "2026-10-30")], "2026-10-07", 3);
    expect(s).toEqual([{ date: "2026-10-07", count: 2 }, { date: "2026-10-08", count: 0 }, { date: "2026-10-09", count: 1 }]);
  });
  it("defaults to 14 days", () => expect(dueStrip([], "2026-10-07")).toHaveLength(14));
});

describe("splitBySource", () => {
  it("keeps Asana rows in their groups and pulls Hub rows out into one flat list", () => {
    const g = groupTasks([
      t("a-over", "2026-10-01"), t("a-none", null),
      t("h-none", null, { source: "hub" }), t("h-over", "2026-10-01", { source: "hub" }),
    ], "2026-10-07");
    const { asana, hub } = splitBySource(g);
    expect(asana.overdue.map((x) => x.id)).toEqual(["a-over"]);
    expect(asana.nodate.map((x) => x.id)).toEqual(["a-none"]);
    expect(hub.map((x) => x.id)).toEqual(["h-over", "h-none"]);
  });
});
