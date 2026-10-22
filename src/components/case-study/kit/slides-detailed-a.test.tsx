import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DETAILED_A } from "./slides-detailed-a";
import { DeckContext, type DeckCtx } from "./primitives";
import { DETAILED_SLIDES, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { deriveMetrics, type PulledMetrics } from "@/lib/case-study/kit/metrics";

const TYPES = ["cover", "brief", "results", "snapshot", "approach", "next_steps"] as const;

const e: Partial<PulledMetrics> = { salesTotal: 2_345_678, adSales: 780_000, adSpend: 300_000, adImpressions: 12_400_000,
  unitsTotal: 90_000, sessions: 600_000, buyBoxPct: 97.4, skuCount: 42, pageViews: 1_250_000,
  salesMonthly: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value: 50_000 + i * 20_000 })) };
const ctx: DeckCtx = { format: "detailed", clientName: "Acme", period: "Jan 2025 – Dec 2025", periodShort: "2025",
  contactEmail: "hello@marketfoundry.com", editing: false, slideNo: 1, slideTotal: 14,
  tokens: { client: "Acme", period: "Jan 2025 – Dec 2025", total: "$2,345,678" } };
const design = { ...EMPTY_DESIGN_IMAGES, heroListing: ["/m", "/p1"], logo: ["/logo"] };

const filled = (type: string) => {
  const def = DETAILED_SLIDES.find((s) => s.type === type)!;
  const c = defaultSectionContent(def, design);
  for (const f of def.copy) if (!c.copy[f.key]) c.copy[f.key] = `${f.key} text`;
  return c;
};

const renderSlide = (type: keyof typeof DETAILED_A, metrics: Partial<PulledMetrics> = e, ctxOverride: Partial<DeckCtx> = {}) => {
  const S = DETAILED_A[type];
  return render(
    <DeckContext.Provider value={{ ...ctx, ...ctxOverride }}>
      <div className="cs-deck"><S content={filled(type)} e={metrics} d={deriveMetrics(metrics)} /></div>
    </DeckContext.Provider>,
  ).container;
};

describe("Detailed slides 1-5 and 14", () => {
  it.each(TYPES)("%s renders with a full fixture: no brackets", (type) => {
    const html = renderSlide(type).innerHTML;
    expect(html).not.toMatch(/\[[^\]]*\]/);
  });

  it("results shows the headline sales figure and Buy Box percentage", () => {
    const text = renderSlide("results").textContent!;
    expect(text).toContain("$2.3M");
    expect(text).toContain("97%");
  });

  it("results headline is two lines, matching the template's <br/> before the orange accent", () => {
    const container = renderSlide("results");
    const h1 = container.querySelector("h1");
    expect(h1?.querySelector("br")).not.toBeNull();
  });

  it("snapshot omits the Fulfilment row when master has no value", () => {
    const without = renderSlide("snapshot", { ...e, fulfilment: undefined }).textContent!;
    expect(without).not.toContain("Fulfilment");
    expect(renderSlide("snapshot", { ...e, fulfilment: "FBA" }).textContent).toContain("FBA");
  });

  it("snapshot headline sales figure keeps the M suffix as its own element", () => {
    const container = renderSlide("snapshot", { ...e, salesTotal: 2_345_678 });
    expect(container.textContent).toContain("$2.3");
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.some((s) => s.textContent === "M")).toBe(true);
  });

  it("snapshot shows a missing chip for the headline sales figure when salesTotal is absent (editing)", () => {
    const S = DETAILED_A.snapshot;
    const container = render(
      <DeckContext.Provider value={{ ...ctx, editing: true }}>
        <S content={filled("snapshot")} e={{ ...e, salesTotal: undefined }} d={deriveMetrics({ ...e, salesTotal: undefined })} />
      </DeckContext.Provider>,
    ).container;
    expect(container.querySelectorAll(".cs-missing").length).toBeGreaterThan(0);
  });

  it("next_steps contains the contact email and the page number", () => {
    const text = renderSlide("next_steps", e, { slideNo: 14, slideTotal: 14 }).textContent!;
    expect(text).toContain("hello@marketfoundry.com");
    expect(text).toContain("14 / 14");
  });

  it("renders with an all-missing fixture without throwing", () => {
    const emptyD = deriveMetrics({});
    for (const type of TYPES) {
      const S = DETAILED_A[type];
      expect(() => render(
        <DeckContext.Provider value={{ ...ctx, editing: true }}>
          <S content={defaultSectionContent(DETAILED_SLIDES.find((s) => s.type === type)!, EMPTY_DESIGN_IMAGES)} e={{}} d={emptyD} />
        </DeckContext.Provider>,
      )).not.toThrow();
    }
  });
});
