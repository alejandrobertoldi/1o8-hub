import { describe, expect, it } from "vitest";
import { normalizeCustomerId, parseGoogleAdsRows } from "./google-ads";
import { googleAdsTotals, kpiValue } from "./values";

describe("normalizeCustomerId", () => {
  it("accepts the dashed and plain forms", () => {
    expect(normalizeCustomerId("202-947-7492")).toBe("2029477492");
    expect(normalizeCustomerId(" 2029477492 ")).toBe("2029477492");
    expect(normalizeCustomerId("12345")).toBeNull();
  });
});

describe("parseGoogleAdsRows", () => {
  it("turns micros into dollars and keeps each day", () => {
    const rows = [
      { segments: { date: "2026-11-01" }, metrics: { costMicros: "12500000", clicks: "40", impressions: "1000", conversions: 2.5, conversionsValue: 180 } },
      { segments: { date: "2026-11-02" }, metrics: { costMicros: "0", clicks: "0" } },
    ];
    const out = parseGoogleAdsRows(rows);
    expect(out).toContainEqual({ day: "2026-11-01", metric: "cost", value: 12.5 });
    expect(out).toContainEqual({ day: "2026-11-01", metric: "conversion_value", value: 180 });
    expect(out).toContainEqual({ day: "2026-11-02", metric: "clicks", value: 0 });
    expect(out.filter((r) => r.day === "2026-11-02")).toHaveLength(2);
  });
});

describe("googleAdsTotals", () => {
  it("prefers the Google Ads API over GA4's link", () => {
    const t = { "google_ads:cost": 100, "google_ads:conversion_value": 400, "ga4:google_ads_cost": 90, "ga4:google_ads_revenue": 300 };
    expect(googleAdsTotals(t)).toMatchObject({ cost: 100, value: 400, direct: true });
    expect(kpiValue("ad_spend", t)?.value).toBe(100);
  });
  it("falls back to GA4", () => {
    expect(googleAdsTotals({ "ga4:google_ads_cost": 90 })).toMatchObject({ cost: 90, direct: false });
  });
});
