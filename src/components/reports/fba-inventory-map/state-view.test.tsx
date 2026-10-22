import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StateBubbleOverlay, dotRadius } from "./state-bubble-overlay";
import { StatePanel } from "./state-panel";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

const CA: StateBubble = {
  state: "CA", name: "California", x: 100, y: 300, units: 60, fee: 6, share: 0.3, metros: [],
  fcs: [
    { code: "LGB8", units: 40, fee: 4, place: "Long Beach, CA", approximate: false, shareOfState: 40 / 60 },
    { code: "SCA1", units: 20, fee: 2, place: "Location approximate", approximate: true, shareOfState: 20 / 60 },
  ],
};
const NJ: StateBubble = { state: "NJ", name: "New Jersey", x: 800, y: 200, units: 5, fee: 1, share: 0.025, metros: [], fcs: [{ code: "EWR4", units: 5, fee: 1, place: "Newark, NJ", approximate: false, shareOfState: 1 }] };

describe("dotRadius", () => {
  it("spans 3..22 and is 0 for no max", () => {
    expect(dotRadius(0, 100)).toBe(3);
    expect(dotRadius(100, 100)).toBe(22);
    expect(dotRadius(5, 0)).toBe(0);
  });
});

describe("StateBubbleOverlay", () => {
  it("draws one circle per state, largest first, selected one brand-stroked, click selects", () => {
    const onSelect = vi.fn();
    const { container } = render(<svg><StateBubbleOverlay bubbles={[NJ, CA]} selected="NJ" onSelect={onSelect} onHover={() => {}} /></svg>);
    const circles = [...container.querySelectorAll("circle")];
    expect(circles.map((c) => c.getAttribute("data-bubble"))).toEqual(["CA", "NJ"]);
    expect(circles[1].getAttribute("stroke")).toBe("var(--brand)");
    expect(circles[0].getAttribute("stroke")).toBe("var(--card)");
    fireEvent.click(circles[0]);
    expect(onSelect).toHaveBeenCalledWith("CA");
  });
});

describe("StateBubbleOverlay labels", () => {
  it("prints each state's code centred on its circle, after every circle, and lets clicks through", () => {
    const { container } = render(<svg><StateBubbleOverlay bubbles={[NJ, CA]} selected={null} onSelect={() => {}} onHover={() => {}} /></svg>);
    const labels = [...container.querySelectorAll("text[data-bubble-label]")];
    expect(labels.map((t) => t.textContent)).toEqual(["CA", "NJ"]);
    expect(labels[0].getAttribute("x")).toBe(String(CA.x));
    expect(labels[0].getAttribute("text-anchor")).toBe("middle");
    expect(labels[0]).toHaveClass("pointer-events-none");
    // Drawn after the last circle, so a neighbour's circle can never cover a label.
    const nodes = [...container.querySelectorAll("circle, text")];
    expect(nodes.findIndex((n) => n.tagName === "text")).toBeGreaterThan(nodes.map((n) => n.tagName).lastIndexOf("circle"));
  });
});

describe("StatePanel", () => {
  it("shows header and FC rows with an approx badge; no demand line", () => {
    render(<StatePanel stateCode="CA" bubble={CA} />);
    const panel = screen.getByTestId("state-panel");
    expect(panel).toHaveTextContent("California");
    expect(panel).toHaveTextContent("60");
    expect(panel).toHaveTextContent("30%");
    expect(screen.queryByTestId("state-demand")).toBeNull();
    const rows = screen.getAllByTestId("state-fc-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("LGB8");
    expect(rows[0]).toHaveTextContent("Long Beach, CA");
    expect(within(rows[1]).getByText("approx.")).toBeInTheDocument();
  });

  it("keeps the approx. badge and the full place name visible when the Place column truncates", () => {
    render(<StatePanel stateCode="CA" bubble={CA} />);
    const rows = screen.getAllByTestId("state-fc-row");
    // The badge must not live inside the truncating element, or it is clipped on narrow panels.
    const badge = within(rows[1]).getByText("approx.");
    expect(badge.closest(".truncate")).toBeNull();
    // The truncating place text carries the full name as a tooltip.
    expect(within(rows[0]).getByTitle("Long Beach, CA")).toHaveClass("truncate");
  });

  it("no stock in a state: message, no FC rows", () => {
    render(<StatePanel stateCode="TX" bubble={null} />);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("No FBA stock in Texas.");
    expect(screen.queryAllByTestId("state-fc-row")).toHaveLength(0);
  });

  it("null state (all stock unplaced) shows the placement message without NaN", () => {
    const { container } = render(<StatePanel stateCode={null} bubble={null} />);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("No FC in this month could be placed on the map.");
    expect(container.textContent).not.toContain("NaN");
  });
});
