import { describe, it, expect } from "vitest";
import { stripVersionSuffix, nextVersionedName, resolveGroupPlaceholder } from "./project-version-name";

describe("stripVersionSuffix", () => {
  it("removes a trailing _vNN", () => {
    expect(stripVersionSuffix("Foo_v01")).toBe("Foo");
    expect(stripVersionSuffix("Foo_v123")).toBe("Foo");
  });
  it("leaves names without a suffix alone", () => {
    expect(stripVersionSuffix("Foo")).toBe("Foo");
    expect(stripVersionSuffix("Foo_v01_bar")).toBe("Foo_v01_bar");
  });
});

describe("nextVersionedName", () => {
  it("starts at _v01 when nothing exists", () => {
    expect(nextVersionedName("Foo", [])).toBe("Foo_v01");
  });
  it("uses highest existing + 1, not count + 1 (gaps must not collide)", () => {
    // Real prod shape: _v02.._v05 exist, no _v01. count+1 would give _v05 again.
    expect(nextVersionedName("Knee", ["Knee_v02", "Knee_v03", "Knee_v04", "Knee_v05"])).toBe("Knee_v06");
  });
  it("ignores names that belong to a different base", () => {
    expect(nextVersionedName("Foo", ["Foo_v03", "FooBar_v09", "Foo", "xFoo_v07"])).toBe("Foo_v04");
  });
  it("treats regex characters in the base literally", () => {
    expect(nextVersionedName("A.B (1)", ["A.B (1)_v01", "AxB (1)_v05"])).toBe("A.B (1)_v02");
  });
  it("pads to two digits but grows past 99", () => {
    expect(nextVersionedName("Foo", ["Foo_v09"])).toBe("Foo_v10");
    expect(nextVersionedName("Foo", ["Foo_v99"])).toBe("Foo_v100");
  });
});

describe("new-convention names (_SEO_V##)", () => {
  it("strips an uppercase _VNN too", () => {
    expect(stripVersionSuffix("REA_SC_US_01_SEO_V03")).toBe("REA_SC_US_01_SEO");
  });
  it("emits uppercase _V for _SEO bases and counts either case", () => {
    expect(nextVersionedName("REA_SC_US_01_SEO", [])).toBe("REA_SC_US_01_SEO_V01");
    expect(nextVersionedName("REA_SC_US_01_SEO", ["REA_SC_US_01_SEO_V01", "REA_SC_US_01_SEO_v04"])).toBe(
      "REA_SC_US_01_SEO_V05"
    );
  });
  it("keeps lowercase _v for legacy bases", () => {
    expect(nextVersionedName("Foo", ["Foo_V02"])).toBe("Foo_v03");
  });
});

describe("resolveGroupPlaceholder", () => {
  const base = "REA_SC_US_G##_Choc_SEO";
  it("starts at G01", () => {
    expect(resolveGroupPlaceholder(base, "REA_SC_US", [])).toBe("REA_SC_US_G01_Choc_SEO");
  });
  it("reuses the number of an existing group with the same label (new version, same group)", () => {
    expect(
      resolveGroupPlaceholder(base, "REA_SC_US", ["REA_SC_US_G01_Vanilla_SEO_V01", "REA_SC_US_G02_Choc_SEO_V01"])
    ).toBe("REA_SC_US_G02_Choc_SEO");
  });
  it("otherwise takes max + 1", () => {
    expect(
      resolveGroupPlaceholder(base, "REA_SC_US", ["REA_SC_US_G01_Vanilla_SEO_V01", "REA_SC_US_G03_Mint_SEO_V02"])
    ).toBe("REA_SC_US_G04_Choc_SEO");
  });
  it("leaves names without the placeholder alone", () => {
    expect(resolveGroupPlaceholder("REA_SC_US_01_SEO", "REA_SC_US", [])).toBe("REA_SC_US_01_SEO");
  });
});
