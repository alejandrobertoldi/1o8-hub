/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/async-await-in-loop */
// Rainforest API as the review scraper. `type=reviews` returns individual
// reviews (10 per page); `type=product` returns the rating summary plus the
// handful of `top_reviews` shown on the PDP, used as a fallback.
import type { RainforestProduct } from "@/types/rainforest";
import { normalizeProductTopReviews, normalizeRainforestReviewsPage, normalizeRainforestSummary } from "./normalize";
import type { NormalizedReview, RatingSummary } from "./types";

const RAINFOREST_URL = "https://api.rainforestapi.com/request";

export type RainforestReviewsOptions = {
  amazonDomain: string;
  /** Pages of 10 reviews to pull, newest first. Default 3 (30 reviews). */
  maxPages?: number;
  sortBy?: "most_recent" | "most_helpful" | "top_reviews";
  reviewerType?: "all_reviews" | "verified_purchase";
  /** Include reviews from other marketplaces of the same product. Default true. */
  globalReviews?: boolean;
  timeoutMs?: number;
  /** Stop paging once a page yields no review newer than this ISO date (incremental sync). */
  stopBeforeDate?: string | null;
};

export type RainforestReviewsResult = {
  reviews: NormalizedReview[];
  summary: RatingSummary;
  pagesFetched: number;
  creditsUsed: number;
  /** True when the reviews endpoint failed and the PDP `top_reviews` were used instead. */
  usedFallback: boolean;
};

function apiKey(): string {
  const key = process.env.RAINFOREST_API_KEY;
  if (!key) throw new Error("RAINFOREST_API_KEY not configured");
  return key;
}

async function rainforestRequest(params: Record<string, string>, timeoutMs: number): Promise<unknown> {
  const url = new URL(RAINFOREST_URL);
  url.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!response.ok) throw new Error(`Rainforest API returned ${response.status}`);
  const data = (await response.json()) as { request_info?: { success?: boolean; message?: string } };
  if (data.request_info?.success === false) throw new Error(data.request_info.message || "Rainforest request failed");
  return data;
}

export async function fetchRainforestProduct(asin: string, amazonDomain: string, timeoutMs = 45_000): Promise<{ product: RainforestProduct; creditsUsed: number }> {
  const data = (await rainforestRequest({ type: "product", asin, amazon_domain: amazonDomain }, timeoutMs)) as {
    product: RainforestProduct;
    request_info?: { credits_used_this_request?: number };
  };
  return { product: data.product, creditsUsed: data.request_info?.credits_used_this_request ?? 1 };
}

/**
 * Pull reviews for one ASIN. Pages until `maxPages`, the last page, or (for
 * incremental syncs) a page that is entirely older than `stopBeforeDate`.
 * Falls back to the PDP top reviews when the reviews endpoint errors.
 */
export async function fetchRainforestReviews(asin: string, options: RainforestReviewsOptions): Promise<RainforestReviewsResult> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 3, 10));
  const timeoutMs = options.timeoutMs ?? 45_000;
  const collected = new Map<string, NormalizedReview>();
  let summary: RatingSummary = { rating: null, ratingsTotal: null, reviewsTotal: null, ratingBreakdown: null, itemName: null };
  let creditsUsed = 0;
  let pagesFetched = 0;

  try {
    for (let page = 1; page <= maxPages; page++) {
      const payload = await rainforestRequest(
        {
          type: "reviews",
          asin,
          amazon_domain: options.amazonDomain,
          sort_by: options.sortBy ?? "most_recent",
          reviewer_type: options.reviewerType ?? "all_reviews",
          global_reviews: String(options.globalReviews ?? true),
          page: String(page),
        },
        timeoutMs,
      );
      const parsed = normalizeRainforestReviewsPage(payload);
      pagesFetched++;
      creditsUsed += parsed.creditsUsed;
      if (page === 1 || summary.rating == null) summary = mergeSummary(summary, parsed.summary);
      for (const r of parsed.reviews) if (!collected.has(r.externalId)) collected.set(r.externalId, r);

      if (!parsed.reviews.length) break;
      if (parsed.totalPages != null && page >= parsed.totalPages) break;
      if (options.stopBeforeDate && parsed.reviews.every((r) => r.reviewDate && r.reviewDate < options.stopBeforeDate!)) break;
    }
    return { reviews: [...collected.values()], summary, pagesFetched, creditsUsed, usedFallback: false };
  } catch (error) {
    if (collected.size > 0) {
      // Partial success: keep what we have rather than failing the ASIN.
      return { reviews: [...collected.values()], summary, pagesFetched, creditsUsed, usedFallback: false };
    }
    // Reviews endpoint unavailable (Amazon gates deep review pages behind login
    // for many domains). Use the PDP top reviews + rating summary instead.
    const { product, creditsUsed: productCredits } = await fetchRainforestProduct(asin, options.amazonDomain, timeoutMs);
    const fallbackSummary = normalizeRainforestSummary({ product });
    const reviews = normalizeProductTopReviews(product);
    if (!reviews.length && fallbackSummary.rating == null) throw error;
    return { reviews, summary: fallbackSummary, pagesFetched, creditsUsed: creditsUsed + productCredits, usedFallback: true };
  }
}

function mergeSummary(base: RatingSummary, next: RatingSummary): RatingSummary {
  return {
    rating: next.rating ?? base.rating,
    ratingsTotal: next.ratingsTotal ?? base.ratingsTotal,
    reviewsTotal: next.reviewsTotal ?? base.reviewsTotal,
    ratingBreakdown: next.ratingBreakdown ?? base.ratingBreakdown,
    itemName: next.itemName ?? base.itemName,
  };
}
