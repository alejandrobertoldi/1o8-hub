import { describe, it, expect } from "vitest";
import { computeCostUsd, MODEL_RATES } from "@/lib/seo/pricing";

describe("Anthropic token → USD pricing", () => {
  it("computes cost for Sonnet 4.6 with cache hits", () => {
    // Sonnet 4.6: $3/M input, $15/M output, $3.75/M cache write, $0.30/M cache read
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1000,
      cache_creation_input_tokens: 5000,
      cache_read_input_tokens: 10000,
      output_tokens: 2000,
    });
    // 1000 * 3/1M + 5000 * 3.75/1M + 10000 * 0.30/1M + 2000 * 15/1M
    // = 0.003 + 0.01875 + 0.003 + 0.03 = 0.05475
    expect(cost).toBeCloseTo(0.05475, 4);
  });

  it("computes cost for Haiku 4.5 (no cache usage)", () => {
    // Haiku 4.5: $0.80/M input, $4/M output
    const cost = computeCostUsd("claude-haiku-4-5-20251001", {
      input_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 500,
    });
    expect(cost).toBeCloseTo(0.0008 + 0.002, 4);
  });

  it("throws on unknown model", () => {
    expect(() =>
      computeCostUsd("claude-fake-99", {
        input_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 100,
      })
    ).toThrow(/unknown model/i);
  });

  it("exports MODEL_RATES with Sonnet + Haiku + Opus entries", () => {
    expect(MODEL_RATES["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_RATES["claude-haiku-4-5-20251001"]).toBeDefined();
    expect(MODEL_RATES["claude-opus-4-7"]).toBeDefined();
  });
});
