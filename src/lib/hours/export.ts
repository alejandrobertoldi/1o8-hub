/**
 * Build an .xlsx timesheet from a user's logged hours in a date range.
 * Sheet layout is a single table (header + entries + total) so Excel
 * autofilter / SUM work without a title block above the data.
 */

import * as XLSX from "xlsx";
import { clientLabel } from "./dashboard-utils";
import { formatHoursMinutes } from "./validation";

export type HoursExportEntry = {
  entryDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  clientIdCode: string;
  category: string | null;
  note: string | null;
};

export const HOURS_EXPORT_HEADERS = [
  "Date",
  "Start",
  "End",
  "Hours",
  "Duration",
  "Client",
  "Category",
  "Note",
] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function hoursExportFilename(from: string, to: string): string {
  return `hours_${from}_${to}.xlsx`;
}

export function toHoursExportEntry(row: {
  entryDate: string;
  startTime: string;
  endTime: string;
  hours: string | number;
  clientIdCode: string;
  category: string | null;
  note: string | null;
}): HoursExportEntry {
  return {
    entryDate: row.entryDate,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    hours: Number(row.hours),
    clientIdCode: row.clientIdCode,
    category: row.category,
    note: row.note,
  };
}

export function buildHoursExportRows(
  entries: HoursExportEntry[]
): (string | number)[][] {
  const body = entries.map((e) => [
    e.entryDate,
    e.startTime,
    e.endTime,
    e.hours,
    formatHoursMinutes(e.hours),
    clientLabel(e.clientIdCode),
    e.category ?? "",
    e.note ?? "",
  ]);
  const total = round2(entries.reduce((sum, e) => sum + e.hours, 0));
  return [
    [...HOURS_EXPORT_HEADERS],
    ...body,
    ["Total", "", "", total, formatHoursMinutes(total), "", "", ""],
  ];
}

export function generateHoursXlsx(entries: HoursExportEntry[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(buildHoursExportRows(entries));
  ws["!cols"] = [
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Hours");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── Admin (team-wide) export ────────────────────────────────────────
// Same columns as the personal timesheet, prefixed with who logged it.

export type AdminHoursExportEntry = HoursExportEntry & {
  member: string;
  email: string;
};

export const ADMIN_HOURS_EXPORT_HEADERS = [
  "Member",
  "Email",
  ...HOURS_EXPORT_HEADERS,
] as const;

export function adminHoursExportFilename(from: string, to: string): string {
  return `team_${hoursExportFilename(from, to)}`;
}

export function toAdminHoursExportEntry(row: Parameters<typeof toHoursExportEntry>[0] & {
  userName: string | null;
  userEmail: string;
}): AdminHoursExportEntry {
  return {
    ...toHoursExportEntry(row),
    member: row.userName ?? row.userEmail,
    email: row.userEmail,
  };
}

export function buildAdminHoursExportRows(
  entries: AdminHoursExportEntry[]
): (string | number)[][] {
  const [, ...personal] = buildHoursExportRows(entries);
  const total = personal.pop()!;
  const body = personal.map((row, i) => [entries[i].member, entries[i].email, ...row]);
  return [
    [...ADMIN_HOURS_EXPORT_HEADERS],
    ...body,
    ["Total", "", "", ...total.slice(1)],
  ];
}

export function generateAdminHoursXlsx(entries: AdminHoursExportEntry[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(buildAdminHoursExportRows(entries));
  ws["!cols"] = [
    { wch: 20 },
    { wch: 30 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Team hours");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
