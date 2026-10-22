import { describe, expect, it } from "vitest";
import { US_MAP_CODES } from "@/lib/us-map-paths";
import { DIVISIONS, STATE_TO_DIVISION } from "./divisions";

describe("census divisions", () => {
  it("has exactly 9 divisions", () => expect(DIVISIONS).toHaveLength(9));
  it("maps every map state except PR to a known division", () => {
    for (const code of US_MAP_CODES.filter((c) => c !== "PR")) {
      expect(DIVISIONS, code).toContain(STATE_TO_DIVISION[code]);
    }
    expect(STATE_TO_DIVISION.PR).toBeUndefined();
  });
  it("puts DC in South Atlantic and NY in Middle Atlantic", () => {
    expect(STATE_TO_DIVISION.DC).toBe("South Atlantic");
    expect(STATE_TO_DIVISION.NY).toBe("Middle Atlantic");
  });
});
