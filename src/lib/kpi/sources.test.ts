import { describe, expect, it } from "vitest";
import { parseMetaInsights } from "./meta";
import { sumAggregate } from "./klaviyo";
import { kpiValue } from "./values";

describe("parseMetaInsights", () => {
  it("takes spend and Meta's cross-surface purchases per day", () => {
    const rows = parseMetaInsights([
      {
        date_start: "2026-10-01",
        spend: "120.50",
        impressions: "5000",
        clicks: "80",
        actions: [
          { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
          { action_type: "omni_purchase", value: "4" },
        ],
        action_values: [{ action_type: "omni_purchase", value: "410.00" }],
      },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    expect(by).toEqual({ spend: 120.5, impressions: 5000, clicks: 80, purchases: 4, purchase_value: 410 });
  });
});

describe("sumAggregate", () => {
  const json = {
    data: {
      attributes: {
        dates: ["2026-10-01T00:00:00-05:00", "2026-10-02T00:00:00-05:00"],
        data: [
          { dimensions: ["email"], measurements: { sum_value: [100, 50], count: [2, 1] } },
          { dimensions: ["sms"], measurements: { sum_value: [10, 0], count: [1, 0] } },
          { dimensions: [""], measurements: { sum_value: [900, 700], count: [20, 15] } },
        ],
      },
    },
  };

  it("sums the attributed channels per day", () => {
    expect([...sumAggregate(json, "sum_value", (d) => /email|sms/.test(d))]).toEqual([
      ["2026-10-01", 110],
      ["2026-10-02", 50],
    ]);
  });

  it("sums everything without a filter", () => {
    expect(sumAggregate(json, "count").get("2026-10-01")).toBe(23);
  });
});

describe("kpiValue with Meta and Klaviyo", () => {
  it("computes ROAS, spend and email revenue", () => {
    const t = { "meta:spend": 1000, "meta:purchase_value": 3500, "klaviyo:attributed_revenue": 2200, "klaviyo:net_subscribers": 140 };
    expect(kpiValue("website_roas", t)?.value).toBe(3.5);
    expect(kpiValue("ad_spend", t)?.value).toBe(1000);
    expect(kpiValue("email_revenue", t)?.value).toBe(2200);
    expect(kpiValue("email_list_growth", t)?.value).toBe(140);
    // Blended ROAS still needs Shopify.
    expect(kpiValue("blended_roas", t)).toBeNull();
  });
});
