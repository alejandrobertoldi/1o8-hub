import { describe, it, expect, beforeAll } from "vitest";
import { getValidator } from "./validators";
import { type ZodTypeAny } from "zod";

const baseListing = (over: Record<string, unknown> = {}) => ({
  asin_id: "11111111-1111-1111-1111-111111111111",
  title: "Acme Knee Brace - Compression Support for Running and Recovery",
  item_highlight: "Breathable Sleeve, All-Day Comfort, Machine Washable, Unisex Fit",
  bullets: {
    detailed: Array(5).fill("FEATURE HEADER: " + "x".repeat(380)),
    concise: Array(5).fill("FEATURE HEADER: " + "x".repeat(180)),
    content: Array(5).fill("FEATURE HEADER: " + "x".repeat(80)),
    key_features: Array(5).fill("FEATURE HEADER: " + "x".repeat(30)),
  },
  product_description: "x".repeat(1100),
  backend_search_terms: "knee brace support",
  backend_categories: { core: "a", supplement: "b", symptom: "c", audience: "d", longtail: "e" },
  ...over,
});

const basePayload = (listing: Record<string, unknown>) => ({
  listings: [listing],
  qa_pairs: Array(12).fill(0).map((_, i) => ({
    id: `QA_${i}`, question: "q", answer_short: "a", answer_long: "a",
    intent_tier: "consideration", source_rufus_question_id: null, source_review_themes: [],
  })),
  passage_map_by_asin: {},
});

describe("buildS6 — 75/125 mandate", () => {
  let v: ZodTypeAny;

  beforeAll(async () => {
    v = await getValidator("S6");
  });

  it("accepts a 75-char title", () => {
    expect(v.safeParse(basePayload(baseListing({ title: "a".repeat(75) }))).success).toBe(true);
  });
  it("rejects a 76-char title", () => {
    expect(v.safeParse(basePayload(baseListing({ title: "a".repeat(76) }))).success).toBe(false);
  });
  it("accepts a 125-char item_highlight", () => {
    expect(v.safeParse(basePayload(baseListing({ item_highlight: "a".repeat(125) }))).success).toBe(true);
  });
  it("rejects a 126-char item_highlight", () => {
    expect(v.safeParse(basePayload(baseListing({ item_highlight: "a".repeat(126) }))).success).toBe(false);
  });
  it("rejects a colon in item_highlight", () => {
    expect(v.safeParse(basePayload(baseListing({ item_highlight: "Feature: value" }))).success).toBe(false);
  });
});
