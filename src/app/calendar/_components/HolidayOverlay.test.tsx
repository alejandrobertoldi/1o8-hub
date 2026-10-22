import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HolidayOverlay, rowsForCell } from "./HolidayOverlay";

const ROWS = [
  { id: "h1", countryCode: "MX", holidayDate: "2026-08-14", name: "Independence Day" },
  { id: "h2", countryCode: "US", holidayDate: "2026-08-14", name: "Sample US Day" },
];

describe("rowsForCell", () => {
  it("matches only the exact date", () => {
    expect(rowsForCell(ROWS, "2026-08-14").map((r) => r.id)).toEqual(["h1", "h2"]);
    expect(rowsForCell(ROWS, "2026-08-15")).toEqual([]);
  });
});

describe("HolidayOverlay", () => {
  it("renders the holiday name as a chip", () => {
    render(<HolidayOverlay rows={ROWS} cellKey="2026-08-14" />);
    expect(screen.getByText("Independence Day")).toBeInTheDocument();
  });

  it("leads each chip with a plain rectangular flag, 3-letter code, and shared deep-blue colour", () => {
    const { container } = render(<HolidayOverlay rows={ROWS} cellKey="2026-08-14" />);
    const chips = container.querySelectorAll(".bg-blue-800\\/15");
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.className).toContain("text-blue-800");
      expect(chip.className).toContain("border-blue-800/30");
    }
    expect(screen.getByText("MEX")).toBeInTheDocument();
    expect(screen.getByText("USA")).toBeInTheDocument();
    // Plain SVG rectangles — no emoji
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/🇺🇸|🇵🇰/);
  });

  it("renders nothing on a non-matching day", () => {
    const { container } = render(<HolidayOverlay rows={ROWS} cellKey="2026-08-15" />);
    expect(container).toBeEmptyDOMElement();
  });
});
