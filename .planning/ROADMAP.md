# Roadmap: SEO Pipeline Premium Upgrade

## Overview

Transform the existing S1-S6 SEO pipeline from generic keyword-stuffed content into premium, brand-voice listings optimized for Amazon's AI systems. Three phases: first build the research data layer (competitor intelligence + brand voice), then wire that intelligence into mid-pipeline phases (S2/S4/S5) with a content brief checkpoint, then deliver the premium generation engine (grouped variation-aware S6) with post-generation validation. The pipeline stays operational throughout -- every upgrade is progressive enhancement.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Research and Voice Data Layer** - Competitor intelligence collection, brand voice extraction, and research UI for viewing/editing results
- [ ] **Phase 2: Prompt Composition and Mid-Pipeline Upgrades** - Centralized prompt builder, upgraded S2/S4/S5 prompts consuming research data, and content brief checkpoint
- [ ] **Phase 3: Premium Generation and Validation** - Brand-voice grouped variation generation (S6), variation consistency, and post-generation quality validation

## Phase Details

### Phase 1: Research and Voice Data Layer
**Goal**: Operators can run competitor analysis and build brand voice profiles for any SEO project, and view/edit the results in the SEO Manager
**Depends on**: Nothing (first phase)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, VOICE-01, VOICE-02, VOICE-03, VOICE-04, UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. Operator can trigger competitor analysis for a project and see structured results (scraped listings, keyword gaps, content patterns, differentiation opportunities) in the SEO Manager detail view
  2. Operator can create, view, and edit a per-client brand voice profile with tone attributes, vocabulary lists, example sentences, and writing rules
  3. System can auto-extract brand voice attributes from a client website URL and from brand guideline PDFs stored in Google Drive
  4. All research data persists in the database and is available for downstream pipeline consumption via API
**Plans**: TBD

Plans:
- [ ] 01-01: Competitor intelligence backend (scraping, analysis, storage)
- [ ] 01-02: Brand voice profiles (storage, extraction, editor UI)
- [ ] 01-03: Research results UI in SEO Manager

### Phase 2: Prompt Composition and Mid-Pipeline Upgrades
**Goal**: The S2/S4/S5 pipeline phases consume competitor and voice data to produce smarter keyword prioritization, Rufus strategy, and COSMO mapping -- with a reviewable content brief before generation
**Depends on**: Phase 1
**Requirements**: PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04, PROMPT-06, BRIEF-01, BRIEF-02, UI-03
**Success Criteria** (what must be TRUE):
  1. A centralized prompt composition layer assembles prompts for all phases, injecting available competitor data and brand voice context when present
  2. S2 keyword prioritization reflects competitor gap analysis; S4 Rufus Q&A reflects differentiation insights; S5 COSMO mapping finds entity white space from competitor analysis
  3. System generates a content brief after S2-S5 that summarizes target keywords, COSMO entities, Rufus strategy, competitor gaps, and voice directives -- and operators can review/annotate it before S6
  4. All upgraded prompts work correctly when competitor data or voice profile is not yet available (progressive enhancement)
**Plans**: TBD

Plans:
- [ ] 02-01: Prompt composition layer and progressive enhancement
- [ ] 02-02: Upgraded S2/S4/S5 prompts with research context injection
- [ ] 02-03: Content brief generation, review UI, and approval gate

### Phase 3: Premium Generation and Validation
**Goal**: S6 produces brand-voice, variation-aware content that is intentionally differentiated across product families, with automated quality and consistency validation
**Depends on**: Phase 2
**Requirements**: PROMPT-05, VAR-01, VAR-02, VAR-03, VAR-04, VAR-05, VAL-01, VAL-02, VAL-03
**Success Criteria** (what must be TRUE):
  1. S6 generates all ASINs in a product family together, producing content that maintains brand voice consistency while intentionally differentiating keywords, features, and usage scenarios per variation
  2. Variation-specific attributes from BigQuery are injected into generation context, and large families (>8-12 ASINs) auto-split by theme with cross-batch consistency
  3. Quality scoring evaluates natural keyword integration, brand voice adherence, and bullet hierarchy effectiveness beyond the current 7 dimensions
  4. Variation consistency scoring flags content that is too similar or too divergent across a family
  5. Rufus coverage validation tests whether generated content surfaces for relevant Rufus-style queries
**Plans**: TBD

Plans:
- [ ] 03-01: Grouped variation generation engine (S6 upgrade)
- [ ] 03-02: Validation layer (quality scoring, variation consistency, Rufus validation)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Research and Voice Data Layer | 0/3 | Not started | - |
| 2. Prompt Composition and Mid-Pipeline Upgrades | 0/3 | Not started | - |
| 3. Premium Generation and Validation | 0/2 | Not started | - |
