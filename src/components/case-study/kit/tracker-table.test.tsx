import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackerTable } from "./tracker-table";
import type { TrackerRow } from "@/lib/case-study/kit/types";

const cellOf = (stage: "drafting" | "sent", extra = {}) => ({ id: "x", stage, ownerName: "Sam", dateRangeStart: "2025-01-01",
  dateRangeEnd: "2025-12-31", updatedAt: "2026-09-28T00:00:00Z", blockers: 0, manualImages: 0, ...extra });
const rows: TrackerRow[] = [
  { clientIdCode: "A_SC_US", clientName: "Alpha", highLevel: cellOf("sent"), detailed: null },
  { clientIdCode: "B_SC_US", clientName: "Beta", highLevel: null, detailed: cellOf("drafting", { blockers: 3, manualImages: 2 }) },
];

describe("TrackerTable", () => {
  it("one row per client, links to the builder per format, Create for empty cells", () => {
    render(<TrackerTable rows={rows} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /create/i })[0].getAttribute("href")).toBe("/clients/A_SC_US/case-study?format=detailed");
    expect(screen.getByRole("link", { name: /sent/i }).getAttribute("href")).toBe("/clients/A_SC_US/case-study?format=high_level");
  });
  it("shows blockers and manual-image badges", () => {
    render(<TrackerTable rows={rows} />);
    expect(screen.getByText("!3")).toBeTruthy();
    expect(screen.getByText("2 manual")).toBeTruthy();
  });
  it("summary counts by stage per format", () => {
    render(<TrackerTable rows={rows} />);
    expect(screen.getByText(/High-Level — 1 sent · 1 not started/)).toBeTruthy();
    expect(screen.getByText(/Detailed — 1 drafting · 1 not started/)).toBeTruthy();
  });
  it("stage filter narrows rows", () => {
    render(<TrackerTable rows={rows} />);
    fireEvent.change(screen.getByLabelText(/stage/i), { target: { value: "sent" } });
    expect(screen.queryByText("Beta")).toBeNull();
  });
});
