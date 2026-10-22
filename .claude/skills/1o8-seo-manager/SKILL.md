---
name: 1o8-seo-manager
description: "9-phase Amazon SEO listing pipeline (S1 Intake → S2 Keywords → S3 Reviews → S4 Rufus → S5 COSMO → S6 Listing Content → S7 Premium A+ optional → S8 Listing Images optional → S9 Score). Produces Amazon-publishable, Rufus + COSMO-optimized listings with hard-gated compliance scoring. Trigger when user asks to optimize an Amazon listing, runs SEO for a client ASIN, builds a listing strategy from Helium 10 data, generates A+ content, plans listing images, or scores listing coverage. Operates against a project_id from the seo_projects table; both in-chat and in-app /seo/manager runners share this spec."
---

# 1o8 SEO Manager — Canonical Skill

You are running the 1o8 9-phase Amazon SEO pipeline. The pipeline operates on a `project_id` and reads/writes typed Postgres tables. Source-of-truth process doc: `AMAZON_SEO_GPT_v5_COMPLETE.md` — every rule below traces to a v5 section.

## Operating Modes

- **In-chat:** invoked by Claude Code with a `project_id`. You execute phases by calling `/api/seo/projects/{id}/<phase>/run`. The runner persists output.
- **In-app `/seo/manager`:** the server-side runner imports this skill and executes each phase via the Anthropic SDK. Same prompts, same outputs, same tables.

Both modes obey the same orchestration rules below.

## Hard Rules (never violate)

1. **Rufus Phase 1 questions are immutable** — exactly the 5 from `prompts/canonical-rufus-questions.ts` (v5 §4.3.1.3).
2. **COSMO must evaluate all 16 relationship categories** per ASIN (v5 §5.3). Categories may be empty for an ASIN, but every category MUST appear in `seo_cosmo_maps.relationship_categories_evaluated`.
3. **Bullets = 4 versions × 5** = 20 fields per ASIN. Every bullet starts with `ALL CAPS HEADER:` prefix. Bullets 1-4 are universal across the variation family; bullet 5 is variation-specific.
4. **Title** — ≤75 chars (Amazon 2026-07-27 mandate), hyphen-only punctuation, no colons, word-repetition cap 2. **Item Highlight** — ≤125 chars, comma-separated Title-Case phrases, no colons, no words repeated from the title.
5. **Backend search terms** — single string, ≤500 bytes UTF-8. One byte over = full de-index.
6. **A+ Premium plan** — exactly 7 modules. Module 7 MUST be `premium_qa` (5 pairs, Q=115-120 chars, A=245-250 chars, Decision-stage). At most one `comparison_table_*` module total.
7. **Images** — exactly 9 per ASIN. Technical names fixed: `MAIN`, `PT01`, `PT02`, `PT03`, `PT04`, `PT05`, `PT06`, `PT07`, `PT08`. All PNG, 2000×2000, RGB. Alt text 95-100 chars. Overlay text ≤100 chars (Not Applicable for MAIN).
8. **Compliance** — `rubrics/amazon-compliance.md` lists ~200 prohibited words (v5 §6.3). Auto-corrections apply at write. Bypassing requires explicit user override per field.
9. **Brand guidelines overlay** — `seo_projects.brand_guidelines_lock.words_to_avoid` augments the prohibited list. Amazon Section 6 always wins on conflict.
10. **Atomic S6 write** — on S6 completion, `seo_listings`, `seo_qa.aplus_qa_subset`, `seo_aplus_plans` (headers only), and `seo_passage_map` are written in one PG transaction. All-or-nothing.
11. **Possessive product voice** — In any bullet body or product description, never start a sentence with `This [product]…`. Use `Our [product]…` instead. Example: `This Arm Sleeve is a heat saver…` → `Our Arm Sleeve is a heat saver…`. Applies after the `ALL CAPS HEADER:` prefix in bullets and to every sentence in the description.

## Phase Orchestration

For each `project_id`:

1. Read `seo_projects` row → load brand guidelines lock + `current_phase`.
2. Run phases sequentially S1 → S9.
3. Auto-flow exception: at S4 Phase 1, prompt-and-wait. The user must paste 5 immutable questions into live Amazon Rufus and paste responses back. Resume on response.
4. Each phase has its own file in `phases/`. Read the file. Substitute `{{slots}}` with project context. Issue exactly one Claude call per phase batch — **except** the S6 **titles** and **bullets** batches, which run a fixed multi-pass chain (generation → humanize → **CMOS editorial** → coherence for bullets) per `phases/s6-listing-content.md`. The CMOS pass is mandatory, not optional; rules in `rubrics/cmos-editorial.md`.
5. Validate output against the phase's `OUTPUT SCHEMA` block. On schema fail, retry once with the validation error appended to the prompt. On second fail, surface to user.
6. Persist to typed table via the API. Stamp `s{N}_approved_at` on success.
7. **Surgical re-run:** If phase N is re-run, all phases > N are marked stale. Skipped phases stay skipped on cascade unless re-enabled.

## Phase Index

| Phase | File | v5 ref | Output table | Skippable |
|---|---|---|---|---|
| S1 | `phases/s1-intake.md` | §1, §1.13 | `seo_projects` + `seo_asins` | No |
| S2 | `phases/s2-keywords.md` | §2 | `seo_keywords` | No |
| S3 | `phases/s3-reviews.md` | §3 | `seo_reviews` | No |
| S4 | `phases/s4-rufus.md` | §4 | `seo_rufus` | No |
| S5 | `phases/s5-cosmo.md` | §5 | `seo_cosmo_maps` | No |
| S6 | `phases/s6-listing-content.md` | §7 | `seo_listings` + `seo_qa` + `seo_aplus_plans` (headers) + `seo_passage_map` | No |
| S7 | `phases/s7-aplus.md` | §8 | `seo_aplus_plans` (full) | **Yes** |
| S8 | `phases/s8-images.md` | §9 | `seo_images` | **Yes** |
| S9 | `phases/s9-score.md` | new | `seo_scores` | No |

## Rubric Index

- `rubrics/rufus-coverage.md` — 5 canonical query types, 80% gate
- `rubrics/cosmo-coverage.md` — 70% kw inclusion, 3-5 relationships per 100 words, 75% gate
- `rubrics/amazon-compliance.md` — prohibited words + auto-correction map
- `rubrics/byte-budgets.md` — title ≤75, item_highlight ≤125, desc 1000-1200, backend ≤500B, bullet variants
- `rubrics/cmos-editorial.md` — Chicago Manual of Style (18th ed.) grammar/style pass for S6 titles & bullets (§5.225, §5.195, §7.85, §5.249-252, §5.254)

## Schema Contract

`schema.json` lists every typed-table column with type, range, and examples. The runner validates writes against this file before committing. Mismatches throw before any DB call.
