import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HL_RENDERERS } from "./slides-hl";
import { DeckContext, type DeckCtx } from "./primitives";
import { HL_SLIDES, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { deriveMetrics, type PulledMetrics } from "@/lib/case-study/kit/metrics";

const e: Partial<PulledMetrics> = { salesTotal: 2_345_678, adSales: 780_000, adSpend: 300_000, adImpressions: 12_400_000,
  unitsTotal: 90_000, sessions: 600_000, buyBoxPct: 97.4,
  salesMonthly: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value: 50_000 + i * 20_000 })) };
const d = deriveMetrics(e);
const ctx: DeckCtx = { format: "high_level", clientName: "Acme", period: "Jan 2025 – Dec 2025", periodShort: "2025",
  contactEmail: "hello@marketfoundry.com", editing: false, slideNo: 1, slideTotal: 5, tokens: { client: "Acme", period: "Jan 2025 – Dec 2025" } };
const design = { ...EMPTY_DESIGN_IMAGES, heroListing: ["/m", "/p1"], brandStory: ["/bs"], aplusStacks: [["/a"]], storefrontPages: [["/s"]] };
const filled = (type: string) => {
  const def = HL_SLIDES.find((s) => s.type === type)!;
  const c = defaultSectionContent(def, design);
  for (const f of def.copy) if (!c.copy[f.key]) c.copy[f.key] = `${f.key} text`;
  return c;
};
const renderSlide = (type: keyof typeof HL_RENDERERS) => {
  const S = HL_RENDERERS[type];
  return render(<DeckContext.Provider value={ctx}><div className="cs-deck"><S content={filled(type)} e={e} d={d} /></div></DeckContext.Provider>).container;
};

describe("High-Level slides", () => {
  it.each(HL_SLIDES.map((s) => s.type))("%s renders with a full fixture: no brackets, no raw $ figures", (type) => {
    const html = renderSlide(type as keyof typeof HL_RENDERERS).innerHTML;
    expect(html).not.toMatch(/\[[^\]]*\]/);
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\$\s?\d/);
  });
  it("banded values appear", () => {
    expect(renderSlide("hl_results").textContent).toContain("Low 7");
    expect(renderSlide("hl_cover").textContent).toContain("Low 7-Fig");
  });
  it("creative slide wires Design images and CVR", () => {
    const c = renderSlide("hl_creative");
    expect(c.querySelector('[data-slot="li1"] img')?.getAttribute("src")).toBe("/m");
    expect(c.querySelector('[data-slot="bs"] img')?.getAttribute("src")).toBe("/bs");
    expect(c.textContent).toContain("2-image sets");
    expect(c.textContent).toContain("15.0%");
  });
  it("renders with an all-missing fixture without throwing", () => {
    for (const s of HL_SLIDES) {
      const S = HL_RENDERERS[s.type as keyof typeof HL_RENDERERS];
      expect(() => render(<DeckContext.Provider value={{ ...ctx, editing: true }}>
        <S content={defaultSectionContent(s, EMPTY_DESIGN_IMAGES)} e={{}} d={deriveMetrics({})} /></DeckContext.Provider>)).not.toThrow();
    }
  });
  it("a {total} token typed into High-Level copy cannot leak an exact figure (tokens omit total)", () => {
    const c = filled("hl_cover"); c.copy.summary = "We hit {total}.";
    const S = HL_RENDERERS.hl_cover;
    const html = render(<DeckContext.Provider value={ctx}><S content={c} e={e} d={d} /></DeckContext.Provider>).container.textContent!;
    expect(html).toContain("We hit .");
    expect(html).not.toContain("{total}");
    expect(html).not.toMatch(/\$\d/);
  });
  it("A+ counts: chip while editing, — in export; real numbers render when present", () => {
    const S = HL_RENDERERS.hl_creative;
    const nullCounts = { ...filled("hl_creative"), creativeCounts: { aplusPremiumModules: null, aplusAsinsLive: null } };
    const editingContainer = render(<DeckContext.Provider value={{ ...ctx, editing: true }}>
      <S content={nullCounts} e={e} d={d} /></DeckContext.Provider>).container;
    expect(editingContainer.querySelectorAll(".cs-missing").length).toBeGreaterThan(0);

    const exportContainer = render(<DeckContext.Provider value={{ ...ctx, editing: false }}>
      <S content={nullCounts} e={e} d={d} /></DeckContext.Provider>).container;
    expect(exportContainer.textContent).toContain("—");
    expect(exportContainer.querySelectorAll(".cs-missing").length).toBe(0);

    const withCounts = { ...filled("hl_creative"), creativeCounts: { aplusPremiumModules: 7, aplusAsinsLive: 4 } };
    const filledContainer = render(<DeckContext.Provider value={ctx}>
      <S content={withCounts} e={e} d={d} /></DeckContext.Provider>).container;
    expect(filledContainer.textContent).toContain("7");
    expect(filledContainer.textContent).toContain("4");
  });
});
