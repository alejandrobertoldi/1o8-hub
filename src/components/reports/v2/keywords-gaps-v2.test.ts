import { describe, it, expect } from "vitest";
import { gapsBarColor } from "./keywords-gaps-v2";

describe("gapsBarColor", () => {
  it("uses the hub accent for the first block on hub", () => {
    expect(gapsBarColor("hub", 0)).toBe("#F7BF1D");
  });

  it("uses the portal accent for the first block on portal", () => {
    expect(gapsBarColor("portal", 0)).toBe("#2C2B35");
  });

  it("keeps the second block's blue shared across both surfaces", () => {
    expect(gapsBarColor("hub", 1)).toBe("#006BBB");
    expect(gapsBarColor("portal", 1)).toBe("#006BBB");
  });

  it("emits no hub orange on portal for either block (dual-accent rule)", () => {
    for (const accentIndex of [0, 1] as const) {
      expect(gapsBarColor("portal", accentIndex).toLowerCase()).not.toContain("ff751f");
    }
  });
});
