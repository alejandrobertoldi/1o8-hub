/* eslint-disable react-doctor/async-await-in-loop */
// Review sync orchestrator: picks ASINs, pulls from each provider, upserts into
// the product_reviews store and records a review_sync_runs row.
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aac,
  master,
  productReviews,
  reviewAsinStatus,
  reviewRatingHistory,
  reviewSyncRuns,
  reviewTopicSnapshots,
  type ReviewSyncError,
} from "@/lib/db/schema";
import { withHelium10 } from "@/lib/helium10/session";
import { discoverReviewTools, fetchHeliumAsinInsights, type ReviewMcpClient } from "./helium10";
import { fetchRainforestReviews } from "./rainforest";
import { amazonDomainFor, isValidAsin, resolveMarketplace } from "./normalize";
import type { NormalizedReview, RatingSummary, ReviewMarketplace, ReviewSyncProvider, TopicSnapshotInput, RatingHistoryPoint } from "./types";

export type SyncTarget = { asin: string; clientIdCode: string | null; marketplace: ReviewMarketplace; itemName: string | null };

export type SyncOptions = {
  providers: ReviewSyncProvider[];
  trigger: "manual" | "cron";
  triggeredBy?: string | null;
  /** Epoch ms after which no new provider call starts. */
  deadline: number;
  /** Rainforest pages (10 reviews each) per ASIN. Default 3 on first sync, 1 when incremental. */
  maxPagesPerAsin?: number;
  withTopics?: boolean;
  withHistory?: boolean;
  historyDays?: number;
};

export type SyncResult = {
  runId: string;
  status: "completed" | "failed";
  asinsTotal: number;
  asinsDone: number;
  asinsFailed: number;
  reviewsAdded: number;
  topicsRefreshed: number;
  rainforestCredits: number;
  heliumCalls: number;
  errors: ReviewSyncError[];
  timedOut: boolean;
};

// --- Target selection ----------------------------------------------------------

const SELLABLE = sql`${master.asin} IS NOT NULL AND ${master.asin} != '' AND lower(coalesce(${master.parentageLevel}, '')) != 'parent'`;

/**
 * Hub products eligible for review sync: active child/standalone ASINs of a
 * client (or every active client), stalest review fetch first.
 */
export async function selectSyncTargets(params: { clientIdCode?: string | null; asins?: string[] | null; limit?: number; activeOnly?: boolean }): Promise<SyncTarget[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 50, 500));
  const conditions = [SELLABLE];
  if (params.activeOnly !== false) conditions.push(eq(master.status, "Active"));
  if (params.clientIdCode) conditions.push(eq(master.clientIdCode, params.clientIdCode));
  const asins = (params.asins ?? []).map((a) => a.trim().toUpperCase()).filter(isValidAsin);
  if (params.asins && !asins.length) return [];
  if (asins.length) conditions.push(inArray(master.asin, asins));

  const rows = await db
    .select({
      asin: master.asin,
      clientIdCode: master.clientIdCode,
      country: master.country,
      itemName: master.itemName,
      lastFetch: reviewAsinStatus.lastReviewsFetchAt,
    })
    .from(master)
    .leftJoin(reviewAsinStatus, eq(reviewAsinStatus.asin, master.asin))
    .where(and(...conditions))
    .orderBy(sql`${reviewAsinStatus.lastReviewsFetchAt} ASC NULLS FIRST`, asc(master.asin));

  // The same ASIN can appear on several rows (one per SKU); keep one target each.
  const seen = new Map<string, SyncTarget>();
  for (const row of rows) {
    const asin = row.asin?.trim().toUpperCase();
    if (!asin || !isValidAsin(asin) || seen.has(asin)) continue;
    seen.set(asin, { asin, clientIdCode: row.clientIdCode ?? null, marketplace: resolveMarketplace(row.clientIdCode, row.country), itemName: row.itemName ?? null });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** Client codes with active AAC status and at least one sellable ASIN (cron rotation). */
export async function activeReviewClients(): Promise<string[]> {
  const active = await db.select({ code: aac.clientIdCode }).from(aac).where(eq(aac.clientStatus, "Active"));
  const activeSet = new Set(active.map((r) => r.code).filter(Boolean));
  const counts = await db
    .select({ code: master.clientIdCode })
    .from(master)
    .where(and(SELLABLE, eq(master.status, "Active")))
    .groupBy(master.clientIdCode);
  return counts.map((r) => r.code).filter((c): c is string => !!c && activeSet.has(c)).sort();
}

// --- Persistence ---------------------------------------------------------------

export async function upsertReviews(target: SyncTarget, reviews: NormalizedReview[]): Promise<{ added: number; updated: number }> {
  if (!reviews.length) return { added: 0, updated: 0 };
  const ids = reviews.map((r) => r.externalId);
  const existing = await db
    .select({ externalId: productReviews.externalId })
    .from(productReviews)
    .where(and(eq(productReviews.asin, target.asin), inArray(productReviews.externalId, ids)));
  const existingIds = new Set(existing.map((r) => r.externalId));
  const now = new Date();

  await db
    .insert(productReviews)
    .values(
      reviews.map((r) => ({
        asin: target.asin,
        clientIdCode: target.clientIdCode,
        marketplace: target.marketplace,
        source: r.source,
        externalId: r.externalId,
        title: r.title,
        body: r.body,
        rating: r.rating,
        reviewerName: r.reviewerName,
        reviewDate: r.reviewDate,
        reviewDateRaw: r.reviewDateRaw,
        verifiedPurchase: r.verifiedPurchase,
        isVine: r.isVine,
        helpfulVotes: r.helpfulVotes,
        variation: r.variation,
        images: r.images,
        reviewCountry: r.reviewCountry,
        link: r.link,
        raw: r.raw,
        firstSeenAt: now,
        lastSeenAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [productReviews.asin, productReviews.externalId],
      set: {
        clientIdCode: sql`coalesce(excluded.client_id_code, ${productReviews.clientIdCode})`,
        title: sql`coalesce(excluded.title, ${productReviews.title})`,
        body: sql`coalesce(excluded.body, ${productReviews.body})`,
        rating: sql`coalesce(excluded.rating, ${productReviews.rating})`,
        reviewDate: sql`coalesce(excluded.review_date, ${productReviews.reviewDate})`,
        helpfulVotes: sql`greatest(excluded.helpful_votes, ${productReviews.helpfulVotes})`,
        verifiedPurchase: sql`excluded.verified_purchase OR ${productReviews.verifiedPurchase}`,
        variation: sql`coalesce(excluded.variation, ${productReviews.variation})`,
        images: sql`coalesce(excluded.images, ${productReviews.images})`,
        link: sql`coalesce(excluded.link, ${productReviews.link})`,
        raw: sql`coalesce(excluded.raw, ${productReviews.raw})`,
        lastSeenAt: now,
      },
    });

  const added = reviews.filter((r) => !existingIds.has(r.externalId)).length;
  return { added, updated: reviews.length - added };
}

type StatusPatch = Partial<{
  summary: RatingSummary;
  lastReviewsFetchAt: Date;
  lastTopicsFetchAt: Date;
  lastHistoryFetchAt: Date;
  lastError: string | null;
}>;

export async function touchAsinStatus(target: SyncTarget, patch: StatusPatch): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(productReviews).where(eq(productReviews.asin, target.asin));
  const now = new Date();
  const values = {
    asin: target.asin,
    clientIdCode: target.clientIdCode,
    marketplace: target.marketplace,
    itemName: patch.summary?.itemName ?? target.itemName,
    rating: patch.summary?.rating == null ? undefined : String(patch.summary.rating),
    ratingsTotal: patch.summary?.ratingsTotal ?? undefined,
    reviewsTotal: patch.summary?.reviewsTotal ?? undefined,
    ratingBreakdown: patch.summary?.ratingBreakdown ?? undefined,
    storedReviews: count,
    lastReviewsFetchAt: patch.lastReviewsFetchAt,
    lastTopicsFetchAt: patch.lastTopicsFetchAt,
    lastHistoryFetchAt: patch.lastHistoryFetchAt,
    lastError: patch.lastError,
    updatedAt: now,
  };
  const set: Record<string, unknown> = { storedReviews: count, updatedAt: now, clientIdCode: sql`coalesce(excluded.client_id_code, ${reviewAsinStatus.clientIdCode})` };
  if (values.itemName) set.itemName = values.itemName;
  if (values.rating !== undefined) set.rating = values.rating;
  if (values.ratingsTotal !== undefined) set.ratingsTotal = values.ratingsTotal;
  if (values.reviewsTotal !== undefined) set.reviewsTotal = values.reviewsTotal;
  if (values.ratingBreakdown !== undefined) set.ratingBreakdown = values.ratingBreakdown;
  if (patch.lastReviewsFetchAt) set.lastReviewsFetchAt = patch.lastReviewsFetchAt;
  if (patch.lastTopicsFetchAt) set.lastTopicsFetchAt = patch.lastTopicsFetchAt;
  if (patch.lastHistoryFetchAt) set.lastHistoryFetchAt = patch.lastHistoryFetchAt;
  if ("lastError" in patch) set.lastError = patch.lastError ?? null;
  await db.insert(reviewAsinStatus).values(values).onConflictDoUpdate({ target: reviewAsinStatus.asin, set });
}

export async function saveTopicSnapshot(target: SyncTarget, topics: TopicSnapshotInput): Promise<void> {
  await db.insert(reviewTopicSnapshots).values({
    asin: target.asin,
    clientIdCode: target.clientIdCode,
    marketplace: target.marketplace,
    source: "helium10",
    itemName: topics.itemName ?? target.itemName,
    rangeStart: topics.rangeStart,
    rangeEnd: topics.rangeEnd,
    positiveTopics: topics.positiveTopics,
    negativeTopics: topics.negativeTopics,
    trends: topics.trends,
    raw: topics.raw,
  });
  // Keep the newest 12 snapshots per ASIN (about a quarter of weekly refreshes).
  await db.execute(sql`
    DELETE FROM review_topic_snapshots
    WHERE asin = ${target.asin}
      AND id NOT IN (SELECT id FROM review_topic_snapshots WHERE asin = ${target.asin} ORDER BY fetched_at DESC LIMIT 12)
  `);
}

export async function saveRatingHistory(target: SyncTarget, points: RatingHistoryPoint[]): Promise<void> {
  if (!points.length) return;
  await db
    .insert(reviewRatingHistory)
    .values(points.map((p) => ({ asin: target.asin, day: p.day, reviewCount: p.reviewCount, rating: p.rating == null ? null : String(p.rating), source: "helium10" })))
    .onConflictDoUpdate({
      target: [reviewRatingHistory.asin, reviewRatingHistory.day],
      set: { reviewCount: sql`excluded.review_count`, rating: sql`excluded.rating` },
    });
}

// --- Orchestration -------------------------------------------------------------

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // Never persist upstream bodies that could carry credentials.
  return text.replace(/api_key=[^&\s]+/gi, "api_key=***").slice(0, 500);
}

export async function runReviewSync(targets: SyncTarget[], options: SyncOptions): Promise<SyncResult> {
  const providers = [...new Set(options.providers)];
  const clientCodes = new Set(targets.map((t) => t.clientIdCode).filter(Boolean));
  const [run] = await db
    .insert(reviewSyncRuns)
    .values({
      clientIdCode: clientCodes.size === 1 ? [...clientCodes][0] : null,
      trigger: options.trigger,
      triggeredBy: options.triggeredBy ?? null,
      providers,
      asinsTotal: targets.length,
    })
    .returning({ id: reviewSyncRuns.id });

  const result: SyncResult = {
    runId: run.id, status: "completed", asinsTotal: targets.length, asinsDone: 0, asinsFailed: 0,
    reviewsAdded: 0, topicsRefreshed: 0, rainforestCredits: 0, heliumCalls: 0, errors: [], timedOut: false,
  };
  const failed = new Set<string>();
  const done = new Set<string>();
  const outOfTime = () => Date.now() >= options.deadline;

  // Phase A: raw reviews (Rainforest). No shared lock, so run first.
  if (providers.includes("rainforest")) {
    if (!process.env.RAINFOREST_API_KEY) {
      result.errors.push({ asin: "*", provider: "rainforest", message: "RAINFOREST_API_KEY not configured" });
    } else {
      const statuses = await db
        .select({ asin: reviewAsinStatus.asin, last: reviewAsinStatus.lastReviewsFetchAt, stored: reviewAsinStatus.storedReviews })
        .from(reviewAsinStatus)
        .where(inArray(reviewAsinStatus.asin, targets.map((t) => t.asin)));
      const statusByAsin = new Map(statuses.map((s) => [s.asin, s]));
      for (const target of targets) {
        if (outOfTime()) { result.timedOut = true; break; }
        const prior = statusByAsin.get(target.asin);
        const incremental = !!prior?.last && (prior.stored ?? 0) > 0;
        try {
          const fetched = await fetchRainforestReviews(target.asin, {
            amazonDomain: amazonDomainFor(target.marketplace),
            maxPages: options.maxPagesPerAsin ?? (incremental ? 1 : 3),
            stopBeforeDate: incremental && prior?.last ? prior.last.toISOString().slice(0, 10) : null,
            timeoutMs: Math.max(5_000, Math.min(45_000, options.deadline - Date.now())),
          });
          result.rainforestCredits += fetched.creditsUsed;
          const { added } = await upsertReviews(target, fetched.reviews);
          result.reviewsAdded += added;
          await touchAsinStatus(target, { summary: fetched.summary, lastReviewsFetchAt: new Date(), lastError: null });
          done.add(target.asin);
        } catch (error) {
          failed.add(target.asin);
          result.errors.push({ asin: target.asin, provider: "rainforest", message: message(error) });
          await touchAsinStatus(target, { lastError: `rainforest: ${message(error)}` }).catch(() => undefined);
        }
      }
    }
  }

  // Phase B: Amazon Customer Feedback topics + rating history (Helium 10 MCP), one connection for the batch.
  if (providers.includes("helium10") && !result.timedOut) {
    try {
      await withHelium10(async (client) => {
          const mcp = client as unknown as ReviewMcpClient;
          const tools = await discoverReviewTools(mcp, options.deadline);
          if (!tools.analysis && !tools.history) throw new Error("Helium 10 review tools are not available for this account.");
          const session = { id: null as string | null };
          for (const target of targets) {
            if (outOfTime()) { result.timedOut = true; break; }
            try {
              const insights = await fetchHeliumAsinInsights(mcp, target.asin, {
                marketplace: target.marketplace, tools, deadline: options.deadline, session,
                withTopics: options.withTopics, withHistory: options.withHistory, historyDays: options.historyDays,
              });
              result.heliumCalls += insights.callsUsed;
              const patch: StatusPatch = { lastError: null };
              if (insights.topics) { await saveTopicSnapshot(target, insights.topics); result.topicsRefreshed++; patch.lastTopicsFetchAt = new Date(); }
              if (insights.history.length) {
                await saveRatingHistory(target, insights.history);
                patch.lastHistoryFetchAt = new Date();
                const latest = insights.history[insights.history.length - 1];
                patch.summary = { rating: latest.rating, ratingsTotal: latest.reviewCount, reviewsTotal: null, ratingBreakdown: null, itemName: insights.topics?.itemName ?? null };
              } else if (insights.topics?.itemName) {
                patch.summary = { rating: null, ratingsTotal: null, reviewsTotal: null, ratingBreakdown: null, itemName: insights.topics.itemName };
              }
              for (const note of insights.skipped) result.errors.push({ asin: target.asin, provider: "helium10", message: note });
              await touchAsinStatus(target, patch);
              done.add(target.asin);
            } catch (error) {
              failed.add(target.asin);
              result.errors.push({ asin: target.asin, provider: "helium10", message: message(error) });
              await touchAsinStatus(target, { lastError: `helium10: ${message(error)}` }).catch(() => undefined);
              if (/timed out/i.test(message(error))) { result.timedOut = true; break; }
            }
          }
      });
    } catch (error) {
      // Connection-level failure (not connected, quota, discovery): one error, not one per ASIN.
      result.errors.push({ asin: "*", provider: "helium10", message: message(error) });
      for (const t of targets) if (!done.has(t.asin)) failed.add(t.asin);
    }
  }

  // An ASIN counts as done when at least one provider succeeded; failed only when every provider failed.
  result.asinsDone = done.size;
  result.asinsFailed = [...failed].filter((a) => !done.has(a)).length;
  result.status = result.asinsTotal > 0 && result.asinsFailed === result.asinsTotal ? "failed" : "completed";

  await db
    .update(reviewSyncRuns)
    .set({
      status: result.status,
      asinsDone: result.asinsDone,
      asinsFailed: result.asinsFailed,
      reviewsAdded: result.reviewsAdded,
      topicsRefreshed: result.topicsRefreshed,
      errors: result.errors,
      completedAt: new Date(),
    })
    .where(eq(reviewSyncRuns.id, run.id));

  return result;
}

/**
 * ASINs never synced, or synced before `staleBefore`, across every active client (cron).
 * With `failedBefore`, ASINs whose last attempt errored are held back until their status
 * row is older than that instant, so a broken ASIN is not retried on every call.
 */
export async function staleSyncTargets(limit: number, staleBefore: Date, options: { failedBefore?: Date } = {}): Promise<SyncTarget[]> {
  const clients = await activeReviewClients();
  if (!clients.length) return [];
  const conditions: Array<SQL | undefined> = [
    SELLABLE,
    eq(master.status, "Active"),
    inArray(master.clientIdCode, clients),
    or(isNull(reviewAsinStatus.lastReviewsFetchAt), sql`${reviewAsinStatus.lastReviewsFetchAt} < ${staleBefore}`),
  ];
  if (options.failedBefore) {
    conditions.push(or(isNull(reviewAsinStatus.lastError), sql`${reviewAsinStatus.updatedAt} < ${options.failedBefore}`));
  }
  const rows = await db
    .select({ asin: master.asin, clientIdCode: master.clientIdCode, country: master.country, itemName: master.itemName })
    .from(master)
    .leftJoin(reviewAsinStatus, eq(reviewAsinStatus.asin, master.asin))
    .where(and(...conditions))
    .orderBy(sql`${reviewAsinStatus.lastReviewsFetchAt} ASC NULLS FIRST`, desc(master.updatedAt));
  const seen = new Map<string, SyncTarget>();
  for (const row of rows) {
    const asin = row.asin?.trim().toUpperCase();
    if (!asin || !isValidAsin(asin) || seen.has(asin)) continue;
    seen.set(asin, { asin, clientIdCode: row.clientIdCode ?? null, marketplace: resolveMarketplace(row.clientIdCode, row.country), itemName: row.itemName ?? null });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}
