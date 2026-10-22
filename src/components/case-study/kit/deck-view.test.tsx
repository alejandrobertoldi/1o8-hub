import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "outfit" }) }));
import { DeckView } from "./deck-view";
import { slidesFor, defaultSectionContent, EMPTY_DESIGN_IMAGES, type DesignImages } from "@/lib/case-study/kit/slides";
import { emptyMetrics } from "@/lib/case-study/kit/metrics";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";

const make = (format: "high_level" | "detailed", auto: Record<string, unknown> = {}, design: DesignImages = EMPTY_DESIGN_IMAGES): KitCaseStudy => {
  const metrics = emptyMetrics("2025-01-01", "2025-12-31");
  metrics.auto = auto;
  return { id: "cs", clientIdCode: "A_SC_US", clientName: "Acme", title: "t", format, stage: "drafting", ownerId: null, ownerName: null,
    sentAt: null, dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", clientSector: "", contactEmail: "hello@marketfoundry.com",
    metrics, updatedAt: "", sections: slidesFor(format).map((def, i) => ({ id: `s${i}`, sectionType: def.type, sortOrder: i,
      content: defaultSectionContent(def, design) })) };
};

// jsdom never sets HTMLImageElement.prototype.complete to true and never fires load/error on an
// <img> at all (verified: no resource loader is configured for this project's vitest environment).
// These two tests stub `complete` directly to exercise the two readiness branches the review
// flagged: an already-cached image (complete=true, never fires another event) and a still-loading
// image that only settles once its load/error event fires.
const stubImgComplete = (value: boolean) => {
  const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
  Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => value });
  return () => {
    if (original) Object.defineProperty(HTMLImageElement.prototype, "complete", original);
    else delete (HTMLImageElement.prototype as unknown as { complete?: unknown }).complete;
  };
};
const withHero: DesignImages = { ...EMPTY_DESIGN_IMAGES, heroListing: ["/hero.png"] };

describe("DeckView", () => {
  it("renders 5 / 14 slides with computed page numbers", () => {
    expect(render(<DeckView cs={make("high_level")} editing={false} />).container.querySelectorAll("section.slide")).toHaveLength(5);
    const det = render(<DeckView cs={make("detailed")} editing={false} />).container;
    expect(det.querySelectorAll("section.slide")).toHaveLength(14);
    expect(det.textContent).toContain("14 / 14");
  });
  it("High-Level never gets the {total} token", () => {
    const cs = make("high_level", { salesTotal: 4_321_000 });
    cs.sections[0].content.copy.summary = "We hit {total}.";
    const text = render(<DeckView cs={cs} editing={false} />).container.textContent!;
    expect(text).toContain("We hit .");
    expect(text).not.toContain("{total}");
    expect(text).not.toMatch(/\$\s?4,321/);
    expect(text).not.toMatch(/\$\d/);
  });
  it("skips a legacy/unknown section_type instead of crashing", () => {
    const cs = make("detailed");
    cs.sections.push({ id: "legacy", sectionType: "executive_summary" as never, sortOrder: 99, content: { copy: {}, designImages: {}, manualImages: {} } });
    const c = render(<DeckView cs={cs} editing={false} />).container;
    expect(c.querySelectorAll("section.slide")).toHaveLength(14);
    expect(c.querySelector("[data-section-id='legacy']")).toBeNull();
    expect(c.textContent).toContain("14 / 14");
    expect(c.textContent).not.toContain("/ 15");
  });
  it("every slide wrapper carries data-section-id (screen and print)", () => {
    expect(render(<DeckView cs={make("high_level")} editing={false} />).container.querySelectorAll("[data-section-id]")).toHaveLength(5);
    expect(render(<DeckView cs={make("high_level")} editing={false} print />).container.querySelectorAll("[data-section-id]")).toHaveLength(5);
  });
  it("pencil calls onEditSlide; print mode has none", () => {
    const onEdit = vi.fn();
    const c = render(<DeckView cs={make("high_level")} editing onEditSlide={onEdit} />).container;
    fireEvent.click(c.querySelector("[data-edit-pencil]")!);
    expect(onEdit).toHaveBeenCalledWith("s0");
    expect(render(<DeckView cs={make("high_level")} editing={false} print />).container.querySelector("[data-edit-pencil]")).toBeNull();
  });
  it("print mode: every slide wrapper breaks after itself except the last (no blank trailing page)", () => {
    const wrappers = Array.from(render(<DeckView cs={make("detailed")} editing={false} print />).container
      .querySelectorAll<HTMLElement>(".cs-deck > [data-section-id]"));
    expect(wrappers).toHaveLength(14);
    wrappers.slice(0, -1).forEach((w) => expect(w.style.breakAfter).toBe("page"));
    expect(wrappers[13].style.breakAfter).toBe("");
  });
  it("print mode passes print through DeckContext so Design images use the print-image route", () => {
    const design: DesignImages = { ...EMPTY_DESIGN_IMAGES, heroListing: ["/api/design/listing-images/image?driveFileId=gH"] };
    const src = (print: boolean) => render(<DeckView cs={make("high_level", {}, design)} editing={false} print={print} />)
      .container.querySelector("[data-slot='cover-hero'] img")?.getAttribute("src");
    expect(src(true)).toBe("/api/case-studies/print-image?driveFileId=gH&w=1600");
    expect(src(false)).toBe("/api/design/listing-images/image?driveFileId=gH");
  });
  it("ready flag is set when there are no images", () => {
    expect(render(<DeckView cs={make("high_level")} editing={false} print />).container.querySelector("[data-case-study-ready]")).toBeTruthy();
  });
  it("an already-cached (complete) content image is ready immediately, without any load event", () => {
    const restore = stubImgComplete(true);
    try {
      const c = render(<DeckView cs={make("high_level", {}, withHero)} editing={false} print />).container;
      expect(c.querySelector("[data-slot='cover-hero'] img")).toBeTruthy();
      expect(c.querySelector("[data-case-study-ready]")).toBeTruthy();
    } finally {
      restore();
    }
  });
  it("a still-loading content image blocks readiness until it settles", () => {
    const restore = stubImgComplete(false);
    try {
      const c = render(<DeckView cs={make("high_level", {}, withHero)} editing={false} print />).container;
      expect(c.querySelector("[data-case-study-ready]")).toBeNull();
      // The hero image is reused by more than one slot (hl_cover's cover-hero AND hl_creative's
      // li1 both read design.heroListing[0]) — settle every content image, not just one, before
      // asserting readiness.
      const imgs = Array.from(c.querySelectorAll("[data-slot] img"));
      expect(imgs.length).toBeGreaterThan(1);
      imgs.forEach((img) => fireEvent.load(img));
      expect(c.querySelector("[data-case-study-ready]")).toBeTruthy();
    } finally {
      restore();
    }
  });
});
