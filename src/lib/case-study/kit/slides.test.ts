import { describe, it, expect } from "vitest";
import { HL_SLIDES, DETAILED_SLIDES, slidesFor, defaultSectionContent, refreshSectionContent,
  resolveSlotImages, deckBlockers, EMPTY_DESIGN_IMAGES, manualImageCount } from "./slides";
import { deriveMetrics } from "./metrics";

const design = { ...EMPTY_DESIGN_IMAGES,
  heroListing: ["m", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
  brandStory: ["bs"], aplusStacks: [["a1", "a2"], ["b1"]], storefrontPages: [["s1", "s2"]], logo: ["logo"] };

describe("catalog", () => {
  it("has 5 High-Level and 14 Detailed slides in template order", () => {
    expect(HL_SLIDES.map((s) => s.type)).toEqual(["hl_cover", "hl_challenge", "hl_results", "hl_approach", "hl_creative"]);
    expect(DETAILED_SLIDES.map((s) => s.type)).toEqual(["cover", "brief", "results", "snapshot", "approach",
      "sales_growth", "product_mix", "demand_curve", "paid_media", "brand_story", "listing_images", "aplus", "storefront", "next_steps"]);
    expect(slidesFor("high_level")).toBe(HL_SLIDES);
  });
  it("slot ids are unique within a format and match the template ids minus the tpl-/tplhl- prefix", () => {
    for (const set of [HL_SLIDES, DETAILED_SLIDES]) {
      const ids = set.flatMap((s) => s.images.map((i) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(HL_SLIDES.flatMap((s) => s.images.map((i) => i.id))).toEqual(["cover-hero", "cover-logo", "bs",
      "li1", "li2", "li3", "li4", "li5", "li6", "li7", "li8", "li9", "ap1", "ap2", "ap3", "ap4", "sf"]);
    expect(DETAILED_SLIDES.flatMap((s) => s.images.map((i) => i.id))).toEqual(["cover-hero", "cover-logo", "bs-hero",
      "li-main", "li-2", "li-3", "li-4", "li-5", "li-6", "li-7", "li-8", "li-9",
      "ap-1", "ap-2", "ap-3", "ap-4", "ap-b1", "ap-b2", "ap-b3", "ap-b4", "ap-c1", "ap-c2", "ap-c3", "ap-c4",
      "sf-a1", "sf-b1", "sf-c1"]);
  });
  it("High-Level copy defaults never contain a {total} token or a raw $ figure", () => {
    for (const s of HL_SLIDES) for (const c of s.copy) {
      expect(c.default).not.toMatch(/\{total\}|\$\d/);
    }
  });
});

describe("section content", () => {
  it("defaults map design images per slot", () => {
    const creative = HL_SLIDES.find((s) => s.type === "hl_creative")!;
    const c = defaultSectionContent(creative, design);
    expect(c.designImages.li1).toEqual(["m"]);
    expect(c.designImages.li9).toEqual(["p8"]);
    expect(c.designImages.ap1).toEqual(["a1"]);
    expect(c.designImages.ap3).toEqual([]);
    expect(c.designImages.sf).toEqual(["s1", "s2"]);
    expect(c.manualImages).toEqual({});
  });
  it("manual wins over design; empty reports empty", () => {
    const c = { copy: {}, designImages: { x: ["d"], y: [] }, manualImages: { x: ["m"] } };
    expect(resolveSlotImages(c, "x")).toEqual({ urls: ["m"], source: "manual" });
    expect(resolveSlotImages({ ...c, manualImages: {} }, "x")).toEqual({ urls: ["d"], source: "design" });
    expect(resolveSlotImages(c, "y")).toEqual({ urls: [], source: "empty" });
  });
  it("refresh keeps copy and manual images, replaces design images", () => {
    const def = HL_SLIDES.find((s) => s.type === "hl_creative")!;
    const prev = { copy: { bsJob: "mine" }, designImages: { li1: ["old"] }, manualImages: { li2: ["man"] } };
    const next = refreshSectionContent(def, prev, design);
    expect(next.copy.bsJob).toBe("mine");
    expect(next.manualImages).toEqual({ li2: ["man"] });
    expect(next.designImages.li1).toEqual(["m"]);
  });
  it("carries A+ counts into section content", () => {
    const creative = HL_SLIDES.find((s) => s.type === "hl_creative")!;
    expect(defaultSectionContent(creative, { ...design, aplusPremiumModules: 7, aplusAsinsLive: 4 }).creativeCounts)
      .toEqual({ aplusPremiumModules: 7, aplusAsinsLive: 4 });
    const prev = { copy: {}, designImages: {}, manualImages: {}, creativeCounts: { aplusPremiumModules: 7, aplusAsinsLive: 4 } };
    const next = refreshSectionContent(creative, prev, { ...design, aplusPremiumModules: 9, aplusAsinsLive: 5 });
    expect(next.creativeCounts).toEqual({ aplusPremiumModules: 9, aplusAsinsLive: 5 });
  });
  it("counts manual images across sections", () => {
    expect(manualImageCount([{ content: { copy: {}, designImages: {}, manualImages: { a: ["1"], b: [] } } }])).toBe(1);
  });
});

describe("deckBlockers", () => {
  it("empty deck is blocked by metrics, images and required copy", () => {
    const sections = HL_SLIDES.map((d) => ({ sectionType: d.type, content: defaultSectionContent(d, EMPTY_DESIGN_IMAGES) }));
    const b = deckBlockers("high_level", {}, deriveMetrics({}), sections);
    expect(b.some((x) => x.kind === "metric" && x.key === "salesTotal")).toBe(true);
    expect(b.some((x) => x.kind === "image" && x.slide === "hl_creative")).toBe(true);
    expect(b.some((x) => x.kind === "copy" && x.slide === "hl_cover")).toBe(true);
  });
  it("fulfilment is never a blocker", () => {
    const sections = DETAILED_SLIDES.map((d) => ({ sectionType: d.type, content: defaultSectionContent(d, design) }));
    const b = deckBlockers("detailed", {}, deriveMetrics({}), sections);
    expect(b.some((x) => x.key === "fulfilment")).toBe(false);
  });
  it("one filled slot satisfies its group", () => {
    const def = HL_SLIDES.find((s) => s.type === "hl_creative")!;
    const content = defaultSectionContent(def, design);
    const b = deckBlockers("high_level", {}, deriveMetrics({}), [{ sectionType: "hl_creative", content }]);
    expect(b.filter((x) => x.kind === "image")).toEqual([]);
  });
});
