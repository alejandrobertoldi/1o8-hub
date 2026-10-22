import { describe, it, expect } from "vitest";
import { loadSkill } from "@/lib/seo/skill-loader";

describe("loadSkill", () => {
  it("loads SKILL.md frontmatter", async () => {
    const s = await loadSkill();
    expect(s.name).toBe("1o8-seo-manager");
    expect(s.description).toMatch(/9-phase Amazon SEO/);
  });

  it("loads all 9 phase files", async () => {
    const s = await loadSkill();
    expect(Object.keys(s.phases).sort()).toEqual([
      "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"
    ]);
  });

  it("loads 4 rubric files", async () => {
    const s = await loadSkill();
    expect(Object.keys(s.rubrics).sort()).toEqual([
      "amazon-compliance", "byte-budgets", "cosmo-coverage", "rufus-coverage"
    ]);
  });

  it("loads schema.json", async () => {
    const s = await loadSkill();
    expect(s.schema.tables.seo_listings).toBeDefined();
  });
});
