# SEO Content Human Voice Upgrade

**Date:** 2026-05-18
**Scope:** Titles and bullets batches in `/api/seo/claude/seo/route.ts`
**Goal:** Generate premium, native American English copy from the first pass — no stiff phrasing, no keyword stuffing, no non-native patterns.

---

## Problem

Current S6 generation produces content that:
- Reads like keyword lists assembled into sentences rather than copy written for a human reader
- Uses over-formal, non-native phrasing (`"facilitates the enhancement of"` instead of `"makes it easier to"`)
- Lacks American English rhythm — missing contractions, colloquialisms, natural sentence variation
- Feels templated — bullets structurally identical across ASINs, hollow despite correct format
- Has literal-translation patterns common in Chinese-origin product copy

These issues are caught post-hoc by the `humanVoice` audit score, but not prevented during generation.

---

## Solution: Three-Layer Approach

### Layer 1 — Voice Contract Block (prompt upgrade)

A new shared constant `NATIVE_VOICE_CONTRACT` injected into the system prompts for both the titles and bullets batches.

**Contents:**

**Persona statement:**
> You are a senior American consumer brand copywriter — not an SEO technician. You write the way a native American speaker thinks: direct, benefit-led, natural rhythm.

**5 writing principles:**
1. Lead with the benefit, not the feature — `"Stays put all day"` not `"Features enhanced adhesive technology"`
2. Use contractions where natural — `"doesn't"`, `"you'll"`, `"it's"`
3. Vary sentence rhythm — never four long sentences in a row
4. American idiom over formal register — `"works great for"` not `"is well-suited to facilitate"`
5. Every sentence must earn its place — if it only strings keywords with no real meaning, rewrite it

**Anti-pattern calibration examples (bad → good):**

*Title — keyword dump vs. descriptive narrative:*
- ❌ `"Premium Organic Turmeric Curcumin Supplement Capsules Black Pepper BioPerine Joint Support Inflammation Relief Non-GMO"`
- ✅ `"Premium Turmeric Curcumin with BioPerine - Supports Joint Comfort and Healthy Inflammation Response for Active Adults - 120 Capsules"`

*Detailed bullet — feature list vs. benefit story:*
- ❌ `"SUPERIOR ABSORPTION: Formulated with advanced bioavailability enhancement technology utilizing black pepper extract for maximum nutrient uptake and absorption optimization"`
- ✅ `"ABSORBS UP TO 20X BETTER: Black pepper BioPerine dramatically boosts how much turmeric your body actually uses — so you get the full benefit of every capsule, not just what passes through"`

*Detailed bullet — stiff/formal vs. natural/conversational:*
- ❌ `"VERSATILE APPLICATION: This product demonstrates suitability for utilization across multiple contexts and environments including indoor and outdoor recreational activities"`
- ✅ `"READY FOR ANYTHING: Whether you're hiking, at the gym, or running errands, these hold up all day without slipping, bunching, or leaving marks"`

---

### Layer 2 — Humanization Pass (post-generation polish)

A new function `humanizeRows(batch, rows, mustKeepKeywords, apiKey, model, maxTokens)` called after `callClaudeAndParse` for titles and bullets, before `computeLengths`.

**Humanizer system prompt:**
> You are a native American English editor. Your only job is to rewrite the content below so it sounds like it was written by a senior copywriter at a premium US consumer brand — not an AI, not an SEO tool, not a translator.
>
> Fix: stiff/formal phrasing, non-native sentence structure, hollow keyword-only sentences, over-long words where short ones work better, missing contractions.
>
> DO NOT change: keywords (they must appear verbatim), JSON structure, field names, ASIN values, ALL CAPS bullet headers.
> DO NOT exceed the character limits for each field.
> DO NOT drop any keyword from the must-keep list.

**Must-keep keyword enforcement:** the full keyword list used during generation is passed in. Same mechanism as revision mode.

**Failure handling:** if the humanizer call throws or returns unparseable JSON, the original generated rows are used as-is. The error is logged but does not surface to the user.

**Character length:** after humanization, the existing `computeLengths` + title auto-fix retry logic runs on the humanized rows — no new length-enforcement code needed.

---

### Layer 3 — Integration

All changes in one file: `src/app/api/seo/claude/seo/route.ts`

| Change | Location |
|--------|----------|
| Add `NATIVE_VOICE_CONTRACT` constant | Top of file, after imports |
| Append `NATIVE_VOICE_CONTRACT` to titles `systemPrompt` | `case "titles"` block |
| Append `NATIVE_VOICE_CONTRACT` to bullets `systemPrompt` | `case "bullets"` block |
| Add `humanizeRows()` function | After `buildRevisionBlock`, before `POST` handler |
| Call `humanizeRows()` after titles `callClaudeAndParse` | `case "titles"` in POST handler |
| Call `humanizeRows()` after bullets `callClaudeAndParse` | `case "bullets"` in POST handler |

**Unchanged:** description batch, backend batch, revision mode, byte-cap enforcement, JSON parsing, rate limiting, logging, `computeLengths`, title auto-fix retry.

---

## Cost Impact

- Titles batch: +1 Claude call (humanization pass)
- Bullets batch: +1 Claude call (humanization pass)
- Description batch: no change
- Backend batch: no change
- Maximum +2 Claude calls per full S6 run

---

## Success Criteria

- `humanVoice` audit score increases from baseline on first generation (no revision required)
- No Tier 1 keywords dropped after humanization
- Title lengths remain within 190–200 chars after humanization
- Bullet lengths remain within their per-version ranges
- No regression on compliance (no colons in titles, no prohibited words)
