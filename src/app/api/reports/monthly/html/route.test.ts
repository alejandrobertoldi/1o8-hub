import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockedGetAuthSession,
  mockedResolveMonthlyClient,
  mockedFindMonthlyReportHtml,
  mockedDownloadFileContent,
} = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedResolveMonthlyClient: vi.fn(),
  mockedFindMonthlyReportHtml: vi.fn(),
  mockedDownloadFileContent: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/monthly-report", async () => {
  const period = await import("@/lib/monthly-report/period");
  return {
    resolvePeriod: period.resolvePeriod,
  };
});
vi.mock("@/lib/monthly-report/resolve-client", () => ({
  resolveMonthlyClient: mockedResolveMonthlyClient,
}));
vi.mock("@/lib/monthly-report/drive-store", () => ({
  findMonthlyReportHtml: mockedFindMonthlyReportHtml,
}));
vi.mock("@/lib/drive-client", () => ({
  driveClient: { downloadFileContent: mockedDownloadFileContent },
}));

import { GET } from "./route";

const adminSession = { user: { email: "admin@marketfoundry.agency", role: "admin" } };

function get(params: Record<string, string>) {
  const url = new URL("http://localhost/api/reports/monthly/html");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedResolveMonthlyClient.mockResolvedValue({
    status: "ok",
    client: { name: "ReadyRESCUE", accountId: "1899670", clientIdCode: "REA_SC_US" },
  });
});

describe("GET /api/reports/monthly/html", () => {
  it("401 when unauthenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET(get({ clientCode: "REA_SC_US", period: "2026-07" }));
    expect(res.status).toBe(401);
  });

  it("400 when clientCode is missing", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await GET(get({ period: "2026-07" }));
    expect(res.status).toBe(400);
  });

  it("404 when the HTML archive is not in Drive", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedFindMonthlyReportHtml.mockResolvedValue(null);
    const res = await GET(get({ clientCode: "REA_SC_US", period: "2026-07" }));
    expect(res.status).toBe(404);
  });

  it("streams the HTML archive as an attachment", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedFindMonthlyReportHtml.mockResolvedValue({
      driveId: "html-id",
      filename: "REA_SC_US_2026-07_monthly-report.html",
    });
    mockedDownloadFileContent.mockResolvedValue(Buffer.from("<html>report</html>"));
    const res = await GET(get({ clientCode: "REA_SC_US", period: "2026-07" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="REA_SC_US_2026-07_monthly-report.html"',
    );
    expect(await res.text()).toBe("<html>report</html>");
    expect(mockedFindMonthlyReportHtml).toHaveBeenCalledWith({
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    });
  });
});
