import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { QualitySparkline } from "./quality-sparkline";

describe("QualitySparkline", () => {
  it("returns null when fewer than 2 scores", () => {
    const { container } = render(<QualitySparkline scores={[85]} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when scores is empty", () => {
    const { container } = render(<QualitySparkline scores={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders an SVG with polyline when 2+ scores provided", () => {
    const { container } = render(<QualitySparkline scores={[80, 85, 90]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeInTheDocument();
    expect(polyline?.getAttribute("points")).toBeTruthy();
  });

  it("renders a dot on the latest value", () => {
    const { container } = render(<QualitySparkline scores={[70, 80]} />);
    const circle = container.querySelector("circle");
    expect(circle).toBeInTheDocument();
  });

  it("has accessible label with trend direction", () => {
    render(<QualitySparkline scores={[70, 80, 90]} />);
    // Scores are reversed: oldest first [90, 80, 70] → newest is 70
    // Wait, scores come in newest→oldest: [70, 80, 90]
    // Reversed for display: [90, 80, 70]
    // data[0]=90, data[last]=70, so label is "90 → 70"
    expect(screen.getByLabelText(/Quality trend: 90 → 70/)).toBeInTheDocument();
  });

  it("accepts custom width and height", () => {
    const { container } = render(
      <QualitySparkline scores={[60, 80]} width={100} height={30} />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("100");
    expect(svg?.getAttribute("height")).toBe("30");
  });
});
