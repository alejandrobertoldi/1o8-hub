import { describe, it, expect } from "vitest";
import { periodsFor } from "./period-comparative-section";

describe("periodsFor", () => {
  it("uses the hub accent for the current period on hub", () => {
    expect(periodsFor("hub").find((p) => p.key === "current")?.color).toBe("#F7BF1D");
  });

  it("uses the portal accent for the current period on portal", () => {
    expect(periodsFor("portal").find((p) => p.key === "current")?.color).toBe("#2C2B35");
  });

  it("emits no hub orange anywhere in the portal trio (dual-accent rule)", () => {
    for (const period of periodsFor("portal")) {
      expect(period.color.toLowerCase()).not.toContain("ff751f");
    }
  });

  it("keeps previous-month blue and previous-year green + dashed on both surfaces", () => {
    for (const surface of ["hub", "portal"] as const) {
      const periods = periodsFor(surface);
      expect(periods.find((p) => p.key === "pm")?.color).toBe("#006BBB");
      const py = periods.find((p) => p.key === "py");
      expect(py?.color).toBe("#05893E");
      expect(py?.dash).toBe("6 4");
    }
  });

  it("returns the three periods in current → pm → py order", () => {
    expect(periodsFor("hub").map((p) => p.key)).toEqual(["current", "pm", "py"]);
  });

  it("keeps the suffixes the daily-row lookup depends on", () => {
    expect(periodsFor("hub").map((p) => p.suffix)).toEqual(["", "_pm", "_py"]);
  });
});
