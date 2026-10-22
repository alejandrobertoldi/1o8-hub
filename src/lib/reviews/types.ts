import type { ReviewRatingBreakdown, ReviewTopic, ReviewTopicTrend } from "@/lib/db/schema";

/** Marketplaces the Helium 10 review tools accept, mapped to Amazon domains. */
export const REVIEW_MARKETPLACES = {
  US: "amazon.com",
  CA: "amazon.ca",
  MX: "amazon.com.mx",
  UK: "amazon.co.uk",
  DE: "amazon.de",
  FR: "amazon.fr",
  IT: "amazon.it",
  ES: "amazon.es",
  NL: "amazon.nl",
  AU: "amazon.com.au",
  JP: "amazon.co.jp",
  IN: "amazon.in",
  AE: "amazon.ae",
  BR: "amazon.com.br",
  SA: "amazon.sa",
} as const;
export type ReviewMarketplace = keyof typeof REVIEW_MARKETPLACES;

export type ReviewSource = "rainforest" | "firecrawl" | "csv" | "manual";

/** One customer review, provider-agnostic. */
export type NormalizedReview = {
  externalId: string;
  source: ReviewSource;
  title: string | null;
  body: string | null;
  rating: number | null;
  reviewerName: string | null;
  /** ISO date (YYYY-MM-DD) when parseable. */
  reviewDate: string | null;
  reviewDateRaw: string | null;
  verifiedPurchase: boolean;
  isVine: boolean;
  helpfulVotes: number;
  variation: string | null;
  images: string[];
  reviewCountry: string | null;
  link: string | null;
  raw: Record<string, unknown>;
};

/** Amazon-level rating summary for an ASIN. */
export type RatingSummary = {
  rating: number | null;
  ratingsTotal: number | null;
  reviewsTotal: number | null;
  ratingBreakdown: ReviewRatingBreakdown | null;
  itemName: string | null;
};

export type TopicSnapshotInput = {
  itemName: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  positiveTopics: ReviewTopic[];
  negativeTopics: ReviewTopic[];
  trends: { positive: ReviewTopicTrend[]; negative: ReviewTopicTrend[] } | null;
  raw: Record<string, unknown>;
};

export type RatingHistoryPoint = { day: string; reviewCount: number | null; rating: number | null };

export type ReviewSyncProvider = "rainforest" | "helium10";
