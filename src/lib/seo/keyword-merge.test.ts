import { describe, it, expect } from "vitest";
import { mergeKeywordSources, normalizeKeyword, sqpMonthlyVolume } from "./keyword-merge";

describe("normalizeKeyword", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeKeyword("  Activated   Charcoal For Dogs ")).toBe("activated charcoal for dogs");
  });
});

describe("sqpMonthlyVolume", () => {
  it("turns an 8-week total into a monthly figure", () => {
    // 10,863 over 8 weeks → 10,863 / 8 × 52/12 ≈ 5,884
    expect(sqpMonthlyVolume(10863, 8)).toBe(5884);
  });
  it("returns 0 for a zero or missing window", () => {
    expect(sqpMonthlyVolume(100, 0)).toBe(0);
  });
});

describe("mergeKeywordSources", () => {
  const h10 = [
    { text: "activated charcoal for dogs", tier: 1, volume: 5319 },
    { text: "coal for dogs", tier: 4, volume: 108 },
  ];
  const sqp = [
    { search_query: "Activated Charcoal for Dogs", search_query_volume: 10863, asin_purchase_count: 0, asin_purchase_share: 0, asin_cart_add_share: 0, asin_click_share: 0.1, asin_impression_share: 0.7 },
    { search_query: "ready rescue", search_query_volume: 120, asin_purchase_count: 4, asin_purchase_share: 45, asin_cart_add_share: 20.4, asin_click_share: 32.9, asin_impression_share: 5.4 },
  ];

  it("merges a phrase present in both sources into one row", () => {
    const rows = mergeKeywordSources(h10, sqp, 8);
    const acf = rows.filter((r) => r.key === "activated charcoal for dogs");
    expect(acf).toHaveLength(1);
    expect(acf[0]).toMatchObject({ inH10: true, inSqp: true, tier: 1, h10Volume: 5319, sqpVolume8wk: 10863, sqpVolumeMonthly: 5884 });
  });

  it("keeps single-source rows with the other source's fields null", () => {
    const rows = mergeKeywordSources(h10, sqp, 8);
    expect(rows.find((r) => r.key === "ready rescue")).toMatchObject({ inH10: false, inSqp: true, tier: null, h10Volume: null, purchases: 4 });
    expect(rows.find((r) => r.key === "coal for dogs")).toMatchObject({ inH10: true, inSqp: false, sqpVolumeMonthly: null, purchases: null });
  });

  it("sorts by SQP purchases, then H10 volume", () => {
    const rows = mergeKeywordSources(h10, sqp, 8);
    expect(rows.map((r) => r.key)).toEqual(["ready rescue", "activated charcoal for dogs", "coal for dogs"]);
  });

  it("works with no SQP data", () => {
    const rows = mergeKeywordSources(h10, [], 8);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.inSqp)).toBe(true);
  });

  it("drops duplicate H10 keywords after normalising", () => {
    const rows = mergeKeywordSources([...h10, { text: "Coal  for dogs", tier: 3, volume: 50 }], [], 8);
    expect(rows.filter((r) => r.key === "coal for dogs")).toHaveLength(1);
  });
});
