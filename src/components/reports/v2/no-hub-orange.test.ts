import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const V2_DIR = join(process.cwd(), "src/components/reports/v2");

// Files allowed to contain the hub-orange literal, with the reason. Locked by
// Manu on 2026-08-03 (spec §9): the two 4-slot arrays are SHARED categorical
// data palettes, not brand-emphasis accents, and recolouring slot 0 on portal
// would put dark teal beside the slot-1 blue and break their validated CVD
// spacing. headline-performance-section picks its accent with an inline surface
// ternary, which is the correct pattern, not a leak.
const ALLOW_HUB_ORANGE = new Set([
  "advertising-audit-section.tsx",     // SLOT_COLORS slot 0 — shared categorical
  "inventory-section.tsx",            // STACK slot 0 — shared categorical
  "headline-performance-section.tsx", // strokeFor()'s surface ternary
]);

function sectionFiles(): string[] {
  return readdirSync(V2_DIR).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
}

describe("v2 section components and the dual-accent rule", () => {
  it("scans a plausible number of section components", () => {
    // Guards against the glob silently matching nothing after a refactor.
    expect(sectionFiles().length).toBeGreaterThan(10);
  });

  it.each(sectionFiles().filter((f) => !ALLOW_HUB_ORANGE.has(f)))(
    "%s contains no hardcoded hub orange",
    (file) => {
      const src = readFileSync(join(V2_DIR, file), "utf8");
      expect(src.toLowerCase()).not.toContain("ff751f");
    },
  );

  it.each(sectionFiles())("%s never inlines a bare text-brand class", (file) => {
    const src = readFileSync(join(V2_DIR, file), "utf8");
    expect(src).not.toContain("text-brand");
  });
});
