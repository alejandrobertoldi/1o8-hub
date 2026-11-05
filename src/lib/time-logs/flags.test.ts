import { describe, expect, it } from "vitest";
import { hoursFlag } from "./flags";

const opts = { start: "2026-11-02", min: 8, windowDays: 14 };

describe("hoursFlag", () => {
  // Thu Nov 5 2026: Mon 2 = 8 h, Tue 3 = 4.5 h, Wed 4 = nothing, today 2 h.
  const logs = [
    { entryDate: "2026-11-02", hours: "8.00" },
    { entryDate: "2026-11-03", hours: "3" },
    { entryDate: "2026-11-03", hours: 1.5 },
    { entryDate: "2026-11-05", hours: "2" },
  ];

  it("flags finished workdays under the minimum, newest first", () => {
    const f = hoursFlag(logs, "2026-11-05", opts);
    expect(f.shortDays).toEqual([
      { date: "2026-11-04", hours: 0 },
      { date: "2026-11-03", hours: 4.5 },
    ]);
    expect(f.today).toBe(2);
    expect(f.lastWorkday).toEqual({ date: "2026-11-04", hours: 0 });
  });

  it("counts this week's expected hours up to yesterday", () => {
    expect(hoursFlag(logs, "2026-11-05", opts).week).toEqual({ logged: 14.5, expected: 24 });
  });

  it("skips weekends and days before hour logging went live", () => {
    // Monday Nov 9: last workday is Friday Nov 6; nothing before Nov 2 counts.
    const f = hoursFlag([{ entryDate: "2026-11-06", hours: 8 }], "2026-11-09", opts);
    expect(f.lastWorkday).toEqual({ date: "2026-11-06", hours: 8 });
    expect(f.shortDays.map((d) => d.date)).toEqual(["2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02"]);
    expect(hoursFlag([], "2026-11-02", opts)).toMatchObject({ lastWorkday: null, shortDays: [], week: { expected: 0 } });
  });
});
