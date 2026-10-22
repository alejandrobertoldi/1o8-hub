import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockedListActiveMonthlyClients,
  mockedGetMonthlyReport,
  mockedGenerateReport,
  mockedResolveConfig,
  mockedSaveMonthlyReportPdf,
  mockedFetchAccountDataThrough,
  mockedIsMonthSettled,
  mockedUpsertGenerated,
  mockedNotifyPm,
  mockedScheduleAsana,
} = vi.hoisted(() => ({
  mockedListActiveMonthlyClients: vi.fn(),
  mockedGetMonthlyReport: vi.fn(),
  mockedGenerateReport: vi.fn(),
  mockedResolveConfig: vi.fn(),
  mockedSaveMonthlyReportPdf: vi.fn(),
  mockedFetchAccountDataThrough: vi.fn(),
  mockedIsMonthSettled: vi.fn(),
  mockedUpsertGenerated: vi.fn(),
  mockedNotifyPm: vi.fn(),
  mockedScheduleAsana: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/monthly-report", () => ({
  generateReport: mockedGenerateReport,
  resolveConfig: mockedResolveConfig,
  resolvePeriod: vi.fn(() => ({ period: "2026-09", label: "September 2026", end: "2026-09-30" })),
  lastCompletedMonth: vi.fn(() => "2026-09"),
  slugify: vi.fn((s: string) => s),
}));
vi.mock("@/lib/monthly-report/resolve-client", () => ({
  listActiveMonthlyClients: mockedListActiveMonthlyClients,
}));
vi.mock("@/lib/monthly-report/drive-store", () => ({
  saveMonthlyReportPdf: mockedSaveMonthlyReportPdf,
}));
vi.mock("@/lib/monthly-report/queries/account", () => ({
  fetchAccountDataThrough: mockedFetchAccountDataThrough,
}));
vi.mock("@/lib/monthly-report/settlement", () => ({
  isMonthSettled: mockedIsMonthSettled,
}));
vi.mock("@/lib/monthly-report/report-store", () => ({
  getMonthlyReport: mockedGetMonthlyReport,
  upsertGeneratedMonthlyReport: mockedUpsertGenerated,
}));
vi.mock("@/lib/monthly-report/review-notify", () => ({
  notifyPmReportsReady: mockedNotifyPm,
}));
vi.mock("@/lib/monthly-report/asana-link", () => ({
  scheduleAsanaEnsureAndSync: mockedScheduleAsana,
}));
vi.mock("@/lib/sales-warm", () => ({
  resolveBaseUrl: () => "https://www.marketfoundryhub.com",
}));

import { GET } from "./route";

const gaffer = {
  code: "1",
  name: "Gaffer",
  accountId: "111",
  clientIdCode: "GAF_SC_US",
  projectManager: "Sara Khan",
  accountManager: "Alex Moreno",
};
const glo = {
  code: "2",
  name: "Glo Health Foods",
  accountId: "222",
  clientIdCode: "GLO_SC_US",
  projectManager: "Hamid Zeb",
  accountManager: "Amir Zeb",
};
const noIw = {
  code: "NOIW",
  name: "No Intentwise",
  accountId: null,
  clientIdCode: "NOI_SC_US",
  projectManager: null,
  accountManager: null,
};

function cronReq(path = "/api/cron/monthly-reports", secret = "test-secret") {
  return new Request(`http://localhost${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("GET /api/cron/monthly-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockedListActiveMonthlyClients.mockResolvedValue([gaffer, glo, noIw]);
    mockedGetMonthlyReport.mockResolvedValue(null);
    mockedFetchAccountDataThrough.mockResolvedValue("2026-10-01");
    mockedIsMonthSettled.mockReturnValue(true);
    mockedResolveConfig.mockResolvedValue({});
    mockedGenerateReport.mockResolvedValue({ report: { meta: { client: "Gaffer" } }, skipped: [] });
    mockedSaveMonthlyReportPdf.mockResolvedValue({ driveUrl: "https://drive.example/pdf", htmlUrl: "https://drive.example/html" });
    mockedUpsertGenerated.mockResolvedValue(undefined);
    mockedNotifyPm.mockResolvedValue(undefined);
    fetchMock.mockImplementation(async (url: string) => {
      const code = new URL(String(url), "http://localhost").searchParams.get("clientIdCode");
      const client = code === "GLO_SC_US" ? "Glo Health Foods" : "Gaffer";
      return { ok: true, json: async () => ({ client, status: "generated" }) };
    });
  });

  it("401 without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/monthly-reports"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fans each pending client into its own worker invocation", async () => {
    const res = await GET(cronReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.period).toBe("2026-09");
    expect(json.results).toEqual(expect.arrayContaining([
      { client: "No Intentwise", status: "skipped_no_intentwise" },
      { client: "Gaffer", status: "generated" },
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string).sort();
    expect(urls[0]).toContain("clientIdCode=GAF_SC_US");
    expect(urls[1]).toContain("clientIdCode=GLO_SC_US");
    expect(mockedGenerateReport).not.toHaveBeenCalled();
    expect(mockedNotifyPm).toHaveBeenCalledWith(expect.objectContaining({
      periodLabel: "September 2026",
      rows: expect.arrayContaining([
        expect.objectContaining({ name: "Gaffer" }),
        expect.objectContaining({ name: "Glo Health Foods" }),
      ]),
    }));
  });

  it("skips already generated clients instead of fanning them out", async () => {
    mockedGetMonthlyReport.mockImplementation(async (code: string) => (
      code === "GAF_SC_US" ? { clientIdCode: code } : null
    ));
    await GET(cronReq());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("GLO_SC_US");
  });

  it("generates one client when clientIdCode is set", async () => {
    const res = await GET(cronReq("/api/cron/monthly-reports?clientIdCode=GAF_SC_US"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ client: "Gaffer", status: "generated" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockedGenerateReport).toHaveBeenCalledOnce();
    expect(mockedNotifyPm).not.toHaveBeenCalled();
  });

  it("schedules the Asana ensure+sync when the main run finished inside the budget", async () => {
    await GET(cronReq());
    expect(mockedScheduleAsana).toHaveBeenCalledExactlyOnceWith("2026-09");
  });

  it("skips the Asana ensure+sync when more than 200s of the 300s budget are gone", async () => {
    let t = 1_000_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => t);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => {
      t += 120_000; // two slow child generations → 240s elapsed
      return { ok: true, json: async () => ({ client: "Gaffer", status: "generated" }) };
    });
    try {
      const res = await GET(cronReq());
      expect(res.status).toBe(200);
      expect(mockedScheduleAsana).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("asana"), expect.anything());
    } finally {
      now.mockRestore();
      log.mockRestore();
    }
  });

  it("never schedules Asana from the single-client branch", async () => {
    await GET(cronReq("/api/cron/monthly-reports?clientIdCode=GAF_SC_US"));
    expect(mockedScheduleAsana).not.toHaveBeenCalled();
  });
});
