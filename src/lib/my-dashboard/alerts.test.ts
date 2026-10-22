import { describe, expect, it } from "vitest";
import { blockedAlerts, clientReadinessAlerts, sowAlerts, goLiveAlerts, lateAlerts, noDueDateAlert, ppcAlerts, rankAlerts, staleAlerts } from "./alerts";
import type { DashTask } from "./types";

describe("ppcAlerts", () => {
  it("maps severity and links to /ppc", () => {
    expect(ppcAlerts([{ id: "x", clientIdCode: "SOP_SC_US", severity: "critical", message: "Budget capped", createdAt: new Date("2026-10-06T00:00:00Z") }]))
      .toEqual([{ kind: "ppc", severity: "critical", clientIdCode: "SOP_SC_US", message: "Budget capped", url: "/ppc", at: "2026-10-06T00:00:00.000Z" }]);
  });
});

describe("staleAlerts", () => {
  it("flags clients ≥2 days behind the newest date, and clients with no data", () => {
    const a = staleAlerts([
      { clientIdCode: "OK_SC_US", latestSalesDate: "2026-10-05" },
      { clientIdCode: "TRT_SC_US", latestSalesDate: "2026-09-19" },
      { clientIdCode: "NEW_SC_US", latestSalesDate: null },
    ], "2026-10-06");
    expect(a.map((x) => [x.clientIdCode, x.message])).toEqual([
      ["TRT_SC_US", "Sales data ends 2026-09-19 (17 days behind)"],
      ["NEW_SC_US", "No sales data"],
    ]);
    expect(a[0].url).toBe("/sales-summary?client=TRT_SC_US");
  });
  it("returns [] without a reference date", () => expect(staleAlerts([{ clientIdCode: "A", latestSalesDate: null }], null)).toEqual([]));
});

describe("blockedAlerts", () => {
  const t = (status: string | null): DashTask => ({ id: status ?? "n", source: "asana", title: "Fix listing", clientIdCode: "SOP_SC_US", dueOn: null, status, priority: null, url: "https://asana/x" });
  it("only Blocked and On Hold", () => {
    expect(blockedAlerts([t("🚫Blocked"), t("⏸️On Hold"), t("🧑🏽‍💻In Progress"), t(null)]).map((a) => a.message))
      .toEqual(["Blocked: Fix listing", "On hold: Fix listing"]);
  });
});

describe("rankAlerts", () => {
  it("critical > warning > info, then 1o8 kinds before the legacy ppc > stale, then newest first", () => {
    const mk = (kind: "ppc" | "stale" | "blocked", severity: "critical" | "warning" | "info", at: string | null) =>
      ({ kind, severity, clientIdCode: null, message: `${kind}-${severity}-${at}`, url: "", at });
    const r = rankAlerts([mk("blocked", "warning", null), mk("ppc", "info", "2026-10-01"), mk("stale", "warning", "2026-09-19"),
      mk("ppc", "warning", "2026-10-01"), mk("ppc", "warning", "2026-10-05"), mk("ppc", "critical", "2026-09-01")]);
    expect(r.map((a) => a.message)).toEqual([
      "ppc-critical-2026-09-01", "blocked-warning-null", "ppc-warning-2026-10-05", "ppc-warning-2026-10-01",
      "stale-warning-2026-09-19", "ppc-info-2026-10-01",
    ]);
  });
});

const task = (over: Partial<DashTask>): DashTask => ({ id: "t", source: "asana", title: "Task", clientIdCode: "ELK", dueOn: null, status: null, priority: null, url: "https://app.asana.com/x", ...over });

describe("1o8 alerts", () => {
  it("flags tasks 3+ days late, critical from 7", () => {
    const a = lateAlerts([task({ dueOn: "2026-10-19" }), task({ dueOn: "2026-10-18", title: "A" }), task({ dueOn: "2026-10-14", title: "B" }), task({ source: "hub", dueOn: "2026-10-01" })], "2026-10-21");
    expect(a.map((x) => [x.severity, x.message])).toEqual([["warning", "3 days late: A"], ["critical", "7 days late: B"]]);
  });
  it("flags Go Lives this week and passed ones", () => {
    const a = goLiveAlerts([
      task({ goLiveDate: "2026-10-21", title: "Today" }),
      task({ goLiveDate: "2026-10-23", title: "Thu" }),
      task({ goLiveDate: "2026-10-20", title: "Missed" }),
      task({ goLiveDate: "2026-11-30", title: "Later" }),
    ], "2026-10-21");
    expect(a.map((x) => [x.severity, x.message])).toEqual([
      ["warning", "Goes live today: Today"],
      ["warning", "Goes live Fri, Oct 23: Thu"],
      ["critical", "Go Live passed (Tue, Oct 20), still open: Missed"],
    ]);
  });
  it("summarizes tasks without a due date", () => {
    expect(noDueDateAlert([task({}), task({}), task({ dueOn: "2026-10-30" })])[0].message).toBe("2 open tasks with no due date");
    expect(noDueDateAlert([task({ dueOn: "2026-10-30" })])).toEqual([]);
  });
  it("flags clients under 70% readiness, critical under 50%", () => {
    const a = clientReadinessAlerts([
      { clientIdCode: "OK", clientName: "Ok", open: 10, overdue: 3 },
      { clientIdCode: "MID", clientName: "Mid", open: 10, overdue: 4 },
      { clientIdCode: "BAD", clientName: "Bad", open: 4, overdue: 3 },
      { clientIdCode: "NONE", clientName: "None", open: 0, overdue: 0 },
    ]);
    expect(a.map((x) => [x.clientIdCode, x.severity])).toEqual([["MID", "warning"], ["BAD", "critical"]]);
  });
  it("ranks critical first, then Go Lives before late tasks", () => {
    const r = rankAlerts([...noDueDateAlert([task({})]), ...lateAlerts([task({ dueOn: "2026-10-01" })], "2026-10-21"), ...goLiveAlerts([task({ goLiveDate: "2026-10-19" })], "2026-10-21")]);
    expect(r.map((x) => x.kind)).toEqual(["golive", "late", "nodate"]);
  });
});

describe("sowAlerts", () => {
  it("warns 30 days ahead and flags expired SOWs", () => {
    const a = sowAlerts([
      { clientIdCode: "SPF", clientName: "Smack Pet Foods", raw: { "Last Day of Term": "October 27, 2026", "SOW Status": "Active" } },
      { clientIdCode: "KSS", clientName: "K9 Sport Sack", raw: { "Last Day of Term": "April 30, 2026", "SOW Status": "Expired" } },
      { clientIdCode: "MSN", clientName: "MISSION", raw: { "Last Day of Term": "December 31, 2026" } },
      { clientIdCode: "PKI", clientName: "Pikos", raw: { "Last Day of Term": "Month To Month 30 day notice" } },
    ], "2026-10-22");
    expect(a.map((x) => [x.clientIdCode, x.severity, x.message])).toEqual([
      ["SPF", "warning", "Smack Pet Foods SOW expires in 5 days"],
      ["KSS", "critical", "K9 Sport Sack SOW expired on Apr 30, 2026"],
    ]);
  });
});
