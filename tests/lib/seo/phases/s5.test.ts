import { describe, it, expect } from "vitest";
import { S5 } from "@/lib/seo/phases/s5";

describe("S5 phase executor", () => {
  it("fillSlots includes COSMO categories required", () => {
    const slots = S5.fillSlots({
      projectId: "00000000-0000-0000-0000-000000000000",
      approvedKeywords: [{ text: "shoes", priority_tier: "T1", cosmo_domain: "Benefit" }],
      rufusPhase3: null,
      brandVoice: "direct",
    });
    expect(typeof slots.cosmo_categories_required).toBe("string");
    expect((slots.cosmo_categories_required as string).length).toBeGreaterThan(0);
  });

  it("persist function exists", () => {
    expect(typeof S5.persist).toBe("function");
  });
});
