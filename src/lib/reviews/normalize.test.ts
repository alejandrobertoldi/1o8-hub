// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseReviewCSV } from "@/lib/parsers/reviews";
import {
  aggregateTopics,
  amazonDomainFor,
  averageRating,
  contentHashId,
  flattenAttributes,
  keywordCandidatesFromTopics,
  normalizeHeliumRatingHistory,
  normalizeHeliumReviewAnalysis,
  normalizeProductTopReviews,
  normalizeRainforestReviewsPage,
  parseReviewCountry,
  parseReviewDate,
  readMcpJson,
  resolveMarketplace,
  reviewsToS3Csv,
  starDistribution,
} from "./normalize";

describe("marketplace resolution", () => {
  it("reads the marketplace suffix off the client code, then the product country", () => {
    expect(resolveMarketplace("TRT_SC_US")).toBe("US");
    expect(resolveMarketplace("ABC_VC_UK")).toBe("UK");
    expect(resolveMarketplace("weird", "GB")).toBe("UK");
    expect(resolveMarketplace("weird", "DE")).toBe("DE");
    expect(resolveMarketplace(null, null)).toBe("US");
    expect(amazonDomainFor("MX")).toBe("amazon.com.mx");
  });
});

describe("parseReviewDate", () => {
  it("handles Amazon's locale prefix, EU order, ISO and Rainforest utc", () => {
    expect(parseReviewDate("Reviewed in the United States on March 5, 2026")).toBe("2026-03-05");
    expect(parseReviewDate("Reviewed in the United Kingdom on 5 March 2026")).toBe("2026-03-05");
    expect(parseReviewDate("2026-03-05T10:00:00Z")).toBe("2026-03-05");
    expect(parseReviewDate("3/5/2026")).toBe("2026-03-05");
    expect(parseReviewDate("garbage", "2026-03-05T00:00:00.000Z")).toBe("2026-03-05");
    expect(parseReviewDate("garbage")).toBeNull();
    expect(parseReviewDate(null)).toBeNull();
  });
  it("pulls the review country from the prefix", () => {
    expect(parseReviewCountry("Reviewed in the United States on March 5, 2026")).toBe("United States");
    expect(parseReviewCountry("Reviewed in Canada on March 5, 2026")).toBe("Canada");
    expect(parseReviewCountry("March 5, 2026")).toBeNull();
  });
});

describe("contentHashId / flattenAttributes", () => {
  it("is stable and prefixed", () => {
    expect(contentHashId(["a", null, 5])).toBe(contentHashId(["a", undefined, "5"]));
    expect(contentHashId(["a"])).toMatch(/^h_[0-9a-f]{24}$/);
    expect(contentHashId(["a"])).not.toBe(contentHashId(["b"]));
  });
  it("flattens variant attributes", () => {
    expect(flattenAttributes([{ name: "Size:", value: "5 lb" }, { name: "Color", value: "Black" }, { value: "" }])).toBe("Size: 5 lb | Color: Black");
    expect(flattenAttributes([{ value: "Pack of 2" }])).toBe("Pack of 2");
    expect(flattenAttributes(null)).toBeNull();
    expect(flattenAttributes([])).toBeNull();
  });
});

const rainforestPage = {
  request_info: { success: true, credits_used_this_request: 1 },
  product: { title: "Neoprene Dumbbells", rating: 4.8, ratings_total: 15686 },
  summary: {
    rating: 4.8, ratings_total: 15686, reviews_total: 4200,
    rating_breakdown: {
      five_star: { percentage: 86, count: 13490 }, four_star: { percentage: 9, count: 1412 },
      three_star: { percentage: 3, count: 470 }, two_star: { percentage: 1, count: 157 }, one_star: { percentage: 1, count: 157 },
    },
  },
  pagination: { total_results: 4200, total_pages: 420, current_page: 1 },
  reviews: [
    {
      id: "R1AAA", title: "Great weights", body: "Solid and comfortable grip.", rating: 5,
      date: { raw: "Reviewed in the United States on March 5, 2026", utc: "2026-03-05T00:00:00.000Z" },
      profile: { name: "Jamie" }, verified_purchase: true, helpful_votes: 12,
      images: [{ link: "https://img/1.jpg" }], attributes: [{ name: "Size", value: "5 Pound" }], link: "https://amazon.com/r/R1AAA",
    },
    { title: "No id here", body: "Falls back to a hash", rating: 3.6, date: { raw: "Reviewed in Canada on 1 January 2026" }, profile: { name: "Sam" } },
    { id: "R_EMPTY", title: "", body: "   ", rating: 5 },
    "not an object",
  ],
};

describe("normalizeRainforestReviewsPage", () => {
  it("normalizes reviews, hashes ids when missing and drops empty rows", () => {
    const page = normalizeRainforestReviewsPage(rainforestPage);
    expect(page.reviews).toHaveLength(2);
    expect(page.invalidRows).toBe(2);
    const [first, second] = page.reviews;
    expect(first).toMatchObject({
      externalId: "R1AAA", source: "rainforest", rating: 5, reviewerName: "Jamie", reviewDate: "2026-03-05",
      verifiedPurchase: true, helpfulVotes: 12, variation: "Size: 5 Pound", images: ["https://img/1.jpg"], reviewCountry: "United States",
    });
    expect(second.externalId).toMatch(/^h_/);
    expect(second.rating).toBe(4);
    expect(second.reviewDate).toBe("2026-01-01");
    expect(second.reviewCountry).toBe("Canada");
    expect(page.summary).toMatchObject({ rating: 4.8, ratingsTotal: 15686, reviewsTotal: 4200, itemName: "Neoprene Dumbbells" });
    expect(page.summary.ratingBreakdown?.five_star).toEqual({ percentage: 86, count: 13490 });
    expect(page.totalPages).toBe(420);
    expect(page.creditsUsed).toBe(1);
  });
  it("surfaces Rainforest request failures", () => {
    expect(() => normalizeRainforestReviewsPage({ request_info: { success: false, message: "ASIN not found" } })).toThrow("ASIN not found");
    expect(() => normalizeRainforestReviewsPage("nope")).toThrow(/unrecognised/);
  });
  it("reads PDP top_reviews as a fallback", () => {
    const reviews = normalizeProductTopReviews({ top_reviews: rainforestPage.reviews });
    expect(reviews.map((r) => r.externalId)[0]).toBe("R1AAA");
    expect(reviews).toHaveLength(2);
    expect(normalizeProductTopReviews(null)).toEqual([]);
  });
});

const heliumTopic = (topic: string, mentions: number, impact: number | null, snippets: string[] = []) => ({
  topic,
  asinMetrics: { numberOfMentions: mentions, occurrencePercentage: mentions * 1.5, ...(impact == null ? {} : { starRatingImpact: impact }) },
  parentAsinMetrics: { numberOfMentions: mentions * 10, occurrencePercentage: 17.24, starRatingImpact: 0.91 },
  browseNodeMetrics: { occurrencePercentage: { allProducts: 15.04 }, starRatingImpact: { allProducts: 0.73 } },
  reviewSnippets: snippets,
  subtopics: [{ subtopic: "quality overall - generic", metrics: { numberOfMentions: 16, occurrencePercentage: 84.21 } }, { subtopic: "good quality dumbbells", metrics: { numberOfMentions: 1, occurrencePercentage: 5.26 } }],
});
const heliumPayload = {
  data: {
    asin: "B01LR5S6HK", marketplace: "US",
    topics_mentions: {
      itemName: "Amazon Basics Neoprene Dumbbell", dateRange: { startDate: "2026-03-11T00:00:00.000Z", endDate: "2026-09-11T00:00:00.000Z" },
      topics: { positiveTopics: [heliumTopic("Quality-Overall", 19, null, ["Great quality, exactly what I expected"])], negativeTopics: [heliumTopic("Measurement/Reading Accuracy", 2, -0.75)] },
    },
    topics_star_rating_impact: {
      itemName: "Amazon Basics Neoprene Dumbbell", dateRange: { startDate: "2026-03-11T00:00:00.000Z", endDate: "2026-09-11T00:00:00.000Z" },
      topics: { positiveTopics: [heliumTopic("Quality-Overall", 19, 0.98), heliumTopic("Weight Heavy", 9, 0.95)], negativeTopics: [] },
    },
    trends: {
      reviewTrends: {
        positiveTopics: [{ topic: "Quality-Overall", trendMetrics: [
          { dateRange: { startDate: "2026-02-01T00:00:00.000Z", endDate: "2026-08-01T00:00:00.000Z" }, asinMetrics: { occurrencePercentage: 12 }, parentAsinMetrics: { occurrencePercentage: 10 }, browseNodeMetrics: { occurrencePercentage: { allProducts: 9 } } },
          { dateRange: { startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-07-01T00:00:00.000Z" }, asinMetrics: { occurrencePercentage: 8.82 } },
        ] }],
        negativeTopics: [],
      },
    },
  },
  error: null,
};

describe("normalizeHeliumReviewAnalysis", () => {
  it("merges the mentions and star-impact lists and normalizes metrics", () => {
    const out = normalizeHeliumReviewAnalysis(heliumPayload);
    expect(out.itemName).toBe("Amazon Basics Neoprene Dumbbell");
    expect(out.rangeStart).toBe("2026-03-11");
    expect(out.rangeEnd).toBe("2026-09-11");
    expect(out.positiveTopics.map((t) => t.topic)).toEqual(["Quality-Overall", "Weight Heavy"]);
    const quality = out.positiveTopics[0];
    expect(quality).toMatchObject({ mentions: 19, occurrencePct: 28.5, starImpact: 0.98, snippets: ["Great quality, exactly what I expected"] });
    expect(quality.subtopics[0]).toEqual({ name: "quality overall - generic", mentions: 16, occurrencePct: 84.21 });
    expect(quality.parent).toEqual({ mentions: 190, occurrencePct: 17.24, starImpact: 0.91 });
    expect(quality.category).toEqual({ occurrencePct: 15.04, starImpact: 0.73 });
    expect(out.negativeTopics[0]).toMatchObject({ topic: "Measurement/Reading Accuracy", mentions: 2, starImpact: -0.75 });
    expect(out.trends?.positive[0].points.map((p) => p.start)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(out.trends?.positive[0].points[1]).toEqual({ start: "2026-02-01", end: "2026-08-01", asinPct: 12, parentPct: 10, categoryPct: 9 });
  });
  it("accepts the bare data object and rejects errors/garbage", () => {
    expect(normalizeHeliumReviewAnalysis(heliumPayload.data).positiveTopics).toHaveLength(2);
    expect(() => normalizeHeliumReviewAnalysis({ data: null, error: { code: "QUOTA" } })).toThrow(/error/);
    expect(() => normalizeHeliumReviewAnalysis(42)).toThrow(/unrecognised/);
  });
});

describe("normalizeHeliumRatingHistory", () => {
  it("dedupes days and sorts ascending", () => {
    const out = normalizeHeliumRatingHistory({
      data: { asin: "X", points: [{ date: "2026-09-02", review_count: 10, rating: 4.7 }, { date: "2026-09-01", review_count: 9, rating: 4.7 }, { date: "2026-09-02", review_count: 11, rating: 4.8 }, { date: "bad" }] },
      error: null,
    });
    expect(out).toEqual([{ day: "2026-09-01", reviewCount: 9, rating: 4.7 }, { day: "2026-09-02", reviewCount: 11, rating: 4.8 }]);
  });
});

describe("readMcpJson", () => {
  it("prefers structuredContent, then the first JSON text block, tolerating gateway-meta suffixes", () => {
    expect(readMcpJson({ structuredContent: { a: 1 } })).toEqual({ a: 1 });
    expect(readMcpJson({ content: [{ type: "text", text: '{"data":{"x":1}}\n[gateway-meta] session_id=abc' }] })).toEqual({ data: { x: 1 } });
    expect(() => readMcpJson({ isError: true, content: [] })).toThrow(/failed/);
    expect(() => readMcpJson({ content: [{ type: "text", text: "no json" }] })).toThrow(/no usable/);
  });
});

describe("aggregation", () => {
  it("computes star distribution and averages", () => {
    expect(starDistribution([5, 5, 1, null, 9])).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 2 });
    expect(averageRating([5, 4, null])).toBe(4.5);
    expect(averageRating([])).toBeNull();
  });
  it("mention-weights topics across ASINs and unions snippets", () => {
    const a = normalizeHeliumReviewAnalysis(heliumPayload.data).positiveTopics;
    const b = [{ ...a[0], mentions: 1, occurrencePct: 10, starImpact: 0.5, snippets: ["Other snippet"] }];
    const merged = aggregateTopics([a, b]);
    expect(merged[0].topic).toBe("Quality-Overall");
    expect(merged[0].mentions).toBe(20);
    // (28.5*19 + 10*1) / 20
    expect(merged[0].occurrencePct).toBeCloseTo(27.58, 1);
    expect(merged[0].snippets).toContain("Other snippet");
    expect(merged[0].subtopics[0].mentions).toBe(32);
  });
  it("derives keyword candidates from topics, subtopics and snippets", () => {
    const topics = normalizeHeliumReviewAnalysis(heliumPayload.data).positiveTopics;
    const kws = keywordCandidatesFromTopics(topics);
    expect(kws[0]).toMatchObject({ phrase: "quality overall", from: "topic" });
    expect(kws.some((k) => k.phrase === "good quality dumbbells" && k.from === "subtopic")).toBe(true);
    expect(kws.some((k) => k.phrase.endsWith("generic"))).toBe(false);
  });
});

describe("reviewsToS3Csv", () => {
  it("round-trips through the SEO S3 CSV parser", () => {
    const csv = reviewsToS3Csv([
      { externalId: "R1", reviewerName: "Jamie", body: 'Solid, "quoted" text', reviewDate: "2026-03-05", reviewDateRaw: null, title: "Great", rating: 5, images: ["a.jpg"], helpfulVotes: 3, variation: "Size: 5 lb", asin: "B000000001" },
      { externalId: "R2", reviewerName: null, body: "Meh", reviewDate: null, reviewDateRaw: "Reviewed in the United States on January 2, 2026", title: "", rating: 2, images: null, helpfulVotes: 0, variation: null, asin: "B000000001" },
    ]);
    const parsed = parseReviewCSV(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.reviews).toHaveLength(2);
    expect(parsed.reviews[0]).toMatchObject({ review_id: "R1", profile_name: "Jamie", text: 'Solid, "quoted" text', star_rating: 5, helpful_votes: 3, product_variation: "Size: 5 lb" });
    expect(parsed.reviews[1]).toMatchObject({ review_id: "R2", star_rating: 2, product_variation: "None" });
    expect(parsed.starDistribution[5]).toBe(1);
  });
});
