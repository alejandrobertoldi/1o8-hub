// src/lib/seo/validators.ts
// Zod schemas synthesized from .claude/skills/1o8-seo-manager/schema.json
// at module init via loadSkill(). Each phase output payload has one
// top-level validator. The runner calls validator.safeParse(claudeOutput).

import { z, type ZodTypeAny } from "zod";
import { loadSkill } from "@/lib/seo/skill-loader";
import { utf8ByteLength } from "@/lib/seo/byte-budget";

const APLUS_MODULE_TYPES = [
  "hero", "image_text_split", "comparison_table_4cell", "comparison_table_5cell",
  "feature_grid_4", "feature_grid_5", "lifestyle_carousel", "premium_qa",
] as const;

const TECHNICAL_NAMES = ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08"] as const;

const cache = new Map<string, ZodTypeAny>();

export async function getValidator(
  phase: "S1" | "S2" | "S3" | "S4P1" | "S4P2" | "S4P3" | "S5" | "S6" | "S7" | "S8" | "S9"
): Promise<ZodTypeAny> {
  if (cache.has(phase)) return cache.get(phase)!;
  const skill = await loadSkill();
  const v = build(phase, skill.schema);
  cache.set(phase, v);
  return v;
}

function build(phase: string, schema: { tables: Record<string, any> }): ZodTypeAny {
  switch (phase) {
    case "S1":
      return z.object({
        asins: z.array(
          z.object({
            asin: z.string(),
            baseline_analysis: z.object({
              quality_score: z.number().min(0).max(100),
              keyword_integration: z.enum(["strong", "moderate", "weak"]),
              compliance_flags: z.array(z.string()),
              top_improvements: z.array(z.string()),
            }),
          })
        ),
      });
    case "S2":
      return z.object({
        keywords: z.array(
          z.object({
            text: z.string().min(1),
            search_volume: z.number().int().nonnegative(),
            priority_tier: z.enum(["T1", "T2", "T3", "T4"]),
            search_intent: z.enum(["Informational", "Navigational", "Commercial", "Transactional"]),
            primary_use_location: z.string(),
            match_type: z.enum(["Exact", "Phrase", "Broad"]),
            cosmo_domain: z.enum(["Benefit", "Feature", "Attribute", "Audience", "Occasion"]),
            buyer_stage: z.enum(["Awareness", "Consideration", "Decision"]),
            semantic_group: z.string(),
            cerebro_iq: z.number().int().nullable().optional(),
            competing_products: z.number().int().nullable().optional(),
            title_density: z.number().int().nullable().optional(),
            cpr: z.number().int().nullable().optional(),
            competitor_rank_avg: z.number().nullable().optional(),
            ppc_suggested_bid: z.number().nullable().optional(),
            ppc_suggested_min_bid: z.number().nullable().optional(),
            ppc_suggested_max_bid: z.number().nullable().optional(),
            composite_score: z.number().nullable().optional(),
            is_negative: z.boolean(),
            negative_reason: z.string().nullable(),
            is_competitor: z.boolean(),
            notes: z.string().default(""),
            keyword_source: z.string().default("Helium 10"),
          })
        ),
      });
    case "S3":
      return z.object({
        reviews: z.array(
          z.object({
            review_id: z.string().nullable().optional(),
            sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
            key_themes: z.string(),
            usage_mentioned: z.string().nullable().optional(),
            rufus_usable_insight: z.string().nullable().optional(),
            bullet_mapping: z.string().nullable().optional(),
          })
        ),
      });
    case "S4P1":
      return z.object({
        phase1_questions: z.array(
          z.object({ id: z.string(), text: z.string(), intent_tier: z.string(), batch_char_count: z.number().int() })
        ).length(5),
        phase1_answers: z.array(z.string()).length(5),
      });
    case "S4P2":
      return z.object({
        phase2_questions: z.array(
          z.object({ id: z.string(), text: z.string(), intent_tier: z.string(), batch_char_count: z.number().int().max(496) })
        ).min(10).max(15),
        phase2_answers: z.array(z.string()),
      });
    case "S4P3":
      return z.object({
        phase3_questions: z.array(z.any()).default([]),
        phase3_answers: z.array(z.any()).default([]),
        rows: z.array(z.record(z.string(), z.any())),
        optimization_summary: z.object({
          seo_strategy: z.string(),
          listing_plan: z.string(),
          image_strategy: z.string(),
          audience_segmentation: z.string(),
          action_list: z.array(z.string()),
        }),
      });
    case "S5":
      return z.object({
        triples: z.array(
          z.object({
            id: z.string(),
            entity1: z.string(),
            relationship: z.string(),
            entity2: z.string(),
            confidence: z.number().min(0).max(1),
            confidence_level: z.enum(["High", "Medium", "Low"]),
            supporting_keyword_tier: z.string().nullable(),
          })
        ),
        keyword_coverage: z.record(z.string(), z.number()),
        competitive_positioning: z.string(),
        relationship_categories_evaluated: z.array(z.string()).length(16),
      });
    case "S6":
      return buildS6(schema.tables);
    case "S7":
      return buildS7();
    case "S8":
      return buildS8();
    case "S9":
      return buildS9();
    default:
      throw new Error(`no validator for phase: ${phase}`);
  }
}

// _tables (skill.schema.tables) is plumbed in for forward-compat: future
// versions may generate the S6 validator directly from schema.json rather
// than hardcoding the listing-content rules below. Leave the param in
// place even though the current implementation ignores it.
function buildS6(_tables: Record<string, any>): ZodTypeAny {
  // HEADER regex: ALL-CAPS label, then ":" + exactly one whitespace char.
  // Plan §D-6 (slot-fill) and §D-7 (Claude prompt) guarantee single-space
  // separators. If the upstream prompt ever emits tabs or multi-space, widen
  // `\s` to `\s+` here.
  const HEADER = /^[A-Z][A-Z0-9 ]*:\s/;
  const bullet = (min: number, max: number) =>
    z.string().min(min).max(max).regex(HEADER, "must start with ALL CAPS HEADER:");
  // Permissive UUID pattern (Zod v4 z.string().uuid() enforces strict RFC 4122 variant bits)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return z.object({
    listings: z.array(
      z.object({
        asin_id: z.string().regex(UUID_RE, "must be a UUID"),
        title: z
          .string()
          .min(1)
          .max(75)
          .refine((s) => !s.includes(":"), "title may not contain ':'")
          .refine((s) => {
            // word-repetition cap 2
            const words = s.toLowerCase().split(/\W+/).filter(Boolean);
            const counts: Record<string, number> = {};
            for (const w of words) counts[w] = (counts[w] ?? 0) + 1;
            return Object.values(counts).every((c) => c <= 2);
          }, "word repeated more than 2 times"),
        item_highlight: z
          .string()
          .min(1)
          .max(125)
          .refine((s) => !s.includes(":"), "item_highlight may not contain ':'"),
        bullets: z.object({
          detailed: z.array(bullet(390, 400)).length(5),
          concise: z.array(bullet(190, 200)).length(5),
          content: z.array(bullet(90, 100)).length(5),
          key_features: z.array(bullet(40, 50)).length(5),
        }),
        product_description: z
          .string()
          .min(1000)
          .max(1200)
          .refine((s) => !s.includes(":"), "description may not contain ':'"),
        backend_search_terms: z.string().refine((s) => utf8ByteLength(s) <= 500, "backend_search_terms > 500 bytes"),
        backend_categories: z.object({
          core: z.string(), supplement: z.string(), symptom: z.string(),
          audience: z.string(), longtail: z.string(),
        }),
        byte_usage: z.record(z.string(), z.object({ used: z.number(), max: z.number(), ok: z.boolean() })).optional().default({}),
        compliance_violations: z.array(z.any()).default([]),
      })
    ),
    qa_pairs: z
      .array(
        z.object({
          id: z.string(),
          question: z.string(),
          answer_short: z.string(),
          answer_long: z.string(),
          intent_tier: z.string(),
          source_rufus_question_id: z.string().nullable(),
          source_review_themes: z.array(z.string()),
        })
      )
      .min(12)
      .max(15),
    passage_map_by_asin: z.record(z.string(), z.array(z.any())),
  });
}

function buildS7(): ZodTypeAny {
  return z.object({
    modules: z
      .array(
        z.object({
          position: z.number().int().min(1).max(7),
          module_type: z.enum(APLUS_MODULE_TYPES),
          cosmo_relationship: z.string().nullable(),
          fields: z.record(z.string(), z.string()),
          images: z.array(
            z.object({
              technical_name: z.string(),
              alt_text: z.string().min(95).max(100),
              overlay_text: z.string().max(100),
              ai_prompt: z.string(),
              dimensions: z.string(),
            })
          ),
        })
      )
      .length(7)
      .refine((mods) => mods[6]?.module_type === "premium_qa", "module 7 must be premium_qa")
      .refine(
        (mods) => mods.filter((m) => m.module_type.startsWith("comparison_table_")).length <= 1,
        "at most one comparison_table_* module"
      ),
  });
}

function buildS8(): ZodTypeAny {
  return z.object({
    images: z
      .array(
        z.object({
          image_number: z.number().int().min(1).max(9),
          technical_name: z.enum(TECHNICAL_NAMES),
          image_type: z.string(),
          image_purpose: z.string(),
          cosmo_relationship: z.string(),
          buyer_stage: z.enum(["Awareness", "Consideration", "Decision"]),
          overlay_text: z.string().max(100),
          alt_text: z.string().min(95).max(100),
          image_direction: z.string(),
          ai_image_prompt: z.string(),
        })
      )
      .length(9)
      .refine(
        (imgs) => imgs[0]?.technical_name === "MAIN" && imgs[0]?.overlay_text === "Not Applicable",
        "MAIN must be index 0 with overlay_text 'Not Applicable'"
      )
      .refine((imgs) => new Set(imgs.map((i) => i.technical_name)).size === 9, "duplicate technical_name")
      .refine(
        (imgs) => imgs.every((i, idx) => i.image_number === idx + 1),
        "image_number must match position 1..9"
      ),
  });
}

function buildS9(): ZodTypeAny {
  return z.object({
    rufus_coverage_pct: z.number().min(0).max(100),
    rufus_5_canonical_coverage: z.record(
      z.string(),
      z.object({ covered: z.boolean(), locations: z.array(z.string()) })
    ),
    cosmo_coverage_pct: z.number().min(0).max(100),
    cosmo_density_per_100_words: z.number().min(0),
    cosmo_relationship_categories_evaluated: z.array(z.string()).length(16),
    buyer_journey_alignment: z.record(z.string(), z.any()),
    byte_budget_status: z.record(z.string(), z.object({ used: z.number(), max: z.number(), ok: z.boolean() })),
    prohibited_word_violations: z.array(z.any()),
    missing_rufus_questions: z.array(z.string()),
    missing_cosmo_triples: z.array(z.string()),
    overall_grade: z.enum(["A", "B", "C", "D", "F"]),
    probe_transcript: z.array(z.any()).nullable().optional(),
  });
}

export function clearValidatorCache() {
  cache.clear();
}
