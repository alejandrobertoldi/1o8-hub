import { describe, it, expect } from "vitest";
import { maxModulesForTier } from "@/lib/aplus2/module-specs";

describe("module cap gate logic", () => {
  it("BA+ rejects a 6th module, allows the 5th", () => {
    const cap = maxModulesForTier("BA+");
    expect(5 > cap).toBe(false); // adding 5th: nextPos=5
    expect(6 > cap).toBe(true);  // adding 6th: nextPos=6 → rejected
  });
  it("PA+ rejects an 8th module, allows the 7th", () => {
    const cap = maxModulesForTier("PA+");
    expect(7 > cap).toBe(false);
    expect(8 > cap).toBe(true);
  });
});
