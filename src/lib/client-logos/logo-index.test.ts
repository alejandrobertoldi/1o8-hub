import { describe, it, expect, vi, beforeEach } from "vitest";

const listClientLogoCodes = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));
vi.mock("./drive-logos", () => ({ listClientLogoCodes }));

import { driveLogoSrc, getClientLogoCodes } from "./logo-index";

beforeEach(() => vi.resetAllMocks());

describe("driveLogoSrc", () => {
  const codes = new Set(["REA_SC_US"]);
  it("returns the Drive-backed URL only for codes that have a logo", () => {
    expect(driveLogoSrc("REA_SC_US", codes)).toBe("/client-logos/REA_SC_US.png");
    expect(driveLogoSrc("rea_sc_us", codes)).toBe("/client-logos/REA_SC_US.png");
    expect(driveLogoSrc("ZZZ_SC_US", codes)).toBeNull();
    expect(driveLogoSrc(null, codes)).toBeNull();
  });
});

describe("getClientLogoCodes", () => {
  it("returns the Drive index", async () => {
    listClientLogoCodes.mockResolvedValue(new Set(["REA_SC_US", "BNU_SC_US"]));
    expect([...(await getClientLogoCodes())].sort()).toEqual(["BNU_SC_US", "REA_SC_US"]);
  });
  it("degrades to no logos (not a crash) when Drive is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    listClientLogoCodes.mockRejectedValue(new Error("drive down"));
    expect((await getClientLogoCodes()).size).toBe(0);
  });
});
