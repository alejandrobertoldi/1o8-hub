import { describe, expect, it } from "vitest";
import { heatCellStyle, heatFill } from "./us-choropleth";
import { accentFor } from "./primitives/chart-colors";

const HUB = accentFor("hub");
const PORTAL = accentFor("portal");
const WHITE = "#FEFEFE";
const INK = "#2C2B35";

describe("heatFill", () => {
  it("returns the flat zero fill when there is nothing to shade", () => {
    expect(heatFill(0, 100, PORTAL)).toBe(heatFill(0, 0, PORTAL));
    expect(heatFill(-5, 100, PORTAL)).toBe(heatFill(0, 100, PORTAL));
  });

  it("darkens toward the accent as the value approaches the max", () => {
    const low = heatFill(1, 100, PORTAL);
    const high = heatFill(100, 100, PORTAL);
    expect(low).not.toBe(high);
    // Full intensity lands on the accent itself: #2C2B35 -> rgb(44,43,53).
    expect(high).toBe("rgb(44,43,53)");
  });
});

describe("heatCellStyle", () => {
  it("puts white text on the portal accent, which is too dark for Off Black", () => {
    // The reported bug: dark text on a dark teal cell was unreadable.
    expect(heatCellStyle(100, 100, PORTAL).color).toBe(WHITE);
  });

  it("keeps dark text on the hub accent, which fails against white", () => {
    // DESIGN.md: white on the bright hub orange is ~2.7:1 and fails WCAG.
    expect(heatCellStyle(100, 100, HUB).color).toBe(INK);
  });

  it("uses dark text on the pale end of either ramp", () => {
    for (const accent of [HUB, PORTAL]) {
      expect(heatCellStyle(0, 100, accent).color).toBe(INK);
      expect(heatCellStyle(1, 1000, accent).color).toBe(INK);
    }
  });

  it("returns the same background heatFill would", () => {
    expect(heatCellStyle(50, 100, PORTAL).background).toBe(heatFill(50, 100, PORTAL));
  });
});
