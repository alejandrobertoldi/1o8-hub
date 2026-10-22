import { describe, expect, it } from "vitest";
import { US_MAP_VIEW_BOX, US_STATE_PATHS } from "@/lib/us-map-paths";
import { distanceToPath, pointInPath } from "./us-map-geometry";
import { FC_METROS, FC_OVERRIDES, metroPoint, normalizeFcCode, resolveFc } from "./fc-locations";
import fixture from "./__fixtures__/fc-top150-2026-08.json";

const COLLISIONS = ["SAT", "SLC", "SDF", "SAN", "SAV", "SMF", "SNA", "SWF", "SCK", "SBD", "SBN", "SYR", "SJA"];

describe("normalizeFcCode", () => {
  it("strips quotes and whitespace and upper-cases", () => {
    expect(normalizeFcCode(`'"phx7" `)).toBe("PHX7");
  });
});

describe("resolveFc", () => {
  it("resolves a metro prefix", () => {
    expect(resolveFc("PHX7")).toEqual({ kind: "metro", metro: "PHX", approximate: false });
  });
  it("normalises quoted input", () => {
    expect(resolveFc(`'"PHX7"'`)).toEqual({ kind: "metro", metro: "PHX", approximate: false });
  });
  it.each(COLLISIONS)("%s1 resolves to a metro, not an S+state anchor", (p) => {
    expect(resolveFc(`${p}1`).kind).toBe("metro");
  });
  it("SFL4 → Florida, approximate", () => {
    expect(resolveFc("SFL4")).toEqual({ kind: "state", state: "FL", approximate: true });
  });
  it("SAX1 (S + non-state) → unplaced unless overridden", () => {
    if (!FC_OVERRIDES.SAX1 && !FC_OVERRIDES.SAX && !FC_METROS.SAX) {
      expect(resolveFc("SAX1")).toEqual({ kind: "unplaced" });
    }
  });
  it("SDC1 is not read as S + DC", () => {
    if (!FC_OVERRIDES.SDC1 && !FC_OVERRIDES.SDC && !FC_METROS.SDC) {
      expect(resolveFc("SDC1")).toEqual({ kind: "unplaced" });
    }
  });
  it("unknown code → unplaced", () => {
    expect(resolveFc("ZZZ9")).toEqual({ kind: "unplaced" });
  });
  it("exact-code override beats a competing prefix metro", () => {
    expect(resolveFc("SDF8")).toEqual({ kind: "metro", metro: "JEFFERSONVILLE_IN", approximate: false });
    expect(resolveFc("SAT2")).toEqual({ kind: "metro", metro: "AUS", approximate: false });
  });
  it("codes of the same prefix without an exact override keep the prefix metro", () => {
    expect(resolveFc("SDF9")).toEqual({ kind: "metro", metro: "SDF", approximate: false });
  });
  it("a scattered prefix (KRB) has no default: unpinned codes stay unplaced", () => {
    expect(FC_OVERRIDES.KRB9).toBeUndefined();
    expect(resolveFc("KRB9")).toEqual({ kind: "unplaced" });
  });
  it("exact override beats prefix", () => {
    const [code, target] = Object.entries(FC_OVERRIDES).find(([k]) => k.length > 3) ?? [];
    if (code && target) expect(resolveFc(code)).toEqual({ kind: "metro", metro: target, approximate: false });
  });
});

describe("tables", () => {
  it("every override target exists in FC_METROS", () => {
    for (const [code, target] of Object.entries(FC_OVERRIDES)) expect(FC_METROS[target], code).toBeDefined();
  });
  it("every metro projects inside the viewBox and inside (or ≤3px from) its own state", () => {
    for (const [key, m] of Object.entries(FC_METROS)) {
      if (["AK", "HI", "PR"].includes(m.state)) continue;
      const [x, y] = metroPoint(key);
      expect(x, key).toBeGreaterThanOrEqual(0);
      expect(x, key).toBeLessThanOrEqual(US_MAP_VIEW_BOX.width);
      expect(y, key).toBeGreaterThanOrEqual(0);
      expect(y, key).toBeLessThanOrEqual(US_MAP_VIEW_BOX.height);
      const d = US_STATE_PATHS[m.state];
      expect(pointInPath(d, x, y) || distanceToPath(d, x, y) <= 3, `${key} outside ${m.state}`).toBe(true);
    }
  });
});

describe("coverage", () => {
  it("≥ 93% of top-150 Aug 2026 units resolve to a metro or state", () => {
    const rows = fixture as { code: string; units: number }[];
    const total = rows.reduce((s, r) => s + r.units, 0);
    const placed = rows.filter((r) => resolveFc(r.code).kind !== "unplaced").reduce((s, r) => s + r.units, 0);
    expect(placed / total).toBeGreaterThanOrEqual(0.93);
  });
});
