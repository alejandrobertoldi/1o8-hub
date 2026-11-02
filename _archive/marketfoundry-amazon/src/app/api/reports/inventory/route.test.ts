import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  requireAuthOrCron: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  buildAccountKey: vi.fn((a) => a),
}));

import { GET } from "./route";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { queryRedshift } from "@/lib/redshift";

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/reports/inventory");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("GET /api/reports/inventory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ asin: "B0X" }] });
    const res = await GET(makeRequest({ accountId: "1" }));
    expect(await res.json()).toEqual({ items: [{ asin: "B0X" }] });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // First call returns maxDate, second call returns inventory rows
    (queryRedshift as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ max_date: "2026-04-01" }])
      .mockResolvedValueOnce([]);
    const res = await GET(makeRequest({ accountId: "1" }));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-inventory",
      "1",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    (queryRedshift as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ max_date: "2026-04-01" }])
      .mockResolvedValueOnce([]);
    await GET(makeRequest({ accountId: "1", refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
