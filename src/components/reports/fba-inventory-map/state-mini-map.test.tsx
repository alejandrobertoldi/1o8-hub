import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateMiniMap, miniMapBox } from "./state-mini-map";
import { StatePanel } from "./state-panel";
import { metroPoint, statePoint } from "@/lib/fc-locations";
import { pathVertices } from "@/lib/us-map-geometry";
import { US_STATE_PATHS } from "@/lib/us-map-paths";
import type { Dot } from "@/lib/fba-inventory-map/types";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

const at = ([x, y]: [number, number], o: Partial<Dot> & Pick<Dot, "key" | "units">): Dot => ({
  label: o.key, state: "CA", x, y, share: 0, approximate: false, fcs: [{ code: `${o.key}1`, units: o.units, fee: 1 }], ...o,
});
const [cx, cy] = statePoint("CA");
const LGB = at(metroPoint("LGB"), { key: "LGB", label: "Long Beach, CA", units: 500 });
const APPROX = at([cx, cy], { key: "state:CA", label: "California (approx.)", units: 50, approximate: true });

describe("miniMapBox", () => {
  it("encloses every vertex of the state's outline, with padding", () => {
    const b = miniMapBox("CA")!;
    for (const [x, y] of pathVertices(US_STATE_PATHS.CA)) {
      expect(x).toBeGreaterThan(b.x);
      expect(x).toBeLessThan(b.x + b.w);
      expect(y).toBeGreaterThan(b.y);
      expect(y).toBeLessThan(b.y + b.h);
    }
    expect(miniMapBox("ZZ")).toBeNull();
  });
});

describe("StateMiniMap", () => {
  it("draws the state and one dot per metro at its x/y; approximate dot is hollow + dashed", () => {
    const { container } = render(<StateMiniMap stateCode="CA" metros={[LGB, APPROX]} />);
    expect(screen.getByTestId("state-mini-map").querySelector("path")!.getAttribute("d")).toBe(US_STATE_PATHS.CA);
    const lgb = container.querySelector('[data-metro="LGB"]')!;
    expect(lgb.getAttribute("cx")).toBe(String(LGB.x));
    expect(lgb.getAttribute("cy")).toBe(String(LGB.y));
    const approx = container.querySelector('[data-metro="state:CA"]')!;
    expect(approx.getAttribute("fill")).toBe("none");
    expect(approx.getAttribute("stroke-dasharray")).toBe("3 2");
    expect(approx.querySelector("title")!.textContent).toContain("Location approximate");
  });

  it("labels only the top 6 metro dots, with the short name, never the approximate one", () => {
    const many = Array.from({ length: 8 }, (_, i) => at([cx + i, cy + i], { key: `M${i}`, label: `Town${i}, CA`, units: 100 - i }));
    const { container } = render(<StateMiniMap stateCode="CA" metros={[...many, APPROX]} />);
    const labels = [...container.querySelectorAll("[data-metro-label]")].map((t) => t.textContent);
    expect(labels).toEqual(["Town0", "Town1", "Town2", "Town3", "Town4", "Town5"]);
  });

  it("skips a dot that falls outside the zoom frame", () => {
    const far = at([-5000, -5000], { key: "FAR", units: 900 });
    const { container } = render(<StateMiniMap stateCode="CA" metros={[LGB, far]} />);
    expect(container.querySelector('[data-metro="FAR"]')).toBeNull();
    expect(container.querySelector('[data-metro="LGB"]')).not.toBeNull();
  });

  it("appears at the top of the FBA page's StatePanel", () => {
    const bubble: StateBubble = {
      state: "CA", name: "California", x: cx, y: cy, units: 550, fee: 2, share: 1, metros: [LGB, APPROX],
      fcs: [{ code: "LGB1", units: 500, fee: 1, place: "Long Beach, CA", approximate: false, shareOfState: 500 / 550 }],
    };
    render(<StatePanel stateCode="CA" bubble={bubble} />);
    expect(screen.getByTestId("state-mini-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("state-fc-row")).toHaveLength(1);
  });
});
