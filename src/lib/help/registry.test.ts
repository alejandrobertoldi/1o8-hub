import { describe, it, expect } from "vitest";
import { HELP_GUIDES, HELP_CATEGORIES, HELP_TREE, getGuide, guidesByCategory } from "./registry";

describe("help registry", () => {
  it("has unique slugs", () => {
    const slugs = HELP_GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("every guide references a known category", () => {
    const ids = new Set(HELP_CATEGORIES.map((c) => c.id));
    for (const g of HELP_GUIDES) expect(ids.has(g.category)).toBe(true);
  });
  it("includes the onboarding guide under processes", () => {
    const g = getGuide("onboarding-process");
    expect(g).toBeDefined();
    expect(g?.category).toBe("processes");
  });
  it("includes the log-hours guide under processes", () => {
    const g = getGuide("log-hours-process");
    expect(g).toBeDefined();
    expect(g?.category).toBe("processes");
    expect(g?.description).toMatch(/download a spreadsheet/i);
    expect(g?.version).toMatch(/September 2026/);
  });
  it("includes the monthly-report guide under processes", () => {
    const g = getGuide("monthly-report-process");
    expect(g).toBeDefined();
    expect(g?.category).toBe("processes");
  });
  it("links the A+ Content SOP from the Design tree", () => {
    const guide = getGuide("aplus-content-process");
    const design = HELP_TREE.find((section) => section.id === "design");
    expect(guide?.category).toBe("processes");
    expect(guide?.description).toMatch(/Group A\+ sets/i);
    expect(design?.items.find((item) => item.href === "/design/aplus2")?.slug)
      .toBe("aplus-content-process");
  });
  it("getGuide returns undefined for an unknown slug", () => {
    expect(getGuide("nope")).toBeUndefined();
  });
  it("guidesByCategory groups guides under their category id", () => {
    expect(guidesByCategory().processes.some((g) => g.slug === "onboarding-process")).toBe(true);
  });
  it("every HELP_TREE slug resolves to a registered guide", () => {
    for (const section of HELP_TREE)
      for (const item of section.items)
        if (item.slug) expect(getGuide(item.slug), `${section.id}/${item.label}`).toBeDefined();
  });
  it("mirrors the Hours nav section and links its SOP", () => {
    const hours = HELP_TREE.find((s) => s.id === "hours");
    expect(hours).toBeDefined();
    expect(hours?.items.map((i) => i.href)).toEqual([
      "/hours-log",
      "/hours-admin",
      "/admin/hour-categories",
    ]);
    expect(hours?.items.find((i) => i.href === "/hours-log")?.slug).toBe("log-hours-process");
  });
  it("links the Monthly Report SOP from the Clients tree", () => {
    const clients = HELP_TREE.find((s) => s.id === "clients");
    expect(clients?.items.find((i) => i.href === "/reports/monthly")?.slug).toBe("monthly-report-process");
  });
  it("lists each app route only once across the tree", () => {
    const hrefs = HELP_TREE.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
