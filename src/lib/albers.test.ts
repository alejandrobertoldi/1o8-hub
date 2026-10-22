import { describe, expect, it } from "vitest";
import { ALIGNMENT_TOLERANCE_PX, projectAlbers } from "./albers";
import { sharedVertices } from "./us-map-geometry";
import { TRIPOINTS } from "./us-map-tripoints";

function nearestShared(states: string[], x: number, y: number): number {
  const candidates = sharedVertices(states);
  expect(candidates.length, `no shared vertex for ${states.join("/")}`).toBeGreaterThan(0);
  return Math.min(...candidates.map(([vx, vy]) => Math.hypot(vx - x, vy - y)));
}

describe("albers alignment with us-map-paths", () => {
  it("has at least 4 held-out tripoints", () => {
    expect(TRIPOINTS.filter((t) => t.role === "holdout").length).toBeGreaterThanOrEqual(4);
  });

  it("tolerance is never below 2px", () => {
    expect(ALIGNMENT_TOLERANCE_PX).toBeGreaterThanOrEqual(2);
  });

  for (const t of TRIPOINTS.filter((p) => p.role === "holdout")) {
    it(`projects held-out ${t.id} within tolerance`, () => {
      const [x, y] = projectAlbers(t.lat, t.lon);
      expect(nearestShared(t.states, x, y)).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
    });
  }
});
