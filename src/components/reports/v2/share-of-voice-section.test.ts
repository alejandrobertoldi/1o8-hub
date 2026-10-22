import { describe, it, expect } from "vitest";
import { sovEntityColors } from "./share-of-voice-section";

describe("sovEntityColors", () => {
  it("uses the hub accent for the brand series on hub", () => {
    expect(sovEntityColors("hub").brand).toBe("#F7BF1D");
  });

  it("uses the portal accent for the brand series on portal", () => {
    expect(sovEntityColors("portal").brand).toBe("#2C2B35");
  });

  it("keeps the competitor blue shared across both surfaces", () => {
    expect(sovEntityColors("hub").competitor).toBe("#006BBB");
    expect(sovEntityColors("portal").competitor).toBe("#006BBB");
  });

  it("emits no hub orange anywhere on portal (dual-accent rule)", () => {
    for (const value of Object.values(sovEntityColors("portal"))) {
      expect(value.toLowerCase()).not.toContain("ff751f");
    }
  });
});
