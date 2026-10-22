import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "outfit" }) }));
import { DeckView } from "./deck-view";
import { SlideStrip } from "./slide-strip";
import { slidesFor, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { emptyMetrics } from "@/lib/case-study/kit/metrics";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";

const make = (): KitCaseStudy => ({
  id: "cs", clientIdCode: "A_SC_US", clientName: "Acme", title: "t", format: "detailed", stage: "drafting", ownerId: null, ownerName: null,
  sentAt: null, dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", clientSector: "", contactEmail: "",
  metrics: emptyMetrics("2025-01-01", "2025-12-31"), updatedAt: "",
  sections: slidesFor("detailed").map((def, i) => ({ id: `s${i}`, sectionType: def.type, sortOrder: i, content: defaultSectionContent(def, EMPTY_DESIGN_IMAGES) })),
});

const original = Element.prototype.scrollIntoView;
afterEach(() => { Element.prototype.scrollIntoView = original; });

describe("SlideStrip", () => {
  it("renders one numbered button per slide, labelled from the catalog", () => {
    const cs = make();
    const { getByRole } = render(<SlideStrip sections={cs.sections} />);
    const buttons = within(getByRole("navigation", { name: "Slides" })).getAllByRole("button");
    expect(buttons).toHaveLength(14);
    expect(buttons[0].textContent).toBe("1 Cover");
    expect(buttons[13].textContent).toBe("14 Next Steps");
  });

  it("clicking button N scrolls slide N's wrapper into view", () => {
    const calls: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) { calls.push(this); });
    const cs = make();
    const { getByRole, container } = render(<><SlideStrip sections={cs.sections} /><DeckView cs={cs} editing={false} /></>);
    const buttons = within(getByRole("navigation", { name: "Slides" })).getAllByRole("button");
    fireEvent.click(buttons[4]);
    const wrappers = container.querySelectorAll("[data-section-id]");
    expect(wrappers).toHaveLength(14);
    expect(calls).toEqual([wrappers[4]]);
    expect((calls[0] as HTMLElement).dataset.sectionId).toBe("s4");
  });
});
