import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApprovedTimeOffOverlay, rowsForCell } from "./ApprovedTimeOffOverlay";

const ROWS = [
  { id: "a", userId: "u1", userName: "Jo", startDate: "2026-08-10", endDate: "2026-08-14" },
  { id: "b", userId: "u2", userName: "Amir", startDate: "2026-08-20", endDate: "2026-08-20" },
];

describe("rowsForCell", () => {
  it("includes a row whose range covers the cell", () => {
    expect(rowsForCell(ROWS, "2026-08-12").map((r) => r.id)).toEqual(["a"]);
  });
  it("includes a single-day row only on its own date", () => {
    expect(rowsForCell(ROWS, "2026-08-20").map((r) => r.id)).toEqual(["b"]);
    expect(rowsForCell(ROWS, "2026-08-21")).toEqual([]);
  });
  it("returns nothing for a date outside every range", () => {
    expect(rowsForCell(ROWS, "2026-08-01")).toEqual([]);
  });
});

describe("ApprovedTimeOffOverlay", () => {
  it("renders a chip for a covering row", () => {
    render(<ApprovedTimeOffOverlay rows={ROWS} cellKey="2026-08-12" />);
    expect(screen.getByText("Jo")).toBeInTheDocument();
  });
  it("renders nothing when no row covers the cell", () => {
    const { container } = render(<ApprovedTimeOffOverlay rows={ROWS} cellKey="2026-08-01" />);
    expect(container).toBeEmptyDOMElement();
  });
  it("falls back to a generic label when userName is null", () => {
    render(
      <ApprovedTimeOffOverlay
        rows={[{ id: "c", userId: "u3", userName: null, startDate: "2026-08-12", endDate: "2026-08-12" }]}
        cellKey="2026-08-12"
      />
    );
    expect(screen.getByText("Team member")).toBeInTheDocument();
  });
});
