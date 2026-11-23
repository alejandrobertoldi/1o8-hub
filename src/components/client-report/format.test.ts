import { describe, expect, it } from "vitest";
import { fmt, fmtChange } from "./format";

describe("report formatting", () => {
  it("formats full figures", () => {
    expect(fmt(99271.4, "money")).toBe("$99,271");
    expect(fmt(67.104, "money")).toBe("$67.10");
    expect(fmt(-10418, "money")).toBe("-$10,418");
    expect(fmt(0.0127, "percent")).toBe("1.27%");
    expect(fmt(3.744, "ratio")).toBe("3.74x");
    expect(fmt(null, "count")).toBe("—");
  });

  it("shows rate changes in points and totals in percent", () => {
    expect(fmtChange(0.0127, 0.0173, "percent")).toEqual({ text: "-0.46 pts", tone: "bad" });
    expect(fmtChange(120, 100, "money")).toEqual({ text: "+20.0%", tone: "good" });
    expect(fmtChange(80, 100, "money", true)).toEqual({ text: "-20.0%", tone: "good" });
    expect(fmtChange(5, null, "count")).toBeNull();
  });

  it("compares negative amounts by size", () => {
    // Returns grew from $7.5k to $13k: more returns is bad.
    expect(fmtChange(-13067, -7454, "money")).toEqual({ text: "+75.3%", tone: "bad" });
    // Discounts shrank.
    expect(fmtChange(-10418, -18617, "money")).toEqual({ text: "-44.0%", tone: "good" });
  });
});
