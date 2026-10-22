// Read side of the reviews store: what the hub page, the portal, the SEO
// pipeline and reports consume. Every query is scoped by client code.
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { master, productReviews, reviewAsinStatus, reviewRatingHistory, reviewSyncRuns, reviewTopicSnapshots, type ReviewTopic, type ReviewTopicTrend } from "@/lib/db/schema";
import { aggregateTopics, averageRating, keywordCandidatesFromTopics, starDistribution, type KeywordCandidate, type StarDistribution } from "./normalize";

export type AsinOverview = {
  asin: string;
  /** master.id of the representative row for this ASIN (Active SKU preferred). */
  productId: string | null;
  sku: string | null;
  status: string | null;
  title: string | null;
  summarizedTitle: string | null;
  imageUrl: string | null;
  parentAsin: string | null;
  rating: number | null;
  ratingsTotal: number | null;
  storedReviews: number;
  negativeShare: number | null;
  lastReviewsFetchAt: string | null;
  lastTopicsFetchAt: string | null;
  lastError: string | null;
  topNegative: string | null;
  topPositive: string | null;
};

export type ClientReviewOverview = {
  clientIdCode: string;
  asins: AsinOverview[];
  totals: {
    products: number;
    synced: number;
    storedReviews: number;
    weightedRating: number | null;
    ratingsTotal: number;
    distribution: StarDistribution;
    negativeShare: number | null;
    lastSyncAt: string | null;
  };
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

type ClientProduct = { id: string; asin: string; sku: string | null; title: string | null; summarizedTitle: string | null; image: string | null; parentAsin: string | null; status: string | null };

/** Sellable (non-parent) Hub products for a client, one row per ASIN. */
async function clientProducts(clientIdCode: string): Promise<ClientProduct[]> {
  const rows = await db
    .select({ id: master.id, asin: master.asin, sku: master.sku, title: master.itemName, summarizedTitle: master.summarizedTitle, image: master.mainImageUrl, parentAsin: master.parentAsin, status: master.status })
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, clientIdCode),
        sql`${master.asin} IS NOT NULL AND ${master.asin} != '' AND lower(coalesce(${master.parentageLevel}, '')) != 'parent'`,
      ),
    )
    .orderBy(desc(sql`${master.status} = 'Active'`), master.itemName);
  const seen = new Map<string, ClientProduct>();
  for (const r of rows) {
    if (!r.asin) continue;
    const asin = r.asin.trim().toUpperCase();
    if (!seen.has(asin)) seen.set(asin, { id: r.id, asin, sku: r.sku, title: r.title, summarizedTitle: r.summarizedTitle, image: r.image, parentAsin: r.parentAsin, status: r.status });
  }
  return [...seen.values()];
}

/** Latest topic snapshot per ASIN. */
export async function latestTopicSnapshots(asins: string[]) {
  if (!asins.length) return [];
  return db
    .selectDistinctOn([reviewTopicSnapshots.asin])
    .from(reviewTopicSnapshots)
    .where(inArray(reviewTopicSnapshots.asin, asins))
    .orderBy(reviewTopicSnapshots.asin, desc(reviewTopicSnapshots.fetchedAt));
}

export async function getClientReviewOverview(clientIdCode: string): Promise<ClientReviewOverview> {
  const products = await clientProducts(clientIdCode);
  const asins = products.map((p) => p.asin);
  if (!asins.length) {
    return { clientIdCode, asins: [], totals: { products: 0, synced: 0, storedReviews: 0, weightedRating: null, ratingsTotal: 0, distribution: starDistribution([]), negativeShare: null, lastSyncAt: null } };
  }

  const [statuses, snapshots, ratingRows] = await Promise.all([
    db.select().from(reviewAsinStatus).where(inArray(reviewAsinStatus.asin, asins)),
    latestTopicSnapshots(asins),
    db
      .select({ asin: productReviews.asin, rating: productReviews.rating, count: sql<number>`count(*)::int` })
      .from(productReviews)
      .where(inArray(productReviews.asin, asins))
      .groupBy(productReviews.asin, productReviews.rating),
  ]);
  const statusByAsin = new Map(statuses.map((s) => [s.asin, s]));
  const snapshotByAsin = new Map(snapshots.map((s) => [s.asin, s]));
  const distByAsin = new Map<string, StarDistribution>();
  const dist = starDistribution([]);
  for (const r of ratingRows) {
    if (!r.rating || r.rating < 1 || r.rating > 5) continue;
    const d = distByAsin.get(r.asin) ?? starDistribution([]);
    d[r.rating as 1 | 2 | 3 | 4 | 5] += r.count;
    distByAsin.set(r.asin, d);
    dist[r.rating as 1 | 2 | 3 | 4 | 5] += r.count;
  }
  const share = (d: StarDistribution) => {
    const total = d[1] + d[2] + d[3] + d[4] + d[5];
    return total ? Math.round(((d[1] + d[2]) / total) * 1000) / 10 : null;
  };

  let weightedSum = 0;
  let weightTotal = 0;
  let lastSync: Date | null = null;
  const overview: AsinOverview[] = products.map((p) => {
    const s = statusByAsin.get(p.asin);
    const snap = snapshotByAsin.get(p.asin);
    const rating = num(s?.rating);
    if (rating != null && s?.ratingsTotal) { weightedSum += rating * s.ratingsTotal; weightTotal += s.ratingsTotal; }
    if (s?.lastReviewsFetchAt && (!lastSync || s.lastReviewsFetchAt > lastSync)) lastSync = s.lastReviewsFetchAt;
    if (s?.lastTopicsFetchAt && (!lastSync || s.lastTopicsFetchAt > lastSync)) lastSync = s.lastTopicsFetchAt;
    return {
      asin: p.asin,
      productId: p.id,
      sku: p.sku,
      status: p.status,
      title: p.title ?? s?.itemName ?? null,
      summarizedTitle: p.summarizedTitle?.trim() || null,
      imageUrl: p.image,
      parentAsin: p.parentAsin,
      rating,
      ratingsTotal: s?.ratingsTotal ?? null,
      storedReviews: s?.storedReviews ?? 0,
      negativeShare: share(distByAsin.get(p.asin) ?? starDistribution([])),
      lastReviewsFetchAt: iso(s?.lastReviewsFetchAt),
      lastTopicsFetchAt: iso(s?.lastTopicsFetchAt),
      lastError: s?.lastError ?? null,
      topNegative: snap?.negativeTopics?.[0]?.topic ?? null,
      topPositive: snap?.positiveTopics?.[0]?.topic ?? null,
    };
  });

  return {
    clientIdCode,
    asins: overview,
    totals: {
      products: overview.length,
      synced: overview.filter((a) => a.lastReviewsFetchAt || a.lastTopicsFetchAt).length,
      storedReviews: overview.reduce((n, a) => n + a.storedReviews, 0),
      weightedRating: weightTotal ? Math.round((weightedSum / weightTotal) * 100) / 100 : null,
      ratingsTotal: weightTotal,
      distribution: dist,
      negativeShare: share(dist),
      lastSyncAt: iso(lastSync),
    },
  };
}

export type ClientTopicInsights = {
  clientIdCode: string;
  asinsWithTopics: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  positive: ReviewTopic[];
  negative: ReviewTopic[];
  trends: { positive: ReviewTopicTrend[]; negative: ReviewTopicTrend[] };
  keywordCandidates: KeywordCandidate[];
  perAsin: Array<{ asin: string; itemName: string | null; fetchedAt: string; positive: ReviewTopic[]; negative: ReviewTopic[] }>;
};

/** Average the per-ASIN trend curves into one client curve per topic (top topics only). */
function aggregateTrends(all: ReviewTopicTrend[][], keep: Set<string>): ReviewTopicTrend[] {
  const byTopic = new Map<string, Map<string, { sum: number; n: number; end: string; parent: number[]; category: number[] }>>();
  for (const list of all) {
    for (const t of list) {
      const key = t.topic.toLowerCase();
      if (!keep.has(key)) continue;
      const m = byTopic.get(key) ?? new Map();
      for (const p of t.points) {
        const cur = m.get(p.start) ?? { sum: 0, n: 0, end: p.end, parent: [], category: [] };
        cur.sum += p.asinPct; cur.n++;
        if (p.parentPct != null) cur.parent.push(p.parentPct);
        if (p.categoryPct != null) cur.category.push(p.categoryPct);
        m.set(p.start, cur);
      }
      byTopic.set(key, m);
    }
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  return [...byTopic.entries()].map(([key, m]) => ({
    topic: [...all.flat()].find((t) => t.topic.toLowerCase() === key)?.topic ?? key,
    points: [...m.entries()]
      .map(([start, v]) => ({ start, end: v.end, asinPct: Math.round((v.sum / v.n) * 100) / 100, parentPct: avg(v.parent), categoryPct: avg(v.category) }))
      .sort((a, b) => a.start.localeCompare(b.start)),
  }));
}

export async function getClientTopicInsights(clientIdCode: string, asinFilter?: string[] | null): Promise<ClientTopicInsights> {
  const products = await clientProducts(clientIdCode);
  let asins = products.map((p) => p.asin);
  if (asinFilter?.length) asins = asins.filter((a) => asinFilter.includes(a));
  const snapshots = await latestTopicSnapshots(asins);
  const positive = aggregateTopics(snapshots.map((s) => s.positiveTopics ?? []));
  const negative = aggregateTopics(snapshots.map((s) => s.negativeTopics ?? []));
  const keep = new Set([...positive, ...negative].map((t) => t.topic.toLowerCase()));
  const starts = snapshots.map((s) => s.rangeStart).filter((d): d is string => !!d).sort();
  const ends = snapshots.map((s) => s.rangeEnd).filter((d): d is string => !!d).sort();
  return {
    clientIdCode,
    asinsWithTopics: snapshots.length,
    rangeStart: starts[0] ?? null,
    rangeEnd: ends[ends.length - 1] ?? null,
    positive,
    negative,
    trends: {
      positive: aggregateTrends(snapshots.map((s) => s.trends?.positive ?? []), keep),
      negative: aggregateTrends(snapshots.map((s) => s.trends?.negative ?? []), keep),
    },
    keywordCandidates: keywordCandidatesFromTopics([...positive, ...negative]),
    perAsin: snapshots.map((s) => ({ asin: s.asin, itemName: s.itemName, fetchedAt: s.fetchedAt.toISOString(), positive: s.positiveTopics ?? [], negative: s.negativeTopics ?? [] })),
  };
}

export type ReviewListFilters = {
  clientIdCode: string;
  asins?: string[] | null;
  ratings?: number[] | null;
  verifiedOnly?: boolean;
  search?: string | null;
  from?: string | null;
  to?: string | null;
  sort?: "newest" | "oldest" | "helpful" | "rating_asc" | "rating_desc";
  page?: number;
  pageSize?: number;
};

export async function listReviews(filters: ReviewListFilters) {
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 25, 200));
  const page = Math.max(1, filters.page ?? 1);
  const conditions: SQL[] = [eq(productReviews.clientIdCode, filters.clientIdCode)];
  if (filters.asins?.length) conditions.push(inArray(productReviews.asin, filters.asins));
  if (filters.ratings?.length) conditions.push(inArray(productReviews.rating, filters.ratings));
  if (filters.verifiedOnly) conditions.push(eq(productReviews.verifiedPurchase, true));
  if (filters.from) conditions.push(gte(productReviews.reviewDate, filters.from));
  if (filters.to) conditions.push(lte(productReviews.reviewDate, filters.to));
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim().replace(/[%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(productReviews.body, q), ilike(productReviews.title, q), ilike(productReviews.variation, q))!);
  }
  const where = and(...conditions);
  const order = {
    newest: [desc(productReviews.reviewDate), desc(productReviews.firstSeenAt)],
    oldest: [productReviews.reviewDate, productReviews.firstSeenAt],
    helpful: [desc(productReviews.helpfulVotes), desc(productReviews.reviewDate)],
    rating_asc: [productReviews.rating, desc(productReviews.reviewDate)],
    rating_desc: [desc(productReviews.rating), desc(productReviews.reviewDate)],
  }[filters.sort ?? "newest"];

  const [rows, [{ total }], ratingRows] = await Promise.all([
    db
      .select({
        id: productReviews.id, asin: productReviews.asin, source: productReviews.source, externalId: productReviews.externalId,
        title: productReviews.title, body: productReviews.body, rating: productReviews.rating, reviewerName: productReviews.reviewerName,
        reviewDate: productReviews.reviewDate, verifiedPurchase: productReviews.verifiedPurchase, isVine: productReviews.isVine,
        helpfulVotes: productReviews.helpfulVotes, variation: productReviews.variation, images: productReviews.images, link: productReviews.link,
        reviewCountry: productReviews.reviewCountry, sentiment: productReviews.sentiment, keyThemes: productReviews.keyThemes,
        productTitle: master.itemName,
      })
      .from(productReviews)
      .leftJoin(master, and(eq(master.asin, productReviews.asin), eq(master.clientIdCode, productReviews.clientIdCode)))
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(distinct ${productReviews.id})::int` }).from(productReviews).where(where),
    db.select({ rating: productReviews.rating, count: sql<number>`count(*)::int` }).from(productReviews).where(where).groupBy(productReviews.rating),
  ]);

  // The master join can fan out when an ASIN has several SKUs; collapse to one row per review.
  const seen = new Set<string>();
  const reviews = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const ratings = ratingRows.flatMap((r) => Array<number | null>(r.count).fill(r.rating));
  return {
    reviews,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    distribution: starDistribution(ratings),
    averageRating: averageRating(ratings),
  };
}

export async function getRatingHistory(asins: string[], days = 90) {
  if (!asins.length) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(reviewRatingHistory)
    .where(and(inArray(reviewRatingHistory.asin, asins), gte(reviewRatingHistory.day, since)))
    .orderBy(reviewRatingHistory.day);
  return rows.map((r) => ({ asin: r.asin, day: r.day, reviewCount: r.reviewCount, rating: num(r.rating) }));
}

export async function recentSyncRuns(clientIdCode: string | null, limit = 10) {
  const where = clientIdCode ? eq(reviewSyncRuns.clientIdCode, clientIdCode) : undefined;
  const rows = await db.select().from(reviewSyncRuns).where(where).orderBy(desc(reviewSyncRuns.startedAt)).limit(limit);
  return rows.map((r) => ({ ...r, startedAt: r.startedAt.toISOString(), completedAt: iso(r.completedAt) }));
}

export type ReviewClientSummary = {
  clientIdCode: string;
  products: number;
  synced: number;
  storedReviews: number;
  weightedRating: number | null;
  lastSyncAt: string | null;
  errors: number;
};

/** Every active client with sellable ASINs plus its review-store status (hub client rail). */
export async function listReviewClients(): Promise<ReviewClientSummary[]> {
  const [products, statuses] = await Promise.all([
    db.execute<{ client_id_code: string; products: number }>(sql`
      SELECT m.client_id_code, count(DISTINCT m.asin)::int AS products
      FROM master m
      JOIN aac a ON a.client_id_code = m.client_id_code AND a.client_status = 'Active'
      WHERE m.asin IS NOT NULL AND m.asin != '' AND m.status = 'Active'
        AND lower(coalesce(m.parentage_level, '')) != 'parent'
      GROUP BY m.client_id_code
    `),
    db.execute<{ client_id_code: string; synced: number; stored: number; weighted: string | null; last_sync: string | null; errors: number }>(sql`
      SELECT client_id_code,
             count(*) FILTER (WHERE last_reviews_fetch_at IS NOT NULL OR last_topics_fetch_at IS NOT NULL)::int AS synced,
             coalesce(sum(stored_reviews), 0)::int AS stored,
             CASE WHEN sum(ratings_total) > 0 THEN (sum(rating * ratings_total) / sum(ratings_total))::text END AS weighted,
             max(greatest(last_reviews_fetch_at, last_topics_fetch_at))::text AS last_sync,
             count(*) FILTER (WHERE last_error IS NOT NULL)::int AS errors
      FROM review_asin_status
      WHERE client_id_code IS NOT NULL
      GROUP BY client_id_code
    `),
  ]);
  const statusByClient = new Map(statuses.map((s) => [s.client_id_code, s]));
  return products
    .filter((p) => p.client_id_code)
    .map((p) => {
      const s = statusByClient.get(p.client_id_code);
      return {
        clientIdCode: p.client_id_code,
        products: p.products,
        synced: s?.synced ?? 0,
        storedReviews: s?.stored ?? 0,
        weightedRating: s?.weighted ? Math.round(Number(s.weighted) * 100) / 100 : null,
        lastSyncAt: s?.last_sync ? new Date(s.last_sync).toISOString() : null,
        errors: s?.errors ?? 0,
      };
    })
    .sort((a, b) => a.clientIdCode.localeCompare(b.clientIdCode));
}

/** Stored reviews for a set of ASINs regardless of client (SEO projects can span codes). */
export async function reviewsForAsins(asins: string[], limit = 2000) {
  if (!asins.length) return [];
  return db
    .select({
      asin: productReviews.asin, externalId: productReviews.externalId, reviewerName: productReviews.reviewerName, body: productReviews.body,
      reviewDate: productReviews.reviewDate, reviewDateRaw: productReviews.reviewDateRaw, title: productReviews.title, rating: productReviews.rating,
      images: productReviews.images, helpfulVotes: productReviews.helpfulVotes, variation: productReviews.variation, verifiedPurchase: productReviews.verifiedPurchase,
    })
    .from(productReviews)
    .where(inArray(productReviews.asin, asins))
    .orderBy(desc(productReviews.reviewDate), desc(productReviews.helpfulVotes))
    .limit(limit);
}
