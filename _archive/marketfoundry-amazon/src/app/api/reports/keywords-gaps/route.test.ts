import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ user: { role: "admin" } }),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthOrCron: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  buildDatedKey: vi.fn((a, s, e) => `${a}|${s}|${e}`),
}));

import { GET } from "./route";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { queryRedshift } from "@/lib/redshift";

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/reports/keywords-gaps");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const matchTypeRow = { match_type: "exact", keyword_count: 5 };
const keywordRow = {
  keyword_text: "test kw",
  broad_revenue: 10, broad_spend: 5,
  exact_revenue: 20, exact_spend: 10,
  phrase_revenue: 8, phrase_spend: 4,
};
const cloudRow = { keyword_text: "test kw", revenue: 20 };

describe("GET /api/reports/keywords-gaps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ sp: {}, sb: {} });

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    const json = await res.json();

    expect(json).toEqual({ sp: {}, sb: {} });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // 8 calls total: query("SP") makes 4, query("SB") makes 4 (run in Promise.all)
    (queryRedshift as ReturnType<typeof vi.fn>)
      .mockResolvedValue(
        // All calls get compatible rows; matchType calls get matchTypeRow shape
        // keywords calls get keywordRow shape, cloud calls get cloudRow shape
        // Using matchTypeRow as a safe default (extra fields are ignored)
        [matchTypeRow]
      );
    // Override specific calls for keyword rows (calls 2 and 6) and cloud rows (3,4,7,8)
    (queryRedshift as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([matchTypeRow])  // SP matchType
      .mockResolvedValueOnce([keywordRow])    // SP keywords
      .mockResolvedValueOnce([cloudRow])      // SP exact cloud
      .mockResolvedValueOnce([cloudRow])      // SP phrase cloud
      .mockResolvedValueOnce([matchTypeRow])  // SB matchType
      .mockResolvedValueOnce([keywordRow])    // SB keywords
      .mockResolvedValueOnce([cloudRow])      // SB exact cloud
      .mockResolvedValueOnce([cloudRow]);     // SB phrase cloud

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-keywords-gaps",
      "1|2026-04-01|2026-04-30",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache and re-queries Redshift", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ stale: true });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([matchTypeRow]);

    await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30", refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
