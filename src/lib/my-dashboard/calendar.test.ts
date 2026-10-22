import { describe, expect, it } from "vitest";
import { monthGrid, shiftMonth, tasksByDate } from "./calendar";
import type { DashTask } from "./types";

const t = (id: string, dueOn: string | null): DashTask => ({
  id, source: "asana", title: id, clientIdCode: null, dueOn, status: null, priority: null, url: "",
});

describe("monthGrid", () => {
  it("covers whole Sun–Sat weeks around the month (Sep 2026 starts Tue, ends Wed)", () => {
    const g = monthGrid("2026-09");
    expect(g).toHaveLength(5);
    expect(g[0][0]).toBe("2026-08-30");
    expect(g[0][2]).toBe("2026-09-01");
    expect(g[4][6]).toBe("2026-10-03");
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it("handles a month that starts on Sunday (Feb 2026: Sun 1st → Sat 28th, exactly 4 weeks)", () => {
    const g = monthGrid("2026-02");
    expect(g).toHaveLength(4);
    expect(g[0][0]).toBe("2026-02-01");
    expect(g[3][6]).toBe("2026-02-28");
  });
});

describe("shiftMonth", () => {
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });
});

describe("tasksByDate", () => {
  it("indexes dated tasks by day and counts undated ones", () => {
    const { byDate, undated } = tasksByDate([t("a", "2026-10-07"), t("b", "2026-10-07"), t("c", null), t("d", "2026-09-16")]);
    expect(byDate.get("2026-10-07")?.map((x) => x.id)).toEqual(["a", "b"]);
    expect(byDate.get("2026-09-16")?.map((x) => x.id)).toEqual(["d"]);
    expect(undated).toBe(1);
  });
});
