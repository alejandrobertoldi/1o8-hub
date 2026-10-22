// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoPhaseRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runPhase } from "@/lib/seo/runner";

const NAME = "__plan2_e2e_s1__";

describe("runPhase('S1') end-to-end (LIVE Claude call — requires ANTHROPIC_API_KEY)", () => {
  let projectId: string;

  beforeAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.name, NAME));
    const [proj] = await db.insert(seoProjects).values({
      name: NAME,
      clientIdCode: "test",
      createdBy: "test@plan2.local",        // NOT NULL with no default
      brandGuidelinesLock: {
        status: "locked",
        brand_voice: "direct",
        language_preferences: "US",
        words_to_avoid: [],
        audience_notes: "",
        positioning: "test",
        raw_text: "",
      },
    }).returning();
    projectId = proj.id;
    await db.insert(seoAsins).values({
      projectId,
      asin: "B0E2ETEST",
      sku: "X",
      existingContent: {
        item_name: "Test Product",
        detailed_bullets: ["A"],
        concise_bullets: [],
        content_bullets: [],
        key_features: [],
        product_description: "Test desc",
        generic_keywords: [],
      },
    });
  });

  afterAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.id, projectId));
  });

  it("writes baseline_analysis + a success row in seo_phase_runs", async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("skipping live S1 e2e — ANTHROPIC_API_KEY not set");
      return;
    }
    const result = await runPhase(projectId, "S1");
    expect(result.status).toBe("success");
    const [asin] = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    expect(asin.baselineAnalysis).toBeDefined();
    expect(typeof asin.baselineAnalysis?.quality_score).toBe("number");
    const [run] = await db.select().from(seoPhaseRuns).where(eq(seoPhaseRuns.projectId, projectId));
    expect(run.status).toBe("success");
    expect(Number(run.claudeCostUsd)).toBeGreaterThan(0);
    expect(run.claudeInputTokens).toBeGreaterThan(0);
  }, 60_000);
});
