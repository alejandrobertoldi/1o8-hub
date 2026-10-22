# 1o8 SEO Manager — Design Spec

**Date:** 2026-05-06
**Status:** Brainstorm complete, awaiting user spec review before /writing-plans
**Source process doc:** `AMAZON_SEO_GPT_v5_COMPLETE.md` (canonical 1o8 SEO config)

## Goal

Transform the existing `/seo` S1→S6 pipeline into a seamless engine that produces fully Amazon-publishable, Rufus + COSMO-optimized listings, driven by **one canonical skill spec** used both in-chat and in-app. Optimize current process — do not rip and replace.

## Locked Decisions (from brainstorm Q1-Q9)

| # | Decision | Choice |
|---|---|---|
| Q1 | Skill consumer model | **C — Single canonical SKILL.md, dual runner** (Claude chat + in-app `/seo/manager`) |
| Q2 | Pain points to fix | **All six** — auto-flow, keyword-research as S2, Rufus/COSMO drives S6, Amazon-publishable schema, bulk mode, compliance scoring |
| Q3 | Autonomy model | **C — Auto-run with checkpoint review**, all phases visible at end, surgical re-run per phase |
| Q4 | Scoring approach | **C — Coverage score (auto, hard gate) + simulated probe (opt-in deep audit)** |
| Q5 | Schema scope | **E — Full overhaul, typed sub-tables**: listing fields, A+ plan, Q&A, passage trace, scores, images |
| Q6 | Q&A module | **D — Single canonical artifact, three consumers**: Customer Q&A export, Rufus passages, A+ FAQ module |
| Q7 | (Superseded by Q8) | — |
| Q8 | Keyword source | **A — V5 strict: Helium 10 Cerebro only**, no Claude fallback |
| Q9 | Pipeline expansion | **C — 9 phases**: S1-S6 keep, +S7 Premium A+ (optional), +S8 Listing Images (optional), +S9 Score (mandatory) |
| Hard requirement | Q&A module | Fully created during process — three downstream destinations |

## Skill Architecture

**Single source of truth:** `.claude/skills/1o8-seo-manager/SKILL.md` + sub-files. Read by:
1. **In-chat:** `Skill` tool invocation runs the pipeline against a project_id, hitting `/api/seo/*` endpoints.
2. **In-app `/seo/manager`:** server-side runner imports skill spec, executes each phase via Claude calls, persists to PG.

**File structure:**
```
.claude/skills/1o8-seo-manager/
├── SKILL.md                       # canonical orchestration + frontmatter
├── phases/
│   ├── s1-intake.md               # incl. brand guidelines lock (v5 §1.13)
│   ├── s2-keywords.md             # Helium 10 Cerebro only (v5 §2)
│   ├── s3-reviews.md              # CSV ingestion (v5 §3)
│   ├── s4-rufus.md                # 3 sub-phases, 5 immutable Phase 1 Qs (v5 §4.3.1.3)
│   ├── s5-cosmo.md                # all 16 relationship categories (v5 §5.3)
│   ├── s6-listing-content.md      # 4 batches: titles → bullets → desc → backend (v5 §7)
│   ├── s7-aplus.md                # exactly 7 modules, last = Premium Q&A (v5 §8) — OPTIONAL
│   ├── s8-images.md               # 9 images, MAIN+PT01-PT08 (v5 §9) — OPTIONAL
│   └── s9-score.md                # gate + auto-rerun on fail
├── rubrics/
│   ├── rufus-coverage.md          # 5 canonical query types (v5 Appendix A.1)
│   ├── cosmo-coverage.md          # density 3-5/100 words, 70% kw inclusion
│   ├── amazon-compliance.md       # ~200 prohibited words (v5 §6.3) + auto-correction
│   └── byte-budgets.md            # title 190-200, desc 1000-1200, backend 500B, etc.
└── schema.json                    # contract for typed tables, validated at write
```

## Schema Changes (Drizzle migrations, hand-written SQL)

### Modified

- **`seo_projects`** — add `s7_approved_at`, `s8_approved_at`, `s9_approved_at`, `s7_skipped`, `s8_skipped`. Replace existing `brand_guidelines` text with structured `brand_guidelines_lock` jsonb (status, voice, language_preferences, words_to_avoid, audience_notes, positioning, raw_text). Add `brand_guidelines_md_path` text (pointer to .md file).

- **`seo_keywords`** — add Helium 10 fields: `semantic_group`, `cerebro_iq`, `competing_products`, `title_density`, `cpr`, `competitor_rank_avg`, `ppc_suggested_bid`, `ppc_suggested_min_bid`, `ppc_suggested_max_bid`, `match_type` (Exact/Phrase/Broad), `cosmo_domain` (Benefit/Feature/Attribute/Audience/Occasion), `composite_score` numeric, `is_negative` bool, `negative_reason`, `is_competitor` bool. (No `keyword_source` flag — always Helium 10 per Q8=A.)

- **`seo_rufus`** — give each question stable id + intent_tier. Extend phase{1,2,3}_questions to `[{id, text, intent_tier, batch_char_count}]`. Add per-sub-phase approval flags.

- **`seo_cosmo_maps`** — give each triple stable id, evaluate all 16 relationship categories from v5 §5.3 (USED_FOR_FUNC, USED_TO, CAPABLE_OF, USED_FOR_EVE, USED_ON, USED_IN_LOC, USED_AS, IS_A, xIS_A, USED_IN_BODY, USED_WITH, USED_FOR_AUD, USED_BY, xINTERESTED_IN, xWANT). Add `confidence_level` (High/Medium/Low) per triple.

### New tables

- **`seo_listings`** (1 per asin) — Amazon flat-file ready:
  - `title` (190-200 chars, hyphen-only, no colons)
  - `bullets` jsonb: `{ detailed[5×390-400], concise[5×190-200], content[5×90-100], key_features[5×40-50] }` — 20 fields per ASIN. Each starts with `ALL CAPS HEADER:` prefix. Bullets 1-4 universal across variation family, bullet 5 variation-specific.
  - `product_description` (1000-1200, no colons)
  - `backend_search_terms` text (single string ≤500 bytes — exceeding de-indexes ALL)
  - `backend_categories` jsonb `{ core, supplement, symptom, audience, longtail }` (organizational, merged into single field for emission)
  - `subject_matter` text + `subject_matter_byte_length` (optional category-specific)
  - `byte_usage` jsonb (per-field char/byte tracking)
  - `category_required_attributes` jsonb (filled from Hub `category_meta` lookup)
  - `compliance_violations` jsonb (running list of Section 6 detections + auto-corrections)
  - `version` int

- **`seo_aplus_plans`** (1 per asin) — Premium A+:
  - `modules` jsonb: array of exactly 7 entries, position 7 MUST be `premium_qa`
  - Each module: `{ position, module_type, cosmo_relationship, fields: { headline, subheadline, body, ... }, images: [{ technical_name, alt_text, overlay_text, ai_prompt, dimensions }] }`
  - Validation: only 1 comparison_table_* allowed total; per-field char ranges (min = max-5)

- **`seo_images`** (9 per asin) — Listing images strategy:
  - `image_number` (1-9), `technical_name` (MAIN, PT01-PT08 — fixed mapping per v5 §9.6.3)
  - `image_type`, `image_purpose`, `cosmo_relationship`, `buyer_stage`
  - `file_format` (always PNG), `width_px`/`height_px` (default 2000×2000), `color_mode` (RGB)
  - `overlay_text` + `overlay_text_length` (Not Applicable for MAIN, ≤100 chars)
  - `alt_text` + `alt_text_length` (95-100 chars)
  - `image_direction` text, `ai_image_prompt` text

- **`seo_qa`** (1 per asin or per project) — Single Q&A artifact, three consumers:
  - `pairs` jsonb: 12-15 canonical pairs, each `{ question, answer_short, answer_long, intent_tier, source_rufus_question_id, source_review_themes[] }`
  - Derived views computed at S6:
    - `aplus_qa_subset`: 5 pairs for Premium A+ Q&A module (Q=115-120, A=245-250 chars, Decision-stage)
    - `customer_qa_export`: full set rendered for Amazon Customer Q&A posting
    - `passage_map_qa`: each pair tagged with covered Rufus questions + COSMO triples

- **`seo_passage_map`** (1 per asin) — Audit trail:
  - `passages` jsonb: `[{ section, text, rufus_question_ids[], cosmo_triple_ids[], keywords_used[] }]`
  - Generated atomically with S6 — model labels its own work

- **`seo_scores`** (1 per asin per run) — Compliance + coverage:
  - `rufus_coverage_pct`, `rufus_5_canonical_coverage` jsonb (which of v5 Appendix A.1 query types answered + where)
  - `cosmo_coverage_pct`, `cosmo_density_per_100_words`, `cosmo_relationship_categories_evaluated` (must include all 16)
  - `buyer_journey_alignment` jsonb (4 checks × 25 points: title=Decision, bullets1-2=Consideration, bullets3-5=Decision, desc=Awareness→Consideration)
  - `byte_budget_status` jsonb (per-field used/max/ok)
  - `prohibited_word_violations[]` (must be empty for pass)
  - `missing_rufus_questions[]`, `missing_cosmo_triples[]`
  - `overall_grade` (A-F)
  - `probe_transcript` jsonb (only on opt-in deep audit)
  - `computed_at`, `score_version`

### Deprecation

- `seo_asins.generatedContent` jsonb → kept read-only legacy for one migration cycle, then dropped.
- `seo_compliance_reports` → folded into `seo_scores`.

## 9-Phase Pipeline

| Phase | v5 mapping | Output | Skippable? |
|---|---|---|---|
| **S1 Intake** | §1 + §1.13 brand lock | `seo_projects`, `seo_asins`, `seo_projects.brand_guidelines_lock` | No |
| **S2 Keywords** | §2 (Helium 10 Cerebro CSV required, blocks until provided) | `seo_keywords` | No |
| **S3 Reviews** | §3 | `seo_reviews` | No |
| **S4 Rufus** | §4 — 3 sub-phases | `seo_rufus`. Phase 1 has 5 immutable Qs; user must paste into live Amazon Rufus and paste responses back | No |
| **S5 COSMO** | §5 — all 16 categories evaluated per ASIN | `seo_cosmo_maps` | No |
| **S6 Listing Content** | §7 — 4 internal batches (titles → bullets → desc → backend), each with APPROVED gate | `seo_listings` + Q&A subset of `seo_qa` + `seo_aplus_plans` headers + `seo_passage_map` (atomic write) | No |
| **S7 Premium A+** | §8 | `seo_aplus_plans` full | **Yes (optional starter)** |
| **S8 Listing Images** | §9 | `seo_images` | **Yes (optional starter)** |
| **S9 Score & Gate** | new (consolidates v5 scoring rubrics) | `seo_scores` — auto-reruns S6 once on fail; hard gate at 80% Rufus + 75% COSMO before `s9_approved_at` | No |

**S6 batch flow** matches v5 §7.1.1: Batch 1 Titles → APPROVED → Batch 2 Bullets (4 versions) → APPROVED → Batch 3 Description → APPROVED → Batch 4 Backend → APPROVED → assemble OUT_SEO.

**Auto-flow exception:** S4 Rufus interaction can't be fully automated (requires human pasting questions into live Amazon Rufus chat). Pipeline runs S1→S3 autonomously, prompts-and-waits at S4, then auto-runs S5→S9.

**Surgical re-run:** changing any phase cascades to all downstream. Skipped phases stay skipped on cascade unless re-enabled.

## Rufus + COSMO Scoring (S9)

**Rufus Coverage (5 canonical query types per v5 Appendix A.1):**
| Query type | Listing source | COSMO mapping |
|---|---|---|
| What is this for? | Title + Bullet 1 | IS_A + USED_FOR_FUNC |
| What do customers like / not like? | Bullets 2-3 + Description | USED_TO + CAPABLE_OF |
| What's the difference X vs Y? | Bullet 2 + A+ comparison | IS_A + xIS_A |
| Is this good for [use case]? | Bullets 3-4 + Description | USED_FOR_EVE + USED_IN_LOC |
| What comes with it? | Bullet 5 + Image 7 | USED_WITH |

**COSMO Coverage:** 70% of keywords per tier reflected in graph; 3-5 explicit relationships per 100 words of listing content; all 16 relationship categories evaluated.

**Hard gate:** 80% Rufus canonical coverage + 75% COSMO coverage required to stamp `s9_approved_at`. Below threshold: auto-rerun S6 once with explicit "you missed Q5, Q12, T3, T7" feedback. Still failing: surfaces in checkpoint review.

**Optional deep audit (Q4=C):** simulated Claude probe acts as Rufus answering canonical queries from listing alone; transcripts stored in `seo_scores.probe_transcript`.

## Brand Guidelines Storage

**File:** `.claude/agent-memory/seo/brand-guidelines/{client_id_code}.md` (matches existing Claudify bundle convention).

**Format:** YAML frontmatter (client_id_code, brand_name, status, last_updated, locked_by) + sections (Brand Voice, Language Preferences, Words to Avoid, Audience Notes, Positioning, Raw Brand Bible Excerpt).

**Flow:**
1. Source of truth = .md file. Skill reads it directly each run.
2. DB mirror = `seo_projects.brand_guidelines_lock` jsonb (parsed snapshot per project).
3. Created at S1 — paste/upload OR fetch from `ClientBibleURL`.
4. Updates via `/seo/manager` markdown editor OR direct file edit. Either path triggers re-parse + DB sync.
5. Reuse: same client_id_code = same .md = same lock for every new project.
6. Compliance overlay: v5 §6 prohibited list always wins over brand guidelines.
7. Updating invalidates downstream phases per v5 §1.13 staleness rule.

## Compliance (Hard Gate)

V5 §6 lists ~200 prohibited words. Auto-correction map provided (treats→supports, cures→helps, etc.). Hard rules:
- Colon `:` permitted in bullets ONLY (banned in titles + descriptions).
- ALL CAPS reserved for: BPA, NSF, USDA, EPA, plus bullet headers.
- No HTML, no emojis.
- Title: hyphen-only punctuation, word-repetition cap 2.
- Backend: ≤500 bytes single field — 1 byte over de-indexes everything.
- Auto-validation on every write to `seo_listings` and `seo_aplus_plans`.

## Open Questions / Risks

- **S4 Rufus automation is partially manual** — needs UI flow for paste-and-resume.
- **Helium 10 strict (Q8=A)** means S2 blocks until CSV provided. UI must clearly surface this.
- **A+ + Images optional but coupled to S6** — if listing copy changes, A+ alt text and image overlays may be stale.
- **Variation handling** — bullets 1-4 universal, bullet 5 per-child. Schema must support family-level + ASIN-level outputs.
- **Variety packs** need composition lock at S1; S6 reuses included singles' SEO.
- **Migration path** — existing projects on `seo_asins.generatedContent` need a backfill script before drop.

## Next Steps

1. User reviews this spec (this file).
2. On approval, run `/writing-plans` to produce implementation plan.
3. Plan should sequence: schema migration → SKILL.md authoring → server-side runner → in-app UI updates → S7-S9 phase wiring → S9 scoring engine.

## Reference

- Source: `AMAZON_SEO_GPT_v5_COMPLETE.md` (delivered in session)
- Existing schema: `src/lib/db/schema.ts:625-940`
- Existing pipeline routes: `src/app/seo/`, `src/app/api/seo/`
- Existing keyword-research skill: `.claude/skills/keyword-research/SKILL.md`
- Bundle config: `.claude/CLAUDE.local.md`
