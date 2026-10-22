// tests/db/seo-migration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

describe("0054 seo_manager_phase_overhaul migration", () => {
  it("adds s7/s8/s9 timestamp columns to seo_projects", async () => {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'seo_projects'
      AND column_name IN ('s7_approved_at','s8_approved_at','s9_approved_at','s7_skipped','s8_skipped')
    `);
    expect(cols.length).toBe(5);
  });

  it("creates 6 new typed tables", async () => {
    const tables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('seo_listings','seo_aplus_plans','seo_images','seo_qa','seo_passage_map','seo_scores')
    `);
    expect(tables.length).toBe(6);
  });

  it("preserves seo_asins.generated_content as legacy", async () => {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'seo_asins' AND column_name = 'generated_content'
    `);
    expect(cols.length).toBe(1);
  });
});
