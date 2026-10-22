# Requirements: SEO Pipeline Premium Upgrade

**Defined:** 2026-03-21
**Core Value:** Every Amazon listing must sound like the brand's own copywriter wrote it, while being invisibly optimized for Amazon's search and AI discovery systems.

## v1 Requirements

### Competitor Intelligence

- [ ] **COMP-01**: System can scrape top 3-5 competitor Amazon listings per project using Firecrawl/Rainforest and store structured results (title, bullets, description, keywords, images)
- [ ] **COMP-02**: System generates keyword gap matrix showing keywords competitors rank for that the client's listing misses, organized by tier (T1-T4)
- [ ] **COMP-03**: System analyzes competitor content patterns — title formulas, bullet structures, description flow, keyword density — and surfaces what works
- [ ] **COMP-04**: System identifies differentiation white space — topics, claims, and angles competitors DON'T cover — as opportunities for the client to own

### Brand Voice

- [ ] **VOICE-01**: Per-client brand voice profile stored as structured JSON with tone axes, vocabulary level, emotional register, do's/don'ts
- [ ] **VOICE-02**: System can scrape a client's website via headless browser and auto-extract brand voice attributes, example phrases, and writing patterns
- [ ] **VOICE-03**: System can read brand guideline PDFs from Google Drive and extract voice rules, terminology, and positioning
- [ ] **VOICE-04**: Brand voice profile includes example sentence bank (10-20 real examples), vocabulary lists (preferred/forbidden words), and explicit writing rules

### Prompt Composition

- [ ] **PROMPT-01**: Centralized prompt composition layer (`seo-prompt-builder.ts`) that assembles prompts for all phases with optional context injection (competitor data, brand voice, variation context)
- [ ] **PROMPT-02**: Upgraded S2 (keywords) prompts that integrate competitor keyword gap analysis into keyword prioritization and tier assignment
- [ ] **PROMPT-03**: Upgraded S4 (Rufus) prompts that incorporate competitor differentiation insights into Q&A strategy
- [ ] **PROMPT-04**: Upgraded S5 (COSMO) prompts that use competitor entity-relationship analysis to find COSMO white space
- [ ] **PROMPT-05**: Upgraded S6 (content generation) prompts that eliminate keyword stuffing, produce natural brand-voice copy, and optimize bullet hierarchy for conversion
- [ ] **PROMPT-06**: All upgraded prompts work gracefully when optional context (competitor data, voice profile) is not yet available — progressive enhancement, no hard dependencies

### Grouped Variation Generation

- [ ] **VAR-01**: S6 generates all ASINs in a product family together in a single prompt, seeing full variation context (flavors, sizes, styles, colors)
- [ ] **VAR-02**: Brand voice and core value propositions stay consistent across all variations in a family
- [ ] **VAR-03**: Keywords, feature callouts, and usage scenarios are intentionally differentiated per variation — not just flavor-name swaps
- [ ] **VAR-04**: Variation-specific attributes pulled from ASIN catalog (BigQuery) and injected into generation context
- [ ] **VAR-05**: Large families (>8-12 ASINs) auto-split by variation theme with cross-batch consistency checks

### Content Brief

- [ ] **BRIEF-01**: System generates an intermediate content brief after research phases (S2-S5) summarizing: target keywords by tier, COSMO entities, Rufus Q&A strategy, competitor gaps, and brand voice directives
- [ ] **BRIEF-02**: Content brief is reviewable by the team before S6 generation begins — serves as a checkpoint between research and writing

### Validation

- [ ] **VAL-01**: Upgraded quality scoring that measures natural keyword integration, brand voice adherence, and bullet hierarchy effectiveness (beyond current 7 dimensions)
- [ ] **VAL-02**: Variation consistency scoring that measures differentiation across a product family — flags when content is too similar or too divergent
- [ ] **VAL-03**: Systematic Rufus coverage validation that tests whether generated content surfaces for relevant Rufus-style queries using Claude simulation

### Research UI

- [ ] **UI-01**: Competitor research results displayed within the SEO Manager project detail view — keyword gaps, content patterns, differentiation opportunities
- [ ] **UI-02**: Brand voice profile editor in the SEO Manager — view, edit, and approve auto-extracted profiles per client
- [ ] **UI-03**: Content brief review panel — view generated brief, annotate, approve before S6 generation

## v2 Requirements

### Advanced Competitor Intelligence

- **COMP-05**: Scheduled competitor re-analysis (monthly) to track listing changes over time
- **COMP-06**: Competitor COSMO entity mapping — visualize competitor entity-relationship coverage vs. ours

### Advanced Validation

- **VAL-04**: Post-publish Rufus validation — check actual Rufus responses after listing goes live on Amazon
- **VAL-05**: A/B content scoring — compare two generated versions of the same listing

### Scale

- **SCALE-01**: Batch project creation — generate content briefs for entire client catalog in one operation
- **SCALE-02**: Voice profile inheritance — sub-brands within a client share base voice with overrides

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time Amazon ranking tracking | Different product, not content pipeline |
| A+ Content module changes | Separate domain |
| Amazon Advertising integration | Ads ≠ organic SEO content |
| Automated listing publishing | Content generation only; publishing is a separate workflow |
| Mobile app | Web-first platform |
| Multi-marketplace (EU, FE) | Focus on NA marketplace first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMP-01 | Phase 1 | Pending |
| COMP-02 | Phase 1 | Pending |
| COMP-03 | Phase 1 | Pending |
| COMP-04 | Phase 1 | Pending |
| VOICE-01 | Phase 1 | Pending |
| VOICE-02 | Phase 1 | Pending |
| VOICE-03 | Phase 1 | Pending |
| VOICE-04 | Phase 1 | Pending |
| PROMPT-01 | Phase 2 | Pending |
| PROMPT-02 | Phase 2 | Pending |
| PROMPT-03 | Phase 2 | Pending |
| PROMPT-04 | Phase 2 | Pending |
| PROMPT-05 | Phase 3 | Pending |
| PROMPT-06 | Phase 2 | Pending |
| VAR-01 | Phase 3 | Pending |
| VAR-02 | Phase 3 | Pending |
| VAR-03 | Phase 3 | Pending |
| VAR-04 | Phase 3 | Pending |
| VAR-05 | Phase 3 | Pending |
| BRIEF-01 | Phase 2 | Pending |
| BRIEF-02 | Phase 2 | Pending |
| VAL-01 | Phase 3 | Pending |
| VAL-02 | Phase 3 | Pending |
| VAL-03 | Phase 3 | Pending |
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation*
