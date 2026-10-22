import { describe, it, expect } from "vitest";
import { inventoryBadgeColors } from "./inventory-date-badge";

describe("inventoryBadgeColors", () => {
  it("uses the hub accent and the dark pill on hub", () => {
    const c = inventoryBadgeColors("hub");
    expect(c.accent).toBe("#F7BF1D");
    expect(c.background).toBe("#3C4043");
  });

  it("uses the portal accent on portal", () => {
    expect(inventoryBadgeColors("portal").accent).toBe("#2C2B35");
  });

  it("emits no hub orange anywhere on portal (dual-accent rule)", () => {
    for (const value of Object.values(inventoryBadgeColors("portal"))) {
      expect(value.toLowerCase()).not.toContain("ff751f");
    }
  });

  it("pairs light text with the dark hub pill and dark text with the light portal pill", () => {
    // The portal renders on the light ghost canvas, so the hub's white-on-dark
    // pairing would make the date unreadable there.
    expect(inventoryBadgeColors("hub").text).toBe("#FEFEFE");
    expect(inventoryBadgeColors("portal").text).toBe("#2C2B35");
    expect(inventoryBadgeColors("portal").background).toBe("#FEFEFE");
  });
});
