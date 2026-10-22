import { describe, expect, it } from "vitest";
import { aggregate } from "./aggregate";
import type { DemandInput } from "./types";

const NO_DEMAND: DemandInput = { status: "unavailable", reason: "no_orders" };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("aggregate", () => {
  it("merges FCs of one metro into one dot, largest first", () => {
    const body = aggregate(
      [
        { fc: "PHX7", units: 30, fee: 3 },
        { fc: "PHX5", units: 10, fee: 1 },
        { fc: "SDF9", units: 60, fee: 6 },
      ],
      NO_DEMAND,
    );
    expect(body.dots.map((d) => d.key)).toEqual(["SDF", "PHX"]);
    const phx = body.dots[1];
    expect(phx.units).toBe(40);
    expect(phx.fcs.map((f) => f.code)).toEqual(["PHX7", "PHX5"]);
    expect(phx.approximate).toBe(false);
    expect(phx.label).toBe("Phoenix, AZ");
  });

  it("merges approximate S+state FCs per state into one hollow dot", () => {
    const body = aggregate([{ fc: "SFL4", units: 5, fee: 0 }, { fc: "SFL9", units: 5, fee: 0 }], NO_DEMAND);
    expect(body.dots).toHaveLength(1);
    expect(body.dots[0]).toMatchObject({ key: "state:FL", label: "Florida (approx.)", approximate: true, units: 10 });
  });

  it("puts unresolvable FCs in the unplaced bucket and shares sum to 1", () => {
    const body = aggregate([{ fc: "PHX7", units: 75, fee: 1 }, { fc: "ZZZ1", units: 25, fee: 2 }], NO_DEMAND);
    expect(body.unplaced).toMatchObject({ units: 25, share: 0.25 });
    expect(body.unplaced.fcs).toEqual([{ code: "ZZZ1", units: 25, fee: 2 }]);
    expect(sum(body.dots.map((d) => d.share)) + body.unplaced.share).toBeCloseTo(1, 10);
    expect(body.totals).toEqual({ units: 100, placedUnits: 75, fee: 3 });
  });

  it("merges duplicate codes after normalisation", () => {
    const body = aggregate([{ fc: `'PHX7'`, units: 1, fee: 1 }, { fc: "PHX7", units: 2, fee: 1 }], NO_DEMAND);
    expect(body.dots[0].fcs).toEqual([{ code: "PHX7", units: 3, fee: 2 }]);
  });

  it("all-unplaced: no dots, 100% unplaced, no NaN anywhere", () => {
    const body = aggregate([{ fc: "ZZZ1", units: 10, fee: 1 }], {
      status: "ok", byState: { CA: 5 }, totalUnits: 5,
    });
    expect(body.dots).toEqual([]);
    expect(body.unplaced.share).toBe(1);
    // JSON.stringify turns NaN into null, so no "null" anywhere ⇒ no NaN leaked.
    expect(JSON.stringify(body)).not.toMatch(/null/);
    for (const d of body.divisions ?? []) {
      expect(Number.isNaN(d.stockShare)).toBe(false);
      expect(d.stockShare).toBe(0);
    }
  });

  it("empty stock → empty body with zero totals", () => {
    const body = aggregate([], NO_DEMAND);
    expect(body).toMatchObject({ dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 0, placedUnits: 0, fee: 0 } });
  });

  it("divisions: placed-only stock share, demand share over mapped states, gap in points", () => {
    const body = aggregate(
      [
        { fc: "EWR4", units: 50, fee: 0 }, // NJ → Middle Atlantic
        { fc: "PHX7", units: 50, fee: 0 }, // AZ → Mountain
        { fc: "ZZZ1", units: 100, fee: 0 }, // unplaced, excluded from stock share
      ],
      { status: "ok", byState: { NY: 80, AZ: 20 }, totalUnits: 110 },
    );
    const mid = body.divisions!.find((d) => d.division === "Middle Atlantic")!;
    expect(mid).toEqual({ division: "Middle Atlantic", demandShare: 0.8, stockShare: 0.5, gapPts: -30 });
    expect(body.divisions).toHaveLength(9);
    expect(body.divisions![0].division).toBe("Middle Atlantic"); // sorted by demand share desc
  });

  it("demand all unmapped: ok status, all shares 0, no NaN", () => {
    const body = aggregate([{ fc: "PHX7", units: 1, fee: 0 }], { status: "ok", byState: {}, totalUnits: 12 });
    expect(body.demand).toEqual({ status: "ok", byState: {}, totalUnits: 12, note: "includes_fbm" });
    for (const d of body.divisions!) expect(d.demandShare).toBe(0);
  });

  it("demand unavailable passes through and divisions is null", () => {
    const body = aggregate([{ fc: "PHX7", units: 1, fee: 0 }], { status: "unavailable", reason: "account_not_mirrored" });
    expect(body.demand).toEqual({ status: "unavailable", reason: "account_not_mirrored" });
    expect(body.divisions).toBeNull();
  });

  describe("with the fulfillment_centers directory", () => {
    const DIR = new Map([
      // ABE7's prefix guesses Allentown, PA; the address says Mira Loma, CA.
      ["ABE7", { state: "CA", city: "Mira Loma", lat: 33.9944, lon: -117.5153 }],
      ["ONT8", { state: "CA", city: "Mira Loma", lat: 33.9901, lon: -117.5201 }],
      ["ANC1", { state: "AK", city: "Anchorage", lat: 61.2181, lon: -149.9003 }],
    ]);

    it("takes state, label and point from the table and groups FCs by city", () => {
      const body = aggregate([{ fc: "ABE7", units: 10, fee: 1 }, { fc: "ONT8", units: 5, fee: 0 }], NO_DEMAND, DIR);
      expect(body.dots).toHaveLength(1);
      expect(body.dots[0]).toMatchObject({ key: "city:CA:Mira Loma", label: "Mira Loma, CA", state: "CA", units: 15, approximate: false });
      expect(body.dots[0].fcs.map((f) => f.code)).toEqual(["ABE7", "ONT8"]);
      expect(body.unplaced.units).toBe(0);
    });

    it("places AK/HI/PR table rows at the state label point, not off-canvas", () => {
      const inTable = aggregate([{ fc: "ANC1", units: 1, fee: 0 }], NO_DEMAND, DIR).dots[0];
      const approx = aggregate([{ fc: "SAK1", units: 1, fee: 0 }], NO_DEMAND).dots[0];
      expect([inTable.x, inTable.y]).toEqual([approx.x, approx.y]);
    });

    it("falls back to the prefix lookup for codes the table lacks", () => {
      const body = aggregate([{ fc: "PHX7", units: 3, fee: 0 }], NO_DEMAND, DIR);
      expect(body.dots[0]).toMatchObject({ key: "PHX", label: "Phoenix, AZ" });
    });
  });
});
