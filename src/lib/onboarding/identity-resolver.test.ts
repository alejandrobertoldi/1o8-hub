// src/lib/onboarding/identity-resolver.test.ts
import { describe, it, expect } from "vitest";
import { resolveRowIdentity, type SheetRow, type MasterCandidate } from "./identity-resolver";

const row = (over: Partial<SheetRow> = {}): SheetRow => ({ sku: "", asin: "", ...over });
const cand = (over: Partial<MasterCandidate>): MasterCandidate => ({
  id: "", sku: null, asin: null, ...over,
});

describe("resolveRowIdentity", () => {
  it("matches by ASIN when ASIN is present and exists", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1", asin: "ASIN1" }),
      [cand({ id: "p1", sku: "OTHER", asin: "ASIN1" })],
    );
    expect(r).toEqual({ action: "update", productId: "p1", backfillAsin: false });
  });

  it("falls back to SKU match when ASIN not present", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1" }),
      [cand({ id: "p2", sku: "SKU1", asin: null })],
    );
    expect(r).toEqual({ action: "update", productId: "p2", backfillAsin: false });
  });

  it("backfillAsin=true when SKU matches and row provides a new ASIN", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1", asin: "NEWASIN" }),
      [cand({ id: "p3", sku: "SKU1", asin: null })],
    );
    expect(r).toEqual({ action: "update", productId: "p3", backfillAsin: true });
  });

  it("INSERT when no match and SKU is present", () => {
    const r = resolveRowIdentity(
      row({ sku: "BRANDNEW", asin: "" }),
      [cand({ id: "p4", sku: "OTHER", asin: null })],
    );
    expect(r).toEqual({ action: "insert" });
  });

  it("REJECT when no SKU at all", () => {
    const r = resolveRowIdentity(row({ sku: "", asin: "" }), []);
    expect(r).toEqual({ action: "reject", reason: "missing-sku" });
  });

  it("ASIN takes precedence over SKU when both match different rows", () => {
    const r = resolveRowIdentity(
      row({ sku: "SKU1", asin: "ASIN1" }),
      [
        cand({ id: "byAsin", sku: "DIFFERENT", asin: "ASIN1" }),
        cand({ id: "bySku",  sku: "SKU1",      asin: "OTHER" }),
      ],
    );
    expect(r.action).toBe("update");
    if (r.action === "update") expect(r.productId).toBe("byAsin");
  });
});
