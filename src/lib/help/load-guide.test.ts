import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadGuideHtml } from "./load-guide";
import { HELP_GUIDES } from "./registry";

describe("loadGuideHtml", () => {
  it("loads the 1o8 onboarding guide (profile checklist, by service)", async () => {
    const html = await loadGuideHtml("onboarding-process");
    expect(html).toContain("step-card");
    expect(html).toContain("Not applicable");
    expect(html).not.toMatch(/Intentwise|FeedbackWhiz|Seller Central/);
  });
  it("loads the timesheet guide (My timesheet, PTO as 1O8 time)", async () => {
    const html = await loadGuideHtml("log-hours-process");
    expect(html).toContain("My timesheet");
    expect(html).toContain("Company holiday");
    expect(html).not.toContain("MF Hub");
  });
  it("loads the client data guide with every KPI source", async () => {
    const html = (await loadGuideHtml("client-data-process")) ?? "";
    for (const source of ["GA4", "Meta Ads", "Google Ads", "Klaviyo", "Shopify"]) expect(html).toContain(source);
  });
  it("every registered guide has a loadable fragment", async () => {
    for (const g of HELP_GUIDES) expect(await loadGuideHtml(g.slug), g.slug).toBeTruthy();
  });
  it("every screenshot referenced by a guide exists in public/help", async () => {
    for (const g of HELP_GUIDES) {
      const html = (await loadGuideHtml(g.slug)) ?? "";
      for (const m of html.matchAll(/src="\/help\/([^"]+)"/g)) {
        const file = path.join(process.cwd(), "public", "help", m[1]);
        await expect(fs.access(file), `${g.slug} → ${m[1]}`).resolves.toBeUndefined();
      }
    }
  });
  it("returns null for an unknown slug", async () => {
    expect(await loadGuideHtml("does-not-exist")).toBeNull();
  });
  it("returns null for a traversal attempt", async () => {
    expect(await loadGuideHtml("../secrets")).toBeNull();
  });
});
