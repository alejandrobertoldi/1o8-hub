import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SalesBars, CumulativeCurve, SpendSalesLines } from "./charts";
const series = (vals: number[]) => vals.map((value, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value }));

describe("charts", () => {
  it("SalesBars draws one rect per month with template geometry + nice axis labels", () => {
    const { container } = render(<svg><SalesBars series={series([4500, 9000, 3000])} /></svg>);
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(rects[0].getAttribute("x")).toBe("74");
    expect(rects[0].getAttribute("height")).toBe("120");
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(expect.arrayContaining(["$9.0K", "$6.0K", "$3.0K", "0", "J", "F", "M"]));
  });
  it("CumulativeCurve draws area, line and end dot", () => {
    const { container } = render(<svg><CumulativeCurve series={series([10, 30, 60])} /></svg>);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("d")).toMatch(/Z$/);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });
  it("SpendSalesLines: orange sales line, teal spend line, dot at sales peak", () => {
    const block = { spend: 3, sales: 9, orders: 1, monthly: [
      { month: "2025-01", spend: 1, sales: 2 }, { month: "2025-02", spend: 1, sales: 5 }, { month: "2025-03", spend: 1, sales: 2 }] };
    const { container } = render(<SpendSalesLines block={block} gradientId="g1" />);
    const strokes = [...container.querySelectorAll("path")].map((p) => p.getAttribute("stroke"));
    expect(strokes).toEqual(expect.arrayContaining(["#F7BF1D", "#5FA6B5"]));
    expect(container.querySelector("circle")?.getAttribute("cx")).toBe("455");
  });
  it("empty series renders an empty chart without throwing", () => {
    expect(() => render(<svg><SalesBars series={[]} /></svg>)).not.toThrow();
    expect(() => render(<SpendSalesLines block={{ spend: 0, sales: 0, orders: 0, monthly: [] }} gradientId="g" />)).not.toThrow();
  });
});
