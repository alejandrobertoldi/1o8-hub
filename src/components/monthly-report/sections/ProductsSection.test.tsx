import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductsSection } from "./ProductsSection";
import type { Report } from "../types";

function makeReport(rows: Report["products"]): Report {
  return {
    meta: {
      client: "Dr. Cuddles",
      month: "March 2026",
      period: "01 Mar – 31 Mar",
      lead: "Manu Lancharro",
      issued: "Apr 24, 2026",
      reportId: "2026-03-dr-cuddles",
    },
    sections: ["cover", "toc", "products"],
    products: rows,
  };
}

describe("ProductsSection", () => {
  it("renders rows sorted by sales desc with grand total in tfoot", () => {
    const data = makeReport([
      { asin: "A1", title: "Small widget", sku: "SKU-A", sessions: 100, units: 5,  sales: 50,  cvr: 5,  buyBox: 90 },
      { asin: "B2", title: "Big widget",   sku: "SKU-B", sessions: 200, units: 40, sales: 400, cvr: 20, buyBox: 98 },
    ]);
    const { container } = render(<ProductsSection data={data} />);
    const bodyRows = container.querySelectorAll("table.dt tbody tr");
    expect(bodyRows[0]?.textContent).toContain("Big widget");
    expect(bodyRows[1]?.textContent).toContain("Small widget");
    const footRow = container.querySelector("table.dt tfoot tr");
    expect(footRow?.textContent).toMatch(/TOTAL/);
  });

  it("renders the full catalog without a top-N cap", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      asin: `A${i}`, title: `P${i}`, sku: `S${i}`,
      sessions: 1, units: 1, sales: 1000 - i, cvr: 5, buyBox: 90,
    }));
    const { container } = render(<ProductsSection data={makeReport(many)} />);
    expect(container.querySelectorAll("table.dt tbody tr")).toHaveLength(25);
    expect(screen.queryByText(/Showing top/i)).not.toBeInTheDocument();
  });

  it("applies ok/warn/crit cell modifiers (mapped from threshold bands)", () => {
    const data = makeReport([
      { asin: "A1", title: "X", sku: "S", sessions: 100, units: 5, sales: 50, cvr: 15, buyBox: 98 }, // good/good → ok/ok
      { asin: "B2", title: "Y", sku: "S", sessions: 100, units: 5, sales: 40, cvr: 3,  buyBox: 70 }, // bad/bad → crit/crit
    ]);
    const { container } = render(<ProductsSection data={data} />);
    expect(container.querySelectorAll("td.ok").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("td.crit").length).toBeGreaterThan(0);
  });

  it("returns null when products is empty", () => {
    const data = makeReport([]);
    const { container } = render(<ProductsSection data={data} />);
    expect(container.firstChild).toBeNull();
  });
});
