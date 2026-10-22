import { describe, expect, it } from "vitest";
import { validateBufferBody } from "./buffers";

describe("validateBufferBody", () => {
  const ok = { clientIdCode: "HAL_SC_US", sku: "4VAR12PCK", bufferPct: 15 };
  it("accepts an integer 0–200", () => {
    expect(validateBufferBody(ok)).toEqual({ ok: true, value: ok });
    expect(validateBufferBody({ ...ok, bufferPct: 0 }).ok).toBe(true);
    expect(validateBufferBody({ ...ok, bufferPct: 200 }).ok).toBe(true);
  });
  it("rejects bad input", () => {
    for (const bad of [{ ...ok, bufferPct: -1 }, { ...ok, bufferPct: 201 }, { ...ok, bufferPct: 1.5 }, { ...ok, bufferPct: "10" }, { ...ok, sku: "" }, { ...ok, clientIdCode: "x y" }, null]) {
      expect(validateBufferBody(bad).ok).toBe(false);
    }
  });
});
