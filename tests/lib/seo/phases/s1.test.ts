// tests/lib/seo/phases/s1.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { S1 } from "@/lib/seo/phases/s1";

const TEST_PROJECT_NAME = "__plan2_test_s1__";

describe("S1 phase executor", () => {
  let projectId: string;
  beforeAll(async () => {
    // Clean up any prior test project
    await db.delete(seoProjects).where(eq(seoProjects.name, TEST_PROJECT_NAME));
    const [proj] = await db.insert(seoProjects).values({
      name: TEST_PROJECT_NAME,
      createdBy: "test@plan2.local",   // ADDED: seoProjects.createdBy is NOT NULL with no default
      clientIdCode: "test",
      brandGuidelinesLock: {
        status: "locked",
        brand_voice: "direct, technical",
        language_preferences: "US English",
        words_to_avoid: ["proprietary"],
        audience_notes: "agency clients",
        positioning: "Amazon agency of record",
        raw_text: "",
      },
    }).returning();
    projectId = proj.id;
    await db.insert(seoAsins).values({
      projectId,
      asin: "B0TESTASIN",
      sku: "SKU-1",
      existingContent: {
        item_name: "Sample Product",
        detailed_bullets: ["A".repeat(50)], concise_bullets: [], content_bullets: [],
        key_features: [], product_description: "x".repeat(100), generic_keywords: [],
      },
    });
  });

  it("loadContext reads project + asins + brand lock", async () => {
    const ctx = await S1.loadContext(projectId);
    expect(ctx.brandVoice).toBe("direct, technical");
    expect(ctx.asins.length).toBe(1);
    expect(ctx.asins[0].asin).toBe("B0TESTASIN");
  });

  it("fillSlots produces all S1 slots", async () => {
    const ctx = await S1.loadContext(projectId);
    const slots = S1.fillSlots(ctx);
    expect(slots).toMatchObject({
      brand_name: expect.any(String),
      brand_voice: "direct, technical",
      words_to_avoid: expect.stringContaining("proprietary"),
      asin_grid_json: expect.stringContaining("B0TESTASIN"),
    });
  });
});
