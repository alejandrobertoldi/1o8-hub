# 1o8 SEO Manager Implementation Plan — Plan 1 of 2 (Foundations)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Scope of this plan:** Foundations layer of the 9-phase pipeline — schema migration, brand guidelines storage, and canonical SKILL.md authoring. Ships as PR 1. Produces a working `.claude/skills/1o8-seo-manager/` tree the in-chat runner can read against the new typed tables, with legacy `/seo` route still operating unchanged.

**Out of scope (deferred to Plan 2):** Server-side runner, `/api/seo/projects/[id]/{listings,aplus,images,qa,passage-map,scores,run}` endpoints, `/seo/manager` UI updates, S7/S8/S9 phase wiring, S9 scoring engine, legacy `seo_asins.generatedContent` backfill + drop migration. Plan 2 will be authored after PR 1 ships, when assumptions in this plan are validated against real schema state.

**Goal:** Land schema (5 new typed tables + column additions to 4 existing tables) + canonical SKILL.md tree (orchestration spec, 9 phase files, 4 rubric files, schema.json wire contract) + brand guidelines MD ↔ DB sync. End state: in-chat invocation of `1o8-seo-manager` skill can read all phase prompts and the schema contract; new tables are queryable; legacy pipeline is untouched.

**Architecture (Plan 1 slice):** SKILL.md is the single source of truth — Plan 2's runner will import this same tree. New typed tables (`seo_listings`, `seo_aplus_plans`, `seo_images`, `seo_qa`, `seo_passage_map`, `seo_scores`) sit alongside legacy `seo_asins.generatedContent` and `seo_compliance_reports` (both retained until Plan 2's backfill). Brand guidelines source-of-truth is the `client_brand_guidelines` table (see `docs/superpowers/specs/2026-05-06-client-brand-guidelines-design.md` and the implementation plan `2026-05-06-client-brand-guidelines-implementation.md`). SEO projects snapshot from there at creation via `renderBrandGuidelinesMd()`; `seo_projects.brand_guidelines_lock` is populated from the snapshot. No filesystem artifact.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + PostgreSQL (Supabase), Vitest + Testing Library. (No Anthropic SDK or `papaparse` in Plan 1 — those land in Plan 2 with the runner.)

**Spec:** `docs/superpowers/specs/2026-05-06-1o8-seo-manager-design.md`
**Source process doc:** `AMAZON_SEO_GPT_v5_COMPLETE.md`

---

## Decisions Carried From Brainstorm Q&A

These were flagged as ambiguous when the user approved the spec — defaults locked here. (1) and (4) shape Plan 1's schema and SKILL.md text directly. (2) and (3) only matter in Plan 2 but are pinned here so the spec lock survives between plans.

1. **S6 atomic write:** `seo_listings` + Q&A subset of `seo_qa` + `seo_aplus_plans` headers + `seo_passage_map` are written in a single PG transaction at the end of S6, all-or-nothing. Plan 1 ensures the schema can support this transaction (FK ON DELETE CASCADE, unique constraints, version columns).
2. **Backfill ordering:** Backfill of legacy `seo_asins.generatedContent` runs as the last milestone of Plan 2, after S9 scoring is verified end-to-end. Plan 1 keeps the legacy column intact.
3. **S9 auto-rerun loop:** Exactly one auto-rerun of S6 on first S9 fail. Second fail surfaces in checkpoint review with miss list. No third pass. (Implemented in Plan 2.)
4. **S7/S8 default state:** New phases default to `pending_decision` (not `skipped`, not `approved`). Plan 1's schema reflects this — `s7_skipped` / `s8_skipped` default `false`, `s7_approved_at` / `s8_approved_at` default `null`. The implicit third state (`pending_decision`) is the absence of both signals.

## Milestone Map

Plan 1 produces shippable software at the end of any milestone — each row leaves the repo in a clean, type-checked, test-passing state. The natural PR cut is at the end of Milestone C (everything together), but Milestones A or A+B are also valid PR boundaries if the engineer wants smaller bites.

| Milestone | Tasks | Ships when complete |
|---|---|---|
| **A — Schema foundation** | 1-8 | New tables + columns deployed, legacy still works, types regenerated, migration tested with round-trip insert |
| **B — Brand guidelines storage** | — | OBSOLETED by client-level brand guidelines. See `2026-05-06-client-brand-guidelines-implementation.md` (D1, D2). |
| **C — SKILL.md authoring** | 13-22 | Canonical SKILL.md + 9 phase files + 4 rubrics + schema.json + 3 prompt modules + skill-loader, all parseable by `loadSkill()` |

After PR 1 (Plan 1) ships, run `/writing-plans` again on a focused Plan-2 spec covering: server-side runner, API endpoints for new phases, `/seo/manager` UI updates, S7-S9 wiring, S9 scoring engine, legacy backfill + 0052 drop migration.

## File Structure (Plan 1 only)

### New files

```
.claude/skills/1o8-seo-manager/
├── SKILL.md                                  # canonical orchestration + frontmatter
├── schema.json                               # wire contract for typed-table writes
├── phases/
│   ├── s1-intake.md
│   ├── s2-keywords.md
│   ├── s3-reviews.md
│   ├── s4-rufus.md
│   ├── s5-cosmo.md
│   ├── s6-listing-content.md
│   ├── s7-aplus.md
│   ├── s8-images.md
│   └── s9-score.md
└── rubrics/
    ├── rufus-coverage.md
    ├── cosmo-coverage.md
    ├── amazon-compliance.md
    └── byte-budgets.md

drizzle/migrations/
└── 0051_seo_manager_phase_overhaul.sql       # main migration (no 0052 in Plan 1)

src/lib/seo/
├── skill-loader.ts                           # parses .claude/skills/1o8-seo-manager/
└── prompts/
    ├── canonical-rufus-questions.ts          # 5 immutable Phase 1 questions
    ├── cosmo-relationships.ts                # 16 categories enum + definitions
    └── amazon-prohibited-words.ts            # ~200 word list + word-boundary scanner

tests/
├── db/
│   ├── seo-migration.test.ts                 # column/table presence
│   └── seo-tables.test.ts                    # round-trip insert + CHECK constraint
└── lib/seo/
    └── skill-loader.test.ts                  # SKILL.md tree load
```

### Modified files

- `src/lib/db/schema.ts` — append 6 new table definitions; extend `seoProjects`, `seoKeywords`, `seoRufus`, `seoCosmopMaps`. (Lines around 625-940 today; specific anchor lines noted in Tasks 4-5.)
- `drizzle/migrations/meta/_journal.json` — auto-regenerated by `npm run db:generate` in Task 7.

### Untouched in Plan 1 (deferred to Plan 2)

- `src/lib/seo/runner.ts`, `src/lib/seo/claude-client.ts`, `src/lib/seo/scoring.ts`, `src/lib/seo/compliance.ts`, `src/lib/seo/byte-budget.ts`
- `src/lib/seo/phases/*.ts` (TypeScript phase executors — `.md` specs in `.claude/skills/` are written in Plan 1, executors land in Plan 2)
- `src/app/api/seo/projects/[id]/{listings,aplus,images,qa,passage-map,scores,run}/`
- `src/app/seo/manager/page.tsx` and components
- `src/app/seo/[id]/page.tsx`
- `scripts/backfill-legacy-seo-content.ts`
- `drizzle/migrations/0052_drop_legacy_generated_content.sql`

---

## Milestone A — Schema Foundation

Goal: Land migration `0051_seo_manager_phase_overhaul.sql` that adds new tables + columns without breaking the existing pipeline. Legacy `seo_asins.generatedContent` stays. `seo_compliance_reports` stays for now (folded in Milestone J).

### Task 1: Write the migration test harness

**Files:**
- Create: `tests/db/seo-migration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/db/seo-migration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

describe("0051 seo_manager_phase_overhaul migration", () => {
  it("adds s7/s8/s9 timestamp columns to seo_projects", async () => {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'seo_projects'
      AND column_name IN ('s7_approved_at','s8_approved_at','s9_approved_at','s7_skipped','s8_skipped','brand_guidelines_md_path')
    `);
    expect(cols.length).toBe(6);
  });

  it("creates 6 new typed tables", async () => {
    const tables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('seo_listings','seo_aplus_plans','seo_images','seo_qa','seo_passage_map','seo_scores')
    `);
    expect(tables.length).toBe(6);
  });

  it("preserves seo_asins.generated_content as legacy", async () => {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'seo_asins' AND column_name = 'generated_content'
    `);
    expect(cols.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/db/seo-migration.test.ts`
Expected: FAIL — columns/tables do not exist yet.

- [ ] **Step 3: Commit failing test**

```bash
git add tests/db/seo-migration.test.ts
git commit -m "test(seo): pin migration contract for phase overhaul"
```

### Task 2: Author migration SQL — modified columns

**Files:**
- Create: `drizzle/migrations/0051_seo_manager_phase_overhaul.sql`

- [ ] **Step 1: Write the migration (part 1 — modify existing tables)**

```sql
-- 0051_seo_manager_phase_overhaul.sql
-- Adds 9-phase pipeline schema: S7 Premium A+, S8 Listing Images, S9 Scoring.
-- Backwards compatible: legacy seo_asins.generated_content + seo_compliance_reports retained.

BEGIN;

-- ─── seo_projects: phase timestamps + skip flags + brand guidelines path ───
ALTER TABLE seo_projects
  ADD COLUMN s7_approved_at timestamptz,
  ADD COLUMN s8_approved_at timestamptz,
  ADD COLUMN s9_approved_at timestamptz,
  ADD COLUMN s7_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN s8_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN brand_guidelines_md_path text;

-- Extend current_phase to allow S7/S8/S9
ALTER TABLE seo_projects
  ALTER COLUMN current_phase TYPE varchar(5);
-- (already varchar(5), no-op if so — kept for clarity)

-- ─── seo_keywords: Helium 10 + COSMO fields ───
ALTER TABLE seo_keywords
  ADD COLUMN semantic_group varchar(100),
  ADD COLUMN cerebro_iq integer,
  ADD COLUMN competing_products integer,
  ADD COLUMN title_density integer,
  ADD COLUMN cpr integer,
  ADD COLUMN competitor_rank_avg numeric,
  ADD COLUMN ppc_suggested_bid numeric,
  ADD COLUMN ppc_suggested_min_bid numeric,
  ADD COLUMN ppc_suggested_max_bid numeric,
  ADD COLUMN cosmo_domain varchar(50),
  ADD COLUMN composite_score numeric,
  ADD COLUMN is_negative boolean NOT NULL DEFAULT false,
  ADD COLUMN negative_reason text,
  ADD COLUMN is_competitor boolean NOT NULL DEFAULT false;
-- keyword_source kept (defaults to 'Helium 10' going forward; no flag rename)

-- ─── seo_rufus: stable IDs + per-sub-phase approval ───
ALTER TABLE seo_rufus
  ADD COLUMN phase1_approved_at timestamptz,
  ADD COLUMN phase2_approved_at timestamptz,
  ADD COLUMN phase3_approved_at timestamptz;
-- phase{1,2,3}_questions remain jsonb but new entries follow {id, text, intent_tier, batch_char_count} shape;
-- runner upgrades old string[] payloads on read.

-- ─── seo_cosmo_maps: confidence per triple + 16 categories enforced via runner ───
ALTER TABLE seo_cosmo_maps
  ADD COLUMN relationship_categories_evaluated jsonb DEFAULT '[]'::jsonb;
-- triples remain jsonb; runner now stamps {id, confidence_level: 'High'|'Medium'|'Low', ...} per triple.

COMMIT;
```

- [ ] **Step 2: Verify SQL parses (dry-run)**

Run: `psql "$DATABASE_URL" -c "BEGIN; \i drizzle/migrations/0051_seo_manager_phase_overhaul.sql; ROLLBACK;"`
Expected: prints `BEGIN`, all `ALTER TABLE` statements, `ROLLBACK`. No errors.

(If `psql` not available locally, defer to Task 8 where we run via `db:push` against dev branch.)

### Task 3: Author migration SQL — new typed tables

**Files:**
- Modify: `drizzle/migrations/0051_seo_manager_phase_overhaul.sql`

- [ ] **Step 1: Append new table definitions before `COMMIT;`**

Insert this block immediately before the existing `COMMIT;`:

```sql
-- ─── seo_listings: Amazon flat-file ready, 1 per ASIN ───
CREATE TABLE seo_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  title varchar(220),                              -- 190-200 target, hard cap 220
  bullets jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { detailed:[5], concise:[5], content:[5], key_features:[5] }
  product_description text,                        -- 1000-1200 target

  backend_search_terms text,                       -- ≤500 bytes single string
  backend_categories jsonb NOT NULL DEFAULT '{}'::jsonb,
                                                   -- { core, supplement, symptom, audience, longtail }
  subject_matter text,
  subject_matter_byte_length integer,

  byte_usage jsonb NOT NULL DEFAULT '{}'::jsonb,   -- per-field char/byte tracking
  category_required_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  compliance_violations jsonb NOT NULL DEFAULT '[]'::jsonb,

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asin_id, version)
);
CREATE INDEX idx_seo_listings_project ON seo_listings(project_id);
CREATE INDEX idx_seo_listings_asin ON seo_listings(asin_id);

-- ─── seo_aplus_plans: exactly 7 modules, last MUST be premium_qa ───
CREATE TABLE seo_aplus_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ position, module_type, cosmo_relationship, fields:{...}, images:[{technical_name, alt_text, overlay_text, ai_prompt, dimensions}] }]

  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asin_id, version)
);
CREATE INDEX idx_seo_aplus_project ON seo_aplus_plans(project_id);

-- ─── seo_images: 9 per ASIN, MAIN + PT01-PT08 ───
CREATE TABLE seo_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  image_number smallint NOT NULL,                  -- 1-9
  technical_name varchar(10) NOT NULL,             -- MAIN | PT01 | PT02 | ... | PT08
  image_type varchar(50),
  image_purpose text,
  cosmo_relationship varchar(50),
  buyer_stage varchar(20),                         -- Awareness | Consideration | Decision

  file_format varchar(10) NOT NULL DEFAULT 'PNG',
  width_px integer NOT NULL DEFAULT 2000,
  height_px integer NOT NULL DEFAULT 2000,
  color_mode varchar(10) NOT NULL DEFAULT 'RGB',

  overlay_text text,                               -- Not Applicable for MAIN
  overlay_text_length integer,
  alt_text text,                                   -- 95-100 chars
  alt_text_length integer,

  image_direction text,
  ai_image_prompt text,

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asin_id, image_number, version),
  CHECK (image_number BETWEEN 1 AND 9),
  CHECK (technical_name IN ('MAIN','PT01','PT02','PT03','PT04','PT05','PT06','PT07','PT08'))
);
CREATE INDEX idx_seo_images_project ON seo_images(project_id);
CREATE INDEX idx_seo_images_asin ON seo_images(asin_id);

-- ─── seo_qa: single Q&A artifact, 3 derived consumers ───
CREATE TABLE seo_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid REFERENCES seo_asins(id) ON DELETE CASCADE,
  -- asin_id null = project-level Q&A (variation-family wide)

  pairs jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ id, question, answer_short, answer_long, intent_tier, source_rufus_question_id, source_review_themes:[] }]

  -- Derived views (computed at S6 write, refreshed on regenerate)
  aplus_qa_subset jsonb NOT NULL DEFAULT '[]'::jsonb,        -- 5 pairs for A+ Q&A module
  customer_qa_export jsonb NOT NULL DEFAULT '[]'::jsonb,     -- full set for Amazon Customer Q&A
  passage_map_qa jsonb NOT NULL DEFAULT '[]'::jsonb,         -- pairs tagged with Rufus + COSMO ids

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_qa_project ON seo_qa(project_id);
CREATE INDEX idx_seo_qa_asin ON seo_qa(asin_id);

-- ─── seo_passage_map: audit trail for which passage covers which Rufus Q + COSMO triple ───
CREATE TABLE seo_passage_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  passages jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ section: 'title'|'bullet1'|...|'description'|'aplus_module_3'|'image_pt02', text, rufus_question_ids:[], cosmo_triple_ids:[], keywords_used:[] }]

  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_passage_map_asin ON seo_passage_map(asin_id);

-- ─── seo_scores: S9 hard gate output ───
CREATE TABLE seo_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  asin_id uuid NOT NULL REFERENCES seo_asins(id) ON DELETE CASCADE,

  rufus_coverage_pct numeric NOT NULL DEFAULT 0,
  rufus_5_canonical_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cosmo_coverage_pct numeric NOT NULL DEFAULT 0,
  cosmo_density_per_100_words numeric NOT NULL DEFAULT 0,
  cosmo_relationship_categories_evaluated jsonb NOT NULL DEFAULT '[]'::jsonb,
  buyer_journey_alignment jsonb NOT NULL DEFAULT '{}'::jsonb,
  byte_budget_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  prohibited_word_violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_rufus_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_cosmo_triples jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_grade varchar(2),                        -- A | B | C | D | F
  probe_transcript jsonb,                          -- only on opt-in deep audit
  rerun_count smallint NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  score_version integer NOT NULL DEFAULT 1
);
CREATE INDEX idx_seo_scores_project ON seo_scores(project_id);
CREATE INDEX idx_seo_scores_asin ON seo_scores(asin_id);
```

- [ ] **Step 2: Verify the SQL block is syntactically clean**

Run: `psql "$DATABASE_URL" -c "BEGIN; \i drizzle/migrations/0051_seo_manager_phase_overhaul.sql; ROLLBACK;"`
Expected: no errors.

- [ ] **Step 3: Commit migration SQL**

```bash
git add drizzle/migrations/0051_seo_manager_phase_overhaul.sql
git commit -m "feat(seo): migration for 9-phase pipeline tables and columns"
```

### Task 4: Update Drizzle schema — modified existing tables

**Files:**
- Modify: `src/lib/db/schema.ts:625-940`

- [ ] **Step 1: Extend `seoProjects` with new columns**

Find the `seoProjects` definition (around line 631) and add these inside the column object, after `s6ApprovedAt`:

```typescript
    s7ApprovedAt: timestamp("s7_approved_at", { withTimezone: true }),
    s8ApprovedAt: timestamp("s8_approved_at", { withTimezone: true }),
    s9ApprovedAt: timestamp("s9_approved_at", { withTimezone: true }),
    s7Skipped: boolean("s7_skipped").notNull().default(false),
    s8Skipped: boolean("s8_skipped").notNull().default(false),
    brandGuidelinesMdPath: text("brand_guidelines_md_path"),
```

- [ ] **Step 2: Extend `seoKeywords`**

Find `seoKeywords` (line ~786) and add after `keywordSource`:

```typescript
    semanticGroup: varchar("semantic_group", { length: 100 }),
    cerebroIq: integer("cerebro_iq"),
    competingProducts: integer("competing_products"),
    titleDensity: integer("title_density"),
    cpr: integer("cpr"),
    competitorRankAvg: numeric("competitor_rank_avg"),
    ppcSuggestedBid: numeric("ppc_suggested_bid"),
    ppcSuggestedMinBid: numeric("ppc_suggested_min_bid"),
    ppcSuggestedMaxBid: numeric("ppc_suggested_max_bid"),
    cosmoDomain: varchar("cosmo_domain", { length: 50 }),
    compositeScore: numeric("composite_score"),
    isNegative: boolean("is_negative").notNull().default(false),
    negativeReason: text("negative_reason"),
    isCompetitor: boolean("is_competitor").notNull().default(false),
```

(Note: `numeric` import — if not already imported from `drizzle-orm/pg-core`, add it to the top of `schema.ts`.)

- [ ] **Step 3: Extend `seoRufus` types and approval flags**

Find `seoRufus` (line ~853) and:

(a) Replace the `phase1Questions`/`phase2Questions`/`phase3Questions` types:

```typescript
  phase1Questions: jsonb("phase1_questions")
    .$type<Array<{ id: string; text: string; intent_tier: string; batch_char_count: number }>>()
    .default([]),
  // (same for phase2 and phase3)
```

(b) Add approval timestamps before `createdAt`:

```typescript
  phase1ApprovedAt: timestamp("phase1_approved_at", { withTimezone: true }),
  phase2ApprovedAt: timestamp("phase2_approved_at", { withTimezone: true }),
  phase3ApprovedAt: timestamp("phase3_approved_at", { withTimezone: true }),
```

- [ ] **Step 4: Extend `seoCosmopMaps`**

Find `seoCosmopMaps` (line ~885) and:

(a) Update the `triples` type to include stable id + confidence_level:

```typescript
  triples: jsonb("triples")
    .$type<Array<{
      id: string;
      entity1: string;
      relationship: string;       // one of 16 v5 §5.3 categories
      entity2: string;
      confidence: number;
      confidence_level: "High" | "Medium" | "Low";
      supporting_keyword_tier: string | null;
    }>>()
    .default([]),
```

(b) Add `relationshipCategoriesEvaluated` before `createdAt`:

```typescript
  relationshipCategoriesEvaluated: jsonb("relationship_categories_evaluated")
    .$type<string[]>()
    .default([]),
```

- [ ] **Step 5: Run typecheck**

Run: `npm run build`
Expected: type errors only in code that consumes these tables (those will be fixed in later tasks). Schema file itself must compile clean.

If schema-file errors appear, fix them — likely a missing import (e.g. `numeric`, `boolean`).

- [ ] **Step 6: Commit schema modifications**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(seo): drizzle schema for modified S1-S5 tables"
```

### Task 5: Update Drizzle schema — 6 new tables

**Files:**
- Modify: `src/lib/db/schema.ts` (append after `seoComplianceReports` definition, before any closing block)

- [ ] **Step 1: Append the 6 new table definitions**

Add after `seoComplianceReports` (line ~944):

```typescript
// ─── SEO Listings ────────────────────────────────────────────────────
// S6 output — Amazon flat-file ready, 1 row per ASIN per version.

export const seoListings = pgTable(
  "seo_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 220 }),
    bullets: jsonb("bullets")
      .$type<{
        detailed: string[];      // 5 × 390-400 chars
        concise: string[];       // 5 × 190-200 chars
        content: string[];       // 5 × 90-100 chars
        key_features: string[];  // 5 × 40-50 chars
      }>()
      .default({ detailed: [], concise: [], content: [], key_features: [] }),
    productDescription: text("product_description"),
    backendSearchTerms: text("backend_search_terms"),
    backendCategories: jsonb("backend_categories")
      .$type<{ core: string; supplement: string; symptom: string; audience: string; longtail: string }>()
      .default({ core: "", supplement: "", symptom: "", audience: "", longtail: "" }),
    subjectMatter: text("subject_matter"),
    subjectMatterByteLength: integer("subject_matter_byte_length"),
    byteUsage: jsonb("byte_usage")
      .$type<Record<string, { used: number; max: number; ok: boolean }>>()
      .default({}),
    categoryRequiredAttributes: jsonb("category_required_attributes")
      .$type<Record<string, string>>()
      .default({}),
    complianceViolations: jsonb("compliance_violations")
      .$type<Array<{ field: string; word: string; type: string; auto_corrected_to?: string; bypassed: boolean }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_listings_project").on(table.projectId),
    index("idx_seo_listings_asin").on(table.asinId),
  ]
);

export const seoAplusPlans = pgTable(
  "seo_aplus_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    modules: jsonb("modules")
      .$type<Array<{
        position: number;        // 1-7
        module_type: string;     // hero | comparison_table_4cell | image_text | ... | premium_qa
        cosmo_relationship: string | null;
        fields: Record<string, string>;
        images: Array<{
          technical_name: string;
          alt_text: string;
          overlay_text: string;
          ai_prompt: string;
          dimensions: string;
        }>;
      }>>()
      .default([]),
    validationErrors: jsonb("validation_errors")
      .$type<Array<{ position: number; field: string; message: string }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_seo_aplus_project").on(table.projectId)]
);

export const seoImages = pgTable(
  "seo_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    imageNumber: smallint("image_number").notNull(),
    technicalName: varchar("technical_name", { length: 10 }).notNull(),
    imageType: varchar("image_type", { length: 50 }),
    imagePurpose: text("image_purpose"),
    cosmoRelationship: varchar("cosmo_relationship", { length: 50 }),
    buyerStage: varchar("buyer_stage", { length: 20 }),
    fileFormat: varchar("file_format", { length: 10 }).notNull().default("PNG"),
    widthPx: integer("width_px").notNull().default(2000),
    heightPx: integer("height_px").notNull().default(2000),
    colorMode: varchar("color_mode", { length: 10 }).notNull().default("RGB"),
    overlayText: text("overlay_text"),
    overlayTextLength: integer("overlay_text_length"),
    altText: text("alt_text"),
    altTextLength: integer("alt_text_length"),
    imageDirection: text("image_direction"),
    aiImagePrompt: text("ai_image_prompt"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_images_project").on(table.projectId),
    index("idx_seo_images_asin").on(table.asinId),
  ]
);

export const seoQa = pgTable(
  "seo_qa",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id").references(() => seoAsins.id, { onDelete: "cascade" }),

    pairs: jsonb("pairs")
      .$type<Array<{
        id: string;
        question: string;
        answer_short: string;
        answer_long: string;
        intent_tier: string;
        source_rufus_question_id: string | null;
        source_review_themes: string[];
      }>>()
      .default([]),
    aplusQaSubset: jsonb("aplus_qa_subset")
      .$type<Array<{ id: string; question: string; answer: string }>>()
      .default([]),
    customerQaExport: jsonb("customer_qa_export")
      .$type<Array<{ id: string; question: string; answer: string }>>()
      .default([]),
    passageMapQa: jsonb("passage_map_qa")
      .$type<Array<{ pair_id: string; rufus_question_ids: string[]; cosmo_triple_ids: string[] }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_qa_project").on(table.projectId),
    index("idx_seo_qa_asin").on(table.asinId),
  ]
);

export const seoPassageMap = pgTable(
  "seo_passage_map",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    passages: jsonb("passages")
      .$type<Array<{
        section: string;
        text: string;
        rufus_question_ids: string[];
        cosmo_triple_ids: string[];
        keywords_used: string[];
      }>>()
      .default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_seo_passage_map_asin").on(table.asinId)]
);

export const seoScores = pgTable(
  "seo_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    asinId: uuid("asin_id")
      .notNull()
      .references(() => seoAsins.id, { onDelete: "cascade" }),

    rufusCoveragePct: numeric("rufus_coverage_pct").notNull().default("0"),
    rufus5CanonicalCoverage: jsonb("rufus_5_canonical_coverage")
      .$type<Record<string, { covered: boolean; locations: string[] }>>()
      .default({}),
    cosmoCoveragePct: numeric("cosmo_coverage_pct").notNull().default("0"),
    cosmoDensityPer100Words: numeric("cosmo_density_per_100_words").notNull().default("0"),
    cosmoRelationshipCategoriesEvaluated: jsonb("cosmo_relationship_categories_evaluated")
      .$type<string[]>()
      .default([]),
    buyerJourneyAlignment: jsonb("buyer_journey_alignment")
      .$type<Record<string, { expected_stage: string; detected_stage: string; points: number }>>()
      .default({}),
    byteBudgetStatus: jsonb("byte_budget_status")
      .$type<Record<string, { used: number; max: number; ok: boolean }>>()
      .default({}),
    prohibitedWordViolations: jsonb("prohibited_word_violations")
      .$type<Array<{ field: string; word: string }>>()
      .default([]),
    missingRufusQuestions: jsonb("missing_rufus_questions").$type<string[]>().default([]),
    missingCosmoTriples: jsonb("missing_cosmo_triples").$type<string[]>().default([]),
    overallGrade: varchar("overall_grade", { length: 2 }),
    probeTranscript: jsonb("probe_transcript").$type<Array<{ query: string; response: string }>>(),
    rerunCount: smallint("rerun_count").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    scoreVersion: integer("score_version").notNull().default(1),
  },
  (table) => [
    index("idx_seo_scores_project").on(table.projectId),
    index("idx_seo_scores_asin").on(table.asinId),
  ]
);
```

- [ ] **Step 2: Add missing imports at top of file**

Ensure these are imported from `drizzle-orm/pg-core`:

```typescript
import { numeric, smallint } from "drizzle-orm/pg-core";
```

(Add to existing import line — do not duplicate the import block.)

- [ ] **Step 3: Run typecheck**

Run: `npm run build`
Expected: any errors must be in OTHER files that reference deleted/renamed columns. Schema file itself must be clean.

- [ ] **Step 4: Commit new schema definitions**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(seo): drizzle definitions for 6 new typed tables"
```

### Task 6: Apply migration to dev database

**Files:**
- Run: migration on local dev DB (which IS prod per memory)

- [ ] **Step 1: Confirm DATABASE_URL points to a non-prod-critical context**

Run: `node -e "console.log(process.env.DATABASE_URL?.split('@')[1])"` (loaded via `dotenv`)
Expected: prints the Supabase host. The user has `feedback_local_db_is_prod.md` — confirm with user before running this step. **DO NOT proceed without explicit user go-ahead.**

- [ ] **Step 2: Apply migration**

Run: `npm run db:migrate`
Expected: prints `Applied 0051_seo_manager_phase_overhaul.sql`. No errors.

If `db:migrate` fails: read error, fix migration SQL, drop the changes already applied with a hand-written rollback in `psql`, re-run.

- [ ] **Step 3: Verify migration test now passes**

Run: `npm run test -- tests/db/seo-migration.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 4: Commit migration application proof**

No commit needed — the test from Task 1 already passing is the proof.

### Task 7: Regenerate Drizzle types snapshot

**Files:**
- Run: `npm run db:generate`

- [ ] **Step 1: Run generate**

Run: `npm run db:generate`
Expected: produces a new `drizzle/migrations/meta/_journal.json` entry pointing to 0051.

- [ ] **Step 2: Diff the generated SQL against the hand-written 0051**

Run: `git diff drizzle/migrations/`
Expected: only the journal entry changes — Drizzle agrees the schema matches our hand-written migration. If Drizzle wants to generate a 0052 with extra changes, the hand-written SQL has drifted from the schema definitions; reconcile before continuing.

- [ ] **Step 3: Commit journal update**

```bash
git add drizzle/migrations/meta/
git commit -m "chore(seo): regenerate drizzle journal for 0051"
```

### Task 8: Sanity insert via Drizzle

**Files:**
- Create: `tests/db/seo-tables.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/db/seo-tables.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  seoProjects, seoAsins, seoListings, seoAplusPlans, seoImages,
  seoQa, seoPassageMap, seoScores
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("new SEO tables — round-trip insert/select", () => {
  let projectId: string;
  let asinId: string;

  afterEach(async () => {
    if (projectId) await db.delete(seoProjects).where(eq(seoProjects.id, projectId));
  });

  it("inserts a listing with bullets in 4×5 shape", async () => {
    const [p] = await db.insert(seoProjects).values({
      createdBy: "test@1o8.agency", name: "test-listing", brandName: "TestBrand"
    }).returning();
    projectId = p.id;

    const [a] = await db.insert(seoAsins).values({
      projectId: p.id, asin: "B0TEST0001", sku: "TEST-SKU"
    }).returning();
    asinId = a.id;

    const [l] = await db.insert(seoListings).values({
      projectId: p.id, asinId: a.id,
      title: "Test - Hyphen Only - No Colons - 190 To 200 Chars",
      bullets: {
        detailed: ["A","B","C","D","E"],
        concise: ["A","B","C","D","E"],
        content: ["A","B","C","D","E"],
        key_features: ["A","B","C","D","E"],
      },
      backendSearchTerms: "kw1 kw2 kw3"
    }).returning();
    expect(l.bullets.detailed.length).toBe(5);
  });

  it("inserts a 9-image set with MAIN+PT01-PT08 names", async () => {
    const [p] = await db.insert(seoProjects).values({
      createdBy: "test@1o8.agency", name: "test-images", brandName: "TestBrand"
    }).returning();
    projectId = p.id;
    const [a] = await db.insert(seoAsins).values({
      projectId: p.id, asin: "B0TEST0002", sku: "IMG-SKU"
    }).returning();

    const names = ["MAIN","PT01","PT02","PT03","PT04","PT05","PT06","PT07","PT08"];
    for (let i = 0; i < 9; i++) {
      await db.insert(seoImages).values({
        projectId: p.id, asinId: a.id, imageNumber: i + 1, technicalName: names[i]
      });
    }
    const rows = await db.select().from(seoImages).where(eq(seoImages.asinId, a.id));
    expect(rows.length).toBe(9);
  });

  it("rejects technical_name outside MAIN+PT01-PT08 (CHECK constraint)", async () => {
    const [p] = await db.insert(seoProjects).values({
      createdBy: "test@1o8.agency", name: "test-bad-image", brandName: "TestBrand"
    }).returning();
    projectId = p.id;
    const [a] = await db.insert(seoAsins).values({
      projectId: p.id, asin: "B0TEST0003", sku: "BAD-SKU"
    }).returning();

    await expect(
      db.insert(seoImages).values({
        projectId: p.id, asinId: a.id, imageNumber: 1, technicalName: "PT99"
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test -- tests/db/seo-tables.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 3: Commit**

```bash
git add tests/db/seo-tables.test.ts
git commit -m "test(seo): round-trip integration for new tables"
```

**Milestone A done.** Schema is in place, types match, legacy tables untouched.

---

## Milestone B — OBSOLETED

### Tasks 9-12 — DELETED
See `2026-05-06-client-brand-guidelines-implementation.md` (Tasks D1, D2). These tasks were obsoleted before execution.

---

## Milestone C — SKILL.md Authoring

Goal: Produce the canonical `.claude/skills/1o8-seo-manager/` tree. The skill IS the contract — both the in-chat runner and the in-app runner read from it. Each phase file is a complete prompt template with input slots, model instructions, output schema, and self-validation rubric. Rubric files are pure spec. `schema.json` is the wire contract for typed-table writes.

### Task 13: SKILL.md frontmatter + orchestration

**Files:**
- Create: `.claude/skills/1o8-seo-manager/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

```markdown
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
4. **Title** — 190-200 chars, hyphen-only punctuation, no colons, word-repetition cap 2.
5. **Backend search terms** — single string, ≤500 bytes UTF-8. One byte over = full de-index.
6. **A+ Premium plan** — exactly 7 modules. Module 7 MUST be `premium_qa` (5 pairs, Q=115-120 chars, A=245-250 chars, Decision-stage). At most one `comparison_table_*` module total.
7. **Images** — exactly 9 per ASIN. Technical names fixed: `MAIN`, `PT01`, `PT02`, `PT03`, `PT04`, `PT05`, `PT06`, `PT07`, `PT08`. All PNG, 2000×2000, RGB. Alt text 95-100 chars. Overlay text ≤100 chars (Not Applicable for MAIN).
8. **Compliance** — `rubrics/amazon-compliance.md` lists ~200 prohibited words (v5 §6.3). Auto-corrections apply at write. Bypassing requires explicit user override per field.
9. **Brand guidelines overlay** — `seo_projects.brand_guidelines_lock.words_to_avoid` augments the prohibited list. Amazon Section 6 always wins on conflict.
10. **Atomic S6 write** — on S6 completion, `seo_listings`, `seo_qa.aplus_qa_subset`, `seo_aplus_plans` (headers only), and `seo_passage_map` are written in one PG transaction. All-or-nothing.

## Phase Orchestration

For each `project_id`:

1. Read `seo_projects` row → load brand guidelines lock + `current_phase`.
2. Run phases sequentially S1 → S9.
3. Auto-flow exception: at S4 Phase 1, prompt-and-wait. The user must paste 5 immutable questions into live Amazon Rufus and paste responses back. Resume on response.
4. Each phase has its own file in `phases/`. Read the file. Substitute `{{slots}}` with project context. Issue exactly one Claude call per phase batch.
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
- `rubrics/byte-budgets.md` — title 190-200, desc 1000-1200, backend ≤500B, bullet variants

## Schema Contract

`schema.json` lists every typed-table column with type, range, and examples. The runner validates writes against this file before committing. Mismatches throw before any DB call.
```

- [ ] **Step 2: Verify file is well-formed**

Run: `head -3 .claude/skills/1o8-seo-manager/SKILL.md`
Expected: prints `---\nname: 1o8-seo-manager\ndescription: …`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/1o8-seo-manager/SKILL.md
git commit -m "feat(seo): canonical SKILL.md for 1o8 SEO manager"
```

### Task 14: schema.json wire contract

**Files:**
- Create: `.claude/skills/1o8-seo-manager/schema.json`

- [ ] **Step 1: Write schema contract**

```json
{
  "version": 1,
  "tables": {
    "seo_listings": {
      "title": { "type": "string", "minChars": 190, "maxChars": 200, "forbidChars": [":"], "punctuation": "hyphen-only", "wordRepeatCap": 2 },
      "bullets.detailed": { "type": "string[]", "length": 5, "minChars": 390, "maxChars": 400, "headerPrefix": "ALL_CAPS_COLON" },
      "bullets.concise": { "type": "string[]", "length": 5, "minChars": 190, "maxChars": 200, "headerPrefix": "ALL_CAPS_COLON" },
      "bullets.content": { "type": "string[]", "length": 5, "minChars": 90, "maxChars": 100, "headerPrefix": "ALL_CAPS_COLON" },
      "bullets.key_features": { "type": "string[]", "length": 5, "minChars": 40, "maxChars": 50, "headerPrefix": "ALL_CAPS_COLON" },
      "product_description": { "type": "string", "minChars": 1000, "maxChars": 1200, "forbidChars": [":"] },
      "backend_search_terms": { "type": "string", "maxBytes": 500, "encoding": "utf8" }
    },
    "seo_aplus_plans": {
      "modules": { "type": "object[]", "length": 7, "module_7_must_be": "premium_qa", "max_one_of_type_prefix": "comparison_table_" }
    },
    "seo_images": {
      "image_count_per_asin": 9,
      "technical_names": ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08"],
      "file_format": "PNG",
      "dimensions": { "width": 2000, "height": 2000 },
      "color_mode": "RGB",
      "alt_text": { "minChars": 95, "maxChars": 100 },
      "overlay_text": { "maxChars": 100, "exempt_for": ["MAIN"] }
    },
    "seo_qa": {
      "pairs": { "type": "object[]", "minLength": 12, "maxLength": 15 },
      "aplus_qa_subset": { "type": "object[]", "length": 5, "question_chars": [115, 120], "answer_chars": [245, 250] }
    },
    "seo_scores": {
      "rufus_coverage_pct": { "type": "number", "min": 0, "max": 100, "hardGate": 80 },
      "cosmo_coverage_pct": { "type": "number", "min": 0, "max": 100, "hardGate": 75 },
      "cosmo_density_per_100_words": { "type": "number", "min": 3, "max": 5 },
      "cosmo_relationship_categories_evaluated": { "type": "string[]", "length": 16 }
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/skills/1o8-seo-manager/schema.json','utf8'))"`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/1o8-seo-manager/schema.json
git commit -m "feat(seo): schema.json wire contract for typed tables"
```

### Task 15: Phase file — S1 Intake

**Files:**
- Create: `.claude/skills/1o8-seo-manager/phases/s1-intake.md`

- [ ] **Step 1: Write phase file**

```markdown
# S1 — Intake

Map to v5 §1 + §1.13.

## Inputs

- `project_id` (uuid)
- Brand guidelines markdown (snapshot from `seo_projects.brand_guidelines_lock`, populated at project creation by `renderBrandGuidelinesMd()` from `client_brand_guidelines`)
- Variation theme (if any)
- ASIN list with: `asin`, `sku`, `amazon_url`, `website_url`, `parentage_level`, `variation_*` fields, existing listing content (Columns M-AM)

## Slots

- `{{client_id_code}}`
- `{{brand_name}}`
- `{{brand_voice}}`
- `{{words_to_avoid}}`
- `{{positioning}}`
- `{{variation_theme}}`
- `{{asin_grid_json}}` — full ASIN list as JSON

## Prompt

You are intake-validating an Amazon SEO project for {{brand_name}} ({{client_id_code}}).

Brand Voice: {{brand_voice}}
Positioning: {{positioning}}
Words to avoid: {{words_to_avoid}}
Variation theme: {{variation_theme}}

ASIN intake grid:
{{asin_grid_json}}

Tasks:
1. For each ASIN, run a `baseline_analysis` (see schema below) on the existing listing content. Score quality 0-100.
2. Flag compliance issues from the existing content against the prohibited word list (referenced from `rubrics/amazon-compliance.md`).
3. List the top 3 improvements per ASIN.
4. Identify keyword integration: "strong" | "moderate" | "weak".

## Output Schema

```json
{
  "asins": [
    {
      "asin": "B0XXXXXXXX",
      "baseline_analysis": {
        "quality_score": 73,
        "keyword_integration": "moderate",
        "compliance_flags": ["uses 'cures'"],
        "top_improvements": ["..."]
      }
    }
  ]
}
```

## Validation

- Every ASIN in `{{asin_grid_json}}` must have a row in output.
- `quality_score` ∈ [0, 100].
- `keyword_integration` ∈ {"strong", "moderate", "weak"}.

## Persistence

- Update `seo_asins.baseline_analysis` per row.
- Stamp `seo_projects.s1_approved_at` after user review.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/1o8-seo-manager/phases/s1-intake.md
git commit -m "feat(seo): S1 intake phase spec"
```

### Task 16: Phase file — S2 Keywords (Helium 10 strict)

**Files:**
- Create: `.claude/skills/1o8-seo-manager/phases/s2-keywords.md`

- [ ] **Step 1: Write phase file**

```markdown
# S2 — Keywords (Helium 10 Cerebro only)

Map to v5 §2. **Hard gate:** Helium 10 Cerebro CSV is required. No Claude fallback.

## Inputs

- `project_id`
- Helium 10 Cerebro CSV — required columns: `Keyword Phrase`, `Search Volume`, `Cerebro IQ Score`, `Competing Products`, `Title Density`, `CPR`, `H10 PPC Sugg. Bid`, `H10 PPC Min Bid`, `H10 PPC Max Bid`, `Match Type`
- Approved S1 baseline analysis (for product context)

## Slots

- `{{cerebro_csv}}` — full CSV
- `{{baseline_summary}}` — 1-paragraph product summary from S1

## Prompt

Process the Helium 10 Cerebro export below. Produce keyword groups and per-keyword classification.

CSV:
{{cerebro_csv}}

Product summary:
{{baseline_summary}}

For every keyword, output:
- `text`
- `search_volume`, `cerebro_iq`, `competing_products`, `title_density`, `cpr`, `ppc_suggested_bid`, `ppc_suggested_min_bid`, `ppc_suggested_max_bid` (from CSV)
- `match_type` (Exact | Phrase | Broad — from CSV)
- `priority_tier` ∈ {"T1","T2","T3","T4"} — T1 = highest priority core terms
- `search_intent` (one of: Informational, Navigational, Commercial, Transactional)
- `primary_use_location` (e.g. "kitchen", "office", "outdoor")
- `cosmo_domain` ∈ {"Benefit","Feature","Attribute","Audience","Occasion"}
- `buyer_stage` ∈ {"Awareness","Consideration","Decision"}
- `semantic_group` (cluster label — up to 6 clusters)
- `composite_score` (0-100 — your weighted ranking)
- `is_negative` (true if shopper would NOT want this product)
- `negative_reason` (if is_negative)
- `is_competitor` (true if it's a competitor brand term)
- `notes` (any flag)

## Output Schema

```json
{
  "keywords": [
    {
      "text": "...",
      "search_volume": 1234,
      "priority_tier": "T1",
      "search_intent": "Commercial",
      "primary_use_location": "...",
      "match_type": "Exact",
      "cosmo_domain": "Benefit",
      "buyer_stage": "Decision",
      "semantic_group": "core_product",
      "cerebro_iq": 87,
      "competing_products": 4321,
      "title_density": 12,
      "cpr": 8,
      "competitor_rank_avg": 12.3,
      "ppc_suggested_bid": 1.45,
      "ppc_suggested_min_bid": 0.85,
      "ppc_suggested_max_bid": 2.10,
      "composite_score": 91,
      "is_negative": false,
      "negative_reason": null,
      "is_competitor": false,
      "notes": "",
      "keyword_source": "Helium 10"
    }
  ]
}
```

## Validation

- Every CSV row → exactly one output row.
- `priority_tier` and `cosmo_domain` and `buyer_stage` MUST use exact strings above.
- If user supplies <50 keywords, surface a warning but do not block.

## Persistence

- Bulk insert into `seo_keywords` (replace project's previous keyword set on re-run).
- Stamp `seo_projects.s2_approved_at` after user review.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/1o8-seo-manager/phases/s2-keywords.md
git commit -m "feat(seo): S2 keywords phase spec — Helium 10 strict"
```

### Task 17: Phase file — S3 Reviews

**Files:**
- Create: `.claude/skills/1o8-seo-manager/phases/s3-reviews.md`

- [ ] **Step 1: Write phase file**

```markdown
# S3 — Reviews

Map to v5 §3.

## Inputs

- `project_id`
- Reviews CSV (per-ASIN reviews) OR Rainforest API pull

## Slots

- `{{reviews_csv}}` — flat review table
- `{{product_summary}}` — from S1

## Prompt

Analyze the customer reviews below.

Reviews:
{{reviews_csv}}

Product summary:
{{product_summary}}

For each review, classify:
- `sentiment` ∈ {"positive","neutral","negative"}
- `key_themes` — comma-separated theme tags
- `usage_mentioned` — what the customer did with the product
- `packaging_feedback`, `price_feedback`, `heat_level_feedback` (if applicable; null otherwise)
- `rufus_usable_insight` — short paraphrase Rufus could quote (≤120 chars)
- `bullet_mapping` — which target bullet (1-5) this insight should land in

## Output Schema

```json
{
  "reviews": [
    {
      "review_id": "R...",
      "asin": "B0...",
      "sentiment": "positive",
      "key_themes": "ease-of-use, durability",
      "usage_mentioned": "daily morning routine",
      "rufus_usable_insight": "Lasts through 8-hour shifts.",
      "bullet_mapping": "3"
    }
  ]
}
```

## Persistence

- Bulk insert into `seo_reviews` (per project, replace on re-run).
- Stamp `seo_projects.s3_approved_at` after user review.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/1o8-seo-manager/phases/s3-reviews.md
git commit -m "feat(seo): S3 reviews phase spec"
```

### Task 18: Phase file — S4 Rufus (3 sub-phases, manual paste)

**Files:**
- Create: `.claude/skills/1o8-seo-manager/phases/s4-rufus.md`
- Create: `src/lib/seo/prompts/canonical-rufus-questions.ts`

- [ ] **Step 1: Write canonical questions module**

```typescript
// src/lib/seo/prompts/canonical-rufus-questions.ts
// v5 §4.3.1.3 — IMMUTABLE. Do not edit text. Do not reorder.

export type CanonicalRufusQuestion = {
  id: string;
  text: string;
  intent_tier: "discovery" | "consideration" | "decision";
};

export const CANONICAL_RUFUS_QUESTIONS: readonly CanonicalRufusQuestion[] = [
  { id: "RQ1", text: "What is this product for?", intent_tier: "discovery" },
  { id: "RQ2", text: "Who is this product designed for?", intent_tier: "discovery" },
  { id: "RQ3", text: "What problem does this product solve?", intent_tier: "consideration" },
  { id: "RQ4", text: "What makes this product different from alternatives?", intent_tier: "consideration" },
  { id: "RQ5", text: "Why should I buy this product over the competition?", intent_tier: "decision" },
] as const;

export const CANONICAL_RUFUS_IDS = CANONICAL_RUFUS_QUESTIONS.map((q) => q.id);
```

- [ ] **Step 2: Write phase file**

```markdown
# S4 — Rufus (3 sub-phases)

Map to v5 §4. **Partially manual:** the user must paste questions into live Amazon Rufus and paste responses back.

## Sub-phases

### Phase 1 — IMMUTABLE 5 questions

The 5 canonical questions live in `src/lib/seo/prompts/canonical-rufus-questions.ts`. Never edit. Never reorder. Never substitute.

Flow:
1. Runner reads canonical questions, displays them to user.
2. User pastes Q1 into live Amazon Rufus, pastes Rufus response back.
3. Repeat for Q2-Q5.
4. Runner stamps `seo_rufus.phase1_approved_at` only after all 5 responses are recorded.

### Phase 2 — Generated probing questions (≤496 char batches)

After Phase 1 responses are in, generate 10-15 follow-up questions targeting gaps in v5's 5 canonical query types (see `rubrics/rufus-coverage.md`).

Batch each question payload at ≤496 characters (Amazon Rufus input limit).

### Phase 3 — Optimization synthesis

Once Phase 1 + Phase 2 responses are collected, synthesize:
- `seo_strategy` (one paragraph)
- `listing_plan` (per-section bullet list)
- `image_strategy` (per-image-slot direction — feeds S8)
- `audience_segmentation` (3-5 personas)
- `action_list` (string[])

## Slots

- `{{phase1_responses}}`
- `{{phase2_questions_and_responses}}`
- `{{baseline_summary}}`

## Output Schemas

### Phase 1

```json
{
  "phase1_questions": [
    { "id": "RQ1", "text": "What is this product for?", "intent_tier": "discovery", "batch_char_count": 32 }
  ],
  "phase1_answers": ["Rufus response …"]
}
```

### Phase 2

```json
{
  "phase2_questions": [
    { "id": "PQ_001", "text": "Does this work on sensitive skin?", "intent_tier": "consideration", "batch_char_count": 36 }
  ],
  "phase2_answers": ["Rufus response …"]
}
```

### Phase 3

```json
{
  "phase3_questions": [],
  "phase3_answers": [],
  "rows": [
    { "question_id": "RQ1", "category": "discovery", "rufus_response_summary": "...", "listing_implication": "..." }
  ],
  "optimization_summary": {
    "seo_strategy": "...",
    "listing_plan": "...",
    "image_strategy": "...",
    "audience_segmentation": "...",
    "action_list": ["..."]
  }
}
```

## Persistence

- Update `seo_rufus` row (one per project; unique constraint).
- Stamp per-sub-phase approval timestamps.
- Stamp `seo_projects.s4_approved_at` after Phase 3.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/1o8-seo-manager/phases/s4-rufus.md src/lib/seo/prompts/canonical-rufus-questions.ts
git commit -m "feat(seo): S4 rufus phase spec + immutable canonical questions"
```

### Task 19: Phase file — S5 COSMO (16 categories)

**Files:**
- Create: `.claude/skills/1o8-seo-manager/phases/s5-cosmo.md`
- Create: `src/lib/seo/prompts/cosmo-relationships.ts`

- [ ] **Step 1: Write COSMO relationships module**

```typescript
// src/lib/seo/prompts/cosmo-relationships.ts
// v5 §5.3 — 16 relationship categories. ALL must be evaluated per ASIN.

export const COSMO_RELATIONSHIPS = [
  "USED_FOR_FUNC",
  "USED_TO",
  "CAPABLE_OF",
  "USED_FOR_EVE",
  "USED_ON",
  "USED_IN_LOC",
  "USED_AS",
  "IS_A",
  "xIS_A",
  "USED_IN_BODY",
  "USED_WITH",
  "USED_FOR_AUD",
  "USED_BY",
  "xINTERESTED_IN",
  "xWANT",
  "xLIKES",
] as const;

export type CosmoRelationship = typeof COSMO_RELATIONSHIPS[number];

export const COSMO_RELATIONSHIP_DEFINITIONS: Record<CosmoRelationship, string> = {
  USED_FOR_FUNC: "Product → primary function it performs",
  USED_TO: "Product → action verb the user takes",
  CAPABLE_OF: "Product → capability or feature it enables",
  USED_FOR_EVE: "Product → event or occasion of use",
  USED_ON: "Product → surface, material, or object it is applied to",
  USED_IN_LOC: "Product → physical location of use",
  USED_AS: "Product → role or substitute it serves",
  IS_A: "Product → category or type it belongs to",
  xIS_A: "Product → category it explicitly is NOT",
  USED_IN_BODY: "Product → body area or system targeted",
  USED_WITH: "Product → companion or accessory paired with",
  USED_FOR_AUD: "Product → audience segment it serves",
  USED_BY: "Product → user persona or role",
  xINTERESTED_IN: "Product → adjacent interest the buyer holds",
  xWANT: "Product → desire or aspiration the buyer has",
  xLIKES: "Product → preference signal of buyer",
};
```

- [ ] **Step 2: Write phase file**

```markdown
# S5 — COSMO

Map to v5 §5. **All 16 relationship categories MUST be evaluated** per ASIN. Categories may have zero triples for an ASIN, but every category MUST appear in the `relationship_categories_evaluated` array.

## Inputs

- `project_id`
- Approved S2 keywords
- Approved S4 Rufus optimization summary

## Slots

- `{{keywords_by_tier_json}}`
- `{{rufus_summary}}`
- `{{product_summary}}`

## Prompt

Build the COSMO graph for this product.

Keywords by tier:
{{keywords_by_tier_json}}

Rufus summary:
{{rufus_summary}}

Product:
{{product_summary}}

For EACH of the 16 relationship categories from `prompts/cosmo-relationships.ts`, generate triples.

Density target: 3-5 explicit relationships per 100 words of eventual listing content (the runner will validate at S6 / S9).
Coverage target: at least 70% of T1+T2 keywords reflected in graph entities.

## Output Schema

```json
{
  "triples": [
    {
      "id": "T_001",
      "entity1": "...",
      "relationship": "USED_FOR_FUNC",
      "entity2": "...",
      "confidence": 0.92,
      "confidence_level": "High",
      "supporting_keyword_tier": "T1"
    }
  ],
  "relationship_categories_evaluated": [
    "USED_FOR_FUNC", "USED_TO", "CAPABLE_OF", "USED_FOR_EVE",
    "USED_ON", "USED_IN_LOC", "USED_AS", "IS_A", "xIS_A",
    "USED_IN_BODY", "USED_WITH", "USED_FOR_AUD", "USED_BY",
    "xINTERESTED_IN", "xWANT", "xLIKES"
  ],
  "keyword_coverage": { "T1": 0.92, "T2": 0.78, "T3": 0.61, "T4": 0.42 },
  "competitive_positioning": "..."
}
```

## Validation

- `relationship_categories_evaluated.length === 16`.
- Every triple has unique `id` (`T_001`, `T_002`, …).
- `relationship` ∈ the 16 listed.
- `confidence_level` ∈ {"High","Medium","Low"}.

## Persistence

- Update `seo_cosmo_maps` row (one per project; unique constraint).
- Stamp `seo_projects.s5_approved_at` after user review.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/1o8-seo-manager/phases/s5-cosmo.md src/lib/seo/prompts/cosmo-relationships.ts
git commit -m "feat(seo): S5 cosmo phase spec + 16 relationship enum"
```

### Task 20: Phase files — S6, S7, S8, S9

**Files:**
- Create: `.claude/skills/1o8-seo-manager/phases/s6-listing-content.md`
- Create: `.claude/skills/1o8-seo-manager/phases/s7-aplus.md`
- Create: `.claude/skills/1o8-seo-manager/phases/s8-images.md`
- Create: `.claude/skills/1o8-seo-manager/phases/s9-score.md`

- [ ] **Step 1: Write S6 listing-content.md**

```markdown
# S6 — Listing Content (4 batches, atomic transaction)

Map to v5 §7. Four sequential batches with internal APPROVED gate per batch. Final write is one PG transaction.

## Batches

1. **Titles** — produce title per ASIN, 190-200 chars, hyphen-only, no colons, word-repeat cap 2.
2. **Bullets** — 4 versions × 5 = 20 fields. ALL CAPS HEADER: prefix mandatory. Bullets 1-4 universal, bullet 5 variation-specific.
3. **Description** — 1000-1200 chars, no colons.
4. **Backend** — single string ≤500 bytes UTF-8. Internally tracked by category (`core`, `supplement`, `symptom`, `audience`, `longtail`) but emitted as one merged field.

After all 4 batches APPROVED, generate the **Q&A artifact** (12-15 pairs) AND the **passage map** (every passage tagged with which Rufus question_ids + COSMO triple_ids it covers).

## Slots

- `{{approved_keywords_json}}`
- `{{rufus_phase3}}`
- `{{cosmo_triples}}`
- `{{brand_voice}}`
- `{{words_to_avoid}}`
- `{{variation_family_summary}}`
- `{{asin_specific_attributes}}`

## Prompt skeleton (per batch)

(Full prompt in runner; this file documents the contract. Each batch ends with the runner re-prompting "APPROVED" or surfacing edits.)

## Output Schema (final, after all 4 batches + Q&A + passage map)

```json
{
  "listings": [
    {
      "asin_id": "uuid",
      "title": "...",
      "bullets": {
        "detailed": ["HEADER 1: ...", "HEADER 2: ...", "HEADER 3: ...", "HEADER 4: ...", "HEADER 5: ..."],
        "concise": ["HEADER 1: ...", "...", "...", "...", "..."],
        "content": ["...", "...", "...", "...", "..."],
        "key_features": ["...", "...", "...", "...", "..."]
      },
      "product_description": "...",
      "backend_search_terms": "...",
      "backend_categories": { "core": "...", "supplement": "...", "symptom": "...", "audience": "...", "longtail": "..." },
      "byte_usage": { "title": { "used": 197, "max": 200, "ok": true }, "...": {} },
      "compliance_violations": []
    }
  ],
  "qa_pairs": [
    {
      "id": "QA_001",
      "question": "...",
      "answer_short": "...",
      "answer_long": "...",
      "intent_tier": "consideration",
      "source_rufus_question_id": "RQ3",
      "source_review_themes": ["..."]
    }
  ],
  "passage_map_by_asin": {
    "<asin_id>": [
      {
        "section": "title",
        "text": "...",
        "rufus_question_ids": ["RQ1"],
        "cosmo_triple_ids": ["T_001", "T_005"],
        "keywords_used": ["..."]
      }
    ]
  }
}
```

## Validation

- Each listing has 20 bullet fields exactly. Each bullet starts with `^[A-Z][A-Z0-9 ]*: ` (ALL CAPS HEADER:).
- Title length ∈ [190, 200], no `:`, no repeated word > 2 times.
- Description length ∈ [1000, 1200], no `:`.
- `backend_search_terms` byte length ≤ 500 (UTF-8).
- Compliance scan against `rubrics/amazon-compliance.md` produces zero unbypassed violations.
- Q&A pairs count ∈ [12, 15].
- Passage map covers ≥80% of canonical Rufus questions (else S6 returns warning, S9 will fail).

## Persistence (atomic)

Inside one PG transaction:
1. Upsert `seo_listings` per ASIN (bumping `version`).
2. Upsert `seo_qa` rows; compute `aplus_qa_subset` (5 pairs, Decision-stage), `customer_qa_export` (full set), `passage_map_qa` (Rufus + COSMO links).
3. Upsert `seo_aplus_plans` row with module headers only (positions 1-7, position 7 = `premium_qa` shell). Full A+ body filled in S7.
4. Upsert `seo_passage_map` with all passages.

If any step fails, rollback all four. Stamp `seo_projects.s6_approved_at` only after the transaction commits.
```

- [ ] **Step 2: Write S7 aplus.md**

```markdown
# S7 — Premium A+ (optional)

Map to v5 §8.

## Default state

`pending_decision`. User must explicitly Run or Skip. S9 cannot stamp `s9_approved_at` while S7 is `pending_decision`.

## Inputs

- Approved S6 listings + Q&A subset + module headers
- Approved S5 COSMO triples

## Modules

Exactly 7 modules per ASIN. Position 7 MUST be `premium_qa`. Allowed module types:

- `hero` (1 expected)
- `image_text_split` (multiple allowed)
- `comparison_table_4cell` | `comparison_table_5cell` (max 1 of either total)
- `feature_grid_4` | `feature_grid_5`
- `lifestyle_carousel`
- `premium_qa` (position 7, REQUIRED)

## Slots

- `{{listing_for_asin}}`
- `{{qa_aplus_subset}}` — 5 pairs already computed
- `{{cosmo_triples}}`
- `{{brand_voice}}`

## Output Schema

```json
{
  "modules": [
    {
      "position": 1,
      "module_type": "hero",
      "cosmo_relationship": "USED_FOR_FUNC",
      "fields": { "headline": "...", "subheadline": "...", "body": "..." },
      "images": [
        { "technical_name": "aplus_hero", "alt_text": "...", "overlay_text": "...", "ai_prompt": "...", "dimensions": "1464x600" }
      ]
    },
    { "position": 7, "module_type": "premium_qa", "cosmo_relationship": null, "fields": { "qa_pairs_json": "[{q,a},{q,a},{q,a},{q,a},{q,a}]" }, "images": [] }
  ]
}
```

## Validation

- Modules array length === 7.
- Module at position 7 has `module_type === "premium_qa"`.
- At most one module with `module_type` starting `comparison_table_`.
- Each `premium_qa` pair: question 115-120 chars, answer 245-250 chars, all 5 in Decision stage.

## Persistence

- Update `seo_aplus_plans.modules` (replace).
- Stamp `seo_projects.s7_approved_at`.
```

- [ ] **Step 3: Write S8 images.md**

```markdown
# S8 — Listing Images (optional)

Map to v5 §9.

## Default state

`pending_decision`. Same gate semantics as S7.

## Inputs

- Approved S6 listings
- Approved S4 Rufus image_strategy
- Approved S5 COSMO triples

## Slot per ASIN

Exactly 9 image rows. Technical names fixed:

| # | technical_name | role |
|---|---|---|
| 1 | MAIN | white background, product hero |
| 2 | PT01 | benefit / value prop |
| 3 | PT02 | feature callout |
| 4 | PT03 | use case / lifestyle |
| 5 | PT04 | scale or size reference |
| 6 | PT05 | comparison or differentiator |
| 7 | PT06 | what's in the box / accessories (USED_WITH) |
| 8 | PT07 | trust signal / certification |
| 9 | PT08 | final CTA / brand badge |

All PNG, 2000×2000, RGB.

## Output Schema

```json
{
  "images": [
    {
      "image_number": 1,
      "technical_name": "MAIN",
      "image_type": "white_bg_hero",
      "image_purpose": "...",
      "cosmo_relationship": "IS_A",
      "buyer_stage": "Awareness",
      "overlay_text": "Not Applicable",
      "alt_text": "<95-100 chars>",
      "image_direction": "...",
      "ai_image_prompt": "..."
    }
  ]
}
```

## Validation

- 9 rows, technical names exactly the list above.
- All formats PNG, 2000×2000, RGB (defaulted in DB; override forbidden).
- Alt text 95-100 chars per row.
- Overlay text ≤100 chars; for MAIN must be the literal `Not Applicable`.

## Persistence

- Replace `seo_images` for the ASIN (bump `version`).
- Stamp `seo_projects.s8_approved_at`.
```

- [ ] **Step 4: Write S9 score.md**

```markdown
# S9 — Score & Hard Gate

Map to new — consolidates v5 scoring rubrics. **Mandatory.** Must pass to publish.

## Hard Gate

- `rufus_coverage_pct >= 80`
- `cosmo_coverage_pct >= 75`
- `prohibited_word_violations.length === 0`
- All byte budgets `ok === true`
- `cosmo_relationship_categories_evaluated.length === 16`
- S7 and S8 each `approved` OR explicitly `skipped` (NOT `pending_decision`)

If any check fails on first run: auto-rerun S6 once, re-score, return final result. No third pass.

## Inputs

- Approved S6 listings, Q&A, passage map
- Approved S5 COSMO triples
- Approved S4 Rufus questions (canonical + Phase 2)
- (If user opted in) deep probe — Claude simulates Rufus answering canonical queries from listing alone.

## Output Schema

```json
{
  "rufus_coverage_pct": 87.5,
  "rufus_5_canonical_coverage": {
    "what_is_this_for":          { "covered": true,  "locations": ["title", "bullet1"] },
    "customer_likes_dislikes":   { "covered": true,  "locations": ["bullet2", "description"] },
    "x_vs_y":                    { "covered": false, "locations": [] },
    "good_for_use_case":         { "covered": true,  "locations": ["bullet3"] },
    "what_comes_with_it":        { "covered": true,  "locations": ["bullet5", "image_pt06"] }
  },
  "cosmo_coverage_pct": 78.0,
  "cosmo_density_per_100_words": 4.2,
  "cosmo_relationship_categories_evaluated": ["USED_FOR_FUNC", "..."],
  "buyer_journey_alignment": {
    "title":       { "expected_stage": "Decision",      "detected_stage": "Decision",      "points": 25 },
    "bullets_1_2": { "expected_stage": "Consideration", "detected_stage": "Consideration", "points": 25 },
    "bullets_3_5": { "expected_stage": "Decision",      "detected_stage": "Decision",      "points": 25 },
    "description": { "expected_stage": "Awareness->Consideration", "detected_stage": "Consideration", "points": 25 }
  },
  "byte_budget_status": { "title": { "used": 197, "max": 200, "ok": true } },
  "prohibited_word_violations": [],
  "missing_rufus_questions": ["RQ4 (x_vs_y)"],
  "missing_cosmo_triples": ["T_018"],
  "overall_grade": "B",
  "probe_transcript": null
}
```

## Persistence

- Insert (do not upsert) into `seo_scores` — keeps run history.
- On pass: stamp `seo_projects.s9_approved_at`.
- On first fail: increment `seo_scores.rerun_count`, trigger S6 with miss list, re-score.
- On second fail: surface to checkpoint review. Do NOT stamp `s9_approved_at`.
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/1o8-seo-manager/phases/s6-listing-content.md \
       .claude/skills/1o8-seo-manager/phases/s7-aplus.md \
       .claude/skills/1o8-seo-manager/phases/s8-images.md \
       .claude/skills/1o8-seo-manager/phases/s9-score.md
git commit -m "feat(seo): S6-S9 phase specs"
```

### Task 21: Rubric files — rufus, cosmo, compliance, byte-budgets

**Files:**
- Create: `.claude/skills/1o8-seo-manager/rubrics/rufus-coverage.md`
- Create: `.claude/skills/1o8-seo-manager/rubrics/cosmo-coverage.md`
- Create: `.claude/skills/1o8-seo-manager/rubrics/amazon-compliance.md`
- Create: `.claude/skills/1o8-seo-manager/rubrics/byte-budgets.md`

- [ ] **Step 1: Write `rubrics/rufus-coverage.md`**

```markdown
# Rufus Coverage Rubric (5 canonical query types — v5 Appendix A.1)

| Query type | Listing source | Required COSMO mapping |
|---|---|---|
| What is this for? | title + bullet 1 | IS_A + USED_FOR_FUNC |
| What do customers like / not like? | bullets 2-3 + description | USED_TO + CAPABLE_OF |
| What's the difference X vs Y? | bullet 2 + A+ comparison module | IS_A + xIS_A |
| Is this good for [use case]? | bullets 3-4 + description | USED_FOR_EVE + USED_IN_LOC |
| What comes with it? | bullet 5 + image PT06 | USED_WITH |

## Coverage formula

`rufus_coverage_pct = (covered_canonical_count / 5) × 0.5 + (covered_phase2_count / phase2_total) × 0.5`

50% weight to canonical, 50% to Phase 2 generated questions.

## Hard gate

`rufus_coverage_pct >= 80`. Below threshold → S9 fails.
```

- [ ] **Step 2: Write `rubrics/cosmo-coverage.md`**

```markdown
# COSMO Coverage Rubric

## Coverage components

1. **Keyword reflection** — % of T1+T2 keywords represented as entities in `seo_cosmo_maps.triples`. Target: ≥70%.
2. **Density** — `triples_used_in_listing / (total_words_of_listing / 100)`. Target: 3.0-5.0 per 100 words.
3. **Category breadth** — must evaluate all 16 categories from `prompts/cosmo-relationships.ts`. Empty categories OK; missing categories = fail.

## Aggregation

`cosmo_coverage_pct = 0.5 × keyword_reflection_pct + 0.3 × density_score + 0.2 × category_breadth_pct`

Where:
- `density_score` = 100 if 3.0 ≤ density ≤ 5.0; else 100 × (1 - distance from band).
- `category_breadth_pct` = (categories_evaluated / 16) × 100.

## Hard gate

`cosmo_coverage_pct >= 75`.
```

- [ ] **Step 3: Write `rubrics/amazon-compliance.md`**

```markdown
# Amazon Compliance Rubric (v5 §6)

## Hard rules

- Colon `:` permitted in bullets ONLY (banned in titles + descriptions).
- ALL CAPS reserved for: BPA, NSF, USDA, EPA, plus bullet headers.
- No HTML, no emojis, no special characters except hyphen + comma + period.
- Title: hyphen-only punctuation, word-repetition cap 2.
- Backend: ≤500 bytes single field — 1 byte over de-indexes everything.

## Prohibited words (live source)

The full ~200-word list lives at `src/lib/seo/prompts/amazon-prohibited-words.ts`. The compliance gate imports this list. Auto-correction map is in the same module.

## Auto-correction examples

| Prohibited | Replacement |
|---|---|
| treats | supports |
| cures | helps |
| heals | promotes recovery from |
| prevents | reduces the risk of |
| diagnoses | identifies |
| antibacterial | helps clean |

## Bypass

Per-field bypass requires explicit user override stored in `seo_listings.compliance_violations[].bypassed === true`. S9 still flags bypassed violations for review but does not block on them.
```

- [ ] **Step 4: Write `rubrics/byte-budgets.md`**

```markdown
# Byte Budgets

| Field | Min chars | Max chars | Byte limit | Encoding |
|---|---|---|---|---|
| title | 190 | 200 | n/a (chars) | UTF-8 |
| bullet detailed | 390 | 400 | n/a | UTF-8 |
| bullet concise | 190 | 200 | n/a | UTF-8 |
| bullet content | 90 | 100 | n/a | UTF-8 |
| bullet key_features | 40 | 50 | n/a | UTF-8 |
| product_description | 1000 | 1200 | n/a | UTF-8 |
| backend_search_terms | n/a | n/a | 500 bytes | UTF-8 |
| aplus_premium_qa.question | 115 | 120 | n/a | UTF-8 |
| aplus_premium_qa.answer | 245 | 250 | n/a | UTF-8 |
| image alt_text | 95 | 100 | n/a | UTF-8 |
| image overlay_text | 0 | 100 | n/a | UTF-8 (Not Applicable for MAIN) |

Counts are inclusive on both ends.

## Byte vs char distinction

`backend_search_terms` is the only byte-limited field. Use UTF-8 byte length, not char length. Multi-byte characters (curly quotes, accented chars) consume >1 byte.
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/1o8-seo-manager/rubrics/
git commit -m "feat(seo): rubric files for rufus, cosmo, compliance, byte-budgets"
```

### Task 22: Prohibited words module + skill-loader

**Files:**
- Create: `src/lib/seo/prompts/amazon-prohibited-words.ts`
- Create: `src/lib/seo/skill-loader.ts`
- Create: `tests/lib/seo/skill-loader.test.ts`

- [ ] **Step 1a: Write the scanner test (failing) — pin behavior independent of list size**

Create `tests/lib/seo/prohibited-words.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AMAZON_PROHIBITED_WORDS, findProhibitedHits } from "@/lib/seo/prompts/amazon-prohibited-words";

describe("amazon-prohibited-words", () => {
  it("loads the full v5 §6.3 list (>= 180 entries)", () => {
    expect(AMAZON_PROHIBITED_WORDS.length).toBeGreaterThanOrEqual(180);
  });

  it("each entry has a string word and a string|null replacement", () => {
    for (const e of AMAZON_PROHIBITED_WORDS) {
      expect(typeof e.word).toBe("string");
      expect(e.word.length).toBeGreaterThan(0);
      expect(e.replacement === null || typeof e.replacement === "string").toBe(true);
    }
  });

  it("scanner finds 'cures' as standalone word but not inside 'cured ham'", () => {
    const a = findProhibitedHits("This product cures eczema.");
    expect(a.find((h) => h.word === "cures")).toBeDefined();

    // 'cured' is a different word — must NOT match 'cures' rule
    const b = findProhibitedHits("Made with cured ham.");
    expect(b.find((h) => h.word === "cures")).toBeUndefined();
  });

  it("scanner returns offset positions in original text", () => {
    const r = findProhibitedHits("This treats acne.");
    const hit = r.find((h) => h.word === "treats");
    expect(hit?.position).toBe(5);
  });
});
```

Run: `npm run test -- tests/lib/seo/prohibited-words.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 1b: Write the module scaffold + seed entries**

Create `src/lib/seo/prompts/amazon-prohibited-words.ts`:

```typescript
// src/lib/seo/prompts/amazon-prohibited-words.ts
// v5 §6.3 — full ~200 word list with paired auto-correction map.
// The list below is seeded with the 18 v5-spec'd categories the engineer
// extends in Step 1c. The test in Step 1a enforces a minimum length of 180.

export type ProhibitedEntry = { word: string; replacement: string | null };

export const AMAZON_PROHIBITED_WORDS: Array<ProhibitedEntry> = [
  // ── Medical / health claims (v5 §6.3 cluster 1) ──
  { word: "treats", replacement: "supports" },
  { word: "cures", replacement: "helps" },
  { word: "heals", replacement: "promotes recovery from" },
  { word: "prevents", replacement: "reduces the risk of" },
  { word: "diagnoses", replacement: "identifies" },
  { word: "antibacterial", replacement: "helps clean" },
  { word: "antimicrobial", replacement: "helps clean" },
  { word: "FDA approved", replacement: null },
  { word: "FDA cleared", replacement: null },
  { word: "doctor recommended", replacement: "professional grade" },
  // ── Superlatives (v5 §6.3 cluster 2) ──
  { word: "best", replacement: "premium" },
  { word: "#1", replacement: "top-rated" },
  { word: "miracle", replacement: null },
  { word: "guaranteed", replacement: null },
  { word: "100% safe", replacement: "rigorously tested" },
  { word: "no side effects", replacement: null },
  // ── Comparative (v5 §6.3 cluster 3) ──
  { word: "better than", replacement: null },
  { word: "outperforms", replacement: "compares favorably with" },
  // Step 1c appends the remaining ~165 entries below this comment, preserving
  // the v5 cluster ordering (clusters 4-18). Do not invent replacements.
];

export function findProhibitedHits(
  text: string
): Array<{ word: string; replacement: string | null; position: number }> {
  const out: Array<{ word: string; replacement: string | null; position: number }> = [];
  const lower = text.toLowerCase();
  for (const entry of AMAZON_PROHIBITED_WORDS) {
    const w = entry.word.toLowerCase();
    let i = lower.indexOf(w);
    while (i !== -1) {
      const before = i === 0 || /\W/.test(lower[i - 1]);
      const after = i + w.length === lower.length || /\W/.test(lower[i + w.length]);
      if (before && after) {
        out.push({ word: entry.word, replacement: entry.replacement, position: i });
      }
      i = lower.indexOf(w, i + w.length);
    }
  }
  return out;
}
```

- [ ] **Step 1c: Append remaining entries verbatim from v5 §6.3**

Open the source process doc `AMAZON_SEO_GPT_v5_COMPLETE.md` (delivered in the prior session — ask the user for it if not present in the repo). Locate Section 6.3 — Prohibited Words List.

For each entry not already in the seed (clusters 4 through 18), append a new `{ word, replacement }` object before the closing `]`. Rules:
- Copy the word exactly as v5 spells it (preserve case for acronyms; use lowercase for normal words).
- If v5 supplies an auto-correction, use it verbatim.
- If v5 does not supply an auto-correction, use `replacement: null`.
- Do NOT invent replacements. Do NOT collapse synonyms.
- Maintain v5's cluster ordering. Group with one comment line per cluster, e.g. `// ── Therapeutic claims (v5 §6.3 cluster 4) ──`.

Verify the count. The full list per v5 must contain ≥180 entries. If the seed (18) + your appended entries does not meet 180, you've missed a cluster — re-read v5 §6.3.

- [ ] **Step 1d: Run the scanner test**

Run: `npm run test -- tests/lib/seo/prohibited-words.test.ts`
Expected: PASS — all 4 tests green. The "loads the full v5 §6.3 list" test enforces ≥180 entries and will fail if Step 1c is incomplete.

If the length test fails: re-open v5 §6.3, find the missing cluster(s), append. Do not lower the test threshold.

- [ ] **Step 2: Write skill-loader test**

```typescript
// tests/lib/seo/skill-loader.test.ts
import { describe, it, expect } from "vitest";
import { loadSkill } from "@/lib/seo/skill-loader";

describe("loadSkill", () => {
  it("loads SKILL.md frontmatter", async () => {
    const s = await loadSkill();
    expect(s.name).toBe("1o8-seo-manager");
    expect(s.description).toMatch(/9-phase Amazon SEO/);
  });

  it("loads all 9 phase files", async () => {
    const s = await loadSkill();
    expect(Object.keys(s.phases).sort()).toEqual([
      "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"
    ]);
  });

  it("loads 4 rubric files", async () => {
    const s = await loadSkill();
    expect(Object.keys(s.rubrics).sort()).toEqual([
      "amazon-compliance", "byte-budgets", "cosmo-coverage", "rufus-coverage"
    ]);
  });

  it("loads schema.json", async () => {
    const s = await loadSkill();
    expect(s.schema.tables.seo_listings).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- tests/lib/seo/skill-loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement skill-loader**

```typescript
// src/lib/seo/skill-loader.ts
import fs from "node:fs/promises";
import path from "node:path";

const SKILL_ROOT = path.join(process.cwd(), ".claude/skills/1o8-seo-manager");

export type LoadedSkill = {
  name: string;
  description: string;
  body: string;
  phases: Record<"s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "s9", string>;
  rubrics: Record<"rufus-coverage" | "cosmo-coverage" | "amazon-compliance" | "byte-budgets", string>;
  schema: { version: number; tables: Record<string, unknown> };
};

let cached: LoadedSkill | null = null;

export async function loadSkill(): Promise<LoadedSkill> {
  if (cached) return cached;

  const skillMd = await fs.readFile(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
  const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error("SKILL.md missing frontmatter");
  const fm = Object.fromEntries(
    fmMatch[1].split("\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
  );

  const phaseFiles = ["s1-intake", "s2-keywords", "s3-reviews", "s4-rufus", "s5-cosmo", "s6-listing-content", "s7-aplus", "s8-images", "s9-score"];
  const phases: any = {};
  for (const f of phaseFiles) {
    phases[f.split("-")[0]] = await fs.readFile(path.join(SKILL_ROOT, "phases", `${f}.md`), "utf8");
  }

  const rubricFiles = ["rufus-coverage", "cosmo-coverage", "amazon-compliance", "byte-budgets"];
  const rubrics: any = {};
  for (const r of rubricFiles) {
    rubrics[r] = await fs.readFile(path.join(SKILL_ROOT, "rubrics", `${r}.md`), "utf8");
  }

  const schema = JSON.parse(await fs.readFile(path.join(SKILL_ROOT, "schema.json"), "utf8"));

  cached = { name: fm.name, description: fm.description, body: fmMatch[2], phases, rubrics, schema };
  return cached;
}

export function clearSkillCache() { cached = null; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/lib/seo/skill-loader.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/seo/prompts/amazon-prohibited-words.ts \
       src/lib/seo/skill-loader.ts \
       tests/lib/seo/prohibited-words.test.ts \
       tests/lib/seo/skill-loader.test.ts
git commit -m "feat(seo): prohibited words list + skill loader"
```

**Milestone C done.** SKILL.md tree exists, parses cleanly, schema.json validates, prohibited words list ≥180 entries with pinned scanner behavior.

---

## End of Plan 1

After Tasks 1-22 are complete and merged:

1. The new SEO schema is live (legacy tables intact, new tables empty but queryable).
2. `.claude/skills/1o8-seo-manager/` is the single source of truth for the 9-phase pipeline — every prompt, every rubric, every byte budget.
3. Brand guidelines edits round-trip between `.md` file and `seo_projects.brand_guidelines_lock`.
4. `loadSkill()` returns a fully-parsed skill tree the Plan 2 runner will consume.
5. Legacy `/seo` route is unchanged — production keeps working.

## Plan 2 preview (do not start until Plan 1 ships)

Plan 2 will be authored from a focused spec covering:

- **D — Server-side runner** (`src/lib/seo/runner.ts` + per-phase TypeScript executors that consume the SKILL.md tree, call Claude, validate against `schema.json`, persist to typed tables)
- **E — API endpoints** for `listings`, `aplus`, `images`, `qa`, `passage-map`, `scores`, plus run endpoints and the auto-run `POST /api/seo/projects/[id]/run`
- **F — `/seo/manager` UI** (9-column phase grid, brand guidelines editor surface, S9 score panel, surgical re-run cascade modal)
- **G/H — S7 + S8 wiring** with phase-level validators (7 modules, premium_qa at position 7, MAIN+PT01-PT08 fixed names)
- **I — S9 scoring engine** with single auto-rerun loop and optional probe transcript
- **J — Legacy backfill** (`scripts/backfill-legacy-seo-content.ts`) + `0052_drop_legacy_generated_content.sql` follow-up migration, run only after S9 passes on a fresh project end-to-end

The Plan-2 spec is not written yet. Author it after Plan 1 lands so its tasks reference the *actual* state of the merged code, not assumptions made today.

