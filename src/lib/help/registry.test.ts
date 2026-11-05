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
    expect(g?.category).toBe("processes");
    expect(g?.description).toMatch(/My timesheet/);
  });
  it("includes the client data guide, linked from Client Reports", () => {
    expect(getGuide("client-data-process")?.category).toBe("processes");
    const clients = HELP_TREE.find((s) => s.id === "clients");
    expect(clients?.items.find((i) => i.href === "/reports")?.slug).toBe("client-data-process");
  });
  it("has no MarketFoundry Amazon guides", () => {
    for (const slug of ["aplus-content-process", "seo-helium10-process", "brand-story-process", "design-upload-process", "monthly-report-process"])
      expect(getGuide(slug)).toBeUndefined();
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
    expect(hours?.items.map((i) => i.href)).toEqual(["/hours", "/hours/analytics", "/calendar/requests", "/calendar/team"]);
    expect(hours?.items.find((i) => i.href === "/hours")?.slug).toBe("log-hours-process");
  });
  it("lists each app route only once across the tree", () => {
    const hrefs = HELP_TREE.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
