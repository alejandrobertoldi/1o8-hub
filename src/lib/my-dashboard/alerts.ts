import { dataLagDays, isDataStale } from "@/lib/sales-summary-header";
import type { DashAlert, DashTask } from "./types";
import { sowStatus } from "@/lib/clients/sow";

// ── MarketFoundry (Amazon) alerts — kept for reference, not used by 1o8 (2026-10-21). ──
export interface PpcAlertRow { id: string; clientIdCode: string; severity: "info" | "warning" | "critical"; message: string; createdAt: Date }

export function ppcAlerts(rows: PpcAlertRow[]): DashAlert[] {
  return rows.map((r) => ({ kind: "ppc", severity: r.severity, clientIdCode: r.clientIdCode, message: r.message, url: "/ppc", at: r.createdAt.toISOString() }));
}

export function staleAlerts(clients: { clientIdCode: string; latestSalesDate: string | null }[], referenceDate: string | null): DashAlert[] {
  if (!referenceDate) return [];
  return clients.filter((c) => isDataStale(c.latestSalesDate, referenceDate)).map((c) => ({
    kind: "stale", severity: "warning", clientIdCode: c.clientIdCode,
    message: c.latestSalesDate ? `Sales data ends ${c.latestSalesDate} (${dataLagDays(c.latestSalesDate, referenceDate)} days behind)` : "No sales data",
    url: `/sales-summary?client=${encodeURIComponent(c.clientIdCode)}`, at: c.latestSalesDate,
  }));
}

export function blockedAlerts(tasks: DashTask[]): DashAlert[] {
  const out: DashAlert[] = [];
  for (const t of tasks) {
    const s = t.status ?? "";
    const label = /blocked/i.test(s) ? "Blocked" : /on hold/i.test(s) ? "On hold" : null;
    if (label) out.push({ kind: "blocked", severity: "warning", clientIdCode: t.clientIdCode, message: `${label}: ${t.title}`, url: t.url, at: t.dueOn });
  }
  return out;
}

// ── 1o8 alerts ────────────────────────────────────────────────────────

/** A task this many days past due becomes an alert; from LATE_CRITICAL_DAYS it's critical. */
export const LATE_DAYS = 3;
export const LATE_CRITICAL_DAYS = 7;
/** Go Lives this many days ahead are flagged. */
export const GO_LIVE_WINDOW_DAYS = 7;
/** Client readiness under this % is flagged; under CLIENT_CRITICAL_PCT it's critical. */
export const CLIENT_READINESS_PCT = 70;
export const CLIENT_CRITICAL_PCT = 50;

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** My Asana tasks LATE_DAYS+ past due (critical from LATE_CRITICAL_DAYS). */
export function lateAlerts(tasks: DashTask[], today: string): DashAlert[] {
  return tasks.flatMap((t): DashAlert[] => {
    if (t.source !== "asana" || !t.dueOn) return [];
    const late = dayDiff(t.dueOn, today);
    if (late < LATE_DAYS) return [];
    return [{
      kind: "late", severity: late >= LATE_CRITICAL_DAYS ? "critical" : "warning", clientIdCode: t.clientIdCode,
      message: `${late} days late: ${t.title}`, url: t.url, at: t.dueOn,
    }];
  });
}

/** Open tasks whose Go Live Date already passed (critical) or is within the next GO_LIVE_WINDOW_DAYS (warning). */
export function goLiveAlerts(tasks: DashTask[], today: string): DashAlert[] {
  return tasks.flatMap((t): DashAlert[] => {
    if (!t.goLiveDate) return [];
    const inDays = dayDiff(today, t.goLiveDate);
    if (inDays > GO_LIVE_WINDOW_DAYS) return [];
    const message = inDays < 0
      ? `Go Live passed (${fmtDay(t.goLiveDate)}), still open: ${t.title}`
      : inDays === 0 ? `Goes live today: ${t.title}` : `Goes live ${fmtDay(t.goLiveDate)}: ${t.title}`;
    return [{ kind: "golive", severity: inDays < 0 ? "critical" : "warning", clientIdCode: t.clientIdCode, message, url: t.url, at: t.goLiveDate }];
  });
}

/** One summary alert for my open Asana tasks with no due date (they never show as late). */
export function noDueDateAlert(tasks: DashTask[]): DashAlert[] {
  const n = tasks.filter((t) => t.source === "asana" && !t.dueOn).length;
  if (!n) return [];
  return [{ kind: "nodate", severity: "info", clientIdCode: null, message: `${n} open task${n === 1 ? "" : "s"} with no due date`, url: "#tasks-nodate", at: null }];
}

/** My clients whose Asana readiness (1 − overdue / open, all assignees) is under CLIENT_READINESS_PCT. */
export function clientReadinessAlerts(clients: { clientIdCode: string; clientName: string; open: number; overdue: number }[]): DashAlert[] {
  return clients.flatMap((c): DashAlert[] => {
    if (!c.open) return [];
    const pct = Math.round((1 - c.overdue / c.open) * 100);
    if (pct >= CLIENT_READINESS_PCT) return [];
    return [{
      kind: "client", severity: pct < CLIENT_CRITICAL_PCT ? "critical" : "warning", clientIdCode: c.clientIdCode,
      message: `${c.clientName} readiness ${pct}% (${c.overdue} of ${c.open} tasks overdue)`,
      url: `/clients/${encodeURIComponent(c.clientIdCode)}`, at: null,
    }];
  });
}

/** My clients whose SOW expired (critical) or ends within SOW_WARNING_DAYS (warning). */
export function sowAlerts(clients: { clientIdCode: string; clientName: string; raw: Record<string, unknown> }[], today: string): DashAlert[] {
  return clients.flatMap((c): DashAlert[] => {
    const s = sowStatus(c.raw, today);
    if (s.state !== "expired" && s.state !== "expiring") return [];
    return [{
      kind: "sow", severity: s.state === "expired" ? "critical" : "warning", clientIdCode: c.clientIdCode,
      message: `${c.clientName} SOW ${s.state === "expired" ? `expired${s.endDate ? ` on ${new Date(`${s.endDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}` : s.label.toLowerCase()}`,
      url: `/clients/${encodeURIComponent(c.clientIdCode)}`, at: s.endDate,
    }];
  });
}

const SEV = { critical: 0, warning: 1, info: 2 } as const;
const KIND = { golive: 0, sow: 1, late: 2, client: 3, blocked: 4, nodate: 5, ppc: 6, stale: 7 } as const;
export function rankAlerts(alerts: DashAlert[]): DashAlert[] {
  return [...alerts].sort((a, b) =>
    SEV[a.severity] - SEV[b.severity] || KIND[a.kind] - KIND[b.kind] || (b.at ?? "").localeCompare(a.at ?? ""));
}
