import { describe, it, expect } from "vitest";
import { snsSeriesColors } from "./subscribe-save-section";

describe("snsSeriesColors", () => {
  it("uses the hub accent for the current series on hub", () => {
    expect(snsSeriesColors("hub").current).toBe("#F7BF1D");
  });

  it("uses the portal accent for the current series on portal", () => {
    expect(snsSeriesColors("portal").current).toBe("#2C2B35");
  });

  it("emits no hub orange anywhere on portal (dual-accent rule)", () => {
    for (const value of Object.values(snsSeriesColors("portal"))) {
      expect(value.toLowerCase()).not.toContain("ff751f");
    }
  });

  it("keeps the previous-year green shared across both surfaces", () => {
    expect(snsSeriesColors("hub").py).toBe("#05893E");
    expect(snsSeriesColors("portal").py).toBe("#05893E");
  });
});
