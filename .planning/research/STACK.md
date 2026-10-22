# Technology Stack — SEO Pipeline Premium Upgrade

**Project:** SEO Pipeline Premium Upgrade
**Researched:** 2026-03-21
**Overall Confidence:** MEDIUM (web search unavailable; recommendations based on training data + codebase analysis of existing integrations)

## Recommended Stack

### 1. Competitor Amazon Listing Scraping & Analysis

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Firecrawl API (existing) | v1 | Primary scraper for competitor Amazon listings | Already integrated (`src/lib/firecrawl.ts`), structured extraction via JSON schema, maps to RainforestProduct shape. Extend existing schema for competitor-specific fields (description, A+ content, brand story). | HIGH |
| Firecrawl Batch API | v1 | Scrape multiple competitor listings in parallel | Firecrawl supports batch scraping (up to 50 URLs per batch call). Critical for scraping 5-10 competitor ASINs per project without sequential 45s waits. | MEDIUM |
| p-limit (existing) | ^7.3.0 | Concurrency control for batch scraping | Already in `package.json`. Use to limit concurrent Firecrawl calls (max 3-5 parallel). | HIGH |
| Rainforest API (existing) | REST | Fallback scraper | Already integrated. Keep as fallback when Firecrawl fails or for fields Firecrawl misses (e.g., detailed BSR history). | HIGH |

**What NOT to use:**
- **Puppeteer/Playwright** -- Headless browser scraping adds infrastructure complexity (Chrome binary on Vercel serverless = broken), Amazon actively blocks it, and you already have Firecrawl which handles JS rendering. Do not add browser automation for Amazon scraping.
- **ScrapingBee/ScrapingAnt** -- Another scraping proxy when you already have two working options. Adding a third creates maintenance burden.
- **Amazon Product Advertising API (PAAPI)** -- Requires Amazon Associates account, restricted data, rate-limited to 1 req/sec. SP-API + Firecrawl cover more ground.

**Implementation approach:** Extend `src/lib/firecrawl.ts` with a new `scrapeCompetitorListing()` function that uses a broader extraction schema (including description text, A+ content indicators, brand story, bullet structure analysis). Store results in a new `seo_competitor_data` table linked to SEO projects.

---

### 2. Brand Voice Extraction

#### Website Scraping

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Firecrawl API (existing) | v1 | Scrape client brand websites | Already integrated. Use `formats: ["markdown"]` mode (not `extract`) to get full page text for brand voice analysis. Scrape homepage + about page + 2-3 product pages. | HIGH |
| Firecrawl `map` endpoint | v1 | Discover scrapeable pages on client site | Firecrawl's `/map` endpoint returns all URLs on a domain. Use to find about/story/values pages automatically. | MEDIUM |

#### PDF Processing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pdfjs-dist (existing) | ^5.5.207 | Extract text from brand guideline PDFs | Already in `package.json`. Currently used for PDF rendering in intake. Extend to text extraction for brand voice analysis. | HIGH |
| Google Drive REST API (existing) | v3 | Download brand guideline PDFs from client folders | Already integrated (`src/lib/drive-client.ts`). Download PDF bytes, pipe to pdfjs-dist for text extraction. | HIGH |

#### AI-Powered Voice Profile Generation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk (existing) | ^0.78.0 | Analyze scraped text + PDFs to generate structured brand voice profile | Already the AI backbone. Use Claude Sonnet 4 for voice extraction (needs nuance). Send scraped website text + PDF text as context, get back structured JSON profile. | HIGH |
| Zod (existing) | ^4.3.6 | Validate brand voice profile schema | Already in stack. Define `BrandVoiceProfile` Zod schema, validate Claude's JSON output before storage. | HIGH |

**What NOT to use:**
- **Mammoth for PDF** -- Mammoth (`^1.11.0`, already in package.json) converts DOCX to HTML, not PDF. It is the wrong tool for brand guideline PDFs.
- **pdf-parse** -- Older library with known issues on serverless (native dependencies). pdfjs-dist is already installed and works on Vercel.
- **LangChain for document loading** -- Massive dependency tree for what amounts to calling pdfjs-dist + fetch. Use direct integration since you already have both tools.
- **OpenAI for voice analysis** -- Anthropic Claude is already the AI backbone. Adding a second LLM provider for one feature creates billing complexity and inconsistency.

**Brand Voice Profile Schema (recommended):**
```typescript
interface BrandVoiceProfile {
  // Core attributes
  tone: string[];              // e.g., ["warm", "authoritative", "playful"]
  personality: string[];       // e.g., ["expert friend", "trusted advisor"]
  vocabulary_level: "simple" | "moderate" | "technical" | "luxury";
  emotional_register: string;  // e.g., "empowering but not aggressive"

  // Writing rules
  dos: string[];               // e.g., ["Use active voice", "Address reader as 'you'"]
  donts: string[];             // e.g., ["Never use 'cheap'", "Avoid clinical language"]
  words_to_use: string[];      // Brand-specific vocabulary
  words_to_avoid: string[];    // Off-brand terms

  // Example bank
  example_phrases: string[];   // 5-10 phrases that sound like the brand
  anti_examples: string[];     // Phrases that do NOT sound like the brand

  // Amazon-specific
  bullet_style: string;        // How this brand structures feature bullets
  description_style: string;   // Narrative approach for descriptions

  // Metadata
  source_urls: string[];       // Where this was extracted from
  source_documents: string[];  // PDF filenames
  extracted_at: string;        // ISO timestamp
  confidence: number;          // 0-1, how much source material was available
}
```

This extends the existing `brandGuidelinesLock` JSONB structure (which already has `brand_voice`, `words_to_avoid`, `audience_notes`, `positioning`) into a richer, more machine-readable format.

---

### 3. Grouped AI Content Generation with Variation Awareness

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk (existing) | ^0.78.0 | Generate all variation content in a single call | Use Claude Sonnet 4 for grouped generation (needs to hold full family context). Single API call with all ASINs + variation attributes in context. | HIGH |
| Claude tool_use / structured output | SDK feature | Force structured JSON output for multi-ASIN generation | Use Claude's `tool_use` feature to define output schema. Guarantees parseable JSON for multi-ASIN responses instead of hoping the model follows format instructions. | HIGH |
| seo-pipeline-config.ts (existing) | N/A | Pipeline rules injection | `buildConfigPromptBlock()` already generates the full rules block. Extend with variation-specific differentiation rules. | HIGH |
| Zod (existing) | ^4.3.6 | Validate multi-ASIN generation output | Define Zod schemas for grouped output (array of ASINs, each with titles/bullets/description/backend). Validate before storing. | HIGH |

**What NOT to use:**
- **LangChain for prompt chaining** -- The pipeline is already well-structured with `seo-pipeline-config.ts` as single source of truth and direct Anthropic SDK calls. LangChain adds abstraction without value here.
- **Multiple sequential API calls (one per ASIN)** -- Defeats the purpose of grouped generation. The whole point is that Claude sees all variations simultaneously to intentionally differentiate them.
- **Claude Opus 4** -- Tempting for quality, but at 20+ clients/month with multiple ASINs each, cost would be prohibitive. Sonnet 4 (`claude-sonnet-4-20250514`) handles this well with proper prompting. Reserve Opus for edge cases or quality audits.
- **Streaming for batch generation** -- Grouped generation produces structured JSON for multiple ASINs. Streaming complicates JSON parsing. Use non-streaming with higher timeout.

**Model tier recommendation for premium pipeline:**

| Pipeline Step | Current Model | Recommended Model | Rationale |
|--------------|---------------|-------------------|-----------|
| S2 Keywords | Haiku 4.5 | Haiku 4.5 | Keyword categorization is well-defined; Haiku handles it fine |
| S3 Reviews | Haiku 4.5 | Haiku 4.5 | Sentiment extraction is structured; keep fast and cheap |
| S4 Rufus | Sonnet 4 | Sonnet 4 | Already upgraded; strategic question generation needs nuance |
| S5 COSMO | Haiku 4.5 | **Sonnet 4** | Entity-relationship mapping needs more reasoning for competitor white space analysis |
| S6 Content (grouped) | Haiku 4.5 | **Sonnet 4** | Critical upgrade: grouped variation generation with brand voice requires Sonnet's instruction-following |
| S6 Audit | Haiku 4.5 | Haiku 4.5 | Scoring against rules is mechanical; Haiku is fine |
| Brand Voice Extraction | N/A | **Sonnet 4** | New: nuanced voice analysis needs strong language understanding |
| Competitor Analysis | N/A | Haiku 4.5 | New: structured data comparison is mechanical |

**Grouped generation approach:** Instead of calling S6 once per ASIN, call it once per batch type (titles, bullets, description, backend) with ALL ASINs in the family. The prompt includes:
1. Full variation family context (all ASINs with their attributes)
2. Brand voice profile
3. Competitor differentiation insights
4. Explicit differentiation rules (what changes per variation vs. what stays consistent)

**Token budget for grouped generation:** For a family of 10 ASINs, expect ~12K-16K output tokens per batch. Sonnet 4 supports 8K output by default; use `max_tokens: 16384` for larger families.

---

### 4. Rufus/COSMO Validation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk (existing) | ^0.78.0 | Simulate Rufus-style Q&A validation against generated content | No public Rufus API exists. Use Claude to simulate Rufus queries against generated content and score whether the content would surface. | HIGH |
| Existing S4 Rufus pipeline | N/A | Reuse phase 1+2 questions as validation test set | The 5 fixed questions + 8-10 generated questions from S4 become the validation test suite. Run generated content through these queries post-generation. | HIGH |
| Existing S5 COSMO pipeline | N/A | Validate COSMO entity coverage in final content | Check that generated content references entities from the COSMO triples. Automated text matching + Claude validation. | HIGH |

**What NOT to use:**
- **Amazon's actual Rufus** -- No public API. The AI shopping assistant is consumer-facing only. Cannot programmatically query it.
- **Custom embedding models for semantic matching** -- Overkill for validation. Simple keyword/entity presence checks + Claude scoring covers 90% of the value.
- **Perplexity/Google AI for "what would Rufus say"** -- Rufus is Amazon-proprietary. External AI can't predict its behavior better than a well-prompted Claude simulating the expected behavior based on Amazon's published COSMO/Rufus research.

**Validation approach:**
1. **Rufus simulation** -- For each S4 question, prompt Claude: "Given this product content [full listing], would this content provide a satisfying answer to the question: [question]? Score 1-5 and explain gaps."
2. **COSMO coverage check** -- Automated: for each COSMO triple, check if the entity and relationship appear in the generated content. Flag uncovered triples. No AI needed for basic presence check; use Claude only for semantic coverage assessment.
3. **Competitive gap check** -- Compare generated content keywords/entities against competitor listings. Flag any competitor strengths not addressed.

---

### Supporting Libraries (No New Dependencies Required)

| Library | Already Installed | Purpose for Premium Upgrade | Notes |
|---------|-------------------|---------------------------|-------|
| p-limit | Yes (^7.3.0) | Rate-limit concurrent Firecrawl calls | Use for batch competitor scraping |
| Zod | Yes (^4.3.6) | Schema validation for all new structured data | Brand voice profiles, competitor data, grouped output |
| pdfjs-dist | Yes (^5.5.207) | PDF text extraction for brand guidelines | Already used for rendering; add extraction path |
| diff | Yes (^8.0.3) | Compare content versions after regeneration | Already used for change tracking |
| date-fns | Yes (^4.1.0) | Timestamp formatting for research/extraction metadata | Already used throughout |

**Zero new npm dependencies.** Everything needed is already in the stack. This is deliberate -- adding dependencies to a production system serving 20+ clients is a risk, and the existing tools cover all needs.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Competitor scraping | Firecrawl (existing) | Puppeteer/Playwright | Can't run headless Chrome on Vercel serverless; Amazon blocks it; already have Firecrawl |
| PDF extraction | pdfjs-dist (existing) | pdf-parse, unstructured.io | pdf-parse has native dep issues on serverless; unstructured.io is a whole new service; pdfjs-dist works |
| Brand voice AI | Claude Sonnet 4 | GPT-4o, Gemini | Already using Anthropic; adding a second provider creates billing complexity and inconsistent behavior |
| Structured output | Claude tool_use | JSON mode (other providers) | Claude's tool_use gives schema-enforced output; already using the SDK |
| Prompt management | seo-pipeline-config.ts | LangChain, Promptfoo | Existing config system is comprehensive and type-safe; LangChain adds abstraction tax |
| Rufus validation | Claude simulation | Amazon Rufus API | No public Rufus API exists; simulation is the only option |
| Content diffing | diff (existing) | custom | Already in stack, handles text comparison for A/B content versions |

---

## New Database Tables Required

No new npm packages, but schema additions are needed:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `seo_competitor_data` | Store scraped competitor listing data per project | projectId, asin, brand, title, bullets, description, keywords, bsr, scrapedAt |
| `brand_voice_profiles` | Per-client brand voice profiles (reusable across projects) | clientIdCode, profile (JSONB), sourceUrls, sourceDocuments, extractedAt, approvedBy |
| `seo_validation_results` | Rufus/COSMO validation scores per project | projectId, rufusScores (JSONB), cosmoConverage (JSONB), competitorGapScore, validatedAt |

These extend the existing `seo_*` table family in `src/lib/db/schema.ts`.

---

## New AI Feature Keys

Extend `AI_FEATURE_KEYS` in `src/lib/ai-config.ts`:

```typescript
export const AI_FEATURE_KEYS = [
  // ... existing keys ...
  "seo_competitor_analysis",    // Analyze competitor listing data
  "seo_brand_voice_extract",    // Extract brand voice from website + PDFs
  "seo_grouped_content",        // Grouped variation content generation
  "seo_rufus_validation",       // Post-generation Rufus simulation
  "seo_cosmo_validation",       // Post-generation COSMO coverage check
] as const;
```

---

## Installation

```bash
# No new dependencies needed. Zero npm install.
# All capabilities come from extending existing integrations:
# - Firecrawl (competitor scraping + website scraping)
# - pdfjs-dist (PDF text extraction)
# - @anthropic-ai/sdk (brand voice extraction + grouped generation + validation)
# - Zod (schema validation for new data structures)
# - p-limit (concurrency control for batch operations)
```

---

## API Cost Estimates

| Operation | Model | Est. Tokens (in/out) | Cost per Call | Calls per Project | Cost per Project |
|-----------|-------|---------------------|---------------|-------------------|-----------------|
| Competitor analysis (5 ASINs) | Haiku 4.5 | 15K/2K | ~$0.02 | 1 | $0.02 |
| Brand voice extraction | Sonnet 4 | 20K/4K | ~$0.28 | 1 | $0.28 |
| Grouped titles (10 ASINs) | Sonnet 4 | 8K/4K | ~$0.15 | 1 | $0.15 |
| Grouped bullets (10 ASINs) | Sonnet 4 | 12K/12K | ~$0.42 | 1 | $0.42 |
| Grouped descriptions (10 ASINs) | Sonnet 4 | 10K/10K | ~$0.35 | 1 | $0.35 |
| Backend terms (10 ASINs) | Sonnet 4 | 6K/4K | ~$0.15 | 1 | $0.15 |
| Rufus validation | Haiku 4.5 | 8K/2K | ~$0.01 | 10 questions | $0.10 |
| COSMO validation | Haiku 4.5 | 4K/1K | ~$0.005 | 1 | $0.005 |
| **Total per project (10 ASINs)** | | | | | **~$1.48** |

Current pipeline cost is roughly $0.15-0.30 per project. Premium upgrade adds ~$1.00-1.50 per project, predominantly from Sonnet 4 grouped generation. At 20 clients/month this is ~$30/month in additional AI costs.

---

## Sources

- Codebase analysis: `src/lib/firecrawl.ts`, `src/lib/ai-config.ts`, `src/lib/seo-pipeline-config.ts`, `src/lib/db/schema.ts`
- Existing integrations: `src/lib/drive-client.ts`, `src/lib/drive-upload.ts`
- Package.json dependency versions (verified from lockfile)
- Anthropic Claude API: tool_use for structured output (training data, MEDIUM confidence -- verify current schema enforcement capabilities before implementation)
- Firecrawl batch API: training data (MEDIUM confidence -- verify batch endpoint exists at `/v1/batch/scrape` before implementation)
- Amazon Rufus/COSMO: no public API confirmed (HIGH confidence -- Amazon has not released any developer API for Rufus)

---

*Stack research: 2026-03-21*
