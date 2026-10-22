import { describe, it, expect, vi, beforeEach } from "vitest";
import { aac, asanaSyncState, asanaTasks, clientOnboardingSteps, monthlyReportAsanaLinks, monthlyReportGenerateFailures, monthlyReports, ppcAlerts, users } from "@/lib/db/schema";

// db.select().from(table)[.where()][.limit()] resolves to whatever `results` holds for that table.
const results = new Map<unknown, unknown>();
vi.mock("@/lib/db", () => {
  const chain = (table: unknown) => {
    const c: Record<string, unknown> = {
      where: () => c,
      limit: () => c,
      orderBy: () => c,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        const v = results.get(table);
        return (v instanceof Error ? Promise.reject(v) : Promise.resolve(v)).then(res, rej);
      },
    };
    return c;
  };
  return { db: { select: () => ({ from: chain }) } };
});
vi.mock("@/lib/sales-cache", () => ({
  buildDailyCacheKey: (s: string, e: string, ids: string) => `daily|${s}|${e}|${ids}`,
  buildSummaryCacheKey: (s: string, e: string) => `${s}|${e}`,
  getCachedData: async () => null,
  getCachedDataMany: async () => new Map(),
}));
vi.mock("@/lib/onboarding/create-asana-project", () => ({ hasAsanaToken: () => true }));

import { loadMyDashboard } from "./load";

const viewer = { id: "u1", canPick: false };

describe("loadMyDashboard section isolation (spec §8)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    results.clear();
    results.set(users, [{ id: "u1", name: "Ada Lovelace", email: "ada@marketfoundry.agency", image: null }]);
    results.set(asanaSyncState, []);
    results.set(asanaTasks, [{ gid: "t1", name: "Do it", clientIdCode: "ABC", dueOn: "2026-10-08", taskStatus: null, priority: null, permalinkUrl: "https://x" }]);
    results.set(clientOnboardingSteps, []);
    results.set(ppcAlerts, []);
    results.set(monthlyReports, []);
    results.set(monthlyReportGenerateFailures, []);
    results.set(aac, [{ clientIdCode: "ABC", clientName: "Abc", clientLogoUrl: null, rawData: { AccountManager_MF: "Ada Lovelace" } }]);
  });

  it("a throw while building accounts blanks only accounts, not tasks", async () => {
    results.set(aac, [{ clientIdCode: "ABC", clientName: "Abc", clientLogoUrl: null, rawData: { AccountManager_MF: 42 } }]);
    const out = await loadMyDashboard("u1", viewer, "2026-10-07");
    expect(out).not.toBeNull();
    expect(out!.accounts.error).toBeTruthy();
    expect(out!.dueStrip.error).toBeNull();
    expect(out!.dueStrip.data).not.toBeNull();
  });

  it("builds 1o8 alerts from my tasks and my clients' readiness", async () => {
    const out = await loadMyDashboard("u1", viewer, "2026-10-15");
    expect(out!.alerts.error).toBeNull();
    expect(out!.alerts.data?.map((a) => [a.kind, a.severity, a.message])).toEqual([
      ["late", "critical", "7 days late: Do it"],
      ["client", "critical", "Abc readiness 0% (1 of 1 tasks overdue)"],
    ]);
    expect(out!.accounts.data?.cards[0].alertCount).toBe(2);
    expect(out!.accounts.data?.cards[0].readiness).toEqual({ open: 1, dueToday: 0, overdue: 1, pct: 0 });
  });

  it("lists a monthly report waiting on this person's PM review; a failing reports query errors only that box", async () => {
    results.set(aac, [{ clientIdCode: "ABC", clientName: "Abc", clientLogoUrl: null, rawData: { ProjectManager_MF: "Ada Lovelace" } }]);
    results.set(monthlyReports, [{ id: "m1", clientIdCode: "ABC", period: "2026-09", status: "pm_review", updatedAt: new Date("2026-10-05T00:00:00Z") }]);
    const out = await loadMyDashboard("u1", viewer, "2026-10-07");
    expect(out!.reviews.data?.map((r) => [r.clientIdCode, r.stageLabel, r.waitingDays])).toEqual([["ABC", "PM review", 2]]);

    results.set(monthlyReports, new Error("reports down"));
    const out2 = await loadMyDashboard("u1", viewer, "2026-10-07");
    expect(out2!.reviews.error).toBe("reports down");
    expect(out2!.tasks.error).toBeNull();
  });
});

describe("generation-failure rows on /me", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    results.clear();
    results.set(users, [{ id: "u1", name: "Ada Lovelace", email: "ada@marketfoundry.agency", image: null }]);
    results.set(asanaSyncState, []);
    results.set(asanaTasks, []);
    results.set(clientOnboardingSteps, []);
    results.set(ppcAlerts, []);
    results.set(monthlyReports, [{ id: "m1", clientIdCode: "ABC", period: "2026-09", status: "pm_review", updatedAt: new Date("2026-10-05T00:00:00Z") }]);
    results.set(aac, [{ clientIdCode: "ABC", clientName: "Abc", clientLogoUrl: null, rawData: { ProjectManager_MF: "Ada Lovelace" } }]);
  });

  it("adds a Generation failed item for the PM", async () => {
    results.set(monthlyReportGenerateFailures, [{ clientIdCode: "ABC", period: "2026-09", attempts: 3, lastError: "x" }]);
    const out = await loadMyDashboard("u1", viewer, "2026-10-07");
    expect(out!.reviews.data?.map((r) => r.stageLabel)).toEqual(["PM review", "Generation failed (3\u00d7)"]);
  });

  it("a failing failures query (table not migrated yet) never errors the box", async () => {
    results.set(monthlyReportGenerateFailures, new Error('relation "monthly_report_generate_failures" does not exist'));
    const out = await loadMyDashboard("u1", viewer, "2026-10-07");
    expect(out!.reviews.error).toBeNull();
    expect(out!.reviews.data?.map((r) => r.stageLabel)).toEqual(["PM review"]);
  });
});

describe("monthly-report Asana link on /me", () => {
  const sub = (o: Record<string, unknown>) => ({ gid: "s1", url: "https://asana/s1", stage: "pm", email: "Ada@marketfoundry.agency", name: "1o8 | Monthly Reports | PM Review \u2014 Ada", dueOn: "2026-10-06", completed: false, ...o });
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    results.clear();
    results.set(users, [{ id: "u1", name: "Ada Lovelace", email: "ada@marketfoundry.agency", image: null }]);
    results.set(asanaSyncState, []);
    results.set(asanaTasks, []);
    results.set(clientOnboardingSteps, []);
    results.set(ppcAlerts, []);
    results.set(monthlyReports, []);
    results.set(monthlyReportGenerateFailures, []);
    results.set(aac, []);
  });

  it("exposes the latest period's parent url and the person's own open subtask as a task", async () => {
    results.set(monthlyReportAsanaLinks, [{ period: "2026-09", parentUrl: "https://asana/parent", subtasks: [sub({}), sub({ gid: "s2", email: "other@marketfoundry.agency" }), sub({ gid: "s3", completed: true })] }]);
    const out = await loadMyDashboard("u1", viewer, "2026-10-07");
    expect(out!.reviewsAsanaUrl).toBe("https://asana/parent");
    const all = Object.values(out!.tasks.data!).flat();
    expect(all).toEqual([{ id: "s1", source: "asana", title: "Monthly Reports \u2014 PM Review", clientIdCode: null, dueOn: "2026-10-06", status: null, priority: null, url: "https://asana/s1" }]);
  });

  it("dedupes a subtask already mirrored in asana_tasks", async () => {
    results.set(asanaTasks, [{ gid: "s1", name: "mirrored", clientIdCode: null, dueOn: "2026-10-06", taskStatus: null, priority: null, permalinkUrl: "https://x" }]);
    results.set(monthlyReportAsanaLinks, [{ period: "2026-09", parentUrl: "https://asana/parent", subtasks: [sub({})] }]);
    const out = await loadMyDashboard("u1", viewer, "2026-10-07");
    const all = Object.values(out!.tasks.data!).flat();
    expect(all.map((t) => t.title)).toEqual(["mirrored"]);
  });

  it("a rejecting link query (table not migrated) degrades silently", async () => {
    results.set(monthlyReportAsanaLinks, new Error('relation "monthly_report_asana_links" does not exist'));
    results.set(asanaTasks, [{ gid: "t1", name: "Do it", clientIdCode: "ABC", dueOn: "2026-10-08", taskStatus: null, priority: null, permalinkUrl: "https://x" }]);
    const out = await loadMyDashboard("u1", viewer, "2026-10-07");
    expect(out!.reviews.error).toBeNull();
    expect(out!.tasks.error).toBeNull();
    expect(Object.values(out!.tasks.data!).flat().map((t) => t.id)).toEqual(["t1"]);
    expect(out!.reviewsAsanaUrl).toBeNull();
  });
});

describe("section() timeout", () => {
  it("turns a query that never settles into a section error instead of hanging", async () => {
    const { section } = await import("./load");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await section(() => new Promise(() => {}), 50);
    expect(out).toEqual({ data: null, error: "Timed out after 0.05s" });
  });
  it("passes a fast result through untouched", async () => {
    const { section } = await import("./load");
    expect(await section(async () => 42, 50)).toEqual({ data: 42, error: null });
  });
});
