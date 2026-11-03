import { describe, expect, it } from "vitest";
import { parseJsonl, summarizeVercelCharges, toAllotmentUnit, usageLevel } from "./plans";

describe("usageLevel", () => {
  it("flags 70% and 90%", () => {
    expect(usageLevel(10, 100)).toBe("ok");
    expect(usageLevel(70, 100)).toBe("watch");
    expect(usageLevel(95, 100)).toBe("critical");
    expect(usageLevel(null, 100)).toBe("unknown");
  });
});

describe("toAllotmentUnit", () => {
  it("converts bytes to GB", () => {
    expect(toAllotmentUnit(2_500_000_000, "Bytes", "gb")).toBeCloseTo(2.5);
    expect(toAllotmentUnit(3, "GB", "gb")).toBe(3);
  });
  it("converts time to hours", () => {
    expect(toAllotmentUnit(7200, "Seconds", "hours")).toBe(2);
    expect(toAllotmentUnit(1.5, "Hours", "hours")).toBe(1.5);
  });
  it("converts memory-time to GB-hours", () => {
    expect(toAllotmentUnit(10, "GB-Hrs", "gbHours")).toBe(10);
    expect(toAllotmentUnit(3600, "GB-Seconds", "gbHours")).toBe(1);
  });
  it("returns null for a unit it can't read", () => {
    expect(toAllotmentUnit(5, "Credits", "gb")).toBeNull();
  });
});

describe("summarizeVercelCharges", () => {
  it("adds charge lines into the Hobby allotments and keeps the rest apart", () => {
    const s = summarizeVercelCharges(
      parseJsonl(
        [
          JSON.stringify({ ServiceName: "Function Invocations", ConsumedQuantity: 600_000, ConsumedUnit: "Invocations", BilledCost: 0 }),
          JSON.stringify({ ServiceName: "Function Invocations", ConsumedQuantity: 200_000, ConsumedUnit: "Invocations", BilledCost: 0 }),
          JSON.stringify({ ServiceName: "Fast Data Transfer", ConsumedQuantity: 1_000_000_000, ConsumedUnit: "Bytes", BilledCost: 0 }),
          "not json",
          JSON.stringify({ ServiceName: "Edge Requests", ConsumedQuantity: 42, ConsumedUnit: "Requests", BilledCost: 0 }),
        ].join("\n"),
      ),
    );
    const inv = s.metrics.find((m) => m.key === "functionInvocations")!;
    expect(inv.used).toBe(800_000);
    expect(inv.level).toBe("watch");
    expect(s.metrics.find((m) => m.key === "fastDataTransfer")!.used).toBeCloseTo(1);
    expect(s.other).toEqual([{ name: "Edge Requests", quantity: 42, unit: "Requests" }]);
  });
  it("shows the raw figure when the unit is unknown", () => {
    const s = summarizeVercelCharges([{ ServiceName: "Fluid Active CPU", ConsumedQuantity: 12, ConsumedUnit: "Units" }]);
    const cpu = s.metrics.find((m) => m.key === "activeCpu")!;
    expect(cpu.used).toBeNull();
    expect(cpu.raw).toBe("12 Units");
    expect(cpu.level).toBe("unknown");
  });
});
