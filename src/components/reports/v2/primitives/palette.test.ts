import { describe, it, expect } from "vitest";
import { getSurfacePalette } from "./palette";

describe("getSurfacePalette", () => {
  it("hub uses the dark charcoal canvas and bright orange hero fill", () => {
    const p = getSurfacePalette("hub");
    expect(p.canvas).toBe("var(--mf-charcoal)");
    // Per user dogfood 2026-07-29: hero recolored to bright brand orange to match the
    // production dashboard. Trades WCAG-AA white-text contrast for brand consistency.
    expect(p.heroFill).toBe("var(--mf-orange)");
    expect(p.heroMiniFill).toBe("#ff8b48");
    expect(p.heroText).toBe("var(--mf-white)");
    expect(p.accent).toBe("var(--mf-orange)");
    expect(p.eyebrowClass).toBe("text-brand");
  });

  it("portal uses the light ghost canvas and charcoal emphasis", () => {
    const p = getSurfacePalette("portal");
    expect(p.canvas).toBe("var(--mf-ghost)");
    expect(p.heroFill).toBe("var(--portal-accent)");
    expect(p.cta).toBe("var(--portal-accent)");
    expect(p.accent).toBe("var(--portal-accent)");
    expect(p.eyebrowClass).toBe("text-portal-accent");
  });

  it("portal palette contains NO hub-orange value anywhere (load-bearing dual-accent rule)", () => {
    const p = getSurfacePalette("portal");
    const banned = ["--mf-orange", "--brand)", "--brand-solid", "#F7BF1D", "#F7BF1D", "text-brand"];
    for (const v of Object.values(p)) {
      for (const b of banned) expect(String(v).toLowerCase()).not.toContain(b.toLowerCase());
    }
  });
});
