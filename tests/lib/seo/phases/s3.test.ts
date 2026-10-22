import { describe, it, expect } from "vitest";
import { S3 } from "@/lib/seo/phases/s3";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("S3 phase executor", () => {
  it("loadContext reads s3_reviews_csv from seo_projects.contentRules", async () => {
    await db.delete(seoProjects).where(eq(seoProjects.name, "__s3_test__"));
    const [proj] = await db.insert(seoProjects).values({
      name: "__s3_test__",
      createdBy: "test@plan2.local",
      clientIdCode: "test",
      contentRules: { s3_reviews_csv: { mode: "shared", dimensions: ["review_id,sentiment\nR1,positive\n"] } } as any,
    }).returning();
    const ctx = await S3.loadContext(proj.id);
    expect(ctx.reviewsCsv).toContain("review_id");
    await db.delete(seoProjects).where(eq(seoProjects.id, proj.id));
  }, 30000);

  it("persist function exists", () => {
    expect(typeof S3.persist).toBe("function");
  });
});
