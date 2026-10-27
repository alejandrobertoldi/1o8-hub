import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  HOURS_EXPORT_HEADERS,
  buildHoursExportRows,
  generateHoursXlsx,
  hoursExportFilename,
  toHoursExportEntry,
  type HoursExportEntry,
  ADMIN_HOURS_EXPORT_HEADERS,
  adminHoursExportFilename,
  buildAdminHoursExportRows,
  generateAdminHoursXlsx,
  type AdminHoursExportEntry,
} from "./export";

const ENTRIES: HoursExportEntry[] = [
  {
    entryDate: "2026-07-16",
    startTime: "09:00",
    endTime: "11:30",
    hours: 2.5,
    clientIdCode: "PURA",
    category: "SEO",
    note: "Keyword map",
  },
  {
    entryDate: "2026-07-16",
    startTime: "13:00",
    endTime: "14:00",
    hours: 1,
    clientIdCode: "INTERNAL",
    category: null,
    note: null,
  },
];

describe("hoursExportFilename", () => {
  it("embeds the inclusive from/to dates", () => {
    expect(hoursExportFilename("2026-07-01", "2026-07-31")).toBe(
      "hours_2026-07-01_2026-07-31.xlsx"
    );
  });
});

describe("toHoursExportEntry", () => {
  it("trims HH:MM:SS times and coerces numeric hours", () => {
    expect(
      toHoursExportEntry({
        entryDate: "2026-07-16",
        startTime: "09:00:00",
        endTime: "11:30:00",
        hours: "2.50",
        clientIdCode: "PURA",
        category: "SEO",
        note: "Keyword map",
      })
    ).toEqual(ENTRIES[0]);
  });
});

describe("buildHoursExportRows", () => {
  it("starts with the canonical header row", () => {
    expect(buildHoursExportRows([])[0]).toEqual([...HOURS_EXPORT_HEADERS]);
  });

  it("maps entries and remaps INTERNAL to 1o8", () => {
    const rows = buildHoursExportRows(ENTRIES);
    expect(rows[1]).toEqual([
      "2026-07-16",
      "09:00",
      "11:30",
      2.5,
      "02:30",
      "PURA",
      "SEO",
      "Keyword map",
    ]);
    expect(rows[2]).toEqual([
      "2026-07-16",
      "13:00",
      "14:00",
      1,
      "01:00",
      "1o8",
      "",
      "",
    ]);
  });

  it("appends a Total row summing hours", () => {
    const rows = buildHoursExportRows(ENTRIES);
    expect(rows.at(-1)).toEqual(["Total", "", "", 3.5, "03:30", "", "", ""]);
  });

  it("still emits header + zero total when there are no entries", () => {
    expect(buildHoursExportRows([])).toEqual([
      [...HOURS_EXPORT_HEADERS],
      ["Total", "", "", 0, "00:00", "", "", ""],
    ]);
  });
});

describe("generateHoursXlsx", () => {
  it("writes a parseable workbook named Hours", () => {
    const buf = generateHoursXlsx(ENTRIES);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Hours"]);
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Hours, {
      header: 1,
    });
    expect(aoa[0]).toEqual([...HOURS_EXPORT_HEADERS]);
    expect(aoa.at(-1)?.[0]).toBe("Total");
    expect(aoa.at(-1)?.[3]).toBe(3.5);
  });
});

describe("admin (team-wide) export", () => {
  const ADMIN_ENTRIES: AdminHoursExportEntry[] = [
    {
      member: "Ana", email: "ana@1o8.agency", entryDate: "2026-07-16", clientIdCode: "KSS", department: "SEO",
      projectNumber: "KSS08132", projectName: "Keyword map", billingType: "Retainer", hours: 2.5, note: null,
    },
    {
      member: "Ben", email: "ben@1o8.agency", entryDate: "2026-07-16", clientIdCode: "INTERNAL", department: "Internal Meetings",
      projectNumber: "1O800000", projectName: "General internal work", billingType: "Internal (non-billable)", hours: 1, note: "Standup",
    },
  ];

  it("prefixes the filename so it can't collide with a personal timesheet", () => {
    expect(adminHoursExportFilename("2026-07-01", "2026-07-31")).toBe(
      "team_hours_2026-07-01_2026-07-31.xlsx"
    );
  });

  it("lists who, when, client, department, project and billing type, and totals hours", () => {
    const rows = buildAdminHoursExportRows(ADMIN_ENTRIES);
    expect(rows[0]).toEqual([...ADMIN_HOURS_EXPORT_HEADERS]);
    expect(rows[1]).toEqual([
      "Ana", "ana@1o8.agency", "2026-07-16", "KSS", "SEO", "KSS08132", "Keyword map", "Retainer", 2.5, "02:30", "",
    ]);
    expect(rows[2][3]).toBe("1o8");
    const total = rows[rows.length - 1];
    expect(total[0]).toBe("Total");
    expect(total[8]).toBe(3.5);
    expect(rows).toHaveLength(ADMIN_ENTRIES.length + 2);
  });

  it("writes a parseable workbook with a 'Team hours' sheet", () => {
    const wb = XLSX.read(generateAdminHoursXlsx(ADMIN_ENTRIES), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Team hours"]);
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Team hours"], { header: 1 });
    expect(aoa[1][0]).toBe("Ana");
    expect(aoa[aoa.length - 1][8]).toBe(3.5);
  });
});
