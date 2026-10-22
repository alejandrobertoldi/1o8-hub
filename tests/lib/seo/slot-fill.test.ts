import { describe, it, expect } from "vitest";
import { substituteSlots } from "@/lib/seo/slot-fill";

describe("slot-fill", () => {
  it("substitutes single slot", () => {
    const out = substituteSlots("Hello {{name}}", { name: "world" });
    expect(out).toBe("Hello world");
  });

  it("substitutes multiple occurrences of same slot", () => {
    const out = substituteSlots("{{x}} and {{x}}", { x: "a" });
    expect(out).toBe("a and a");
  });

  it("serializes objects as JSON", () => {
    const out = substituteSlots("data: {{payload}}", { payload: { a: 1 } });
    expect(out).toContain('"a":1');
  });

  it("throws on missing slot (no silent empty)", () => {
    expect(() => substituteSlots("{{a}} {{b}}", { a: "x" })).toThrow(/missing slot.*b/);
  });

  it("leaves text without slots unchanged", () => {
    const out = substituteSlots("plain text", {});
    expect(out).toBe("plain text");
  });
});
