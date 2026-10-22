# Architecture Patterns

**Domain:** Amazon SEO Content Pipeline Premium Upgrade
**Researched:** 2026-03-21

## Recommended Architecture

The upgrade adds three new subsystems to the existing S1-S6 pipeline, injected as **pre-pipeline enrichment** (competitor research + brand voice) and **cross-ASIN orchestration** (grouped variation generation). These are not new pipeline phases -- they are data layers that feed into existing phases.

```
                    CLIENT ONBOARDING (one-time per client)
                    ┌─────────────────────────────────────┐
                    │  Brand Voice Extraction              │
                    │  (scrape website + parse PDF guides) │
                    │  → brand_voice_profiles table        │
                    └──────────────┬──────────────────────┘
                                   │ per-client, reusable
                                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                    SEO PROJECT CREATION                         │
  │  S1 Intake now auto-attaches: brand voice + triggers research  │
  └──────────┬──────────────────────────────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │  Competitor Research (pre-S2)       │
  │  Scrape top 3-5 competitor ASINs    │
  │  → competitor_research table        │
  │  Analyze: keywords, content, gaps   │
  └──────────┬──────────────────────────┘
             │ feeds into S2, S4, S5, S6
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  EXISTING PIPELINE (upgraded prompts at each phase)            │
  │                                                                 │
  │  S2 Keywords ──→ S3 Reviews ──→ S4 Rufus ──→ S5 COSMO ──→ S6 │
  │  + competitor      (unchanged)   + competitor   + competitor     │
  │    gap analysis                    differen-      white space    │
  │                                    tiation                       │
  └─────────────────────────────────────────────────┬───────────────┘
                                                     │
                                                     ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  S6 GENERATION (upgraded)                                       │
  │                                                                 │
  │  Single ASIN mode: existing flow + brand voice + competitor ctx │
  │                                                                 │
  │  Grouped mode: all ASINs in variation family generated together │
  │  → shared brand voice, shared keywords                          │
  │  → intentionally differentiated per variation attribute          │
  │  → consistency enforced across family                            │
  └─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Storage |
|-----------|---------------|-------------------|---------|
| **Brand Voice Extractor** | Scrapes client website (Firecrawl), parses brand guideline PDFs (Google Drive), builds structured voice profile via Claude | Firecrawl API, Google Drive API, Anthropic API | `brand_voice_profiles` table (new) |
| **Competitor Research Engine** | Scrapes top competitor Amazon listings, extracts keywords/content patterns, identifies gaps and differentiation opportunities | Firecrawl API (Amazon scraping), Anthropic API (analysis) | `competitor_research` table (new) |
| **Upgraded Prompt Builder** | Assembles system/user prompts for each pipeline phase, injecting brand voice + competitor context alongside existing data | Reads from all research tables, `seo-pipeline-config.ts` | None (stateless, builds prompt strings) |
| **Variation Group Orchestrator** | When project is linked to a variation, loads all sibling ASINs and generates content as a batch with family context | `variations`, `variationGroups`, `variationGroupAssignments`, `seoAsins` | `seoAsins.generatedContent` (existing) |
| **Research Results UI** | Displays competitor research and brand voice data within SEO Manager project detail view | Reads from `competitor_research`, `brand_voice_profiles` | None (read-only display) |

### Data Flow

**Brand Voice Flow (one-time per client, reusable across projects):**

1. Admin triggers "Extract Brand Voice" from client settings or SEO project intake
2. System fetches `brandUrl` from `seoProjects` or client config
3. **Firecrawl** scrapes client website homepage + about page + product pages (3-5 URLs)
4. **Google Drive** client fetches brand guideline PDFs from client's Drive folder (via `driveFolders` table lookup by `clientIdCode` + `folderType: 'brand_guidelines'`)
5. PDF text extracted (existing `extract-doc` route pattern can be extended)
6. **Claude API** (strategic model) analyzes scraped content + PDF text, produces structured profile:
   - `tone_attributes`: array of 3-5 adjective pairs (e.g., "warm but professional")
   - `vocabulary_preferences`: words/phrases the brand uses often
   - `vocabulary_avoid`: words/phrases to never use
   - `emotional_register`: how emotionally expressive the copy should be
   - `writing_rules`: specific rules extracted from guidelines (e.g., "always capitalize Product Name")
   - `example_phrases`: 5-10 representative phrases from brand's actual copy
   - `audience_notes`: who the brand speaks to
   - `positioning`: how brand positions against market
7. Profile stored in `brand_voice_profiles` table, keyed by `clientIdCode`
8. Admin reviews/edits profile before it goes live
9. All future SEO projects for this client auto-attach the profile

**Competitor Research Flow (per-project, runs between S1 and S2):**

1. During S1 intake, user enters 3-5 competitor ASINs (field already exists: `seoProjects.competitors`)
2. User clicks "Run Competitor Research" (new action button in intake UI)
3. API route orchestrates:
   a. **Firecrawl** scrapes each competitor ASIN's Amazon listing (reuses existing `scrapeAmazonProduct()`)
   b. Raw scrape data stored in `competitor_research.raw_listings` (JSONB)
   c. **Claude API** analyzes all competitor listings together, producing:
      - `keyword_gaps`: keywords competitors rank for that our product doesn't target
      - `content_patterns`: structural patterns across top competitors (bullet format, description style)
      - `differentiation_opportunities`: what competitors miss that our product can own
      - `pricing_context`: where our product sits in the competitive landscape
      - `strengths_to_counter`: competitor strengths we need to address
4. Structured analysis stored in `competitor_research` table
5. Results available to all subsequent pipeline phases via project lookup

**Upgraded S2-S5 Flow (existing pipeline, enriched prompts):**

Each existing Claude API call gets additional context injected:

- **S2 Keywords**: Competitor keyword gaps added to prioritization prompt. Gap keywords auto-tagged as T2/T3 candidates.
- **S3 Reviews**: No change (reviews are product-specific, not competitor-dependent)
- **S4 Rufus**: Competitor differentiation insights inform question generation. New focus area: "How does this product differ from [competitor pattern]?"
- **S5 COSMO**: Competitor COSMO analysis reveals entity-relationship white space. Triples should target relationships competitors don't cover.

**Grouped Variation Generation Flow (S6 upgrade):**

1. When SEO project has `variationId` set, system detects this is a family project
2. Before S6 generation, system loads ALL `seoAsins` for the project
3. System also loads variation metadata: group names, variation attributes (flavor, size, color, style) from `variationGroupAssignments` + `master` table
4. S6 generation switches to "grouped mode":
   - Single Claude API call per content type (titles, bullets, etc.) generates ALL ASINs at once
   - System prompt includes full family context: all variation attributes, group structure
   - Explicit differentiation rules per bullet position (B5 = variation-specific)
   - Consistency constraints: brand voice, core value props, and B1-B4 themes stay aligned across family
   - Variation-specific: keywords, B5 content, description angle, and usage scenarios differ per SKU
5. If family is too large for single API call (>15 ASINs), batch by variation group

## New Database Tables

### `brand_voice_profiles`

```sql
CREATE TABLE brand_voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code VARCHAR(100) NOT NULL,
  -- Unique per client: one active profile at a time
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | active | archived

  -- Structured voice profile (machine-readable for prompt injection)
  profile JSONB NOT NULL DEFAULT '{}',
  -- Shape: {
  --   tone_attributes: string[],        -- ["warm but professional", "confident not arrogant"]
  --   vocabulary_preferences: string[],  -- ["nourish", "craft", "premium"]
  --   vocabulary_avoid: string[],        -- ["cheap", "basic", "simple"]
  --   emotional_register: string,        -- "moderately expressive"
  --   writing_rules: string[],           -- ["Always capitalize Brand Name", "Use em-dashes not hyphens"]
  --   example_phrases: string[],         -- 5-10 real phrases from brand copy
  --   audience_notes: string,            -- "health-conscious millennials, 25-40"
  --   positioning: string,               -- "premium natural alternative to mass-market"
  -- }

  -- Source tracking
  source_urls TEXT[],                    -- URLs that were scraped
  source_drive_files TEXT[],             -- Google Drive file IDs used

  -- Extraction metadata
  extracted_by VARCHAR(255),             -- user email who triggered extraction
  extraction_model VARCHAR(100),         -- which Claude model was used

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(client_id_code, status) WHERE status = 'active'  -- only one active per client
);
CREATE INDEX idx_bvp_client ON brand_voice_profiles(client_id_code);
CREATE INDEX idx_bvp_status ON brand_voice_profiles(status);
```

### `competitor_research`

```sql
CREATE TABLE competitor_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,

  -- Raw scraped competitor listings
  raw_listings JSONB NOT NULL DEFAULT '[]',
  -- Shape: Array<{
  --   asin: string,
  --   title: string,
  --   bullets: string[],
  --   description: string,
  --   rating: number,
  --   ratings_total: number,
  --   price: number,
  --   bsr: { rank: number, category: string }[],
  --   scraped_at: string
  -- }>

  -- AI-analyzed insights
  analysis JSONB NOT NULL DEFAULT '{}',
  -- Shape: {
  --   keyword_gaps: Array<{ keyword: string, competitor_asins: string[], suggested_tier: string }>,
  --   content_patterns: Array<{ pattern: string, frequency: number, our_product_has: boolean }>,
  --   differentiation_opportunities: Array<{ opportunity: string, priority: "high"|"medium"|"low" }>,
  --   pricing_context: { our_price: number, avg_competitor: number, positioning: string },
  --   strengths_to_counter: Array<{ strength: string, our_response: string }>,
  --   summary: string  -- 2-3 paragraph executive summary
  -- }

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | scraping | analyzing | complete | failed
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comp_research_project ON competitor_research(project_id);
```

### Schema Changes to Existing Tables

**`seo_projects`** -- add column:
```sql
ALTER TABLE seo_projects ADD COLUMN brand_voice_profile_id UUID REFERENCES brand_voice_profiles(id) ON DELETE SET NULL;
```

This links a project to the client's active brand voice profile at the time of project creation. Snapshotting the profile ID (rather than always using latest) ensures in-progress projects don't shift mid-pipeline if the voice profile is updated.

## Patterns to Follow

### Pattern 1: Pre-Pipeline Enrichment (not new phases)

**What:** Competitor research and brand voice are data enrichment steps that run before or during S1, not new pipeline phases (S0, S-1, etc.)

**When:** Always. The pipeline is already well-understood as S1-S6. Adding phases creates UI complexity and breaks existing project state machines.

**Rationale:** The `currentPhase` field is a simple varchar enum. Adding phases means migrating every project's state. Instead, enrichment data is attached to the project via FK relationships and loaded on demand by each phase's prompt builder.

```typescript
// In each Claude API route, load enrichment data alongside existing data
const [brandVoice, competitorResearch] = await Promise.all([
  project.brandVoiceProfileId
    ? db.select().from(brandVoiceProfiles).where(eq(brandVoiceProfiles.id, project.brandVoiceProfileId)).limit(1)
    : Promise.resolve([]),
  db.select().from(competitorResearch).where(eq(competitorResearch.projectId, project.id)).limit(1),
]);
```

### Pattern 2: Prompt Composition Layer

**What:** A single `buildEnrichedPrompt()` function that composes the final system/user prompt from pipeline config + brand voice + competitor context + phase-specific data.

**When:** Every Claude API call in the pipeline.

**Rationale:** Currently, each route (`claude/seo/route.ts`, `claude/keywords/route.ts`, etc.) builds prompts inline with string concatenation. This works but becomes unmaintainable when adding brand voice and competitor context to every prompt. Extract to a shared module.

```typescript
// src/lib/seo-prompt-builder.ts
export function buildSystemPrompt(opts: {
  phase: 'keywords' | 'reviews' | 'rufus' | 'cosmo' | 'titles' | 'bullets' | 'description' | 'backend';
  brandVoice?: BrandVoiceProfile;
  competitorResearch?: CompetitorAnalysis;
  pipelineRules: string; // from buildConfigPromptBlock()
}): string {
  // Compose prompt sections in consistent order
}
```

### Pattern 3: Variation-Aware Batch Generation

**What:** When a project has `variationId`, S6 generates all ASINs together instead of treating each independently.

**When:** S6 content generation for variation-linked projects.

**Rationale:** The current S6 route already receives all ASINs and generates them in one API call. The change is adding variation context (family structure, group assignments, per-SKU attributes) to the prompt, plus explicit differentiation instructions.

```typescript
// In claude/seo/route.ts, detect grouped mode
const isGroupedGeneration = !!project.variationId;

if (isGroupedGeneration) {
  // Load variation family context
  const familyContext = await loadVariationFamily(project.variationId);
  // Add to prompt: group structure, per-ASIN variation attributes
  // Add differentiation rules to system prompt
}
```

### Pattern 4: Existing Firecrawl Reuse for Competitor Scraping

**What:** Reuse the existing `scrapeAmazonProduct()` function from `src/lib/firecrawl.ts` for competitor ASIN scraping.

**When:** Competitor research step.

**Rationale:** The function already extracts structured Amazon listing data (title, bullets, price, BSR, ratings). No new scraping infrastructure needed. For brand website scraping, use Firecrawl's markdown extraction mode (different from the structured extract mode used for Amazon).

## Anti-Patterns to Avoid

### Anti-Pattern 1: New Pipeline Phases

**What:** Adding S0 (competitor research) and S-1 (brand voice) as new phases in the state machine.

**Why bad:** Breaks existing project status tracking, requires migration of all in-progress projects, complicates the well-understood S1-S6 UI flow, and creates confusion about which phases are required vs optional.

**Instead:** Model as enrichment data attached to the project. Brand voice is per-client (lives on `brand_voice_profiles`). Competitor research is per-project (lives on `competitor_research`). Both are optional -- the pipeline works without them, just with lower quality output.

### Anti-Pattern 2: Brand Voice in Project (not Client)

**What:** Storing brand voice profile data directly on `seo_projects`.

**Why bad:** Brand voice is a client-level concern, not a project-level concern. Every project for the same client should use the same voice. Duplicating it per project means inconsistency and data bloat.

**Instead:** Separate `brand_voice_profiles` table keyed by `clientIdCode`. Projects reference via FK. The existing `brandGuidelinesLock` JSONB field on `seoProjects` is a lightweight precursor -- the new table supersedes it with a richer, extractable profile.

### Anti-Pattern 3: Synchronous Competitor Scraping in S1

**What:** Blocking S1 intake completion while competitor ASINs are scraped and analyzed.

**Why bad:** Firecrawl scraping 3-5 ASINs takes 15-30 seconds each. Users should not wait 60-150 seconds during intake.

**Instead:** Trigger competitor research asynchronously. S1 completes immediately. Competitor research runs in background (status field on `competitor_research`: pending -> scraping -> analyzing -> complete). S2 can proceed without it; if research completes before S2, it enriches keywords. If not, S2 uses existing keyword sources and competitor data enriches later phases.

### Anti-Pattern 4: Generating Variations Sequentially

**What:** Running S6 generation per-ASIN, then trying to enforce consistency after the fact.

**Why bad:** AI cannot ensure cross-ASIN consistency when it only sees one ASIN at a time. Post-hoc consistency checks lead to regeneration loops.

**Instead:** Send all ASINs in a single API call with explicit family context and differentiation rules. The model sees the full picture and produces intentionally differentiated yet consistent content in one pass.

## API Route Structure

New routes follow existing naming convention:

```
# Brand Voice
POST /api/seo/brand-voice/extract          # Trigger extraction for a client
GET  /api/seo/brand-voice/[clientId]       # Get active profile for client
PATCH /api/seo/brand-voice/[profileId]     # Edit profile (admin review)
POST /api/seo/brand-voice/[profileId]/activate  # Set as active

# Competitor Research
POST /api/seo/projects/[id]/competitor-research  # Trigger research for project
GET  /api/seo/projects/[id]/competitor-research  # Get research results

# Existing routes (modified, not new)
POST /api/seo/claude/keywords    # + competitor gap context
POST /api/seo/claude/rufus       # + competitor differentiation
POST /api/seo/claude/cosmo       # + competitor white space
POST /api/seo/claude/seo         # + brand voice + competitor context + variation family
POST /api/seo/claude/seo-audit   # + brand voice consistency check
```

## Scalability Considerations

| Concern | Current (20 clients/month) | At 50 clients/month | At 100+ clients/month |
|---------|---------------------------|--------------------|-----------------------|
| Brand voice extraction | One-time per client, negligible | Same -- profiles reused | Same -- profiles reused |
| Competitor scraping | 3-5 Firecrawl calls per project | Rate limit awareness needed | Queue system, batch scraping |
| Claude API costs | ~$0.50-1.00 per project (existing) | +$0.10-0.30 per project for enrichment | Consider caching competitor analysis across similar products |
| Storage | JSONB profiles are small (2-5KB each) | No concern | No concern |
| Generation time | +5-10s per project for enriched prompts | Same | Consider parallel API calls per batch |

## Build Order (Dependencies)

The components have a clear dependency chain that dictates build order:

```
Phase 1: Brand Voice Profiles (independent, no pipeline changes)
  ├── brand_voice_profiles table + migration
  ├── Extraction API route (Firecrawl + Drive + Claude)
  ├── Admin review UI
  └── No pipeline changes yet -- just stores data

Phase 2: Competitor Research Engine (independent, no pipeline changes)
  ├── competitor_research table + migration
  ├── Research trigger API route (reuses scrapeAmazonProduct)
  ├── Research results display in project detail
  └── No pipeline changes yet -- just stores data

Phase 3: Prompt Composition Layer (depends on Phase 1 + 2)
  ├── Extract seo-prompt-builder.ts from inline prompt construction
  ├── Add brand voice injection points
  ├── Add competitor context injection points
  └── Refactor existing claude/* routes to use builder

Phase 4: Upgraded Phase Prompts (depends on Phase 3)
  ├── S2 keywords: competitor gap integration
  ├── S4 Rufus: competitor differentiation questions
  ├── S5 COSMO: competitor white space analysis
  └── S6 generation: brand voice + competitor + enriched prompts

Phase 5: Grouped Variation Generation (depends on Phase 3 + 4)
  ├── Variation family context loader
  ├── Grouped generation mode in S6
  ├── Cross-ASIN consistency rules
  └── Variation-specific differentiation logic
```

**Critical path:** Phase 3 (Prompt Composition) is the bottleneck. Phases 1 and 2 can build in parallel. Phase 4 and 5 both depend on 3. Phase 5 additionally depends on 4 (needs upgraded prompts as a foundation for grouped generation).

**Incremental deployability:** Each phase is independently deployable. The pipeline continues working at every stage -- each phase adds capability without breaking existing flows.

## Sources

- Existing codebase analysis: `src/lib/seo-pipeline-config.ts` (pipeline rules), `src/lib/db/schema.ts` (data model), `src/app/api/seo/claude/seo/route.ts` (current S6 generation)
- Existing scraping infrastructure: `src/lib/firecrawl.ts` (Amazon product scraping, reusable for competitor research)
- Existing Drive integration: `src/lib/drive-client.ts` (PDF retrieval for brand guidelines)
- Existing variation system: `variationGroupAssignments` junction table, `variations`/`variationGroups` tables
- Current brand voice precursor: `seoProjects.brandGuidelinesLock` JSONB field (lightweight version of what brand voice profiles will provide)

---

*Architecture analysis: 2026-03-21*
