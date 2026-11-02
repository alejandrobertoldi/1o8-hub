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
  return new Request("http://localhost/api/internal/refresh/inventory", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ranges: RANGES, clients: CLIENTS }),
  });
}

describe("POST /api/internal/refresh/inventory", () => {
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

  it("calls inventory route once per client (no range loop)", async () => {
    await POST(makeRequest("test-secret"));
    // 4 clients, no range loop = 4 fetches
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes("/api/reports/inventory"))).toBe(true);
    expect(urls.every((u) => u.includes("refresh=true"))).toBe(true);
    // NO start/end params
    expect(urls.every((u) => !u.includes("start="))).toBe(true);
  });

  it("returns aggregate ok/error counts", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    const res = await POST(makeRequest("test-secret"));
    const json = await res.json();
    expect(json.ok + json.errors).toBe(4);
    expect(json.errors).toBeGreaterThanOrEqual(1);
  });
});
