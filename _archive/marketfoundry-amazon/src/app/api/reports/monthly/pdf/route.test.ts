import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({ user: { role: "admin" } })),
}));
vi.mock("@/lib/monthly-report", () => ({
  generateReport: vi.fn(),
  resolveConfig: vi.fn(async () => ({ enabled: { products: true, kpis: true } })),
  resolvePeriod: vi.fn((p: string) => ({
    period: p, start: `${p}-01`, end: `${p}-28`,
    prevStart: `${p}-01`, prevEnd: `${p}-01`, label: "Test",
  })),
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, "-")),
  lastCompletedMonth: vi.fn(() => "2099-12"),
}));
vi.mock("@/lib/monthly-report/pdf-token", () => ({
  signReportToken: vi.fn(() => "fake.jwt.token"),
}));
vi.mock("@/lib/monthly-report/resolve-client", () => ({
  resolveMonthlyClient: vi.fn(async () => ({
    status: "ok",
    client: { name: "ReadyRESCUE", accountId: "1899670", clientIdCode: "REA_SC_US" },
  })),
}));

const pdfBuffer = Buffer.from("fake-pdf-bytes");
const browserMock = {
  newPage: vi.fn(async () => ({
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    pdf: vi.fn(async () => pdfBuffer),
    setExtraHTTPHeaders: vi.fn(),
  })),
  close: vi.fn(async () => {}),
};
vi.mock("puppeteer-core", () => ({
  default: { launch: vi.fn(async () => browserMock) },
}));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: vi.fn(async () => "/fake/chromium"), headless: true },
}));

import { POST } from "./route";
import { generateReport } from "@/lib/monthly-report";

function makeReq(body: object) {
  return new Request("http://x/api/reports/monthly/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/reports/monthly/pdf", () => {
  beforeEach(() => {
    process.env.MONTHLY_REPORT_JWT_SECRET = "test-secret";
    vi.mocked(generateReport).mockReset();
  });

  it("returns application/pdf on success", async () => {
    vi.mocked(generateReport).mockResolvedValueOnce({
      report: { meta: { client: "Dr. Cuddles" }, sections: [] } as any,
      headline: null,
      skipped: [],
    });

    const res = await POST(makeReq({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(res.headers.get("content-disposition")).toMatch(/\.pdf/);
  });

  it("returns 500 with friendly error when Chromium launch fails", async () => {
    vi.mocked(generateReport).mockResolvedValueOnce({
      report: {} as any, headline: null, skipped: [],
    });
    const puppeteer = (await import("puppeteer-core")).default;
    vi.mocked(puppeteer.launch).mockRejectedValueOnce(new Error("boom"));

    const res = await POST(makeReq({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/PDF renderer unavailable/i);
  });
});
