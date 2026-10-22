import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VALID_COUNTRY_CODES } from "@/lib/constants";
import { CountryFlag } from "./country-flag";

describe("CountryFlag", () => {
  it("renders a rectangular SVG for every holiday calendar", () => {
    for (const code of VALID_COUNTRY_CODES) {
      const { container, unmount } = render(<CountryFlag code={code} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("viewBox", "0 0 20 14");
      expect(container.firstElementChild?.className).toContain("h-[14px]");
      expect(container.firstElementChild?.className).toContain("w-[20px]");
      unmount();
    }
  });

  it("renders nothing for an unknown code", () => {
    const { container } = render(<CountryFlag code="XX" />);
    expect(container).toBeEmptyDOMElement();
  });
});
