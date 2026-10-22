/* eslint-disable react-doctor/server-sequential-independent-await */
import { db } from "@/lib/db";
import { seoProjects, seoKeywords, seoRufus, seoCosmopMaps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";
import { COSMO_RELATIONSHIPS } from "@/lib/seo/prompts/cosmo-relationships";

type S5Context = {
  projectId: string;
  approvedKeywords: Array<Record<string, unknown>>;
  rufusPhase3: unknown;
  brandVoice: string;
};

type S5Output = {
  triples: Array<{ id: string; entity1: string; relationship: string; entity2: string; confidence: number; confidence_level: "High" | "Medium" | "Low"; supporting_keyword_tier: string | null }>;
  keyword_coverage: Record<string, number>;
  competitive_positioning: string;
  relationship_categories_evaluated: string[];
};

export const S5: PhaseExecutor<S5Context, S5Output> = {
  phase: "S5",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const kws = await db.select().from(seoKeywords).where(eq(seoKeywords.projectId, projectId));
    const [rufus] = await db.select().from(seoRufus).where(eq(seoRufus.projectId, projectId)).limit(1);
    return {
      projectId,
      approvedKeywords: kws.map((k) => ({ text: k.text, priority_tier: k.priorityTier, cosmo_domain: k.cosmoDomain })),
      rufusPhase3: rufus?.optimizationSummary ?? null,
      brandVoice: (project.brandGuidelinesLock as any)?.brand_voice ?? "",
    };
  },
  fillSlots(ctx) {
    return {
      approved_keywords_json: ctx.approvedKeywords,
      rufus_phase3: ctx.rufusPhase3 ?? "",
      brand_voice: ctx.brandVoice,
      cosmo_categories_required: COSMO_RELATIONSHIPS.join(", "),
    };
  },
  async persist(projectId, output) {
    await db
      .insert(seoCosmopMaps)
      .values({
        projectId,
        triples: output.triples,
        keywordCoverage: output.keyword_coverage,
        competitivePositioning: output.competitive_positioning,
        relationshipCategoriesEvaluated: output.relationship_categories_evaluated,
      })
      .onConflictDoUpdate({
        target: seoCosmopMaps.projectId,
        set: {
          triples: output.triples,
          keywordCoverage: output.keyword_coverage,
          competitivePositioning: output.competitive_positioning,
          relationshipCategoriesEvaluated: output.relationship_categories_evaluated,
          updatedAt: new Date(),
        },
      });
    return { version: 1 };
  },
};
