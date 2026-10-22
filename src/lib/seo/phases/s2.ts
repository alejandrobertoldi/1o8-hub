/* eslint-disable react-doctor/js-combine-iterations */
import { db } from "@/lib/db";
import { seoProjects, seoKeywords, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";
import { mergeResearchKeywords, type KeywordSnapshot } from "@/lib/helium10/keywords";

type S2Context = {
  projectId: string;
  cerebroCsv: string;
  baselineSummary: string;
};

type S2Output = {
  keywords: Array<Record<string, unknown> & { text: string }>;
};

export const S2: PhaseExecutor<S2Context, S2Output> = {
  phase: "S2",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const rules = (project.contentRules ?? {}) as Record<string, { mode: string; dimensions: string[] }>;
    let cerebroCsv = rules.s2_cerebro_csv?.dimensions?.[0] ?? "";
    const research = rules.s2_helium10_data?.dimensions?.[0];
    if (research) {
      const snapshot = JSON.parse(research) as KeywordSnapshot;
      cerebroCsv = JSON.stringify({ source: "Helium 10 MCP", marketplace: snapshot.marketplace, fetched_at: snapshot.fetchedAt,
        keywords: mergeResearchKeywords(snapshot.client, snapshot.competitors),
      }, null, 2);
    }
    if (!cerebroCsv) throw new Error("S2 requires Helium 10 data. Fetch keywords in the keyword step.");
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    const baselineSummary = asins
      .filter((a) => a.baselineAnalysis)
      .map((a) => `${a.asin}: ${(a.baselineAnalysis as { top_improvements?: string[] })?.top_improvements?.join("; ") ?? ""}`)
      .join("\n");
    return { projectId, cerebroCsv, baselineSummary };
  },
  fillSlots(ctx) {
    return { cerebro_csv: ctx.cerebroCsv, baseline_summary: ctx.baselineSummary };
  },
  async persist(projectId, output) {
    await db.delete(seoKeywords).where(eq(seoKeywords.projectId, projectId));
    if (output.keywords.length > 0) {
      await db.insert(seoKeywords).values(
        output.keywords.map((k) => ({
          projectId,
          text: String(k.text),
          searchVolume: Number(k.search_volume ?? 0),
          priorityTier: String(k.priority_tier ?? "T4"),
          searchIntent: String(k.search_intent ?? ""),
          primaryUseLocation: String(k.primary_use_location ?? ""),
          matchType: String(k.match_type ?? ""),
          cosmoRelationship: null,
          buyerStage: String(k.buyer_stage ?? "Awareness"),
          notes: String(k.notes ?? ""),
          keywordSource: String(k.keyword_source ?? "Helium 10"),
          semanticGroup: String(k.semantic_group ?? ""),
          cerebroIq: k.cerebro_iq == null ? null : Number(k.cerebro_iq),
          competingProducts: k.competing_products == null ? null : Number(k.competing_products),
          titleDensity: k.title_density == null ? null : Number(k.title_density),
          cpr: k.cpr == null ? null : Number(k.cpr),
          competitorRankAvg: k.competitor_rank_avg == null ? null : String(k.competitor_rank_avg),
          ppcSuggestedBid: k.ppc_suggested_bid == null ? null : String(k.ppc_suggested_bid),
          ppcSuggestedMinBid: k.ppc_suggested_min_bid == null ? null : String(k.ppc_suggested_min_bid),
          ppcSuggestedMaxBid: k.ppc_suggested_max_bid == null ? null : String(k.ppc_suggested_max_bid),
          cosmoDomain: String(k.cosmo_domain ?? ""),
          compositeScore: k.composite_score == null ? null : String(k.composite_score),
          isNegative: Boolean(k.is_negative),
          negativeReason: k.negative_reason == null ? null : String(k.negative_reason),
          isCompetitor: Boolean(k.is_competitor),
        }))
      );
    }
    return { version: 1 };
  },
};
