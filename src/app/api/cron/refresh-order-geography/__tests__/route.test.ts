import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const listStalestSnapshotAccountIds = vi.fn();
vi.mock("@/lib/reports/order-geography-snapshot", () => ({
  listStalestSnapshotAccountIds: (limit: number) => listStalestSnapshotAccountIds(limit),
}));

import { GET, maxDuration } from "../route";

function makeRequest(secret: string): Request {
  return new Request("http://localhost/api/cron/refresh-order-geography", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("GET /api/cron/refresh-order-geography", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: 2, errors: 0 }) });
    listStalestSnapshotAccountIds.mockResolvedValue(["5", "2"]);
  });

  it("rejects requests without the cron Bearer token", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listStalestSnapshotAccountIds).not.toHaveBeenCalled();
  });

  it("gets the same 300s as the worker it waits on", () => {
    expect(maxDuration).toBe(300);
  });

  it("refreshes only the two stalest accounts, in ONE worker call", async () => {
    await GET(makeRequest("test-secret"));
    expect(listStalestSnapshotAccountIds).toHaveBeenCalledWith(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/internal\/refresh\/order-geography$/);
    expect(JSON.parse(init.body as string).clients).toEqual([
      { name: "5", accountIds: ["5"] },
      { name: "2", accountIds: ["2"] },
    ]);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-cron-refresh"]).toBe("true");
    expect(headers.Authorization).toBe("Bearer test-secret");
  });

  it("reports the worker result, including a failed call", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    const json = await (await GET(makeRequest("test-secret"))).json();
    expect(json.accountIds).toEqual(["5", "2"]);
    expect(json.worker.status).toBe("error");
    expect(json.worker.error).toContain("socket hang up");
  });

  it("makes no worker call when every snapshot is fresh", async () => {
    listStalestSnapshotAccountIds.mockResolvedValue([]);
    const json = await (await GET(makeRequest("test-secret"))).json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.accountIds).toEqual([]);
    expect(json.worker).toBeNull();
  });
});
