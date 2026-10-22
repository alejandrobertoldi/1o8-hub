// Pure normalizers: provider payload -> Hub review shapes. No I/O, fully unit-tested.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ReviewRatingBreakdown, ReviewTopic, ReviewTopicTrend } from "@/lib/db/schema";
import {
  REVIEW_MARKETPLACES,
  type NormalizedReview,
  type RatingHistoryPoint,
  type RatingSummary,
  type ReviewMarketplace,
  type TopicSnapshotInput,
} from "./types";

// --- Marketplace helpers -----------------------------------------------------

export function isReviewMarketplace(value: unknown): value is ReviewMarketplace {
  return typeof value === "string" && value in REVIEW_MARKETPLACES;
}

/** Client codes end in the marketplace ("TRT_SC_US"); fall back to the product country, then US. */
export function resolveMarketplace(clientIdCode: string | null | undefined, country?: string | null): ReviewMarketplace {
  const suffix = clientIdCode?.split("_").pop()?.trim().toUpperCase();
  if (isReviewMarketplace(suffix)) return suffix;
  const c = country?.trim().toUpperCase();
  if (c === "GB") return "UK";
  if (isReviewMarketplace(c)) return c;
  return "US";
}

export function amazonDomainFor(marketplace: ReviewMarketplace): string {
  return REVIEW_MARKETPLACES[marketplace];
}

export function isValidAsin(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9]{10}$/.test(value);
}

// --- Dates -------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

/**
 * Amazon review dates arrive as "Reviewed in the United States on March 5, 2026",
 * "5 March 2026", ISO strings, or Rainforest's `date.utc`. Returns YYYY-MM-DD or null.
 */
export function parseReviewDate(raw: string | null | undefined, utc?: string | null): string | null {
  if (utc) {
    const d = new Date(utc);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (!raw) return null;
  const text = raw.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // "March 5, 2026"
  const us = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (us && MONTHS[us[1].toLowerCase()]) return toIso(Number(us[3]), MONTHS[us[1].toLowerCase()], Number(us[2]));
  // "5 March 2026"
  const eu = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (eu && MONTHS[eu[2].toLowerCase()]) return toIso(Number(eu[3]), MONTHS[eu[2].toLowerCase()], Number(eu[1]));
  // "3/5/2026" (US)
  const slash = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return toIso(Number(slash[3]), Number(slash[1]), Number(slash[2]));
  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Extract the country from "Reviewed in the United States on ...". */
export function parseReviewCountry(raw: string | null | undefined): string | null {
  const m = raw?.match(/Reviewed in (?:the )?([A-Za-z .]+?) on /i);
  return m ? m[1].trim() : null;
}

// --- Stable ids --------------------------------------------------------------

/** Content hash for sources that do not carry Amazon's review id. */
export function contentHashId(parts: Array<string | number | null | undefined>): string {
  const joined = parts.map((p) => (p == null ? "" : String(p))).join("|");
  return "h_" + createHash("sha1").update(joined).digest("hex").slice(0, 24);
}

export function flattenAttributes(attributes: unknown): string | null {
  if (!Array.isArray(attributes)) return null;
  const parts = attributes
    .map((a) => (a && typeof a === "object" ? (a as { name?: unknown; value?: unknown }) : null))
    .filter((a): a is { name?: unknown; value?: unknown } => !!a && typeof a.value === "string" && a.value.trim() !== "")
    .map((a) => (typeof a.name === "string" && a.name.trim() ? `${a.name.trim().replace(/:$/, "")}: ${(a.value as string).trim()}` : (a.value as string).trim()));
  return parts.length ? parts.join(" | ") : null;
}

// --- Rainforest `type=reviews` -----------------------------------------------

const rainforestReview = z
  .object({
    id: z.string().optional(),
    title: z.string().nullish(),
    body: z.string().nullish(),
    rating: z.number().nullish(),
    date: z.object({ raw: z.string().nullish(), utc: z.string().nullish() }).nullish(),
    profile: z.object({ name: z.string().nullish(), link: z.string().nullish(), id: z.string().nullish() }).nullish(),
    verified_purchase: z.boolean().nullish(),
    vine_program: z.boolean().nullish(),
    helpful_votes: z.number().nullish(),
    images: z.array(z.object({ link: z.string() }).passthrough()).nullish(),
    link: z.string().nullish(),
    attributes: z.unknown().optional(),
    review_country: z.string().nullish(),
    is_global_review: z.boolean().nullish(),
  })
  .passthrough();

const rainforestReviewsPayload = z
  .object({
    request_info: z.object({ success: z.boolean().optional(), message: z.string().optional(), credits_used_this_request: z.number().optional() }).passthrough().optional(),
    product: z.object({ title: z.string().nullish(), rating: z.number().nullish(), ratings_total: z.number().nullish(), reviews_total: z.number().nullish() }).passthrough().nullish(),
    summary: z
      .object({
        rating: z.number().nullish(),
        ratings_total: z.number().nullish(),
        reviews_total: z.number().nullish(),
        rating_breakdown: z.record(z.string(), z.object({ percentage: z.number().nullish(), count: z.number().nullish() }).passthrough()).nullish(),
      })
      .passthrough()
      .nullish(),
    reviews: z.array(z.unknown()).nullish(),
    pagination: z.object({ total_results: z.number().nullish(), total_pages: z.number().nullish(), current_page: z.number().nullish() }).passthrough().nullish(),
  })
  .passthrough();

export type RainforestReviewsPage = {
  reviews: NormalizedReview[];
  summary: RatingSummary;
  totalPages: number | null;
  currentPage: number | null;
  creditsUsed: number;
  invalidRows: number;
};

function toNormalizedReview(row: unknown, source: NormalizedReview["source"]): NormalizedReview | null {
  const r = rainforestReview.safeParse(row);
  if (!r.success) return null;
  const v = r.data;
  const body = v.body?.trim() || null;
  const title = v.title?.trim() || null;
  if (!body && !title) return null;
  const rating = typeof v.rating === "number" && v.rating >= 1 && v.rating <= 5 ? Math.round(v.rating) : null;
  return {
    externalId: v.id?.trim() || contentHashId([v.profile?.name, v.date?.raw, title, body]),
    source,
    title,
    body,
    rating,
    reviewerName: v.profile?.name?.trim() || null,
    reviewDate: parseReviewDate(v.date?.raw, v.date?.utc),
    reviewDateRaw: v.date?.raw?.trim() || null,
    verifiedPurchase: v.verified_purchase === true,
    isVine: v.vine_program === true,
    helpfulVotes: typeof v.helpful_votes === "number" && v.helpful_votes > 0 ? Math.round(v.helpful_votes) : 0,
    variation: flattenAttributes(v.attributes),
    images: (v.images ?? []).map((i) => i.link).filter(Boolean),
    reviewCountry: v.review_country?.trim() || parseReviewCountry(v.date?.raw),
    link: v.link?.trim() || null,
    raw: v as Record<string, unknown>,
  };
}

export function normalizeRainforestReviewsPage(payload: unknown): RainforestReviewsPage {
  const parsed = rainforestReviewsPayload.safeParse(payload);
  if (!parsed.success) throw new Error("Rainforest returned an unrecognised reviews payload.");
  const data = parsed.data;
  if (data.request_info?.success === false) throw new Error(data.request_info.message || "Rainforest request failed");

  const reviews: NormalizedReview[] = [];
  let invalidRows = 0;
  for (const row of data.reviews ?? []) {
    const review = toNormalizedReview(row, "rainforest");
    if (review) reviews.push(review); else invalidRows++;
  }

  return {
    reviews,
    summary: normalizeRainforestSummary(data),
    totalPages: data.pagination?.total_pages ?? null,
    currentPage: data.pagination?.current_page ?? null,
    creditsUsed: data.request_info?.credits_used_this_request ?? 1,
    invalidRows,
  };
}

const BREAKDOWN_KEYS = ["five_star", "four_star", "three_star", "two_star", "one_star"] as const;

export function normalizeRainforestSummary(payload: unknown): RatingSummary {
  const parsed = rainforestReviewsPayload.safeParse(payload);
  if (!parsed.success) return { rating: null, ratingsTotal: null, reviewsTotal: null, ratingBreakdown: null, itemName: null };
  const { summary, product } = parsed.data;
  let breakdown: ReviewRatingBreakdown | null = null;
  const src = summary?.rating_breakdown ?? (product as { rating_breakdown?: Record<string, { percentage?: number | null; count?: number | null }> } | null | undefined)?.rating_breakdown;
  if (src && BREAKDOWN_KEYS.every((k) => k in src)) {
    breakdown = Object.fromEntries(
      BREAKDOWN_KEYS.map((k) => [k, { count: src[k]?.count ?? 0, percentage: src[k]?.percentage ?? 0 }]),
    ) as ReviewRatingBreakdown;
  }
  return {
    rating: summary?.rating ?? product?.rating ?? null,
    ratingsTotal: summary?.ratings_total ?? product?.ratings_total ?? null,
    reviewsTotal: summary?.reviews_total ?? product?.reviews_total ?? null,
    ratingBreakdown: breakdown,
    itemName: product?.title?.trim() || null,
  };
}

// --- Rainforest `type=product` -> top_reviews (fallback when the reviews endpoint is unavailable) --

export function normalizeProductTopReviews(product: unknown, source: NormalizedReview["source"] = "rainforest"): NormalizedReview[] {
  const parsed = z.object({ top_reviews: z.array(z.unknown()).nullish() }).passthrough().safeParse(product);
  if (!parsed.success) return [];
  const out: NormalizedReview[] = [];
  for (const row of parsed.data.top_reviews ?? []) {
    const review = toNormalizedReview(row, source);
    if (review) out.push(review);
  }
  return out;
}

// --- Helium 10 MCP: get_asin_review_analysis ---------------------------------

/** Helium 10 wraps payloads as `{ data, error }`; accept that or the bare data object. */
function unwrapHeliumEnvelope(payload: unknown): { body: unknown; error: unknown } {
  if (payload && typeof payload === "object" && "data" in payload) {
    const p = payload as { data: unknown; error?: unknown };
    return { body: p.data, error: p.error ?? null };
  }
  return { body: payload, error: null };
}


const metrics = z.object({ numberOfMentions: z.number().nullish(), occurrencePercentage: z.number().nullish(), starRatingImpact: z.number().nullish() }).passthrough();
const browseMetrics = z
  .object({
    occurrencePercentage: z.union([z.number(), z.object({ allProducts: z.number().nullish() }).passthrough()]).nullish(),
    starRatingImpact: z.union([z.number(), z.object({ allProducts: z.number().nullish() }).passthrough()]).nullish(),
  })
  .passthrough();
const heliumTopic = z
  .object({
    topic: z.string(),
    asinMetrics: metrics.nullish(),
    parentAsinMetrics: metrics.nullish(),
    browseNodeMetrics: browseMetrics.nullish(),
    reviewSnippets: z.array(z.string()).nullish(),
    subtopics: z.array(z.object({ subtopic: z.string(), metrics: metrics.nullish() }).passthrough()).nullish(),
  })
  .passthrough();
const heliumTopicBlock = z
  .object({
    itemName: z.string().nullish(),
    dateRange: z.object({ startDate: z.string().nullish(), endDate: z.string().nullish() }).nullish(),
    topics: z.object({ positiveTopics: z.array(z.unknown()).nullish(), negativeTopics: z.array(z.unknown()).nullish() }).nullish(),
  })
  .passthrough();
const heliumTrendBlock = z
  .object({
    reviewTrends: z
      .object({
        positiveTopics: z.array(z.unknown()).nullish(),
        negativeTopics: z.array(z.unknown()).nullish(),
      })
      .nullish(),
  })
  .passthrough();
const heliumTrend = z
  .object({
    topic: z.string(),
    trendMetrics: z
      .array(
        z
          .object({
            dateRange: z.object({ startDate: z.string().nullish(), endDate: z.string().nullish() }).nullish(),
            asinMetrics: z.object({ occurrencePercentage: z.number().nullish() }).passthrough().nullish(),
            parentAsinMetrics: z.object({ occurrencePercentage: z.number().nullish() }).passthrough().nullish(),
            browseNodeMetrics: browseMetrics.nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();
const heliumAnalysis = z
  .object({
    asin: z.string().optional(),
    marketplace: z.string().optional(),
    topics_mentions: heliumTopicBlock.nullish(),
    topics_star_rating_impact: heliumTopicBlock.nullish(),
    trends: heliumTrendBlock.nullish(),
  })
  .passthrough();

function browseNumber(v: number | { allProducts?: number | null } | null | undefined): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof v.allProducts === "number") return v.allProducts;
  return null;
}

function toReviewTopic(raw: unknown): ReviewTopic | null {
  const t = heliumTopic.safeParse(raw);
  if (!t.success) return null;
  const v = t.data;
  return {
    topic: v.topic.trim(),
    mentions: v.asinMetrics?.numberOfMentions ?? 0,
    occurrencePct: v.asinMetrics?.occurrencePercentage ?? 0,
    starImpact: v.asinMetrics?.starRatingImpact ?? null,
    snippets: (v.reviewSnippets ?? []).map((s) => s.trim()).filter(Boolean),
    subtopics: (v.subtopics ?? []).map((s) => ({
      name: s.subtopic.trim(),
      mentions: s.metrics?.numberOfMentions ?? 0,
      occurrencePct: s.metrics?.occurrencePercentage ?? 0,
    })),
    parent: v.parentAsinMetrics
      ? { mentions: v.parentAsinMetrics.numberOfMentions ?? 0, occurrencePct: v.parentAsinMetrics.occurrencePercentage ?? 0, starImpact: v.parentAsinMetrics.starRatingImpact ?? null }
      : null,
    category: v.browseNodeMetrics
      ? { occurrencePct: browseNumber(v.browseNodeMetrics.occurrencePercentage), starImpact: browseNumber(v.browseNodeMetrics.starRatingImpact) }
      : null,
  };
}

/**
 * Merge the "by mentions" and "by star-rating impact" lists: same topic names,
 * but the impact list carries `starRatingImpact` the mentions list may omit.
 */
function mergeTopicLists(byMentions: unknown[], byImpact: unknown[]): ReviewTopic[] {
  const out = new Map<string, ReviewTopic>();
  for (const raw of byMentions) {
    const t = toReviewTopic(raw);
    if (t) out.set(t.topic.toLowerCase(), t);
  }
  for (const raw of byImpact) {
    const t = toReviewTopic(raw);
    if (!t) continue;
    const key = t.topic.toLowerCase();
    const existing = out.get(key);
    if (!existing) { out.set(key, t); continue; }
    if (existing.starImpact == null && t.starImpact != null) existing.starImpact = t.starImpact;
    if (!existing.snippets.length && t.snippets.length) existing.snippets = t.snippets;
    if (!existing.subtopics.length && t.subtopics.length) existing.subtopics = t.subtopics;
    if (existing.parent && existing.parent.starImpact == null && t.parent?.starImpact != null) existing.parent.starImpact = t.parent.starImpact;
  }
  return [...out.values()].sort((a, b) => b.mentions - a.mentions || Math.abs(b.starImpact ?? 0) - Math.abs(a.starImpact ?? 0));
}

function toTrend(raw: unknown): ReviewTopicTrend | null {
  const t = heliumTrend.safeParse(raw);
  if (!t.success) return null;
  const points = (t.data.trendMetrics ?? [])
    .map((p) => ({
      start: p.dateRange?.startDate?.slice(0, 10) ?? "",
      end: p.dateRange?.endDate?.slice(0, 10) ?? "",
      asinPct: p.asinMetrics?.occurrencePercentage ?? 0,
      parentPct: p.parentAsinMetrics?.occurrencePercentage ?? null,
      categoryPct: browseNumber(p.browseNodeMetrics?.occurrencePercentage),
    }))
    .filter((p) => p.start)
    .sort((a, b) => a.start.localeCompare(b.start));
  return { topic: t.data.topic.trim(), points };
}

/** Accepts either the bare `data` object or the `{ data, error }` envelope Helium 10 returns. */
export function normalizeHeliumReviewAnalysis(payload: unknown): TopicSnapshotInput {
  const { body, error } = unwrapHeliumEnvelope(payload);
  if (error) throw new Error("Helium 10 review analysis returned an error.");
  const parsed = heliumAnalysis.safeParse(body);
  if (!parsed.success) throw new Error("Helium 10 returned an unrecognised review analysis payload.");
  const d = parsed.data;
  const block = d.topics_mentions ?? d.topics_star_rating_impact ?? null;
  const positive = mergeTopicLists(d.topics_mentions?.topics?.positiveTopics ?? [], d.topics_star_rating_impact?.topics?.positiveTopics ?? []);
  const negative = mergeTopicLists(d.topics_mentions?.topics?.negativeTopics ?? [], d.topics_star_rating_impact?.topics?.negativeTopics ?? []);
  const trends = d.trends?.reviewTrends
    ? {
        positive: (d.trends.reviewTrends.positiveTopics ?? []).map(toTrend).filter((t): t is ReviewTopicTrend => !!t),
        negative: (d.trends.reviewTrends.negativeTopics ?? []).map(toTrend).filter((t): t is ReviewTopicTrend => !!t),
      }
    : null;
  return {
    itemName: block?.itemName?.trim() || null,
    rangeStart: block?.dateRange?.startDate?.slice(0, 10) ?? null,
    rangeEnd: block?.dateRange?.endDate?.slice(0, 10) ?? null,
    positiveTopics: positive,
    negativeTopics: negative,
    trends,
    raw: d as Record<string, unknown>,
  };
}

// --- Helium 10 MCP: get_asin_reviews_history ---------------------------------

export function normalizeHeliumRatingHistory(payload: unknown): RatingHistoryPoint[] {
  const { body, error } = unwrapHeliumEnvelope(payload);
  if (error) throw new Error("Helium 10 rating history returned an error.");
  const parsed = z
    .object({ points: z.array(z.object({ date: z.string(), review_count: z.number().nullish(), rating: z.number().nullish() }).passthrough()).nullish() })
    .passthrough()
    .safeParse(body);
  if (!parsed.success) throw new Error("Helium 10 returned an unrecognised rating history payload.");
  const byDay = new Map<string, RatingHistoryPoint>();
  for (const p of parsed.data.points ?? []) {
    const day = p.date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDay.set(day, { day, reviewCount: p.review_count ?? null, rating: p.rating ?? null });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// --- MCP tool result envelope ------------------------------------------------

/** Unwrap an MCP `callTool` result into its JSON payload (structuredContent or first JSON text block). */
export function readMcpJson(input: unknown, what = "Helium 10"): unknown {
  const envelope = z.object({ isError: z.boolean().optional(), structuredContent: z.unknown().optional(), content: z.unknown().optional() }).safeParse(input);
  if (!envelope.success) throw new Error(`${what} returned an invalid response.`);
  if (envelope.data.isError) throw new Error(`${what} tool call failed. Check the account entitlement and try again.`);
  if (envelope.data.structuredContent) return envelope.data.structuredContent;
  if (Array.isArray(envelope.data.content)) {
    for (const item of envelope.data.content) {
      if (!item || typeof item !== "object" || (item as { type?: string }).type !== "text") continue;
      const text = String((item as { text?: unknown }).text ?? "");
      // Some gateways append a trailing "[gateway-meta] ..." line after the JSON.
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end <= start) continue;
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* not JSON */ }
    }
  }
  throw new Error(`${what} returned no usable payload.`);
}

// --- Aggregation helpers (shared by API + UI) --------------------------------

export type StarDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export function starDistribution(ratings: Array<number | null | undefined>): StarDistribution {
  const dist: StarDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) if (r && r >= 1 && r <= 5) dist[r as 1 | 2 | 3 | 4 | 5]++;
  return dist;
}

export function averageRating(ratings: Array<number | null | undefined>): number | null {
  const valid = ratings.filter((r): r is number => typeof r === "number" && r >= 1 && r <= 5);
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

/**
 * Roll many ASIN snapshots into one client-level topic list: sum mentions,
 * mention-weight the percentages and star impact, union snippets (capped).
 */
export function aggregateTopics(lists: ReviewTopic[][], limit = 12): ReviewTopic[] {
  type Acc = ReviewTopic & { impactWeight: number; pctWeight: number };
  const acc = new Map<string, Acc>();
  for (const list of lists) {
    for (const t of list) {
      const key = t.topic.toLowerCase();
      const cur = acc.get(key);
      const w = Math.max(t.mentions, 1);
      if (!cur) {
        acc.set(key, {
          ...t,
          snippets: [...t.snippets],
          subtopics: t.subtopics.map((s) => ({ ...s })),
          occurrencePct: t.occurrencePct * w,
          starImpact: t.starImpact == null ? null : t.starImpact * w,
          impactWeight: t.starImpact == null ? 0 : w,
          pctWeight: w,
        });
        continue;
      }
      cur.mentions += t.mentions;
      cur.occurrencePct += t.occurrencePct * w;
      cur.pctWeight += w;
      if (t.starImpact != null) { cur.starImpact = (cur.starImpact ?? 0) + t.starImpact * w; cur.impactWeight += w; }
      for (const s of t.snippets) if (cur.snippets.length < 6 && !cur.snippets.includes(s)) cur.snippets.push(s);
      for (const s of t.subtopics) {
        const existing = cur.subtopics.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
        if (existing) existing.mentions += s.mentions; else cur.subtopics.push({ ...s });
      }
    }
  }
  return [...acc.values()]
    .map(({ impactWeight, pctWeight, ...t }) => ({
      ...t,
      occurrencePct: Math.round((t.occurrencePct / Math.max(pctWeight, 1)) * 100) / 100,
      starImpact: impactWeight ? Math.round(((t.starImpact ?? 0) / impactWeight) * 100) / 100 : null,
      subtopics: t.subtopics.sort((a, b) => b.mentions - a.mentions).slice(0, 8),
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit);
}

/**
 * Keyword candidates for SEO from review language: topic names, subtopic
 * phrases and frequent 2-3 word n-grams in snippets. Dedupes, drops stopwords.
 */
const STOP = new Set(["the", "and", "for", "with", "this", "that", "was", "are", "but", "not", "you", "have", "they", "very", "just", "than", "them", "its", "it's", "these", "from", "were", "been", "has", "had", "would", "also", "too", "get", "got", "into", "out", "our", "your", "their", "what", "when", "which", "there", "then", "some", "much", "more", "most", "can", "will", "all", "one", "two", "use", "used", "using", "like", "really", "great", "good", "love", "well", "exactly", "expected"]);

export type KeywordCandidate = { phrase: string; weight: number; from: "topic" | "subtopic" | "snippet" };

export function keywordCandidatesFromTopics(topics: ReviewTopic[], limit = 30): KeywordCandidate[] {
  const scores = new Map<string, { weight: number; from: KeywordCandidate["from"] }>();
  const add = (phrase: string, weight: number, from: KeywordCandidate["from"]) => {
    const p = phrase.toLowerCase().replace(/[^a-z0-9 '-]/g, " ").replace(/\s+/g, " ").trim();
    if (p.length < 4 || STOP.has(p)) return;
    const cur = scores.get(p);
    if (cur) cur.weight += weight; else scores.set(p, { weight, from });
  };
  for (const t of topics) {
    add(t.topic.replace(/[-/]/g, " "), Math.max(t.mentions, 1) * 2, "topic");
    for (const s of t.subtopics) if (!/generic$/i.test(s.name)) add(s.name, Math.max(s.mentions, 1), "subtopic");
    for (const snip of t.snippets) {
      const words = snip.toLowerCase().replace(/[^a-z0-9 '-]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && w.length > 2);
      for (let n = 2; n <= 3; n++) for (let i = 0; i + n <= words.length; i++) add(words.slice(i, i + n).join(" "), 0.5, "snippet");
    }
  }
  return [...scores.entries()]
    .map(([phrase, v]) => ({ phrase, ...v }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/** CSV in the exact shape the SEO S3 parser (`parseReviewCSV`) expects. */
export type S3CsvRow = {
  externalId: string;
  reviewerName: string | null;
  body: string | null;
  reviewDate: string | null;
  reviewDateRaw: string | null;
  title: string | null;
  rating: number | null;
  images: string[] | null;
  helpfulVotes: number;
  variation: string | null;
  asin?: string | null;
};

export function reviewsToS3Csv(rows: S3CsvRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  // `variant: ... name` columns are what the parser folds into product_variation.
  const header = ["id", "profileName", "text", "date", "title", "rating", "images", "helpful", "asin", "variant: name"];
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    lines.push([
      r.externalId,
      r.reviewerName ?? "",
      r.body ?? "",
      r.reviewDate ?? r.reviewDateRaw ?? "",
      r.title ?? "",
      r.rating ?? "",
      (r.images ?? []).join(" "),
      r.helpfulVotes ?? 0,
      r.asin ?? "",
      r.variation ?? "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}
