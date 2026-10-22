import { describe, it, expect } from "vitest";
import { utf8ByteLength, checkByteBudget, checkCharBudget } from "@/lib/seo/byte-budget";

describe("byte budget helpers", () => {
  it("counts UTF-8 bytes correctly for multibyte chars", () => {
    expect(utf8ByteLength("hello")).toBe(5);
    expect(utf8ByteLength("café")).toBe(5);   // é = 2 bytes
    expect(utf8ByteLength("🚀")).toBe(4);     // emoji = 4 bytes
    expect(utf8ByteLength("中文")).toBe(6);   // CJK = 3 bytes each
  });

  it("flags backend_search_terms over 500 bytes", () => {
    const within = "a".repeat(500);
    const over = "a".repeat(501);
    expect(checkByteBudget(within, 500)).toEqual({ used: 500, max: 500, ok: true });
    expect(checkByteBudget(over, 500)).toEqual({ used: 501, max: 500, ok: false });
  });

  it("rejects multibyte chars pushing over byte limit even with low char count", () => {
    // 167 emoji = 668 bytes (4 each), only 167 chars
    const tightByteOver = "🚀".repeat(167);
    const r = checkByteBudget(tightByteOver, 500);
    expect(r.ok).toBe(false);
    expect(r.used).toBe(668);
  });

  it("checkCharBudget honors min and max chars", () => {
    expect(checkCharBudget("a".repeat(195), 190, 200)).toEqual({ used: 195, min: 190, max: 200, ok: true });
    expect(checkCharBudget("a".repeat(180), 190, 200).ok).toBe(false);
    expect(checkCharBudget("a".repeat(220), 190, 200).ok).toBe(false);
  });

  it("handles empty string at the byte and char budget edges", () => {
    expect(checkByteBudget("", 500)).toEqual({ used: 0, max: 500, ok: true });
    expect(checkCharBudget("", 190, 200)).toEqual({ used: 0, min: 190, max: 200, ok: false });
    expect(checkCharBudget("", 0, 200)).toEqual({ used: 0, min: 0, max: 200, ok: true });
  });
});
