import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DETAILED_B } from "./slides-detailed-b";
import { DETAILED_C } from "./slides-detailed-c";
import { DeckContext, type DeckCtx } from "./primitives";
import { DETAILED_SLIDES, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { deriveMetrics, type PulledMetrics } from "@/lib/case-study/kit/metrics";

const DETAILED_ALL = { ...DETAILED_B, ...DETAILED_C };
const TYPES = ["sales_growth", "product_mix", "demand_curve", "paid_media", "brand_story", "listing_images", "aplus", "storefront"] as const;

const monthly12 = (base: number, step: number) =>
  Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, spend: base * 0.3 + i * step * 0.3, sales: base + i * step }));

const e: Partial<PulledMetrics> = {
  salesTotal: 2_345_678, adSales: 780_000, adSpend: 300_000, adImpressions: 12_400_000,
  unitsTotal: 90_000, sessions: 600_000, buyBoxPct: 97.4, skuCount: 24, pageViews: 1_200_000,
  salesMonthly: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value: 50_000 + i * 20_000 })),
  topByRevenue: [
    { asin: "A1", title: "Acme Widget Pro Max Ultra Deluxe Edition Extra Long Title Name", value: 900_000 },
    { asin: "A2", title: "Acme Widget Mini", value: 620_000 },
    { asin: "A3", title: "Acme Widget Travel", value: 400_000 },
  ],
  topByUnits: [
    { asin: "A1", title: "Acme Widget Pro", value: 40_000 },
    { asin: "A2", title: "Acme Widget Mini", value: 30_000 },
    { asin: "A3", title: "Acme Widget Travel", value: 20_000 },
  ],
  paidSp: { spend: 90_000, sales: 400_000, orders: 1_200, monthly: monthly12(20_000, 3_000) },
  paidSbSd: { spend: 30_000, sales: 100_000, orders: 300, monthly: monthly12(5_000, 1_000) },
};
const ctx: DeckCtx = {
  format: "detailed", clientName: "Acme", period: "Jan 2025 – Dec 2025", periodShort: "2025",
  contactEmail: "hello@marketfoundry.com", editing: false, slideNo: 1, slideTotal: 14,
  tokens: { client: "Acme", period: "Jan 2025 – Dec 2025", total: "$2,345,678" },
};
const design = { ...EMPTY_DESIGN_IMAGES, heroListing: ["/m", "/p1"], brandStory: ["/bs"], logo: ["/logo"],
  aplusStacks: [["/a1", "/a2", "/a3", "/a4"], ["/b1", "/b2", "/b3", "/b4"], ["/c1", "/c2", "/c3", "/c4"]],
  storefrontPages: [["/sf-a"], ["/sf-b"], ["/sf-c"]], aplusPremiumModules: 12, aplusAsinsLive: 4 };

const filled = (type: string) => {
  const def = DETAILED_SLIDES.find((s) => s.type === type)!;
  const c = defaultSectionContent(def, design);
  for (const f of def.copy) if (!c.copy[f.key]) c.copy[f.key] = `${f.key} text`;
  return c;
};

const renderSlide = (type: keyof typeof DETAILED_ALL, metrics: Partial<PulledMetrics> = e, ctxOverride: Partial<DeckCtx> = {}) => {
  const S = DETAILED_ALL[type];
  return render(
    <DeckContext.Provider value={{ ...ctx, ...ctxOverride }}>
      <div className="cs-deck"><S content={filled(type)} e={metrics} d={deriveMetrics(metrics)} /></div>
    </DeckContext.Provider>,
  ).container;
};

describe("Detailed slides 6-13", () => {
  it.each(TYPES)("%s renders with a full fixture: no brackets", (type) => {
    const html = renderSlide(type).innerHTML;
    expect(html).not.toMatch(/\[[^\]]*\]/);
  });

  it("sales_growth contains the headline total and the {total} token filled in body copy", () => {
    const text = renderSlide("sales_growth").textContent!;
    expect(text).toContain("$2.3M");
    const content = filled("sales_growth");
    content.copy.body = "Total {total}.";
    const S = DETAILED_B.sales_growth;
    const container = render(
      <DeckContext.Provider value={ctx}>
        <S content={content} e={e} d={deriveMetrics(e)} />
      </DeckContext.Provider>,
    ).container;
    expect(container.textContent).toContain("Total $2,345,678.");
  });

  it("product_mix shows the three product titles and the SKU count", () => {
    const text = renderSlide("product_mix").textContent!;
    expect(text).toContain("Acme Widget Mini");
    expect(text).toContain("Acme Widget Travel");
    expect(text).toContain("24");
  });

  it("paid_media renders 2 <svg> when both channel blocks are present", () => {
    const container = renderSlide("paid_media");
    expect(container.querySelectorAll("svg").length).toBe(2);
  });

  it("paid_media renders only 1 <svg> and does not throw when paidSbSd is undefined", () => {
    const metrics = { ...e, paidSbSd: undefined };
    expect(() => {
      const container = renderSlide("paid_media", metrics);
      expect(container.querySelectorAll("svg").length).toBe(1);
    }).not.toThrow();
  });

  it("demand_curve renders 1 <svg> and the peak month text", () => {
    const container = renderSlide("demand_curve");
    expect(container.querySelectorAll("svg").length).toBe(1);
    const d = deriveMetrics(e);
    expect(d.peakMonth).not.toBeNull();
    expect(container.textContent).toContain("Dec");
  });

  it("demand_curve shows a dash for peak and base when metrics are missing (export, not editing)", () => {
    const emptyD = deriveMetrics({});
    const S = DETAILED_B.demand_curve;
    const container = render(
      <DeckContext.Provider value={{ ...ctx, editing: false }}>
        <S content={filled("demand_curve")} e={{}} d={emptyD} />
      </DeckContext.Provider>,
    ).container;
    const cards = Array.from(container.querySelectorAll(".card"));
    const peakCard = cards.find((c) => c.textContent?.includes("Peak"));
    const baseCard = cards.find((c) => c.textContent?.includes("Base"));
    expect(peakCard?.textContent).toContain("—");
    expect(baseCard?.textContent).toContain("—");
    expect(container.querySelectorAll(".cs-missing").length).toBe(0);
  });

  it("demand_curve shows a missing chip for peak and base when metrics are missing and editing", () => {
    const emptyD = deriveMetrics({});
    const S = DETAILED_B.demand_curve;
    const container = render(
      <DeckContext.Provider value={{ ...ctx, editing: true }}>
        <S content={filled("demand_curve")} e={{}} d={emptyD} />
      </DeckContext.Provider>,
    ).container;
    const cards = Array.from(container.querySelectorAll(".card"));
    const peakCard = cards.find((c) => c.textContent?.includes("Peak"));
    const baseCard = cards.find((c) => c.textContent?.includes("Base"));
    expect(peakCard?.querySelector(".cs-missing")).not.toBeNull();
    expect(baseCard?.querySelector(".cs-missing")).not.toBeNull();
  });

  it("storefront has a slot for sf-a1", () => {
    const container = renderSlide("storefront");
    expect(container.querySelector('[data-slot="sf-a1"]')).not.toBeNull();
  });

  it("renders with an all-missing fixture without throwing, for all 8 slides", () => {
    const emptyD = deriveMetrics({});
    for (const type of TYPES) {
      const S = DETAILED_ALL[type];
      expect(() => render(
        <DeckContext.Provider value={{ ...ctx, editing: true }}>
          <S content={defaultSectionContent(DETAILED_SLIDES.find((s) => s.type === type)!, EMPTY_DESIGN_IMAGES)} e={{}} d={emptyD} />
        </DeckContext.Provider>,
      )).not.toThrow();
    }
  });
});
