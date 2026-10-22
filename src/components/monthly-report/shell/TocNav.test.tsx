import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TocNav } from "./TocNav";
import type { Report } from "../types";

function makeReport(): Report {
  return {
    meta: {
      client: "Poochie Butter",
      month: "July 2026",
      period: "01 Jul – 31 Jul",
      lead: "Manu Lancharro",
      issued: "Aug 24, 2026",
      reportId: "July|26|POO_SC_US",
    },
    sections: ["cover", "toc", "kpis", "campaigns", "mom", "products", "appendix"],
    kpis: [{ label: "Sales", value: "$1", delta: "+1%", direction: "up", foot: "" }],
    campaigns: {
      dateRange: "Jul 1 - Jul 31, 2026",
      stats: [],
      series: { totalSales: [], adSpend: [], adRevenue: [], acos: [] },
    },
    mom: { revenueSeries: [{ label: "JUL", value: 1 }], narrative: "", table: [] },
    products: [{ asin: "B1", title: "Treat", sku: "S1", sessions: 10, units: 2, sales: 20, cvr: 20, buyBox: 90 }],
    appendix: {
      methodology: "",
      sources: [],
      glossary: [],
      changelog: [],
      contactLine: "",
    },
  };
}

describe("TocNav", () => {
  it("renders document sticky toc by default", () => {
    const { container } = render(<TocNav data={makeReport()} />);
    const nav = container.querySelector("nav.toc");
    expect(nav).not.toBeNull();
    expect(nav).not.toHaveClass("toc--chrome");
    expect(screen.getByText("MONTHLY REPORT")).toBeTruthy();
    expect(screen.getByText(/KEY METRICS/i)).toBeTruthy();
    expect(screen.queryByText(/APPENDIX/i)).toBeNull();
  });

  it("renders chrome variant without sticky offset for the hub top nav", () => {
    const { container } = render(<TocNav data={makeReport()} variant="chrome" />);
    const nav = container.querySelector("nav.toc");
    expect(nav).toHaveClass("toc--chrome");
    expect(nav).not.toHaveAttribute("style");
  });

  it("pins below the report top bar, or at 0 when that bar is hidden", () => {
    const withBar = render(<TocNav data={makeReport()} topOffset={53} />);
    expect(withBar.container.querySelector("nav.toc")).not.toHaveAttribute("style");
    withBar.unmount();
    const withoutBar = render(<TocNav data={makeReport()} topOffset={0} />);
    expect(withoutBar.container.querySelector("nav.toc")).toHaveStyle({ top: "0px" });
  });
});
