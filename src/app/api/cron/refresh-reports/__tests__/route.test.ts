import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/report-clients", () => ({
  getReportClients: () => [
    { name: "A", accountIds: ["1"] },
    { name: "B", accountIds: ["2"] },
  ],
}));

import { GET } from "../route";

function makeRequest(secret: string): Request {
  return new Request("http://localhost/api/cron/refresh-reports", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("GET /api/cron/refresh-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: 1, errors: 0 }) });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));
  });

  it("rejects requests without the cron Bearer token", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("computes 4 ranges (mtd, this-week, prev-week, last-month)", async () => {
    await GET(makeRequest("test-secret"));
    const firstCall = fetchMock.mock.calls[0];
    const body = JSON.parse(firstCall[1].body as string);
    expect(body.ranges).toHaveLength(4);
    expect(body.ranges.map((r: { id: string }) => r.id).sort()).toEqual([
      "last-month", "mtd", "prev-week", "this-week",
    ]);
    const lastMonth = body.ranges.find((r: { id: string }) => r.id === "last-month");
    expect(lastMonth.start).toBe("2026-03-01");
    expect(lastMonth.end).toBe("2026-03-31");
  });

  it("fans out to 7 worker endpoints in parallel", async () => {
    await GET(makeRequest("test-secret"));
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const workerNames = fetchMock.mock.calls.map((c) => {
      const url = c[0] as string;
      return url.split("/").pop();
    }).sort();
    expect(workerNames).toEqual([
      "advertising-audit",
      "inventory",
      "overview-cards",
      "overview-tables",
      "period-comparative",
      "share-of-voice",
      "subscribe-save",
    ]);
  });

  it("returns aggregate per-worker status", async () => {
    const res = await GET(makeRequest("test-secret"));
    const json = await res.json();
    expect(json.workers).toHaveLength(7);
    expect(json.timestamp).toBeDefined();
    expect(json.ranges).toHaveLength(4);
  });

  it("sends x-cron-refresh:true so workers' requireAuthOrCron passes", async () => {
    await GET(makeRequest("test-secret"));
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["x-cron-refresh"]).toBe("true");
      expect(headers.Authorization).toBe("Bearer test-secret");
    }
  });
});
