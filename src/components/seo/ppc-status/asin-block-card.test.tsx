import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AsinBlockCard, type AsinBlock } from "./asin-block-card";

const m = (o: Partial<{ impressions: number; clicks: number; spend: number; sales: number; orders: number }> = {}) => ({ impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, ...o });
const t = (o = {}) => ({ ...m(o), roas: null });

function block(o: Partial<AsinBlock> = {}): AsinBlock {
  return {
    asin: "A1", title: "Title", projectId: "P", projectName: "P_v01", version: 1, liveDate: "2026-08-01",
    status: "live", advertised: true, sharedWith: 0,
    windows: { before: { start: "2026-07-02", end: "2026-07-31", days: 30 }, after: { start: "2026-08-01", end: "2026-08-30", days: 30 } },
    rows: [{ keyword: "zero proof", tier: "T1", fields: ["T"], before: m({ impressions: 0.4 }), after: m({ impressions: 1.63 }), beforeTotals: t(), afterTotals: t() }],
    totals: null,
    ...o,
  };
}

describe("AsinBlockCard", () => {
  it("O1: per-day impressions below 1 keep their decimals instead of rounding to 0", () => {
    render(<AsinBlockCard block={block()} windowDays={30} />);
    expect(screen.getByText("0.40 → 1.6")).toBeTruthy();
    expect(screen.getByText("+308%")).toBeTruthy();
  });
  it("O2: one column per metric (before → after, Δ beneath) — 9 columns, not 19", () => {
    render(<AsinBlockCard block={block()} windowDays={30} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(9);
    expect(screen.getByRole("columnheader", { name: "Impr / day" })).toBeTruthy();
  });
  it("O3: an unadvertised ASIN says so instead of a table of zeros, and still lists its tracked keywords", () => {
    render(<AsinBlockCard block={block({ advertised: false })} windowDays={30} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/Not advertised in Sponsored Products/)).toBeTruthy();
    expect(screen.getByText(/zero proof/)).toBeTruthy();
  });
});
