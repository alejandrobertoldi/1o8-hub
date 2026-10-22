import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadGuideHtml } from "./load-guide";
import { HELP_GUIDES } from "./registry";

describe("loadGuideHtml", () => {
  it("loads the onboarding fragment with template classes and /help image paths", async () => {
    const html = await loadGuideHtml("onboarding-process");
    expect(html).toBeTruthy();
    expect(html).toContain("step-card");
    expect(html).toContain("/help/step2.png");
  });
  it("loads the monthly-report SOP with AM Reply-To and CEO Cc", async () => {
    const html = await loadGuideHtml("monthly-report-process");
    expect(html).toBeTruthy();
    expect(html).toContain("status-table");
    expect(html).toContain("Reply-To</strong> is the AM");
    expect(html).toContain("jake@marketfoundry.agency");
    expect(html).toContain("Cc</strong> is the AM and the CEO");
    expect(html).toContain("Client notes (PM / AM / CEO)");
    expect(html).toContain("Note for the client");
    expect(html).toContain("Can add client notes");
    expect(html).toContain("Internal review pings go through Resend");
  });
  it("loads the log-hours fragment with template classes and /help image paths", async () => {
    const html = await loadGuideHtml("log-hours-process");
    expect(html).toBeTruthy();
    expect(html).toContain("step-card");
    expect(html).toContain("/help/hours-form-bar.png");
    expect(html).toContain("Download spreadsheet");
    expect(html).toContain("hours_YYYY-MM-DD_YYYY-MM-DD.xlsx");
  });
  it("loads the A+ guide with Group scope and anchorless filtering instructions", async () => {
    const html = await loadGuideHtml("aplus-content-process");
    expect(html).toContain("ASIN, Variation, and Group");
    expect(html).toContain("All variations");
    expect(html).toContain("does not require a parent anchor");
    expect(html).toContain("{CLIENT}_G01_Nordic_Dreams_APlus_V01");
    expect(html).toContain("Edit suggestion");
    expect(html).toContain("Generate Alt Text");
    expect(html).toContain("Sparkles");
    expect(html).toContain("skip images that already have alt text");
    expect(html).toContain("sent with the current alt");
    expect(html).toContain("does not have a copy icon");
    expect(html).toContain("three-line textarea");
  });
  it("loads the Brand Story guide with version and module alt-text controls", async () => {
    const html = await loadGuideHtml("brand-story-process");
    expect(html).toContain("Edit suggestion");
    expect(html).toContain("Generate Alt Text");
    expect(html).toContain("Sparkles");
    expect(html).toContain("sent with the current alt");
    expect(html).toContain("does not have a copy icon");
    expect(html).toContain("three-line textarea");
    expect(html).toContain("Module header");
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
