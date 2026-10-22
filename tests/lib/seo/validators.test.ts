// tests/lib/seo/validators.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getValidator } from "@/lib/seo/validators";

describe("phase validators (generated from schema.json)", () => {
  it("accepts a valid S6 listings payload", async () => {
    const v = await getValidator("S6");
    const result = v.safeParse({
      listings: [
        {
          asin_id: "11111111-1111-1111-1111-111111111111",
          title: "Acme Knee Brace - Compression Support",
          item_highlight: "Breathable Sleeve, All-Day Comfort, Machine Washable",
          bullets: {
            detailed: Array(5).fill("HEADER: " + "x".repeat(390)),
            concise: Array(5).fill("HEADER: " + "x".repeat(190)),
            content: Array(5).fill("HEADER: " + "x".repeat(90)),
            key_features: Array(5).fill("HEADER: " + "x".repeat(40)),
          },
          product_description: "x".repeat(1050),
          backend_search_terms: "kw1 kw2 kw3",
          backend_categories: { core: "", supplement: "", symptom: "", audience: "", longtail: "" },
          byte_usage: {},
          compliance_violations: [],
        },
      ],
      qa_pairs: Array(13).fill({
        id: "QA_001", question: "q", answer_short: "a", answer_long: "long",
        intent_tier: "consideration", source_rufus_question_id: null, source_review_themes: [],
      }),
      passage_map_by_asin: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects S6 title longer than 75 chars", async () => {
    const v = await getValidator("S6");
    const result = v.safeParse({
      listings: [
        {
          asin_id: "11111111-1111-1111-1111-111111111111",
          title: "a".repeat(76),
          item_highlight: "Breathable Sleeve, All-Day Comfort",
          bullets: { detailed: [], concise: [], content: [], key_features: [] },
          product_description: "x".repeat(1050),
          backend_search_terms: "",
          backend_categories: { core: "", supplement: "", symptom: "", audience: "", longtail: "" },
          byte_usage: {},
          compliance_violations: [],
        },
      ],
      qa_pairs: [],
      passage_map_by_asin: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects S7 modules that don't end in premium_qa", async () => {
    const v = await getValidator("S7");
    const result = v.safeParse({
      modules: [
        { position: 1, module_type: "hero", cosmo_relationship: "IS_A", fields: {}, images: [] },
        { position: 2, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 3, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 4, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 5, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 6, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 7, module_type: "feature_grid_4", cosmo_relationship: null, fields: {}, images: [] }, // WRONG
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects S8 with wrong technical names", async () => {
    const v = await getValidator("S8");
    const images = Array.from({ length: 9 }, (_, i) => ({
      image_number: i + 1,
      technical_name: i === 0 ? "MAIN" : `WRONG${i}`, // bogus
      image_type: "x", image_purpose: "x", cosmo_relationship: "IS_A", buyer_stage: "Awareness",
      overlay_text: i === 0 ? "Not Applicable" : "x".repeat(50),
      alt_text: "x".repeat(98), image_direction: "x", ai_image_prompt: "x",
    }));
    const result = v.safeParse({ images });
    expect(result.success).toBe(false);
  });
});
