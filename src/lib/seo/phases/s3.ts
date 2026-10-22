import { db } from "@/lib/db";
import { seoProjects, seoReviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";

type S3Context = { projectId: string; reviewsCsv: string };
type S3Output = { reviews: Array<Record<string, unknown>> };

export const S3: PhaseExecutor<S3Context, S3Output> = {
  phase: "S3",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const rules = (project.contentRules ?? {}) as Record<string, { dimensions: string[] }>;
    const reviewsCsv = rules.s3_reviews_csv?.dimensions?.[0] ?? "";
    if (!reviewsCsv) throw new Error("S3 requires reviews CSV. Upload it via the S3 column UI.");
    return { projectId, reviewsCsv };
  },
  fillSlots(ctx) {
    return { reviews_csv: ctx.reviewsCsv };
  },
  async persist(projectId, output) {
    await db.delete(seoReviews).where(eq(seoReviews.projectId, projectId));
    if (output.reviews.length > 0) {
      await db.insert(seoReviews).values(
        output.reviews.map((r) => ({
          projectId,
          reviewId: r.review_id == null ? null : String(r.review_id),
          sentiment: String(r.sentiment ?? ""),
          keyThemes: String(r.key_themes ?? ""),
          usageMentioned: r.usage_mentioned == null ? null : String(r.usage_mentioned),
          rufusUsableInsight: r.rufus_usable_insight == null ? null : String(r.rufus_usable_insight),
          bulletMapping: r.bullet_mapping == null ? null : String(r.bullet_mapping),
        }))
      );
    }
    return { version: 1 };
  },
};
