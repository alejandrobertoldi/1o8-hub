import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockedGetAuthSession, mockedGetMonthlyReport, mockedListMonthlyReportsForClient } = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedGetMonthlyReport: vi.fn(),
  mockedListMonthlyReportsForClient: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/monthly-report/report-store", () => ({
  getMonthlyReport: mockedGetMonthlyReport,
  listMonthlyReportsForClient: mockedListMonthlyReportsForClient,
}));

import { GET } from "./route";

const report = {
  meta: { client: "ReadyRESCUE", month: "July 2026", clientIdCode: "REA_SC_US" },
  sections: ["kpis"],
};

const sentRow = {
  report,
  status: "sent",
  period: "2026-07",
  clientIdCode: "REA_SC_US",
};

function get(params: Record<string, string>) {
  const url = new URL("http://localhost/api/portal/reports/monthly");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/portal/reports/monthly", () => {
  it("401 when unauthenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET(get({ period: "2026-07" }));
    expect(res.status).toBe(401);
  });

  it("returns the stored report for a client after it was sent", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "REA_SC_US" },
    });
    mockedGetMonthlyReport.mockResolvedValue(sentRow);
    const res = await GET(get({ period: "2026-07" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report.meta.client).toBe("ReadyRESCUE");
    expect(json.period).toBe("2026-07");
    expect(mockedGetMonthlyReport).toHaveBeenCalledWith("REA_SC_US", "2026-07");
  });

  it("hides unsent reports from client users", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "REA_SC_US" },
    });
    mockedGetMonthlyReport.mockResolvedValue({ ...sentRow, status: "am_review" });
    const res = await GET(get({ period: "2026-07" }));
    expect(res.status).toBe(404);
  });

  it("lets an admin preview any stored report via ?client=", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { role: "admin", clientIdCode: null },
    });
    mockedGetMonthlyReport.mockResolvedValue({ ...sentRow, status: "am_review" });
    const res = await GET(get({ period: "2026-07", client: "REA_SC_US" }));
    expect(res.status).toBe(200);
    expect(mockedGetMonthlyReport).toHaveBeenCalledWith("REA_SC_US", "2026-07");
  });

  it("ignores ?client= for portal users", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "REA_SC_US" },
    });
    mockedGetMonthlyReport.mockResolvedValue(sentRow);
    const res = await GET(get({ period: "2026-07", client: "POO_SC_US" }));
    expect(res.status).toBe(200);
    expect(mockedGetMonthlyReport).toHaveBeenCalledWith("REA_SC_US", "2026-07");
  });

  it("400 on a bad period", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "REA_SC_US" },
    });
    const res = await GET(get({ period: "July" }));
    expect(res.status).toBe(400);
    expect(mockedGetMonthlyReport).not.toHaveBeenCalled();
  });

  it("lists generated reports when period is omitted", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "REA_SC_US" },
    });
    mockedListMonthlyReportsForClient.mockResolvedValue([
      { period: "2026-07", status: "sent", sentAt: "2026-08-26T00:00:00.000Z" },
      { period: "2026-06", status: "am_review", sentAt: null },
    ]);
    const res = await GET(get({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports).toEqual([
      { period: "2026-07", label: "July 2026", status: "sent" },
    ]);
    expect(mockedGetMonthlyReport).not.toHaveBeenCalled();
  });

  it("lets an admin list unsent generated reports", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { role: "admin", clientIdCode: null },
    });
    mockedListMonthlyReportsForClient.mockResolvedValue([
      { period: "2026-07", status: "am_review", sentAt: null },
    ]);
    const res = await GET(get({ client: "REA_SC_US" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports).toEqual([
      { period: "2026-07", label: "July 2026", status: "am_review" },
    ]);
  });
});
