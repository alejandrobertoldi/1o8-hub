/**
 * 1o8 time tracking rules — the "Lists" tab of the TIME TRACKING 2.0 (Pilot)
 * sheet as code. Pure (no DB), shared by the API and the UI.
 *
 * Project Number = CLIENT CODE + 5 digits:
 *   - MSN08132  → Mission, Asana task with 1o8 Internal ID INT-8132
 *   - MSN00000  → general account work with no Asana task
 *   - 1O8xxxxx  → 1o8's own time (internal codes below, or 1o8 Asana tasks)
 */
import { INTERNAL_CLIENT_CODE } from "@/lib/my-dashboard/asana-map";

export { INTERNAL_CLIENT_CODE };
export const INTERNAL_CLIENT_NAME = "1o8 Agency (Internal)";

export const TIME_SETTINGS = {
  /** Minimum hours per workday (PTO included). Day totals under it turn red. */
  dailyMinimumHours: 8,
  /** Hours must be a multiple of this (0.25 = 15 min). */
  hourStep: 0.25,
  maxHoursPerEntry: 24,
} as const;

/**
 * Department / Type of Work. `tag` narrows the Project list to Asana tasks
 * from that 1o8 team (asana_tasks.service_tags); null shows every project.
 */
export const WORK_TYPES = [
  { label: "Paid Media", tag: "Paid Media" },
  { label: "Email & SMS", tag: "Email" },
  { label: "Web Dev", tag: "Web Dev" },
  { label: "Creative", tag: "Creative" },
  { label: "SEO & Content", tag: "SEO" },
  { label: "Social", tag: "Social" },
  { label: "Strategy & Planning", tag: null },
  { label: "Reporting & Analytics", tag: null },
  { label: "Client Meetings", tag: null },
  { label: "Internal Meetings", tag: null },
  { label: "Project Management", tag: null },
  { label: "Admin Work", tag: null },
  { label: "Time Off", tag: null },
] as const;
export type WorkType = (typeof WORK_TYPES)[number]["label"];
export const isWorkType = (v: unknown): v is WorkType => WORK_TYPES.some((w) => w.label === v);
export const workTypeTag = (label: string) => WORK_TYPES.find((w) => w.label === label)?.tag ?? null;

/** Weekly capacity per person (the 40 h goal of the time-tracking dashboard). */
export const WEEKLY_CAPACITY_HOURS = 40;
/** Hours insights timesheet: rows returned at most (newest first). */
export const TIMESHEET_LIMIT = 2000;

export const BILLING_TYPES = {
  client: "Client work",
  internal: "Internal (non-billable)",
  pto: "PTO / Holiday",
} as const;
export type BillingType = (typeof BILLING_TYPES)[keyof typeof BILLING_TYPES];

/** Fixed 1O8 project numbers for time that can't go to a client. */
export const INTERNAL_PROJECTS = [
  { projectNumber: "1O800000", name: "General internal work", billingType: BILLING_TYPES.internal },
  { projectNumber: "1O890001", name: "PTO", billingType: BILLING_TYPES.pto },
  { projectNumber: "1O890002", name: "Company holiday", billingType: BILLING_TYPES.pto },
  { projectNumber: "1O890003", name: "Sales & new business", billingType: BILLING_TYPES.internal },
  { projectNumber: "1O890004", name: "Internal meetings", billingType: BILLING_TYPES.internal },
  { projectNumber: "1O890005", name: "Training & learning", billingType: BILLING_TYPES.internal },
  { projectNumber: "1O890006", name: "Agency ops & admin", billingType: BILLING_TYPES.internal },
] as const;

export const GENERAL_SUFFIX = "00000";
export const generalProjectNumber = (clientCode: string) => `${clientCode.toUpperCase()}${GENERAL_SUFFIX}`;

/** "INT-8132" → "08132". */
export function internalIdSuffix(internalId: string | null | undefined): string | null {
  const m = internalId?.match(/(\d+)/);
  return m ? m[1].slice(-5).padStart(5, "0") : null;
}

export function taskProjectNumber(clientCode: string, internalId: string | null | undefined): string | null {
  const suffix = internalIdSuffix(internalId);
  return suffix ? `${clientCode.toUpperCase()}${suffix}` : null;
}

/** Billing type is never chosen by people: it follows from client + project (sheet Lists K–M). */
export function billingTypeFor(clientCode: string, projectNumber: string): BillingType {
  if (clientCode.toUpperCase() !== INTERNAL_CLIENT_CODE) return BILLING_TYPES.client;
  return INTERNAL_PROJECTS.find((p) => p.projectNumber === projectNumber)?.billingType ?? BILLING_TYPES.internal;
}

export function isValidHours(hours: number): boolean {
  if (!Number.isFinite(hours) || hours <= 0 || hours > TIME_SETTINGS.maxHoursPerEntry) return false;
  const steps = hours / TIME_SETTINGS.hourStep;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** Monday–Friday count between two YYYY-MM-DD dates, inclusive. */
export function workdaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
