import { describe, expect, it } from "vitest";
import { SUMMARY_ROWS, clientTeam, driveFileId, rowGoal } from "./sales-summary";
import { sparkBucket } from "./sales-summary-server";
import { formatKpi } from "./values";

const row = (key: string) => SUMMARY_ROWS.find((r) => r.key === key)!;

describe("sales summary", () => {
  it("prorates monthly totals to the period and keeps averages as-is", () => {
    const kpis = [{ key: "net_sales", target: "$150k / mo" }, { key: "website_roas", target: "4x" }];
    expect(rowGoal(row("net_sales"), "money", kpis, 7)).toBeCloseTo((150_000 / 30.44) * 7);
    expect(rowGoal(row("website_roas"), "ratio", kpis, 7)).toBe(4);
    expect(rowGoal(row("orders"), "count", kpis, 7)).toBeNull();
  });

  it("builds the team chart from the AAC role columns, one entry per person", () => {
    const team = clientTeam({ ExecutiveStrategist_MF: "Aalap Shah", AccountManager_MF: "Barbara McDonald", PPCManager_MF: "Alex K, Evan D", EmailManager_1o8: "Barbara McDonald" });
    expect(team.find((m) => m.name === "Aalap Shah")?.level).toBe(1);
    expect(team.find((m) => m.name === "Barbara McDonald")).toMatchObject({ level: 2, roles: ["Account Manager", "Email Manager"] });
    expect(team.filter((m) => m.roles.includes("Paid Media Manager")).map((m) => m.level)).toEqual([3, 3]);
  });

  it("reads the Drive id of a brand guidelines logo", () => {
    expect(driveFileId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view")).toBe("1AbCdEfGhIjKlMnOp");
    expect(driveFileId(null)).toBeNull();
  });

  it("charts days, weeks or months depending on the period", () => {
    expect(sparkBucket("2026-10-26", "2026-11-01")).toBe("day");
    expect(sparkBucket("2026-10-01", "2026-10-31")).toBe("week");
    expect(sparkBucket("2026-01-01", "2026-11-04")).toBe("month");
  });

  it("shows millions as M", () => {
    expect(formatKpi({ value: 1_039_600, unit: "money", basis: "" })).toBe("$1.04M");
  });
});
