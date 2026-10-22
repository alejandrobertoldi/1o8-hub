import { describe, it, expect } from "vitest";
import { validateOverrideBody } from "./overrides";

const ok = { clientIdCode: "POO_SC_US", asin: "B0TEST1234", sku: "SKU-1", qty: 200, note: "Client asked for 200" };

describe("validateOverrideBody", () => {
  it("accepts a valid body and trims note", () => {
    expect(validateOverrideBody({ ...ok, note: "  hi  " })).toEqual({ ok: true, value: { ...ok, note: "hi" } });
  });
  it("accepts negative and zero qty", () => {
    expect(validateOverrideBody({ ...ok, qty: -14 }).ok).toBe(true);
    expect(validateOverrideBody({ ...ok, qty: 0 }).ok).toBe(true);
  });
  it.each([
    [{ ...ok, qty: 1.5 }, /qty/],
    [{ ...ok, qty: 1_000_001 }, /qty/],
    [{ ...ok, qty: "200" }, /qty/],
    [{ ...ok, note: "x".repeat(1001) }, /note/],
    [{ ...ok, sku: "" }, /sku/],
    [{ ...ok, clientIdCode: "POO'; DROP" }, /client/i],
    [{ ...ok, note: undefined }, /note/],
  ])("rejects %j", (body, msg) => {
    const r = validateOverrideBody(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});
