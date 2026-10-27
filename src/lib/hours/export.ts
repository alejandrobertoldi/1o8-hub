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
// Hours Analytics over 1o8's time logs: who, when, client, department,
// project and billing type (logs carry hours only, no start/end clock).

export type AdminHoursExportEntry = {
  member: string;
  email: string;
  entryDate: string;
  clientIdCode: string;
  department: string;
  projectNumber: string;
  projectName: string;
  billingType: string;
  hours: number;
  note: string | null;
};

export const ADMIN_HOURS_EXPORT_HEADERS = [
  "Member",
  "Email",
  "Date",
  "Client",
  "Department",
  "Project #",
  "Project",
  "Billing type",
  "Hours",
  "Duration",
  "Note",
] as const;

export function adminHoursExportFilename(from: string, to: string): string {
  return `team_${hoursExportFilename(from, to)}`;
}

export function toAdminHoursExportEntry(row: {
  entryDate: string;
  hours: string | number;
  clientIdCode: string;
  department: string;
  projectNumber: string;
  projectName: string;
  billingType: string;
  note: string | null;
  userName: string | null;
  userEmail: string;
}): AdminHoursExportEntry {
  return {
    member: row.userName ?? row.userEmail,
    email: row.userEmail,
    entryDate: row.entryDate,
    clientIdCode: row.clientIdCode,
    department: row.department,
    projectNumber: row.projectNumber,
    projectName: row.projectName,
    billingType: row.billingType,
    hours: Number(row.hours),
    note: row.note,
  };
}

export function buildAdminHoursExportRows(
  entries: AdminHoursExportEntry[]
): (string | number)[][] {
  const body = entries.map((e) => [
    e.member,
    e.email,
    e.entryDate,
    clientLabel(e.clientIdCode),
    e.department,
    e.projectNumber,
    e.projectName,
    e.billingType,
    e.hours,
    formatHoursMinutes(e.hours),
    e.note ?? "",
  ]);
  const total = round2(entries.reduce((sum, e) => sum + e.hours, 0));
  return [
    [...ADMIN_HOURS_EXPORT_HEADERS],
    ...body,
    ["Total", "", "", "", "", "", "", "", total, formatHoursMinutes(total), ""],
  ];
}

export function generateAdminHoursXlsx(entries: AdminHoursExportEntry[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(buildAdminHoursExportRows(entries));
  ws["!cols"] = [
    { wch: 20 },
    { wch: 30 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 36 },
    { wch: 22 },
    { wch: 8 },
    { wch: 10 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Team hours");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
