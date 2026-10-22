import { describe, it, expect } from "vitest";
import {
  canAccess,
  CONFIGURABLE_SECTIONS,
  DESIGN_PORTAL_SUBSECTIONS,
  portalSectionDeltaIds,
  VALID_SECTION_IDS,
} from "./permissions";

describe("canAccess", () => {
  it("admin bypasses every check", () => {
    expect(canAccess("brandstory", [], true)).toBe(true);
    expect(canAccess("anything-at-all", [], true)).toBe(true);
  });

  it("returns true for an exact flat match", () => {
    expect(canAccess("design", ["design"], false)).toBe(true);
    expect(canAccess("brandstory", ["brandstory"], false)).toBe(true);
  });

  it("returns false when the section is not listed", () => {
    expect(canAccess("brandstory", ["aplus", "storefront"], false)).toBe(false);
  });

  it("does NOT cascade department grants to subsections (strict semantics)", () => {
    // Previously this returned true via dept→subsection cascade. The new rule
    // is that each subsection must be granted explicitly.
    expect(canAccess("brandstory", ["design"], false)).toBe(false);
  });

  it("honors dot-notation grants for flat subsection lookups", () => {
    expect(canAccess("aplus", ["design.aplus"], false)).toBe(true);
  });

  it("dot-notation lookup matches the flat subsection grant", () => {
    expect(canAccess("design.aplus", ["aplus"], false)).toBe(true);
  });

  it("dot-notation lookup does NOT cascade from dept grant", () => {
    expect(canAccess("design.brandstory", ["design"], false)).toBe(false);
  });

  it("dashboard Design toggle also writes the subsection ids the landing page checks", () => {
    expect(portalSectionDeltaIds("design")).toEqual([
      "design",
      ...DESIGN_PORTAL_SUBSECTIONS,
    ]);
    expect(portalSectionDeltaIds("brandstory")).toEqual(["brandstory"]);
    expect(portalSectionDeltaIds("sales")).toEqual(["sales"]);
  });

  it("ayers rock case: design dept granted, brandstory unchecked → brandstory hidden", () => {
    const ayersRock = [
      "calendar", "clients", "reports", "catalog", "products", "sync",
      "timeline", "design", "aplus", "listing-images", "storefront",
      "files", "ppc", "sales", "seo", "finances", "activity",
      "import", "publish", "export",
    ];
    expect(canAccess("brandstory", ayersRock, false)).toBe(false);
    expect(canAccess("aplus", ayersRock, false)).toBe(true);
    expect(canAccess("storefront", ayersRock, false)).toBe(true);
    expect(canAccess("design", ayersRock, false)).toBe(true);
  });
});

describe("team section", () => {
  it("is a standalone configurable section, like calendar", () => {
    const team = CONFIGURABLE_SECTIONS.find((s) => s.id === "team");
    expect(team).toBeDefined();
    expect(team?.type).toBe("standalone");
    expect(team?.dept).toBeNull();
  });

  it("is accepted by the API's section allowlist", () => {
    // VALID_SECTION_IDS derives from CONFIGURABLE_SECTIONS, so this proves the
    // derivation ran rather than needing a second hand-maintained list.
    expect(VALID_SECTION_IDS).toContain("team");
  });
});
