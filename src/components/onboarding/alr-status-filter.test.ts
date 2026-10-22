import { describe, it, expect } from "vitest";
import {
  normalizeAlrStatus,
  filterRowsByStatus,
  type AlrStatusBucket,
} from "./alr-status-filter";

describe("normalizeAlrStatus", () => {
  it("maps known statuses to canonical buckets", () => {
    expect(normalizeAlrStatus("Active")).toBe("Active");
    expect(normalizeAlrStatus("Inactive")).toBe("Inactive");
    expect(normalizeAlrStatus("Incomplete")).toBe("Incomplete");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeAlrStatus("active")).toBe("Active");
    expect(normalizeAlrStatus("INACTIVE")).toBe("Inactive");
    expect(normalizeAlrStatus("  Incomplete  ")).toBe("Incomplete");
  });

  it("returns 'Other' for unknown, empty, or null statuses", () => {
    expect(normalizeAlrStatus(null)).toBe("Other");
    expect(normalizeAlrStatus("")).toBe("Other");
    expect(normalizeAlrStatus("Pending")).toBe("Other");
    expect(normalizeAlrStatus(undefined as unknown as string | null)).toBe("Other");
  });
});

describe("filterRowsByStatus", () => {
  const rows = [
    { sku: "A", status: "Active" },
    { sku: "B", status: "Inactive" },
    { sku: "C", status: "Incomplete" },
    { sku: "D", status: "active" },
    { sku: "E", status: "Pending" },
    { sku: "F", status: null },
  ];

  it("keeps rows whose normalized status is in the selection", () => {
    const selected = new Set<AlrStatusBucket>(["Active"]);
    expect(filterRowsByStatus(rows, selected).map((r) => r.sku)).toEqual(["A", "D"]);
  });

  it("keeps rows for multiple selected buckets", () => {
    const selected = new Set<AlrStatusBucket>(["Active", "Incomplete"]);
    expect(filterRowsByStatus(rows, selected).map((r) => r.sku)).toEqual(["A", "C", "D"]);
  });

  it("returns no rows when selection is empty", () => {
    const selected = new Set<AlrStatusBucket>();
    expect(filterRowsByStatus(rows, selected)).toEqual([]);
  });

  it("never includes rows that normalize to 'Other', regardless of selection", () => {
    const selected = new Set<AlrStatusBucket>(["Active", "Inactive", "Incomplete"]);
    const result = filterRowsByStatus(rows, selected).map((r) => r.sku);
    expect(result).not.toContain("E");
    expect(result).not.toContain("F");
  });
});
