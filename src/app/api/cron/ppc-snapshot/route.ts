/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aac, ppcSnapshots } from "@/lib/db/schema";
import { ilike, eq, and } from "drizzle-orm";
import {
  fetchCampaignSummary,
  fetchKeywordSummary,
  fetchSearchTermSummary,
  aggregateCampaigns,
  aggregateKeywords,
  aggregateSearchTerms,
} from "@/lib/ppc-queries";
import { formatLocalDate } from "@/lib/date-ranges";

export const maxDuration = 300;

interface ClientInfo {
  clientIdCode: string;
  clientName: string;
  accountId: number;
}

/**
 * Daily PPC snapshot cron — captures campaign, keyword, and search term
 * snapshots for all active clients.
 *
 * Schedule: 02:00 UTC daily (configured in vercel.json)
 * Auth: CRON_SECRET bearer token
 *
 * Eng decisions applied:
 * - 3 queries per client in parallel, clients sequential (#6)
 * - 30s per-query timeout, skip-on-failure (#6)
 * - Pre-computed deltas stored in deltas JSONB column (#4)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const snapshotDate = formatLocalDate(today);

  // Yesterday's range for the snapshot (full day of data)
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = formatLocalDate(yesterday);

  // 7-day window for the snapshot data
  const weekAgo = new Date(yesterday);
  weekAgo.setDate(yesterday.getDate() - 6);
  const startDate = formatLocalDate(weekAgo);

  // Previous 7-day window for delta computation
  const prevEnd = new Date(weekAgo);
  prevEnd.setDate(weekAgo.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - 6);
  const prevStartDate = formatLocalDate(prevStart);
  const prevEndDate = formatLocalDate(prevEnd);

  // 1. Get active clients with Intentwise account IDs
  const activeClients = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      rawData: aac.rawData,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));

  const clients: ClientInfo[] = [];
  for (const c of activeClients) {
    const raw = typeof c.rawData === "string" ? JSON.parse(c.rawData) : (c.rawData as Record<string, string>);
    const iwId = raw?.IntentwiseID;
    if (!iwId || !c.clientIdCode) continue;
    clients.push({
      clientIdCode: c.clientIdCode,
      clientName: c.clientName || c.clientIdCode,
      accountId: parseInt(iwId, 10),
    });
  }

  const results: { client: string; status: string; detail?: string }[] = [];

  // 2. Process clients sequentially, 3 queries per client in parallel
  for (const client of clients) {
    try {
      // Current period — 3 queries in parallel
      const [campaigns, keywords, searchTerms] = await Promise.all([
        fetchCampaignSummary(client.accountId, startDate, endDate).catch(() => []),
        fetchKeywordSummary(client.accountId, startDate, endDate).catch(() => []),
        fetchSearchTermSummary(client.accountId, startDate, endDate).catch(() => []),
      ]);

      // Previous period — for delta computation
      const [prevCampaigns, prevKeywords, prevSearchTerms] = await Promise.all([
        fetchCampaignSummary(client.accountId, prevStartDate, prevEndDate).catch(() => []),
        fetchKeywordSummary(client.accountId, prevStartDate, prevEndDate).catch(() => []),
        fetchSearchTermSummary(client.accountId, prevStartDate, prevEndDate).catch(() => []),
      ]);

      // Aggregate
      const campaignSummary = aggregateCampaigns(campaigns);
      const keywordSummary = aggregateKeywords(keywords);
      const searchTermSummary = aggregateSearchTerms(searchTerms);

      const prevCampaignSummary = aggregateCampaigns(prevCampaigns);
      const prevKeywordSummary = aggregateKeywords(prevKeywords);
      const prevSearchTermSummary = aggregateSearchTerms(prevSearchTerms);

      // Compute deltas
      const campaignDeltas = computeDeltas(campaignSummary, prevCampaignSummary);
      const keywordDeltas = {
        totalKeywords: keywordSummary.totalKeywords - prevKeywordSummary.totalKeywords,
        totalSpend: keywordSummary.totalSpend - prevKeywordSummary.totalSpend,
        totalRevenue: keywordSummary.totalRevenue - prevKeywordSummary.totalRevenue,
      };
      const searchTermDeltas = {
        totalSearchTerms: searchTermSummary.totalSearchTerms - prevSearchTermSummary.totalSearchTerms,
        totalSpend: searchTermSummary.totalSpend - prevSearchTermSummary.totalSpend,
        totalRevenue: searchTermSummary.totalRevenue - prevSearchTermSummary.totalRevenue,
      };

      // Upsert snapshots (3 report types)
      const snapshots = [
        {
          clientIdCode: client.clientIdCode,
          reportType: "campaign" as const,
          snapshotDate,
          summary: campaignSummary,
          deltas: campaignDeltas,
          data: { rowCount: campaigns.length },
        },
        {
          clientIdCode: client.clientIdCode,
          reportType: "keyword" as const,
          snapshotDate,
          summary: keywordSummary,
          deltas: keywordDeltas,
          data: { rowCount: keywords.length },
        },
        {
          clientIdCode: client.clientIdCode,
          reportType: "search_term" as const,
          snapshotDate,
          summary: searchTermSummary,
          deltas: searchTermDeltas,
          data: { rowCount: searchTerms.length },
        },
      ];

      for (const snap of snapshots) {
        await db
          .insert(ppcSnapshots)
          .values(snap)
          .onConflictDoUpdate({
            target: [ppcSnapshots.clientIdCode, ppcSnapshots.reportType, ppcSnapshots.snapshotDate],
            set: {
              summary: snap.summary,
              deltas: snap.deltas,
              data: snap.data,
            },
          });
      }

      results.push({
        client: client.clientIdCode,
        status: "ok",
        detail: `campaigns:${campaigns.length} keywords:${keywords.length} searchTerms:${searchTerms.length}`,
      });
    } catch (error) {
      // Skip-on-failure per eng decision #6
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[PPC Cron] Failed for ${client.clientIdCode}:`, msg);
      results.push({ client: client.clientIdCode, status: "error", detail: msg });
    }
  }

  return NextResponse.json({
    snapshotDate,
    dateRange: { start: startDate, end: endDate },
    prevRange: { start: prevStartDate, end: prevEndDate },
    clientsProcessed: results.filter((r) => r.status === "ok").length,
    clientsFailed: results.filter((r) => r.status === "error").length,
    results,
  });
}

function computeDeltas(
  current: { totalSpend: number; totalRevenue: number; totalImpressions: number; totalClicks: number; totalOrders: number; acos: number; roas: number; cpc: number; ctr: number; cvr: number },
  previous: { totalSpend: number; totalRevenue: number; totalImpressions: number; totalClicks: number; totalOrders: number; acos: number; roas: number; cpc: number; ctr: number; cvr: number }
) {
  const pctChange = (curr: number, prev: number) =>
    prev !== 0 ? ((curr - prev) / prev) * 100 : curr !== 0 ? 100 : 0;

  return {
    spend: { absolute: current.totalSpend - previous.totalSpend, pct: pctChange(current.totalSpend, previous.totalSpend) },
    revenue: { absolute: current.totalRevenue - previous.totalRevenue, pct: pctChange(current.totalRevenue, previous.totalRevenue) },
    impressions: { absolute: current.totalImpressions - previous.totalImpressions, pct: pctChange(current.totalImpressions, previous.totalImpressions) },
    clicks: { absolute: current.totalClicks - previous.totalClicks, pct: pctChange(current.totalClicks, previous.totalClicks) },
    orders: { absolute: current.totalOrders - previous.totalOrders, pct: pctChange(current.totalOrders, previous.totalOrders) },
    acos: { absolute: current.acos - previous.acos, pct: pctChange(current.acos, previous.acos) },
    roas: { absolute: current.roas - previous.roas, pct: pctChange(current.roas, previous.roas) },
    cpc: { absolute: current.cpc - previous.cpc, pct: pctChange(current.cpc, previous.cpc) },
    ctr: { absolute: current.ctr - previous.ctr, pct: pctChange(current.ctr, previous.ctr) },
    cvr: { absolute: current.cvr - previous.cvr, pct: pctChange(current.cvr, previous.cvr) },
  };
}
