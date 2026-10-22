import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));

import { queryRedshift } from "@/lib/redshift";
import { fetchRevenueSeries, fetchAccountDataThrough } from "./account";

describe("fetchRevenueSeries", () => {
  beforeEach(() => { vi.mocked(queryRedshift).mockReset(); });

  it("returns 6 months ending at periodStart, oldest→newest, gap-filled", async () => {
    // Redshift returns only 3 months; the other 3 must be zero-filled.
    vi.mocked(queryRedshift).mockResolvedValueOnce([
      { month_key: "2026-01", revenue: "1000" },
      { month_key: "2026-02", revenue: "2000" },
      { month_key: "2026-03", revenue: "3000" },
    ] as any);

    const out = await fetchRevenueSeries("1899670", "2026-03-01");

    expect(out.length).toBe(6);
    expect(out.map(r => r.month)).toEqual(["OCT", "NOV", "DEC", "JAN", "FEB", "MAR"]);
    expect(out.map(r => r.revenue)).toEqual([0, 0, 0, 1000, 2000, 3000]);
  });

  it("coerces string revenue values to numbers", async () => {
    vi.mocked(queryRedshift).mockResolvedValueOnce([
      { month_key: "2026-03", revenue: "4200" },
    ] as any);
    const out = await fetchRevenueSeries("1899670", "2026-03-01");
    expect(typeof out.find(r => r.month === "MAR")!.revenue).toBe("number");
  });
});

describe("fetchAccountDataThrough", () => {
  beforeEach(() => { vi.mocked(queryRedshift).mockReset(); });

  it("returns the max calendar day for the account", async () => {
    vi.mocked(queryRedshift).mockResolvedValueOnce([{ max_date: "2026-07-31" }] as any);
    await expect(fetchAccountDataThrough("1899670")).resolves.toBe("2026-07-31");
  });

  it("returns null when Redshift has no rows", async () => {
    vi.mocked(queryRedshift).mockResolvedValueOnce([{ max_date: null }] as any);
    await expect(fetchAccountDataThrough("1899670")).resolves.toBeNull();
  });
});
