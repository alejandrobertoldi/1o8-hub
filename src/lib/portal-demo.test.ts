import { describe, it, expect } from "vitest";
import { PORTAL_DEMO } from "./portal-demo";

describe("PORTAL_DEMO fixtures", () => {
  it("timeline is enabled + initialized with tasks and sections", () => {
    expect(PORTAL_DEMO.timeline.enabled).toBe(true);
    expect(PORTAL_DEMO.timeline.initialized).toBe(true);
    expect(PORTAL_DEMO.timeline.tasks.length).toBeGreaterThan(0);
    expect(PORTAL_DEMO.timeline.sections.length).toBeGreaterThan(0);
  });
  it("seo is a non-empty array of projects with phase fields", () => {
    expect(Array.isArray(PORTAL_DEMO.seo)).toBe(true);
    expect(PORTAL_DEMO.seo[0]).toHaveProperty("current_phase");
  });
  it("products has products[] and total", () => {
    expect(PORTAL_DEMO.products.total).toBe(PORTAL_DEMO.products.products.length);
    expect(PORTAL_DEMO.products.products[0]).toHaveProperty("asin");
  });
  it("design has categories and image arrays", () => {
    expect(PORTAL_DEMO.design.clientName).toBe("Zingora");
    expect(PORTAL_DEMO.design.categories.length).toBeGreaterThan(0);
    expect(Array.isArray(PORTAL_DEMO.design.aplusThumbs)).toBe(true);
  });
  it("finance statement has netProceeds and availablePeriods", () => {
    expect(PORTAL_DEMO.finance.statement).toHaveProperty("netProceeds");
    expect(PORTAL_DEMO.finance.availablePeriods.length).toBeGreaterThan(0);
  });
  it("salesSummary has one Zingora client with non-empty accountIds (so daily fetch fires)", () => {
    expect(PORTAL_DEMO.salesSummary.clients.length).toBe(1);
    expect(PORTAL_DEMO.salesSummary.clients[0].clientIdCode).toBe("ZIN_SC_US");
    expect(PORTAL_DEMO.salesSummary.clients[0].clientName).toBe("Zingora");
    expect(PORTAL_DEMO.salesSummary.clients[0].accountIds.length).toBeGreaterThan(0);
  });
  it("salesDaily has a days[] array", () => {
    expect(PORTAL_DEMO.salesDaily.days.length).toBeGreaterThan(0);
    expect(PORTAL_DEMO.salesDaily.days[0]).toHaveProperty("report_date");
  });
});
