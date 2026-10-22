// @vitest-environment node
import { describe, it, expect } from "vitest";
import { fulfilmentLabel } from "./pull-fulfilment";

describe("fulfilmentLabel", () => {
  it.each([
    [["AMAZON_NA"], "FBA"], [["AMAZON_NA", "AMAZON_NA"], "FBA"], [["DEFAULT"], "FBM"],
    [["AMAZON_NA", "DEFAULT"], "FBA + FBM"], [[], undefined], [["", " "], undefined],
  ] as const)("%j → %s", (codes, out) => expect(fulfilmentLabel([...codes])).toBe(out));
});
