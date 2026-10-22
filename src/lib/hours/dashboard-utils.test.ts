import { describe, it, expect } from "vitest";
import { clientLabel, computeKpis, topMembers, topClients, buildHeatmap, filterSummary, parseLocalDate, formatDayLabel, formatDayRowLabel, formatWeekdayLabel, formatTimeRange, buildCategoryQuery, enumerateDays, buildDayHeatmap, fmtHM, hoursBucket, sumHoursByDay, trailingRange, buildCalendarWeeks, isoWeekNumber, weekTotals, yearColumnGroups, monthColumnGroups, weekColumnGroups, isOvertime, trafficLight, trafficLightFill, trafficLightText, overtimeStage, overtimeStageFill, overtimeStageText, overtimeBorderClass, buildAgencyBreakdown, MF_UNCATEGORIZED_KEY, type Summary, type DayRow, type CalendarWeeks, type InternalBreakdownRow } from "./dashboard-utils";

const S: Summary = {
  byMember: [
    { userId: "u1", name: "Ana", email: "ana@mf.io", totalHours: 12.5, clients: [{ clientIdCode: "PURA", hours: 10.5 }, { clientIdCode: "INTERNAL", hours: 2 }] },
    { userId: "u2", name: "Bo", email: "bo@mf.io", totalHours: 20, clients: [{ clientIdCode: "PURA", hours: 20 }] },
  ],
  byClient: [
    { clientIdCode: "PURA", totalHours: 30.5, members: [{ userId: "u2", name: "Bo", hours: 20 }, { userId: "u1", name: "Ana", hours: 10.5 }] },
    { clientIdCode: "INTERNAL", totalHours: 2, members: [{ userId: "u1", name: "Ana", hours: 2 }] },
  ],
  categories: [],
};

it("clientLabel maps INTERNAL to 1o8", () => {
  expect(clientLabel("INTERNAL")).toBe("1o8");
  expect(clientLabel("PURA")).toBe("PURA");
});

it("computeKpis totals members, clients and average", () => {
  expect(computeKpis(S)).toEqual({ totalHours: 32.5, activeMembers: 2, activeClients: 2, avgHoursPerMember: 16.25 });
});

it("topMembers/topClients sort by hours desc and cap at n", () => {
  expect(topMembers(S, 1)).toEqual([{ key: "u2", label: "Bo", hours: 20 }]);
  expect(topClients(S, 1)).toEqual([{ key: "PURA", label: "PURA", hours: 30.5 }]);
});

it("buildHeatmap exposes member/client axes and cell lookup", () => {
  const h = buildHeatmap(S);
  expect(h.members.map((m) => m.userId).sort()).toEqual(["u1", "u2"]);
  expect(h.clients.map((c) => c.code).sort()).toEqual(["INTERNAL", "PURA"]);
  expect(h.cell("u1", "PURA")).toBe(10.5);
  expect(h.cell("u2", "INTERNAL")).toBe(0);
});

it("filterSummary narrows to selected members and clients and re-pivots", () => {
  const f = filterSummary(S, ["u1"], []);
  expect(f.byMember.map((m) => m.userId)).toEqual(["u1"]);
  expect(f.byClient.find((c) => c.clientIdCode === "PURA")?.totalHours).toBe(10.5);

  const g = filterSummary(S, [], ["INTERNAL"]);
  expect(g.byClient.map((c) => c.clientIdCode)).toEqual(["INTERNAL"]);
  expect(g.byMember.map((m) => m.userId)).toEqual(["u1"]);
});

it("parseLocalDate builds a local-midnight date matching the input components (no UTC off-by-one)", () => {
  const d = parseLocalDate("2026-07-21");
  expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 21]);
});

it("formatDayLabel renders a non-empty label containing the day of month", () => {
  const label = formatDayLabel("2026-07-21");
  expect(label.length).toBeGreaterThan(0);
  expect(label).toContain("21");
});

it("formatWeekdayLabel renders only the short weekday, local-parsed (no day-of-month)", () => {
  // Local-parsed, so a negative-offset host cannot shift Wed 2026-07-01 back to Tuesday.
  expect(formatWeekdayLabel("2026-07-01")).toBe("Wed");
  expect(formatWeekdayLabel("2026-08-01")).toBe("Sat");
  expect(formatWeekdayLabel("2026-07-01")).not.toContain("1");
});

it("formatWeekdayLabel stays inside the heatmap header's ~8-character column budget", () => {
  // Row 4 has content in every column, so unlike the month row it cannot overflow.
  for (const d of enumerateDays("2026-08-01", "2026-08-07")) {
    expect(formatWeekdayLabel(d).length).toBeLessThanOrEqual(8);
  }
});

it("formatDayRowLabel renders MM/DD/YYYY + short weekday, zero-padded, local-parsed", () => {
  expect(formatDayRowLabel("2026-07-01")).toBe("07/01/2026 Wed");
  expect(formatDayRowLabel("2026-12-25")).toBe("12/25/2026 Fri");
});

it("formatTimeRange strips seconds, uses 12-hour am/pm, en-dash separator", () => {
  expect(formatTimeRange("09:00:00", "12:30:00")).toBe("9:00 AM – 12:30 PM");
  expect(formatTimeRange("13:05:00", "18:30:00")).toBe("1:05 PM – 6:30 PM");
  expect(formatTimeRange("00:00:00", "12:00:00")).toBe("12:00 AM – 12:00 PM");
  expect(formatTimeRange("09:00", "17:15")).toBe("9:00 AM – 5:15 PM");
});

describe("buildCategoryQuery", () => {
  it("returns empty string for no categories", () => {
    expect(buildCategoryQuery([])).toBe("");
  });
  it("builds one repeated param per category", () => {
    expect(buildCategoryQuery(["Design", "Dev"])).toBe("&category=Design&category=Dev");
  });
  it("url-encodes labels with spaces and ampersands", () => {
    expect(buildCategoryQuery(["R & D", "Client Ops"])).toBe(
      "&category=R%20%26%20D&category=Client%20Ops",
    );
  });
});

describe("enumerateDays", () => {
  it("lists inclusive days in a range", () => {
    expect(enumerateDays("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01", "2026-07-02", "2026-07-03",
    ]);
  });
  it("returns a single day when from === to", () => {
    expect(enumerateDays("2026-07-05", "2026-07-05")).toEqual(["2026-07-05"]);
  });
  it("crosses month boundaries", () => {
    expect(enumerateDays("2026-07-30", "2026-08-01")).toEqual([
      "2026-07-30", "2026-07-31", "2026-08-01",
    ]);
  });
  it("returns [] when from is after to", () => {
    expect(enumerateDays("2026-07-05", "2026-07-01")).toEqual([]);
  });
});

describe("fmtHM", () => {
  it("formats decimal hours as HH:MM, both parts zero-padded", () => {
    expect(fmtHM(26.73)).toBe("26:44");
    expect(fmtHM(2)).toBe("02:00");
    expect(fmtHM(0)).toBe("00:00");
  });

  it("reads as a duration, not a clock time - past 24h it does not wrap", () => {
    expect(fmtHM(30)).toBe("30:00");
  });

  it("adds a thousand separator on the hours side above 999", () => {
    expect(fmtHM(3358 + 46 / 60)).toBe("3,358:46");
    expect(fmtHM(1000)).toBe("1,000:00");
  });
});

describe("buildDayHeatmap", () => {
  const days = ["2026-07-01", "2026-07-02"];
  const rows: DayRow[] = [
    { key: "u1", keyName: "Ana", entryDate: "2026-07-01", totalHours: "4.00" },
    { key: "u1", keyName: "Ana", entryDate: "2026-07-02", totalHours: "1.50" },
    { key: "u2", keyName: "Bo", entryDate: "2026-07-01", totalHours: "8.00" },
  ];

  it("sorts keys by total hours desc and carries keyName", () => {
    const h = buildDayHeatmap(rows, days);
    expect(h.keys).toEqual([
      { key: "u2", keyName: "Bo" },
      { key: "u1", keyName: "Ana" },
    ]);
  });
  it("cell returns hours for a key+date, 0 when absent", () => {
    const h = buildDayHeatmap(rows, days);
    expect(h.cell("u1", "2026-07-01")).toBe(4);
    expect(h.cell("u2", "2026-07-02")).toBe(0);
  });
  it("dayTotal sums all keys for a date", () => {
    const h = buildDayHeatmap(rows, days);
    expect(h.dayTotal("2026-07-01")).toBe(12);
    expect(h.dayTotal("2026-07-02")).toBe(1.5);
  });
  it("exposes maxCell and maxDayTotal floored at 1", () => {
    expect(buildDayHeatmap(rows, days).maxCell).toBe(8);
    expect(buildDayHeatmap(rows, days).maxDayTotal).toBe(12);
    expect(buildDayHeatmap([], days).maxCell).toBe(1);
    expect(buildDayHeatmap([], days).maxDayTotal).toBe(1);
  });
});

it("hoursBucket maps hours to workday-anchored levels 0-4", () => {
  expect(hoursBucket(0)).toBe(0);
  expect(hoursBucket(-3)).toBe(0);
  expect(hoursBucket(0.5)).toBe(1);
  expect(hoursBucket(1.99)).toBe(1);
  expect(hoursBucket(2)).toBe(2);
  expect(hoursBucket(3.9)).toBe(2);
  expect(hoursBucket(4)).toBe(3);
  expect(hoursBucket(5.5)).toBe(3);
  expect(hoursBucket(6)).toBe(4);
  expect(hoursBucket(12)).toBe(4);
  expect(hoursBucket(Number.NaN)).toBe(0);
});

it("isOvertime is true only strictly past an 8h workday", () => {
  expect(isOvertime(8)).toBe(false);
  expect(isOvertime(8.01)).toBe(true);
  expect(isOvertime(0)).toBe(false);
  expect(isOvertime(-3)).toBe(false);
  expect(isOvertime(Number.NaN)).toBe(false);
});

it("trafficLight is yellow under 8h, green at 8:00, red from 8:01", () => {
  expect(trafficLight(0)).toBe("empty");
  expect(trafficLight(7.75)).toBe("under"); // 7:45
  expect(trafficLight(7 + 59 / 60)).toBe("under"); // 7:59
  expect(trafficLight(8)).toBe("target");
  expect(trafficLight(8 + 1 / 60)).toBe("over"); // 8:01
  expect(trafficLight(8.5)).toBe("over");
  expect(trafficLight(Number.NaN)).toBe("empty");
});

it("trafficLightFill scales yellow under 8h and red over 8h; 8:00 is solid green", () => {
  expect(trafficLightFill(0)).toBe("var(--card)");
  expect(trafficLightFill(1)).toContain("brand-yellow");
  expect(trafficLightFill(1)).toContain("25%");
  expect(trafficLightFill(7)).toBe("var(--brand-yellow)");
  expect(trafficLightFill(8)).toBe("#34C759");
  expect(trafficLightFill(9)).toContain("overtime-blue");
  expect(trafficLightFill(21)).toBe("var(--overtime-blue)");
  expect(trafficLightText(8)).toBe("text-white");
  expect(trafficLightText(21)).toContain("overtime-blue-foreground");
});

it("trafficLight accepts a custom target (team All row uses 40h)", () => {
  expect(trafficLight(39.9, 40)).toBe("under");
  expect(trafficLight(40, 40)).toBe("target");
  expect(trafficLight(40 + 1 / 60, 40)).toBe("over");
  expect(trafficLightFill(40, 40)).toBe("#34C759");
  expect(trafficLightFill(20, 40)).toContain("brand-yellow");
  expect(trafficLightFill(51, 40)).toContain("overtime-blue");
});

it("overtimeStage bands 8:01+ into four stages; 8:00 and below stay stage 0 (orange)", () => {
  expect(overtimeStage(7.75)).toBe(0); // 7:45
  expect(overtimeStage(8)).toBe(0);
  expect(overtimeStage(8.01)).toBe(1);
  expect(overtimeStage(8.5)).toBe(1); // 8:30
  expect(overtimeStage(11.99)).toBe(1);
  expect(overtimeStage(12)).toBe(2);
  expect(overtimeStage(15.99)).toBe(2);
  expect(overtimeStage(16)).toBe(3);
  expect(overtimeStage(19.99)).toBe(3);
  expect(overtimeStage(20)).toBe(4);
  expect(overtimeStage(24)).toBe(4);
  expect(overtimeStage(30)).toBe(4); // clamped, no error for a mis-entered day
  expect(overtimeStage(Number.NaN)).toBe(0);
});

it("overtimeStageFill ramps toward solid --overtime-blue as the stage rises, stage 4 is the pure color", () => {
  expect(overtimeStageFill(0)).toBe("var(--card)");
  expect(overtimeStageFill(4)).toBe("var(--overtime-blue)");
  const fills = ([1, 2, 3, 4] as const).map(overtimeStageFill);
  expect(new Set(fills).size).toBe(4); // four visually distinct stages
});

it("overtimeStageText swaps to the light overtime foreground from stage 3 up", () => {
  expect(overtimeStageText(0)).not.toBe(overtimeStageText(4));
  expect(overtimeStageText(1)).toBe(overtimeStageText(2));
  expect(overtimeStageText(3)).toBe(overtimeStageText(4));
  expect(overtimeStageText(4)).toContain("overtime-blue-foreground");
});

it("overtimeBorderClass swaps to a heavy pure-red overtime marker only past 8h", () => {
  expect(overtimeBorderClass(8)).not.toContain("#FF0000");
  expect(overtimeBorderClass(8.01)).toContain("border-4");
  expect(overtimeBorderClass(8.01)).toContain("#FF0000");
});

it("sumHoursByDay accumulates hours per entryDate", () => {
  const m = sumHoursByDay([
    { entryDate: "2026-07-21", hours: 8 },
    { entryDate: "2026-07-21", hours: 0.5 },
    { entryDate: "2026-07-22", hours: 7.67 },
  ]);
  expect(m.get("2026-07-21")).toBe(8.5);
  expect(m.get("2026-07-22")).toBe(7.67);
  expect(m.size).toBe(2);
});

it("sumHoursByDay returns empty map for empty input", () => {
  expect(sumHoursByDay([]).size).toBe(0);
});

it("trailingRange returns a to=today window months back", () => {
  expect(trailingRange("2026-07-30", 3)).toEqual({ from: "2026-04-30", to: "2026-07-30" });
  expect(trailingRange("2026-07-30", 6)).toEqual({ from: "2026-01-30", to: "2026-07-30" });
  expect(trailingRange("2026-07-30", 12)).toEqual({ from: "2025-07-30", to: "2026-07-30" });
});

it("trailingRange clamps to shorter target months (no month overflow)", () => {
  // 3 months before May 31 is Feb 31 → clamp to Feb 28 (2026 not a leap year)
  expect(trailingRange("2026-05-31", 3)).toEqual({ from: "2026-02-28", to: "2026-05-31" });
});

it("buildCalendarWeeks lays days into Mon-first week columns with padding", () => {
  // 2026-07-01 is a Wednesday; 2026-07-14 is a Tuesday.
  const { weeks } = buildCalendarWeeks("2026-07-01", "2026-07-14");
  // First column: Mon 06-29, Tue 06-30 are BEFORE 'from' → padded "".
  expect(weeks[0]).toEqual(["", "", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]);
  expect(weeks[1]).toEqual(["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"]);
  // Last column: Mon 07-13, Tue 07-14, then padded to 7.
  expect(weeks[2]).toEqual(["2026-07-13", "2026-07-14", "", "", "", "", ""]);
  expect(weeks[2].length).toBe(7);
});

it("buildCalendarWeeks emits a month label at the starting column and at month changes", () => {
  const { monthLabels } = buildCalendarWeeks("2026-06-28", "2026-07-05");
  // 2026-06-28 is a Sunday → week col 0 is all June (28th). Week col 1 starts Mon 06-29 and contains Jul 1.
  expect(monthLabels[0]).toEqual({ index: 0, label: "Jun" });
  expect(monthLabels.some((m) => m.label === "Jul")).toBe(true);
});

it("buildCalendarWeeks does not double-label column 0 when a Monday-start week itself contains a 1st-of-month", () => {
  // 2026-06-29 is a Monday -> lead=0, so there is exactly ONE week column: [06-29..07-05].
  // That column holds 2 June days and 5 July days, so its owning month is July.
  // The column must carry exactly ONE label - never one entry per month present.
  const { monthLabels } = buildCalendarWeeks("2026-06-29", "2026-07-05");
  expect(monthLabels).toEqual([{ index: 0, label: "Jul" }]);
  const indices = monthLabels.map((m) => m.index);
  expect(new Set(indices).size).toBe(indices.length); // no duplicate index values
});

describe("isoWeekNumber", () => {
  it("returns the ISO-8601 week for ordinary dates", () => {
    expect(isoWeekNumber("2026-04-30")).toBe(18); // Thursday
    expect(isoWeekNumber("2026-05-04")).toBe(19); // the following Monday
    expect(isoWeekNumber("2026-07-30")).toBe(31);
  });

  it("is constant across every day of one Mon-Sun week", () => {
    const week = [
      "2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30",
      "2026-05-01", "2026-05-02", "2026-05-03",
    ];
    expect(week.map(isoWeekNumber)).toEqual([18, 18, 18, 18, 18, 18, 18]);
  });

  it("handles year boundaries by ISO rules, not calendar-year rules", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1);  // Thu -> week 1 of 2026
    expect(isoWeekNumber("2026-12-31")).toBe(53); // Thu -> week 53 of 2026
    expect(isoWeekNumber("2027-01-01")).toBe(53); // Fri -> still 2026-W53
    expect(isoWeekNumber("2024-12-30")).toBe(1);  // Mon -> already 2025-W01
    expect(isoWeekNumber("2021-01-01")).toBe(53); // Fri -> 2020-W53
  });

  it("is stable across DST transitions (local-date arithmetic must not drift)", () => {
    // US spring-forward 2026-03-08, fall-back 2026-11-01.
    expect(isoWeekNumber("2026-03-08")).toBe(10);
    expect(isoWeekNumber("2026-03-09")).toBe(11);
    expect(isoWeekNumber("2026-11-01")).toBe(44);
    expect(isoWeekNumber("2026-11-02")).toBe(45);
  });
});

describe("buildCalendarWeeks month ownership", () => {
  it("labels the month owning most of a straddling first column (regression: missing May)", () => {
    // trailingRange("2026-07-30", 3) -> from 2026-04-30, a Thursday. Column 0 spans
    // Apr 30 -> May 3: 1 April day, 3 May days. The old rule labeled it "Apr" and then
    // never labeled May at all, rendering "Apr, Jun, Jul".
    const { monthLabels } = buildCalendarWeeks("2026-04-30", "2026-07-30");
    expect(monthLabels).toEqual([
      { index: 0, label: "May" },
      { index: 5, label: "Jun" },
      { index: 9, label: "Jul" },
    ]);
  });

  it("emits at most one label per column index for a full 12-month window", () => {
    const { weeks, monthLabels, yearLabels } = buildCalendarWeeks("2025-07-30", "2026-07-30");
    expect(weeks.length).toBe(53);
    const indices = monthLabels.map((m) => m.index);
    expect(new Set(indices).size).toBe(indices.length);
    expect(monthLabels.length).toBe(12);
    expect(monthLabels[0].index).toBe(0);

    // Month labels are short names only; year lives on the separate yearLabels row.
    const labels = monthLabels.map((m) => m.label);
    expect(labels).toContain("Dec");
    expect(labels).toContain("Jan");
    expect(yearLabels.map((y) => y.label)).toEqual(
      expect.arrayContaining(["2025", "2026"]),
    );
  });

  it("never emits two consecutive labels for the same month", () => {
    const { monthLabels } = buildCalendarWeeks("2026-04-30", "2026-07-30");
    for (let i = 1; i < monthLabels.length; i++) {
      expect(monthLabels[i].label).not.toBe(monthLabels[i - 1].label);
    }
  });

  it("labels a single-month window exactly once, at column 0", () => {
    const { monthLabels } = buildCalendarWeeks("2026-07-01", "2026-07-14");
    expect(monthLabels).toEqual([{ index: 0, label: "Jul" }]);
  });
});

describe("buildCalendarWeeks year labels", () => {
  it("labels a single-year window exactly once, at column 0", () => {
    const { yearLabels } = buildCalendarWeeks("2026-07-01", "2026-07-14");
    expect(yearLabels).toEqual([{ index: 0, label: "2026" }]);
  });

  it("emits a year label at the starting column and at the Dec 31/Jan 1 boundary", () => {
    const { yearLabels } = buildCalendarWeeks("2025-12-28", "2026-01-04");
    expect(yearLabels).toEqual([
      { index: 0, label: "2025" },
      { index: 1, label: "2026" },
    ]);
  });
});

describe("weekTotals", () => {
  it("sums each column's real days and ignores padding", () => {
    const weeks = [
      ["", "", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
      ["2026-07-06", "2026-07-07", "", "", "", "", ""],
    ];
    const byDay = new Map([
      ["2026-07-01", 8],
      ["2026-07-02", 7.5],
      ["2026-07-03", 0.25],
      ["2026-07-06", 4],
      // 2026-07-20 is outside every column above and must not leak into a total.
      ["2026-07-20", 99],
    ]);
    // 8 + 7.5 + 0.25 = 15.75, all binary-exact, so toEqual is safe here.
    expect(weekTotals(weeks, byDay)).toEqual([15.75, 4]);
  });

  it("returns 0 for an all-padding column and for a column whose days are absent from byDay", () => {
    const weeks = [
      ["", "", "", "", "", "", ""],
      ["2026-07-06", "2026-07-07", "", "", "", "", ""],
    ];
    expect(weekTotals(weeks, new Map())).toEqual([0, 0]);
  });

  it("returns [] for no weeks", () => {
    expect(weekTotals([], new Map([["2026-07-01", 8]]))).toEqual([]);
  });

  it("is index-aligned with buildCalendarWeeks output", () => {
    // 3 columns: [pad,pad,07-01..07-05], [07-06..07-12], [07-13,07-14,pad...].
    const { weeks } = buildCalendarWeeks("2026-07-01", "2026-07-14");
    const byDay = sumHoursByDay([
      { entryDate: "2026-07-01", hours: 2 },
      { entryDate: "2026-07-13", hours: 3 },
    ]);
    const totals = weekTotals(weeks, byDay);
    expect(totals.length).toBe(weeks.length);
    expect(totals).toEqual([2, 0, 3]);
  });
});

describe("yearColumnGroups", () => {
  it("returns [] for no days", () => {
    expect(yearColumnGroups([])).toEqual([]);
  });

  it("labels index 0 and each year change", () => {
    const groups = yearColumnGroups(enumerateDays("2025-12-30", "2026-01-02"));
    expect(groups.map((g) => g.index)).toEqual([0, 2]);
    expect(groups[0].label).toBe("2025");
    expect(groups[1].label).toBe("2026");
  });

  it("emits one group when the range sits inside a single year", () => {
    expect(yearColumnGroups(enumerateDays("2026-01-01", "2026-12-31")).map((g) => g.index)).toEqual([0]);
  });

  it("labels the 4-digit year and nothing else", () => {
    expect(yearColumnGroups(enumerateDays("2026-08-01", "2026-08-03")).map((g) => g.label)).toEqual(["2026"]);
  });

  it("starts a year group on the same column as the January month group", () => {
    // The year and month rows must break together, or the two dividers desync.
    const days = enumerateDays("2025-12-28", "2026-01-04");
    expect(yearColumnGroups(days)[1].index).toBe(monthColumnGroups(days)[1].index);
  });
});

describe("monthColumnGroups", () => {
  it("returns [] for no days", () => {
    expect(monthColumnGroups([])).toEqual([]);
  });

  it("labels index 0 and each month change with the full month name", () => {
    const days = enumerateDays("2026-07-30", "2026-08-03");
    const groups = monthColumnGroups(days);
    expect(groups.map((g) => g.index)).toEqual([0, 2]);
    expect(groups.map((g) => g.label)).toEqual(["July", "August"]);
  });

  it("emits one group when the range sits inside a single month", () => {
    expect(monthColumnGroups(enumerateDays("2026-08-10", "2026-08-14")).map((g) => g.index)).toEqual([0]);
  });

  it("omits the year, which now has its own header row", () => {
    const groups = monthColumnGroups(enumerateDays("2025-12-30", "2026-01-02"));
    expect(groups.map((g) => g.index)).toEqual([0, 2]);
    expect(groups.map((g) => g.label)).toEqual(["December", "January"]);
  });
});

describe("weekColumnGroups", () => {
  it("returns [] for no days", () => {
    expect(weekColumnGroups([])).toEqual([]);
  });

  it("labels index 0 and each ISO week change (Mon starts a new week)", () => {
    // 2026-08-01 is a Saturday; Monday 2026-08-03 starts the next ISO week.
    const groups = weekColumnGroups(enumerateDays("2026-08-01", "2026-08-05"));
    expect(groups.map((g) => g.index)).toEqual([0, 2]);
    expect(groups[0].label).toBe(`W${String(isoWeekNumber("2026-08-01")).padStart(2, "0")}`);
    expect(groups[1].label).toBe(`W${String(isoWeekNumber("2026-08-03")).padStart(2, "0")}`);
  });

  it("emits one group when the range sits inside a single ISO week", () => {
    // Mon 2026-08-03 .. Wed 2026-08-05, same ISO week.
    expect(weekColumnGroups(enumerateDays("2026-08-03", "2026-08-05")).map((g) => g.index)).toEqual([0]);
  });

  it("zero-pads single-digit week numbers", () => {
    const groups = weekColumnGroups(enumerateDays("2026-01-05", "2026-01-06"));
    expect(groups[0].label).toMatch(/^W\d{2}$/);
  });
});

describe("buildAgencyBreakdown", () => {
  const rows: InternalBreakdownRow[] = [
    { userId: "u1", userName: "Ana", userEmail: "ana@mf.io", category: "Meetings", hours: 4, entries: 3 },
    { userId: "u1", userName: "Ana", userEmail: "ana@mf.io", category: "Gmail", hours: 1, entries: 2 },
    { userId: "u2", userName: "Bo", userEmail: "bo@mf.io", category: "Meetings", hours: 2, entries: 1 },
    { userId: "u2", userName: "Bo", userEmail: "bo@mf.io", category: null, hours: 3, entries: 2 },
  ];

  it("returns null when there are no INTERNAL hours", () => {
    expect(buildAgencyBreakdown([], 10)).toBeNull();
  });

  it("rolls up activities, people, KPIs and percents", () => {
    const b = buildAgencyBreakdown(rows, 20);
    expect(b).not.toBeNull();
    expect(b!.totalHours).toBe(10);
    expect(b!.pctOfAll).toBe(50);
    expect(b!.entryCount).toBe(8);
    expect(b!.largestLabel).toBe("Meetings");
    expect(b!.meetingsAdminHours).toBe(6);
    expect(b!.meetingsAdminLabel).toBe("Meetings");
    expect(b!.activities.map((a) => [a.label, a.hours, a.pct])).toEqual([
      ["Meetings", 6, 60],
      ["Uncategorized", 3, 30],
      ["Gmail", 1, 10],
    ]);
    expect(b!.people.map((p) => [p.label, p.total, p.Meetings, p[MF_UNCATEGORIZED_KEY]])).toEqual([
      ["Ana", 5, 4, 0],
      ["Bo", 5, 2, 3],
    ]);
  });
});
