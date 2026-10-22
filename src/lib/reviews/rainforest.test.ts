// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRainforestReviews } from "./rainforest";

const review = (id: string, date: string) => ({ id, title: `t${id}`, body: `b${id}`, rating: 5, date: { raw: date, utc: `${date}T00:00:00Z` }, profile: { name: "A" } });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchRainforestReviews", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RAINFOREST_API_KEY", "test-key");
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("pages newest-first, dedupes ids, stops at the last page and never logs the key in errors", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_info: { success: true, credits_used_this_request: 1 }, summary: { rating: 4.7, ratings_total: 100 }, pagination: { total_pages: 2, current_page: 1 }, reviews: [review("R1", "2026-09-10"), review("R2", "2026-09-09")] }))
      .mockResolvedValueOnce(jsonResponse({ request_info: { success: true, credits_used_this_request: 1 }, pagination: { total_pages: 2, current_page: 2 }, reviews: [review("R2", "2026-09-09"), review("R3", "2026-09-01")] }));
    const out = await fetchRainforestReviews("B000000001", { amazonDomain: "amazon.com", maxPages: 5 });
    expect(out.reviews.map((r) => r.externalId)).toEqual(["R1", "R2", "R3"]);
    expect(out.pagesFetched).toBe(2);
    expect(out.creditsUsed).toBe(2);
    expect(out.summary).toMatchObject({ rating: 4.7, ratingsTotal: 100 });
    expect(out.usedFallback).toBe(false);
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(firstUrl.searchParams.get("type")).toBe("reviews");
    expect(firstUrl.searchParams.get("sort_by")).toBe("most_recent");
    expect(firstUrl.searchParams.get("page")).toBe("1");
    expect(firstUrl.searchParams.get("api_key")).toBe("test-key");
  });

  it("stops paging early for incremental syncs once a page is entirely older than the cutoff", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ request_info: { success: true }, pagination: { total_pages: 9, current_page: 1 }, reviews: [review("R1", "2026-01-01")] }));
    const out = await fetchRainforestReviews("B000000001", { amazonDomain: "amazon.com", maxPages: 3, stopBeforeDate: "2026-06-01" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.reviews).toHaveLength(1);
  });

  it("falls back to the PDP top reviews when the reviews endpoint fails outright", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_info: { success: false, message: "Reviews unavailable for this domain" } }))
      .mockResolvedValueOnce(jsonResponse({ request_info: { success: true, credits_used_this_request: 1 }, product: { title: "Thing", rating: 4.2, ratings_total: 50, top_reviews: [review("R9", "2026-08-01")] } }));
    const out = await fetchRainforestReviews("B000000001", { amazonDomain: "amazon.com" });
    expect(out.usedFallback).toBe(true);
    expect(out.reviews.map((r) => r.externalId)).toEqual(["R9"]);
    expect(out.summary).toMatchObject({ rating: 4.2, ratingsTotal: 50, itemName: "Thing" });
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("type")).toBe("product");
  });

  it("keeps partial results when a later page fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_info: { success: true }, pagination: { total_pages: 3, current_page: 1 }, reviews: [review("R1", "2026-09-10")] }))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    const out = await fetchRainforestReviews("B000000001", { amazonDomain: "amazon.com", maxPages: 3 });
    expect(out.reviews).toHaveLength(1);
    expect(out.pagesFetched).toBe(1);
  });

  it("throws when the key is missing", async () => {
    vi.stubEnv("RAINFOREST_API_KEY", "");
    await expect(fetchRainforestReviews("B000000001", { amazonDomain: "amazon.com" })).rejects.toThrow(/RAINFOREST_API_KEY/);
  });
});
