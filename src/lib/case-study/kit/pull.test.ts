// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => exec(...a) } }));
const pullRs = vi.fn();
vi.mock("./pull-redshift", () => ({ pullRedshiftMetrics: (...a: unknown[]) => pullRs(...a) }));
vi.mock("./pull-fulfilment", () => ({ pullFulfilment: vi.fn().mockResolvedValue("FBA") }));
const design = vi.fn();
vi.mock("./design-images", () => ({ resolveDesignImages: (...a: unknown[]) => design(...a) }));
import { pullEverything } from "./pull";
import { EMPTY_DESIGN_IMAGES } from "./slides";

beforeEach(() => {
  exec.mockReset(); pullRs.mockReset(); design.mockReset();
  design.mockResolvedValue(EMPTY_DESIGN_IMAGES);
});

describe("pullEverything", () => {
  it("no Intentwise id → all Redshift metrics missing, noAccount, no Redshift call", async () => {
    exec.mockResolvedValue([{ raw_data: { ClientName: "x" } }]);
    const r = await pullEverything("NOID_SC_US", "2025-01-01", "2025-12-31");
    expect(r.noAccount).toBe(true);
    expect(pullRs).not.toHaveBeenCalled();
    expect(r.metrics.auto.salesTotal).toBeUndefined();
    expect(r.metrics.auto.fulfilment).toBe("FBA");
    expect(design).toHaveBeenCalledWith("NOID_SC_US", null);
  });
  it("passes hero ASIN to design resolver and keeps prior overrides", async () => {
    exec.mockResolvedValue([{ raw_data: { IntentwiseID: "42" } }]);
    pullRs.mockResolvedValue({ metrics: { salesTotal: 5, topByRevenue: [{ asin: "B9", title: "t", value: 5 }] }, failed: ["campaigns"] });
    const prev = { pulledAt: "x", period: { start: "a", end: "b" }, auto: {}, overrides: { sessions: 77 }, failed: [] };
    const r = await pullEverything("C_SC_US", "2025-01-01", "2025-12-31", prev);
    expect(pullRs).toHaveBeenCalledWith("42", "2025-01-01", "2025-12-31");
    expect(design).toHaveBeenCalledWith("C_SC_US", "B9");
    expect(r.metrics.overrides).toEqual({ sessions: 77 });
    expect(r.metrics.failed).toEqual(["campaigns"]);
    expect(r.metrics.period).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(r.metrics.pulledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("Design lookup failure → empty design images, 'design' in failed, deck still pullable", async () => {
    exec.mockResolvedValue([{ raw_data: { IntentwiseID: "42" } }]);
    pullRs.mockResolvedValue({ metrics: { salesTotal: 5 }, failed: ["campaigns"] });
    design.mockRejectedValue(new Error("drive down"));
    const r = await pullEverything("C_SC_US", "2025-01-01", "2025-12-31");
    expect(r.design).toEqual(EMPTY_DESIGN_IMAGES);
    expect(r.metrics.failed).toEqual(["campaigns", "design"]);
    expect(r.metrics.auto.salesTotal).toBe(5);
  });
  it("raw_data stored as a JSON string is parsed", async () => {
    exec.mockResolvedValue([{ raw_data: JSON.stringify({ IntentwiseID: "7" }) }]);
    pullRs.mockResolvedValue({ metrics: {}, failed: [] });
    await pullEverything("C_SC_US", "2025-01-01", "2025-12-31");
    expect(pullRs).toHaveBeenCalledWith("7", "2025-01-01", "2025-12-31");
  });
});
