import { describe, expect, it } from "vitest";
import { US_STATE_PATHS } from "@/lib/us-map-paths";
import { pathVertices, pointInPath, sharedVertices } from "./us-map-geometry";

describe("us-map-geometry", () => {
  it("parses absolute M/L pairs", () => {
    expect(pathVertices("M1.5,2 L3,4.25 L-1,0Z")).toEqual([[1.5, 2], [3, 4.25], [-1, 0]]);
  });

  it("finds the Four Corners as a vertex shared by CO, UT, AZ and NM", () => {
    const shared = sharedVertices(["CO", "UT", "AZ", "NM"]);
    expect(shared.length).toBeGreaterThanOrEqual(1);
  });

  it("point-in-path: the CO label point is inside CO and not inside KS", () => {
    expect(pointInPath(US_STATE_PATHS.CO, 239.6, 334.2)).toBe(true);
    expect(pointInPath(US_STATE_PATHS.KS, 239.6, 334.2)).toBe(false);
  });
});
