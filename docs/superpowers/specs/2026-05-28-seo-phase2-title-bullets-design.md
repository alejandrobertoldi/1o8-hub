# SEO Manager Phase 2 — Title & Bullet Structure Design

**Date:** 2026-05-28
**Status:** Approved by user 2026-05-28 (Section 1, 2, 3 + 4 inline sub-decisions in Section 2)
**Predecessor:** [docs/superpowers/plans/2026-05-27-seo-phase1-keyword-workflow.md](../plans/2026-05-27-seo-phase1-keyword-workflow.md) (Phase 1 SHIPPED 2026-05-27, commits c2858013..78e9bac7)
**Successor:** Phase 3 (tone polish — P7/P14/P15/P16)

## Goal

Fix 8 listing-quality problems by tightening the title and bullet system prompts in the S7 content generator. No new modules, no schema changes — pure prompt engineering against the existing route at [src/app/api/seo/claude/seo/route.ts](../../../src/app/api/seo/claude/seo/route.ts).

## Problems in scope (verbatim from team review)

- **P1 — Title Structure:** No consistent title formula → enforce loose-guidance structure (Brand+Core Noun → Key Features → Material/Function → Use Case/Location → Size).
- **P2 — Keyword Coverage in Title:** Highest-priority keywords not always used → require ALL approved title keywords woven in naturally, with variations where length permits.
- **P3 — Bullet Length & Strength:** Bullets feel incomplete → enforce feature + benefit + practical use/value body shape; 390-400 chars for Detailed (current band satisfies team's "around 380").
- **P4 — Keyword Usage in Bullets:** Bullets don't consistently cover keyword targets → MIN keyword count scaled by length: Detailed 2 + partial / Concise 2 / Content 1 / Key Features 1.
- **P5 — Bullet Uniqueness:** Bullets overlap → keep current B1-B5 purposes (core value / fit-scope / workflow / care-durability / variation-specific); add explicit "each bullet covers a distinct angle" rule.
- **P6 — Repeated Phrases:** Bullets repeat openings → maintain grammatical parallelism but vary lexical openers (no two bullets in same version begin with the same first 3-word phrase).
- **P18 — Balanced Coverage:** Tool over-focuses on one dimension → require even distribution of features / benefits / use cases / value points across the 5 bullets.
- **P21 — Front-Loading Key Information:** Important info appears too late → highest-priority approved keyword inside title segment 1 (right after brand); ALL CAPS bullet header states the concrete benefit (not a generic label).

## Phase 1 follow-ups folded in

- [src/app/api/seo/claude/seo/route.ts:620](../../../src/app/api/seo/claude/seo/route.ts#L620) — title system prompt still says "Tier 1 keywords naturally where they fit." Phase 1's user prompt was already changed to "Approved Title Keywords (use ALL)". Phase 2 replaces L620 with a "KEYWORD COVERAGE" rule that matches.
- [src/app/api/seo/claude/seo/route.ts:782](../../../src/app/api/seo/claude/seo/route.ts#L782) — backend system prompt still says "Use ONLY T4 keywords not already covered." Phase 2 replaces with "Use ONLY the Approved Backend Keywords (already routed by KeywordPrimaryUseLocation) and never include words from title/bullets/description."

## Locked decisions (from approved brainstorm)

| # | Decision |
|---|---|
| 1 | Title separator: `-` (hyphen). Team's `|` was schema notation. |
| 2 | Title formula is **loose guidance** (Option C): segment 1 mandatory (Brand + Core Product Noun), then 3-5 hyphen-separated descriptive segments. Adjacent slots combinable to fit 200 chars. |
| 3 | Bullet B1-B5 purposes **keep current mapping** (Option B): core value / fit-scope / workflow / care-durability / variation-specific. |
| 4 | Add "feature + benefit + practical use/value" body shape rule to all bullet versions. |
| 5 | Detailed bullet length stays **390-400 chars** (current band; satisfies team's "around 380"). |
| 6 | P4 min keywords scaled by length: Detailed 2 + 1 partial / Concise 2 / Content 1 / Key Features 1. |
| 7 | P5 B5 fallback for Parent ASINs without variations: **"compatibility / accessory pairing"**. |
| 8 | P6 lexical variation rule: **no two bullets in same version begin with the same first 3-word phrase**. Grammatical parallelism still required (CMOS wins over P6). |
| 9 | Description length 1000→2000 chars is **Phase 5**, not Phase 2. |
| 10 | Tone polish (P7/P14/P15/P16) is **Phase 3**, not Phase 2. |

## Architecture

Pure prompt engineering. Two files modified:

### 1. `src/app/api/seo/claude/seo/route.ts`

**Title system prompt** (`case "titles"` block, ~L605-626):

Replace the current `TITLE RULES:` block with:

```
TITLE RULES:
- One title per ASIN. STRICT LENGTH: 190-200 characters. Titles under 190 chars WILL BE REJECTED.
- Allowed chars: letters, numbers, spaces, hyphen "-". One space before AND after each hyphen.
- STRUCTURE (loose guidance — follow order, condense or skip slots that don't apply):
  Segment 1 (REQUIRED): Brand Name + Core Product Noun phrase. Variation attributes NEVER here.
  Segments 2-5 (in order, hyphen-separated): Key Feature(s) → Material/Function → Use Case/Location → Size
  Total: 3-5 segments. Adjacent slots may be combined to fit 200 chars (e.g. "Stainless Steel for Outdoor Use" merges Material + Use Case).
- FRONT-LOAD (P21): the highest-priority approved keyword phrase MUST appear inside segment 1, right after the brand name — not buried at the end.
- KEYWORD COVERAGE (P2): weave EVERY approved title keyword into the title naturally. Cover important keyword variations where length permits. Never look stuffed.
- Parent ASIN: Size="Parent" in data but do NOT put "Parent" in the title text.
${sizePlacement ? `- Size placement override: ${sizePlacement}` : ""}
- VERIFY: count each title's characters. If under 190, add more descriptive segments.
```

The existing 195-char hot-sauce example below the rules stays unchanged — it already demonstrates the loose-guidance pattern.

**Bullet system prompt** (`case "bullets"` block, ~L652-691):

Replace the current `BULLET RULES:` block with:

```
BULLET RULES:
- 5 bullets per ASIN in 4 versions.
- LENGTH (strict): Detailed: 390-400 chars. Concise: 190-200 chars. Content: 90-100 chars. Key Features: 40-50 chars.
- FORMAT: ALL CAPS summary header + colon + normal-case body.
- HEADER RULE (P21 — front-loading): The ALL CAPS header MUST state the concrete benefit or specific claim, not a generic label.
  BAD: "QUALITY:" "DURABILITY:" "FEATURES:"
  GOOD: "ABSORBS 20X BETTER:" "HOLDS 200 LBS:" "STAYS PUT ALL DAY:"
- BODY SHAPE (P3 — applies to every bullet body across all 4 versions):
  feature -> benefit -> practical use/value
  Each bullet body must contain a concrete feature, a clear customer benefit, and a real-world use or value point — in that order.
- BULLET PURPOSES (P5 — each bullet covers a distinct angle; no overlap):
  B1: core value     [Consideration]
  B2: fit / scope    [Consideration]
  B3: workflow / instruction [Decision]
  B4: care / durability [Decision]
  B5: variation-specific for Child ASINs; falls back to "compatibility / accessory pairing" for Parent ASINs without variations [Decision]
- BALANCED COVERAGE (P18): across the 5 bullets, cover features, benefits, use cases, and value points roughly evenly — no two bullets should both be feature-heavy or both benefit-heavy.
- KEYWORD COUNT (P4): Detailed = MIN 2 keywords + 1 partial variation; Concise = MIN 2 keywords; Content = MIN 1 keyword; Key Features = MIN 1 keyword. Max 1x per keyword phrase per bullet. Use ONLY the Approved Bullet Keywords list (already provided).
- LEXICAL VARIATION (P6 — narrow rule, CMOS parallelism still wins):
  Maintain grammatical parallelism — all 5 Detailed bullet bodies (after the ALL CAPS header) must open with the SAME grammatical pattern (e.g. all imperative verbs, or all noun phrases). NATIVE_VOICE_CONTRACT principle 7 still applies.
  BUT vary the lexical opener — no two bullets in the same version may begin with the same first word OR the same first 3-word phrase.
- No word repeated >2x per bullet (case-insensitive). No cross-bullet keyword duplication.
```

**Backend system prompt** (`case "backend"` block, ~L777-792):

Replace line L782 only:

```
- Use ONLY the Approved Backend Keywords (already routed by KeywordPrimaryUseLocation) and never include words that already appear in the listing's title/bullets/description (per-ASIN exclusion enforced server-side).
```

The line below it at L783 ("Never include words from the exclusion list — Amazon already indexes those from surface content") **stays** — it enforces a different rule (no overlap with visible content) than L782 (use ONLY approved backend keywords). Both are kept.

### 2. `src/lib/seo-pipeline-config.ts`

**`TITLE_CONFIG.structure`** (L199-203) — replace with the loose-guidance structure as ordered list:

```typescript
structure: [
  "Segment 1 (REQUIRED): Brand Name + Core Product Noun phrase",
  "Segments 2-5 (in order, hyphen-separated): Key Feature(s), Material/Function, Use Case/Location, Size",
  "Total 3-5 segments — adjacent slots may be combined to fit 200 chars",
  "Variation attributes NEVER in segment 1",
  "Parent ASIN: Size='Parent' in data but do NOT put 'Parent' in title text",
],
```

Also update `keyword_rule` from `"Tier 1 keywords placed naturally"` to `"All approved title keywords woven in naturally; highest-priority keyword in segment 1 (P21 front-load)"`.

**`BULLET_CONFIG.purposes`** (L172-178 area) — update B5 description to include Parent fallback:

```typescript
purposes: {
  B1: "core value",
  B2: "fit / scope",
  B3: "workflow / instruction",
  B4: "care / durability",
  B5: "variation-specific for Child ASINs; compatibility / accessory pairing for Parent ASINs",
},
```

**`BULLET_CONFIG.rules`** (L184-190) — replace `"Min 1 keyword per bullet"` with scaled minimums:

```typescript
rules: [
  "Detailed: MIN 2 keywords + 1 partial variation per bullet",
  "Concise: MIN 2 keywords per bullet",
  "Content: MIN 1 keyword per bullet",
  "Key Features: MIN 1 keyword per bullet",
  "Max 1x per keyword phrase per bullet",
  "No word repeated >2x per bullet (case-insensitive)",
  "No cross-bullet keyword duplication",
  "B5 must be variation-specific for Child ASINs",
  "Each bullet body: feature -> benefit -> practical use/value (P3)",
  "ALL CAPS header states concrete benefit, not generic label (P21)",
  "Vary lexical opener: no two bullets in same version share first 3-word phrase (P6)",
  "Balanced coverage across 5 bullets: features, benefits, use cases, value (P18)",
],
```

## Testing strategy

No new pure-logic modules → no new Vitest files. Validation:

1. **Type check:** `npx tsc --noEmit` — no new errors in changed files.
2. **Build:** `npm run build` — no regressions.
3. **Dev smoke test:** `PORT=3000 npm run dev`. Pick a test project with S2 keywords already tiered. Generate titles + bullets; open [/admin/observability](/admin/observability) and verify:
   - Title system prompt contains the new STRUCTURE / FRONT-LOAD / KEYWORD COVERAGE blocks (and no longer says "Tier 1 keywords naturally where they fit").
   - Bullet system prompt contains HEADER RULE / BODY SHAPE / KEYWORD COUNT / LEXICAL VARIATION blocks.
   - Generated titles use 3-5 hyphen segments, highest-priority keyword in segment 1.
   - Generated Detailed bullets have concrete ALL CAPS headers (not "QUALITY:") and 2+ keywords per bullet.
   - Generated bullets within a version don't share the first 3 words across rows.
   - Backend system prompt no longer says "T4 keywords."

## Out of scope (deferred to later phases)

- **P7 / P14 / P15 / P16 — tone polish.** P14 (feature-to-benefit) is *partially* addressed by Section 2's body shape rule; deeper tone work belongs in Phase 3.
- **P8 — description 1000→2000 chars** — Phase 5.
- **P9 — backend exclusion verification** — Phase 6 (already implemented at route.ts:786-823 + 1013-1037; Phase 2 only fixes the system-prompt drift at L782).
- **P12 / P13 / P17 / P19 / P20 / P22 / P23 — meta-rules** — Phase 4.
- **`docs/seo-manager-complete.html` rewrite** — Phase 7.

## Risks & rollback

- **Risk:** Stricter prompt rules could increase Claude's failure rate to honor every rule simultaneously (e.g. front-load + use ALL keywords + concrete header + 2 keywords per bullet might conflict with 190-200 char band). Mitigation: dev smoke test on 3+ real projects before merging; soften any rule that proves over-constrained.
- **Risk:** P6's "first 3-word phrase" rule may be too strict for 5-bullet sets where keyword overlap is unavoidable. Mitigation: if dev test shows Claude can't satisfy this, drop to "first word."
- **Rollback:** Single commit per task → `git revert <sha>` is sufficient. No data, no schema, no API contract change.

## Files touched

1. [src/app/api/seo/claude/seo/route.ts](../../../src/app/api/seo/claude/seo/route.ts) — title block ~L605-626, bullet block ~L652-691, backend line L782.
2. [src/lib/seo-pipeline-config.ts](../../../src/lib/seo-pipeline-config.ts) — `TITLE_CONFIG`, `BULLET_CONFIG.purposes`, `BULLET_CONFIG.rules`.

## Execution

Plan to be produced via `superpowers:writing-plans` in a fresh session at:
`docs/superpowers/plans/2026-05-28-seo-phase2-title-bullets.md`

Subagent-driven execution recommended (one task per file change), matching Phase 1's pattern.
