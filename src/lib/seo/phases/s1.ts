/* eslint-disable react-doctor/async-await-in-loop */
// src/lib/seo/phases/s1.ts
import { db } from "@/lib/db";
import { seoProjects, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SlotMap } from "@/lib/seo/slot-fill";

export type PhaseId = "S1" | "S2" | "S3" | "S4P1" | "S4P2" | "S4P3" | "S5" | "S6" | "S7" | "S8" | "S9";

export type PhaseExecutor<Ctx = unknown, Output = unknown> = {
  phase: PhaseId;
  model: string;
  loadContext: (projectId: string) => Promise<Ctx>;
  fillSlots: (ctx: Ctx) => SlotMap;
  persist: (
    projectId: string,
    output: Output,
    runId: string
  ) => Promise<{ version: number }>;
};

type S1Context = {
  projectId: string;
  brandName: string;
  brandVoice: string;
  wordsToAvoid: string[];
  positioning: string;
  variationTheme: string;
  asins: Array<{ id: string; asin: string; sku: string; existing: unknown }>;
};

type S1Output = {
  asins: Array<{
    asin: string;
    baseline_analysis: {
      quality_score: number;
      keyword_integration: "strong" | "moderate" | "weak";
      compliance_flags: string[];
      top_improvements: string[];
    };
  }>;
};

export const S1: PhaseExecutor<S1Context, S1Output> = {
  phase: "S1",
  model: "claude-sonnet-4-6",

  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    const lock = project.brandGuidelinesLock;
    return {
      projectId,
      brandName: project.name ?? "",
      brandVoice: (lock as Record<string, unknown>)?.brand_voice as string ?? "",
      wordsToAvoid: (lock as Record<string, unknown>)?.words_to_avoid as string[] ?? [],
      positioning: (lock as Record<string, unknown>)?.positioning as string ?? "",
      variationTheme: project.varietyPackDetails ?? "",
      asins: asins.map((a) => ({ id: a.id, asin: a.asin, sku: a.sku, existing: a.existingContent })),
    };
  },

  fillSlots(ctx) {
    return {
      client_id_code: "", // project.clientIdCode looked up at runner level if needed by template
      brand_name: ctx.brandName,
      brand_voice: ctx.brandVoice,
      words_to_avoid: ctx.wordsToAvoid.join(", "),
      positioning: ctx.positioning,
      variation_theme: ctx.variationTheme,
      asin_grid_json: JSON.stringify(ctx.asins.map((a) => ({ asin: a.asin, sku: a.sku, existing: a.existing }))),
    };
  },

  async persist(projectId, output) {
    let written = 0;
    for (const row of output.asins) {
      const res = await db
        .update(seoAsins)
        .set({ baselineAnalysis: row.baseline_analysis })
        .where(eq(seoAsins.projectId, projectId));
      written += (res as unknown as { count?: number }).count ?? 0;
    }
    return { version: written };
  },
};
