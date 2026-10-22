import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Surface } from "./surface";

/** Surface is the single wrapper every v2 card passes through, so one stable
 *  hook on it is what lets print.css avoid breaking cards across page
 *  boundaries in all six sections. Matching on Tailwind classes instead would
 *  break the moment a card's styling changed. */
describe("Surface", () => {
  it("marks its root as a report card", () => {
    const { container } = render(<Surface><div>body</div></Surface>);
    expect(container.firstElementChild?.getAttribute("data-report-card")).toBe("true");
  });

  it("keeps the hook when a title and tools are present", () => {
    const { container } = render(
      <Surface title="Spend" tools={<button>csv</button>}><div>body</div></Surface>,
    );
    expect(container.querySelectorAll("[data-report-card]").length).toBe(1);
  });

  it("still applies caller classes alongside the hook", () => {
    const { container } = render(<Surface className="col-span-6"><div /></Surface>);
    expect(container.firstElementChild?.className).toContain("col-span-6");
  });
});
