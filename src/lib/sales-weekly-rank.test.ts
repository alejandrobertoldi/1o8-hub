import { describe, expect, it } from "vitest";
import {
  weeklyRankValueScale,
  buildWeeklyRank,
  formatPctAbs,
  formatPctLabel,
  isWeeklyRankImprovement,
  weeklyRankChartLayout,
  WEEKLY_RANK_MAX_BAR,
} from "./sales-weekly-rank";

const base = {
  brandName: null as string | null,
  accountIds: ["1"],
  logoSrc: null as string | null,
};

function client(
  code: string,
  name: string,
  values: Record<string, { current: number | null; previous: number | null }>,
  extra: Partial<typeof base> = {},
) {
  return { ...base, ...extra, clientIdCode: code, clientName: name, values };
}

describe("buildWeeklyRank", () => {
  it("sorts accounts best to worst by week-over-week %", () => {
    const rows = buildWeeklyRank(
      [
        client("C3", "Gamma", { Sales: { current: 110, previous: 100 } }),
        client("C1", "Alpha", { Sales: { current: 162, previous: 100 } }),
        client("C2", "Beta", { Sales: { current: 72, previous: 100 } }),
      ],
      "Sales",
    );
    expect(rows.map((r) => r.clientIdCode)).toEqual(["C1", "C3", "C2"]);
    expect(rows[0].pctChange).toBeCloseTo(62);
    expect(rows[2].pctChange).toBeCloseTo(-28);
  });

  it("sorts lower-is-better metrics so the biggest drop ranks first", () => {
    const rows = buildWeeklyRank(
      [
        client("UP", "Up", { ACoS: { current: 30, previous: 20 } }),
        client("DROP", "Drop", { ACoS: { current: 10, previous: 20 } }),
        client("FLAT", "Flat", { ACoS: { current: 20, previous: 20 } }),
      ],
      "ACoS",
      true,
    );
    expect(rows.map((r) => r.clientIdCode)).toEqual(["DROP", "FLAT", "UP"]);
  });

  it("skips unconnected accounts and rows with no prior value", () => {
    const rows = buildWeeklyRank(
      [
        client("OK", "Ok", { Sales: { current: 120, previous: 100 } }),
        client("NONE", "None", { Sales: { current: 50, previous: 40 } }, { accountIds: [] }),
        client("ZERO", "Zero", { Sales: { current: 50, previous: 0 } }),
        client("NULL", "Null", { Sales: { current: 50, previous: null } }),
      ],
      "Sales",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].clientIdCode).toBe("OK");
  });

  it("keeps the client id code, display name, and logo", () => {
    const rows = buildWeeklyRank(
      [
        client("PUR_SC_US", "Purina US", { Sales: { current: 200, previous: 100 } }, {
          brandName: "Purina",
          logoSrc: "/client-logos/PUR_SC_US.png",
        }),
      ],
      "Sales",
    );
    expect(rows[0].clientIdCode).toBe("PUR_SC_US");
    expect(rows[0].displayName).toBe("Purina");
    expect(rows[0].logoSrc).toBe("/client-logos/PUR_SC_US.png");
  });
});

describe("isWeeklyRankImprovement", () => {
  it("treats increases as good unless lower is better", () => {
    expect(isWeeklyRankImprovement(12)).toBe(true);
    expect(isWeeklyRankImprovement(-8)).toBe(false);
    expect(isWeeklyRankImprovement(-8, true)).toBe(true);
    expect(isWeeklyRankImprovement(12, true)).toBe(false);
  });
});

describe("formatPctLabel", () => {
  it("adds a sign and rounds to a whole percent", () => {
    expect(formatPctLabel(62.4)).toBe("+62%");
    expect(formatPctLabel(-17.6)).toBe("-18%");
    expect(formatPctLabel(0.2)).toBe("0%");
  });
});

describe("formatPctAbs", () => {
  it("drops the sign and rounds to a whole percent", () => {
    expect(formatPctAbs(62.4)).toBe("62%");
    expect(formatPctAbs(-17.6)).toBe("18%");
    expect(formatPctAbs(0.2)).toBe("0%");
  });
});

describe("weeklyRankChartLayout", () => {
  it("keeps every client slot inside the plot width", () => {
    const layout = weeklyRankChartLayout(720, 12);
    expect(layout.slot * 12).toBeCloseTo(720);
    expect(layout.pairW).toBeLessThanOrEqual(layout.slot);
    expect(layout.pairW + layout.barGap).toBeLessThanOrEqual(layout.slot + layout.barGap);
  });

  it("uses full-size bars when there is room", () => {
    const layout = weeklyRankChartLayout(900, 4);
    expect(layout.maxBar).toBe(WEEKLY_RANK_MAX_BAR);
    expect(layout.showNames).toBe(true);
    expect(layout.showValues).toBe(true);
  });

  it("shrinks bars and labels instead of overflowing a dense set", () => {
    const layout = weeklyRankChartLayout(480, 12);
    expect(layout.maxBar).toBeLessThan(WEEKLY_RANK_MAX_BAR);
    expect(layout.pairW * 12).toBeLessThanOrEqual(480);
    expect(layout.showLineLabels).toBe(false);
  });
});

describe("weeklyRankValueScale", () => {
  it("stays linear when values are comparable", () => {
    expect(weeklyRankValueScale([1000, 2000, 5000, 8000])).toEqual({ type: "linear", floor: 0 });
  });

  it("switches to log when one account dwarfs the rest", () => {
    const values = [220, 620, 785, 960, 2100, 2500, 20800, 22100, 452300, 463000, 0];
    expect(weeklyRankValueScale(values)).toEqual({ type: "log", floor: 100 });
  });

  it("ignores zeros and stays linear with fewer than two non-zero values", () => {
    expect(weeklyRankValueScale([0, 0, 500])).toEqual({ type: "linear", floor: 0 });
    expect(weeklyRankValueScale([])).toEqual({ type: "linear", floor: 0 });
  });

  it("handles sub-1 values (ratios) with a fractional floor", () => {
    expect(weeklyRankValueScale([0.004, 0.02, 0.03, 0.05, 5])).toEqual({ type: "log", floor: 0.001 });
  });
});
