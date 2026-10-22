import { describe, expect, it } from "vitest";
import { groupByState } from "./state-grouping";
import { statePoint } from "@/lib/fc-locations";
import type { Dot } from "./types";

const dot = (o: Partial<Dot> & Pick<Dot, "key" | "state" | "fcs">): Dot => ({
  label: o.key, x: 0, y: 0, share: 0, approximate: false,
  units: o.fcs.reduce((s, f) => s + f.units, 0), ...o,
});

const DOTS: Dot[] = [
  dot({ key: "LGB", label: "Long Beach, CA", state: "CA", fcs: [{ code: "LGB8", units: 30, fee: 3 }, { code: "LGB3", units: 10, fee: 1 }] }),
  dot({ key: "state:CA", label: "California (approx.)", state: "CA", approximate: true, fcs: [{ code: "SCA1", units: 20, fee: 2 }] }),
  dot({ key: "PHX", label: "Phoenix, AZ", state: "AZ", fcs: [{ code: "PHX7", units: 25, fee: 4 }] }),
  dot({ key: "EWR", label: "Newark, NJ", state: "NJ", fcs: [{ code: "EWR4", units: 25, fee: 5 }] }),
  dot({ key: "ABE", label: "Allentown, PA", state: "PA", fcs: [{ code: "ABE3", units: 0, fee: 0 }] }),
];

describe("groupByState", () => {
  const out = groupByState(DOTS, 200);

  it("merges metro + approximate dots of one state and conserves units and fee", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.units).toBe(60);
    expect(ca.fee).toBe(6);
    expect(ca.fcs.map((f) => f.code)).toEqual(["LGB8", "SCA1", "LGB3"]);
    expect(out.reduce((s, b) => s + b.units, 0)).toBe(DOTS.reduce((s, d) => s + d.units, 0));
  });

  it("labels places and flags approximate rows", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.fcs.find((f) => f.code === "LGB8")).toMatchObject({ place: "Long Beach, CA", approximate: false });
    expect(ca.fcs.find((f) => f.code === "SCA1")).toMatchObject({ place: "Location approximate", approximate: true });
  });

  it("shareOfState sums to 1 per state with stock, and share uses totalUnits", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.fcs.reduce((s, f) => s + f.shareOfState, 0)).toBeCloseTo(1, 10);
    expect(ca.share).toBeCloseTo(60 / 200, 10);
  });

  it("orders by units desc, ties by state code asc", () => {
    expect(out.map((b) => b.state)).toEqual(["CA", "AZ", "NJ", "PA"]);
  });

  it("keeps a zero-unit state with 0 shares (no NaN) and positions at statePoint", () => {
    const pa = out.find((b) => b.state === "PA")!;
    expect(pa.units).toBe(0);
    expect(pa.fcs[0].shareOfState).toBe(0);
    const [x, y] = statePoint("AZ");
    expect(out.find((b) => b.state === "AZ")).toMatchObject({ x, y, name: "Arizona" });
  });

  it("returns [] for no dots and 0 shares when totalUnits is 0", () => {
    expect(groupByState([], 0)).toEqual([]);
    expect(groupByState(DOTS, 0)[0].share).toBe(0);
  });

  it("keeps each state's source metro dots, units desc", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.metros.map((m) => m.key)).toEqual(["LGB", "state:CA"]);
    expect(out.find((b) => b.state === "AZ")!.metros.map((m) => m.key)).toEqual(["PHX"]);
  });
});
