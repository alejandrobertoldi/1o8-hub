import { describe, expect, it } from "vitest";
import { parseRangeParams } from "./range-params";

describe("parseRangeParams", () => {
  it("accepts a valid ordered pair", () => {
    expect(parseRangeParams("2026-08-01", "2026-08-31")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });
  it("rejects missing, malformed, or reversed", () => {
    expect(parseRangeParams(null, "2026-08-31")).toBeNull();
    expect(parseRangeParams("2026-8-1", "2026-08-31")).toBeNull();
    expect(parseRangeParams("2026-09-01", "2026-08-31")).toBeNull();
  });
});
