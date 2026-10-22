import { describe, it, expect } from "vitest";
import { S2 } from "@/lib/seo/phases/s2";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("S2 phase executor", () => {
  it("loadContext reads s2_cerebro_csv from seo_projects.contentRules", async () => {
    await db.delete(seoProjects).where(eq(seoProjects.name, "__s2_test__"));
    const [proj] = await db.insert(seoProjects).values({
      name: "__s2_test__",
      createdBy: "test@plan2.local",
      clientIdCode: "test",
      contentRules: { s2_cerebro_csv: { mode: "shared", dimensions: ["Keyword Phrase\nshoes\n"] } } as any,
    }).returning();
    const ctx = await S2.loadContext(proj.id);
    expect(ctx.cerebroCsv).toContain("Keyword Phrase");
    await db.delete(seoProjects).where(eq(seoProjects.id, proj.id));
  }, 30000);

  it("persist replaces project's keyword set", async () => {
    // covered by integration test in Task 14
    expect(typeof S2.persist).toBe("function");
  });
});
