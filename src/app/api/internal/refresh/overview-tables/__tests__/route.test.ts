import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { POST } from "../route";

const RANGES = [
  { id: "mtd", start: "2026-04-01", end: "2026-04-28" },
  { id: "this-week", start: "2026-04-26", end: "2026-05-02" },
];
const CLIENTS = [
  { name: "A", accountIds: ["1"] },
  { name: "B", accountIds: ["2"] },
  { name: "C", accountIds: ["3"] },
  { name: "D", accountIds: ["4"] },
];

function makeRequest(secret: string): Request {
  return new Request("http://localhost/api/internal/refresh/overview-tables", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ranges: RANGES, clients: CLIENTS }),
  });
}

describe("POST /api/internal/refresh/overview-tables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    fetchMock.mockResolvedValue({ ok: true });
  });

  it("rejects requests without the cron Bearer token", async () => {
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls keywords/campaigns/product-performance routes once per (range × client)", async () => {
    await POST(makeRequest("test-secret"));
    // 2 ranges × 4 clients × 3 routes = 24 fetches
    expect(fetchMock).toHaveBeenCalledTimes(24);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    const allRoutes = ["keywords", "campaigns", "product-performance"];
    expect(urls.every((u) => allRoutes.some((r) => u.includes(`/api/reports/${r}`)))).toBe(true);
    expect(urls.every((u) => u.includes("refresh=true"))).toBe(true);
  });

  it("returns aggregate ok/error counts", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    const res = await POST(makeRequest("test-secret"));
    const json = await res.json();
    expect(json.ok + json.errors).toBe(24);
    expect(json.errors).toBeGreaterThanOrEqual(1);
  });
});
