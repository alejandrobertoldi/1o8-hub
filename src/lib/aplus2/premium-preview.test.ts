import { describe, expect, it } from "vitest";
import { firstTwoModules, firstTwoPremiumModules, aplusCoverUrls } from "./premium-preview";

const mod = (id: string, position: number) => ({ id, position });

describe("aplusCoverUrls", () => {
  it("prefers the first two module thumbs over the single fallback", () => {
    expect(aplusCoverUrls(["a", "b", "c"], "fallback")).toEqual(["a", "b"]);
  });

  it("uses the fallback when no module thumbs exist", () => {
    expect(aplusCoverUrls([], "only")).toEqual(["only"]);
    expect(aplusCoverUrls(undefined, null)).toEqual([]);
  });
});

describe("firstTwoModules", () => {
  it("keeps editor order and drops modules after the second", () => {
    expect(firstTwoModules([mod("m3", 3), mod("m1", 1), mod("m2", 2)]).map((m) => m.id)).toEqual([
      "m1",
      "m2",
    ]);
  });
});

describe("firstTwoPremiumModules", () => {
  it("returns the first two modules of the latest PA+ version", () => {
    const modules = firstTwoPremiumModules([
      {
        versionNumber: 1,
        contentType: "PA+",
        modules: [mod("m1", 1), mod("m2", 2), mod("m3", 3)],
      },
      {
        versionNumber: 2,
        contentType: "PA+",
        modules: [mod("n1", 2), mod("n2", 1), mod("n3", 3)],
      },
    ]);
    expect(modules.map((m) => m.id)).toEqual(["n2", "n1"]);
  });

  it("ignores BA+ versions even when they are newer", () => {
    const modules = firstTwoPremiumModules([
      {
        versionNumber: 2,
        contentType: "BA+",
        modules: [mod("b1", 1), mod("b2", 2)],
      },
      {
        versionNumber: 1,
        contentType: "PA+",
        modules: [mod("p1", 1), mod("p2", 2), mod("p3", 3)],
      },
    ]);
    expect(modules.map((m) => m.id)).toEqual(["p1", "p2"]);
  });

  it("returns an empty list when there is no PA+ version", () => {
    expect(
      firstTwoPremiumModules([
        { versionNumber: 1, contentType: "BA+", modules: [mod("b1", 1)] },
      ]),
    ).toEqual([]);
  });

  it("keeps extra module fields for callers that render ModuleDto", () => {
    const modules = firstTwoPremiumModules([
      {
        versionNumber: 1,
        contentType: "PA+",
        modules: [{ id: "m1", position: 1, moduleType: "STANDARD_IMAGE" }],
      },
    ]);
    const moduleType: string = modules[0]!.moduleType;
    expect(moduleType).toBe("STANDARD_IMAGE");
  });
});
