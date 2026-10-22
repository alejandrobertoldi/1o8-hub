import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoListings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stampPhaseApproval, getNextVersionForAsin } from "@/lib/seo/persist";

const NAME = "__plan2_test_persist__";

describe("persist helpers", () => {
  let projectId: string;
  let asinId: string;

  beforeAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.name, NAME));
    const [proj] = await db
      .insert(seoProjects)
      .values({
        name: NAME,
        clientIdCode: "test",
        createdBy: "test@plan2.local",
      })
      .returning();
    projectId = proj.id;
    const [asin] = await db
      .insert(seoAsins)
      .values({ projectId, asin: "B0PERSIST", sku: "P" })
      .returning();
    asinId = asin.id;
  });

  afterAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.id, projectId));
  });

  it("stampPhaseApproval sets s2_approved_at when phase is S2", async () => {
    await stampPhaseApproval(projectId, "S2");
    const [row] = await db
      .select()
      .from(seoProjects)
      .where(eq(seoProjects.id, projectId));
    expect(row.s2ApprovedAt).toBeInstanceOf(Date);
    expect(row.s1ApprovedAt).toBeNull(); // other phases untouched
  });

  it("stampPhaseApproval sets s6_approved_at when phase is S6", async () => {
    await stampPhaseApproval(projectId, "S6");
    const [row] = await db
      .select()
      .from(seoProjects)
      .where(eq(seoProjects.id, projectId));
    expect(row.s6ApprovedAt).toBeInstanceOf(Date);
  });

  it("getNextVersionForAsin returns 1 when no rows exist for the asin", async () => {
    const v = await getNextVersionForAsin(seoListings, asinId);
    expect(v).toBe(1);
  });

  it("getNextVersionForAsin returns prior+1 after a listing is inserted", async () => {
    await db.insert(seoListings).values({
      projectId,
      asinId,
      title: "test title",
      version: 1,
    });
    const v = await getNextVersionForAsin(seoListings, asinId);
    expect(v).toBe(2);
  });
});
