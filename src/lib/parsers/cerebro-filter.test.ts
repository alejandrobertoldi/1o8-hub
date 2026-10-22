import { describe, it, expect } from "vitest";
import { applyCerebroFilters, defaultFilterConfig } from "./cerebro-filter";
import type { CerebroRow } from "./cerebro";

const row = (overrides: Partial<CerebroRow>): CerebroRow => ({
  keyword_phrase: "test phrase",
  search_volume: 1000,
  keyword_sales: 0,
  cerebro_iq_score: 0,
  search_volume_trend: 0,
  competing_products: 0,
  cpr: 0,
  title_density: 0,
  position: 50,
  relative_rank: 0,
  competitor_rank: 0,
  ranking_count: 0,
  organic: 0,
  ppc_bid: 0,
  sponsored: 0,
  amazon_recommended: 0,
  ...overrides,
});

describe("applyCerebroFilters", () => {
  it("drops rows below minSearchVolume", () => {
    const rows = [row({ search_volume: 50 }), row({ search_volume: 500 })];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, minSearchVolume: 100 });
    expect(result.kept.length).toBe(1);
    expect(result.kept[0].search_volume).toBe(500);
    expect(result.dropped).toEqual([{ reason: "low_volume", count: 1 }]);
  });

  it("drops rows above maxOrganicRank when set (0 means disabled)", () => {
    const rows = [row({ position: 10 }), row({ position: 100 })];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, maxOrganicRank: 50 });
    expect(result.kept.length).toBe(1);
    expect(result.kept[0].position).toBe(10);
  });

  it("disables maxOrganicRank when 0", () => {
    const rows = [row({ position: 10 }), row({ position: 100 })];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, maxOrganicRank: 0 });
    expect(result.kept.length).toBe(2);
  });

  it("drops rows containing any excludeWord (case-insensitive substring)", () => {
    const rows = [
      row({ keyword_phrase: "knee sleeve" }),
      row({ keyword_phrase: "knee SOCK" }),
      row({ keyword_phrase: "knee brace" }),
    ];
    const result = applyCerebroFilters(rows, { ...defaultFilterConfig, excludeWords: ["sock"] });
    expect(result.kept.map((r) => r.keyword_phrase)).toEqual(["knee sleeve", "knee brace"]);
  });

  it("filters by word count bounds", () => {
    const rows = [
      row({ keyword_phrase: "knee" }),                              // 1 word
      row({ keyword_phrase: "knee sleeve" }),                       // 2
      row({ keyword_phrase: "knee compression sleeve for running" }),// 5
    ];
    const result = applyCerebroFilters(rows, {
      ...defaultFilterConfig,
      minWordCount: 2,
      maxWordCount: 4,
    });
    expect(result.kept.map((r) => r.keyword_phrase)).toEqual(["knee sleeve"]);
  });

  it("aggregates multiple drop reasons", () => {
    const rows = [
      row({ search_volume: 10 }),
      row({ keyword_phrase: "junk term" }),
      row({ search_volume: 500 }),
    ];
    const result = applyCerebroFilters(rows, {
      ...defaultFilterConfig,
      minSearchVolume: 100,
      excludeWords: ["junk"],
    });
    expect(result.kept.length).toBe(1);
    expect(result.dropped).toEqual(
      expect.arrayContaining([
        { reason: "low_volume", count: 1 },
        { reason: "excluded_word", count: 1 },
      ])
    );
  });
});
