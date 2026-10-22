import { describe, it, expect } from "vitest";
import { summarizeRows, validateSnapshotBody, toPortalRow, MAX_SNAPSHOT_ROWS, type SnapshotRowInput } from "./snapshot";

const row: SnapshotRowInput = {
  asin: "B0", sku: "S", productName: "Thing", mainImageUrl: "", available: 10, inbound: 5, reserved: 1, awdAvailable: 0, awdInbound: 0,
  stockPosition: 16, basisUnits: 100, liveCalc: 94, overrideQty: 200, note: "internal", final: 200,
};
const settings = { method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 };

describe("summarizeRows", () => {
  it("sums positives to send and negatives as overstock units", () => {
    expect(summarizeRows([{ final: 200 }, { final: 0 }, { final: -14 }, { final: -5 }, { final: 30 }]))
      .toEqual({ skuCount: 5, unitsToSend: 230, overstockSkus: 2, overstockUnits: 19 });
  });
});

describe("validateSnapshotBody", () => {
  it("accepts a valid body", () => {
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [row] }).ok).toBe(true);
  });
  it("rejects zero rows", () => {
    const r = validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [] });
    expect(r.ok).toBe(false);
  });
  it("caps rows below the Postgres 65,535 bind-parameter limit (14 params per row)", () => {
    expect(MAX_SNAPSHOT_ROWS).toBe(4000);
    expect(MAX_SNAPSHOT_ROWS * 14).toBeLessThanOrEqual(65535);
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: Array(MAX_SNAPSHOT_ROWS).fill(row) }).ok).toBe(true);
  });
  it("rejects too many rows, non-integers, bad settings", () => {
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: Array(MAX_SNAPSHOT_ROWS + 1).fill(row) }).ok).toBe(false);
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [{ ...row, final: 1.5 }] }).ok).toBe(false);
    expect(validateSnapshotBody({ clientIdCode: "POO_SC_US", settings: { ...settings, upliftPct: 999 }, rows: [row] }).ok).toBe(false);
  });
  it("normalizes rows to exactly SnapshotRowInput keys, dropping unknown fields", () => {
    const result = validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [{ ...row, secret: "x" } as any] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const normalized = result.value.rows[0];
      expect(normalized).not.toHaveProperty("secret");
      const keys = Object.keys(normalized).sort();
      const expected = ["asin", "available", "awdAvailable", "awdInbound", "basisUnits", "final", "inbound", "liveCalc", "mainImageUrl", "note", "overrideQty", "productName", "reserved", "sku", "stockPosition"].sort();
      expect(keys).toEqual(expected);
    }
    // A row from an older page without the AWD fields is still accepted, as 0.
    const { awdAvailable: _a, awdInbound: _b, ...legacy } = row;
    void _a; void _b;
    const old = validateSnapshotBody({ clientIdCode: "POO_SC_US", settings, rows: [legacy] });
    expect(old.ok && old.value.rows[0].awdAvailable).toBe(0);
    if (result.ok) {
    }
  });
});

describe("toPortalRow", () => {
  it("strips note and overrideQty", () => {
    const p = toPortalRow(row);
    expect(p).not.toHaveProperty("note");
    expect(p).not.toHaveProperty("overrideQty");
    expect(p.final).toBe(200);
  });
  it("returns exactly the 12 portal keys via allowlist — no liveCalc", () => {
    const p = toPortalRow({ ...row, secret: "x" } as any);
    expect(p).not.toHaveProperty("secret");
    const keys = Object.keys(p).sort();
    const expected = ["asin", "available", "awdAvailable", "awdInbound", "basisUnits", "final", "inbound", "mainImageUrl", "productName", "reserved", "sku", "stockPosition"].sort();
    expect(keys).toEqual(expected);
  });
});
