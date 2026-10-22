import { db } from "@/lib/db";
import { seoRufus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CANONICAL_RUFUS_QUESTIONS } from "@/lib/seo/prompts/canonical-rufus-questions";

type Phase1Q = { id: string; text: string; intent_tier: string; batch_char_count: number };

export const S4 = {
  phase: "S4" as const,
  model: "claude-sonnet-4-6",

  emitPhase1(): Phase1Q[] {
    return CANONICAL_RUFUS_QUESTIONS.map((q) => ({
      id: q.id,
      text: q.text,
      intent_tier: q.intent_tier,
      batch_char_count: q.text.length,
    }));
  },

  requiresPause(subPhase: "S4P1" | "S4P2" | "S4P3"): boolean {
    return subPhase === "S4P1" || subPhase === "S4P2";
  },

  async persistPhase1(projectId: string, responses: string[]): Promise<void> {
    if (responses.length !== 5) throw new Error("S4 Phase 1 requires exactly 5 responses");
    const questions = S4.emitPhase1();
    await db
      .insert(seoRufus)
      .values({
        projectId,
        phase1Questions: questions,
        phase1Answers: responses,
        phase1ApprovedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: seoRufus.projectId,
        set: { phase1Questions: questions, phase1Answers: responses, phase1ApprovedAt: new Date(), updatedAt: new Date() },
      });
  },

  async persistPhase2(projectId: string, questions: Phase1Q[], answers: string[]): Promise<void> {
    if (answers.length !== questions.length) {
      throw new Error("S4 Phase 2: questions and answers must be same length");
    }
    await db
      .update(seoRufus)
      .set({ phase2Questions: questions, phase2Answers: answers, phase2ApprovedAt: new Date(), updatedAt: new Date() })
      .where(eq(seoRufus.projectId, projectId));
  },

  // Phase 3 is autonomous: runner calls Claude with the optimization-synthesis
  // prompt, validates against the S4P3 schema, persists, stamps s4_approved_at.
  async persistPhase3(
    projectId: string,
    output: { rows: Array<Record<string, string>>; optimization_summary: { seo_strategy: string; listing_plan: string; image_strategy: string; audience_segmentation: string; action_list: string[] } }
  ): Promise<void> {
    await db
      .update(seoRufus)
      .set({
        rows: output.rows,
        optimizationSummary: output.optimization_summary,
        phase3ApprovedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(seoRufus.projectId, projectId));
  },
};
