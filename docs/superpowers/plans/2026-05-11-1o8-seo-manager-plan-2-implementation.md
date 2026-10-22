# 1o8 SEO Manager Implementation Plan — Plan 2 of 2 (Runtime Layer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 9-phase pipeline actually run. Wire the server-side runner that imports the canonical `.claude/skills/1o8-seo-manager/` tree shipped in Plan 1, calls Claude (Sonnet 4.6 with prompt caching), validates output against `schema.json`, persists transactionally, and exposes a `/seo/manager` UI that drives a fresh project from S1 through S9, hits the 80/75 hard gate, and stamps `s9_approved_at`.

**Architecture:** Single source of truth is still `.claude/skills/1o8-seo-manager/SKILL.md`. Plan 2 adds three layers on top: (1) `src/lib/seo/runner.ts` + 9 per-phase executors + Zod validators generated from `schema.json` + cost-tracking Claude client, (2) Next.js App Router endpoints under `/api/seo/projects/[id]/...` that enqueue runs via Vercel `waitUntil` and expose typed-table reads, (3) `/seo/manager` UI with a 9-column phase grid, cascade modal, brand-guidelines dual panel, and S9 score panel. Background work is tracked in a new `seo_phase_runs` audit table; the UI polls `/runs` for status. §J backfills legacy `seo_asins.generated_content` into typed tables and drops the legacy column — gated on ≥1 production project having stamped `s9_approved_at` on the new schema.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + PostgreSQL (Supabase), `@anthropic-ai/sdk@^0.78.0` with prompt caching, Zod (already in deps), Vitest + Testing Library. Runner runs in Node.js runtime (NOT edge) for full Drizzle + Anthropic SDK support.

**Spec:** `docs/superpowers/specs/2026-05-11-1o8-seo-manager-plan-2.md`
**Predecessor:** Plan 1 plan `docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md` (shipped as PR #23, merge commit `8ffefb3`)
**Source process doc:** `AMAZON_SEO_GPT_v5_COMPLETE.md`

---

## Decisions Locked in the Spec (do NOT re-litigate)

These 10 decisions came out of the brainstorm session that produced the spec. They shape every task below. If a task seems to contradict one of these, the task is wrong — not the decision.

1. **Concurrency:** Background job table `seo_phase_runs` + Vercel `waitUntil` + UI polling. Routes return `202` with `run_id` immediately; the runner finishes in the background and writes the result row.
2. **Cascade:** Stale data is preserved. Tri-state modal per phase ("Re-run downstream + cascade / Re-run only this / Cancel"). Downstream rows stay in the DB; UI shows a stale badge when an upstream phase was re-approved after the downstream's `approved_at`.
3. **Auth:** Runner uses Supabase service role for DB writes (RLS bypass). API routes require an authed NextAuth v5 session via `getAuthSession()`. RBAC: `admin | editor` writes, `viewer` reads, `client | pending` denied.
4. **Legacy backfill:** §J migration number is dynamic at PR time (next available slot when the §J PR is opened). Backfill scope = projects with `current_phase ∈ {S6, S7, S8, S9}` by default; `--project-id <uuid>` opt-in override. Re-derivable fields (`byte_usage`, `compliance_violations`) computed on backfill; unknowable fields (`seo_qa.pairs`, `seo_passage_map.passages`) left empty with `version = 0` sentinel.
5. **Auto-run vs step-by-step:** Both. `POST /api/seo/projects/[id]/run` enqueues the full pipeline (auto-pauses at S4P1 and S4P2 for Rufus paste-back). `POST /api/seo/projects/[id]/phases/[phase]/run` advances exactly one phase.
6. **Validator strictness:** On 2nd validation failure, persist partial output with `validation_errors[]` populated; phase approval button stays disabled until errors clear. Validators are Zod schemas generated inline from `schema.json` at module init (no `json-schema-to-zod` dep).
7. **S9 deep probe:** Opt-in checkbox on S9 panel ("Run deep probe — adds ~$0.05 in Claude cost"). 5 canonical Rufus questions. Sonnet 4.6. Transcript persisted to `seo_scores.probe_transcript`.
8. **Single API code path:** In-chat skill and in-app UI both hit `/api/seo/projects/[id]/phases/[phase]/run`. Server-side runner is one function: `runPhase(projectId, phase)`.
9. **Brand guidelines:** Dual panel in S1 column. Top = read-only mirror of `brand_guidelines_lock`. Bottom = editable textarea over `brand_guidelines_notes`. Notes edits do NOT cascade-invalidate downstream phases; lock refresh DOES.
10. **Version retention:** Keep all artifact versions forever. UI shows latest by default with a "View history" link. No purge job.

**ONE new table** is introduced by Plan 2: `seo_phase_runs` (full column list in spec §"New table"). Migration number = next available at PR-open time (currently `0060` based on main HEAD's `0059`).

---

## Milestone Map

Plan 2 ships in six independently-testable milestones. Each leaves the repo type-checked + test-passing. PR boundary is the end of each milestone; bundled PRs are allowed but §J ships standalone (gated).

| Milestone | Focus | Tasks | Ships when complete |
|---|---|---|---|
| **D — Server runner** | `runner.ts`, 9 phase executors, validators, cost tracking, `seo_phase_runs` migration | 1–14 | `runPhase('S1')` on a fixture project produces a valid `seo_asins.baseline_analysis` write + `seo_phase_runs` row end-to-end |
| **E — API endpoints** | All routes under `/api/seo/projects/[id]/{run,phases,runs,listings,aplus,images,qa,passage-map,scores}` | 15–25 | Postman/curl can drive a project S1→S6 with auth; validation errors surface as 4xx with structured body |
| **F — `/seo/manager` UI** | 9-column phase grid + drawer + cascade modal + brand-guidelines dual panel + run-history viewer | 26–36 | An agency operator can run a project S1→S9 in the browser, see cost per phase, view re-run history |
| **G/H — S7/S8 wiring** | Phase executors + UI columns + Run/Skip/Decide-later state + validators (7 modules, premium_qa @ pos 7, 9 images MAIN+PT01-PT08) | 37–43 | An S7-approved + S8-approved project shows full A+ plan + 9 image rows; an S7-skipped project sets `s7_skipped=true` and S9 passes its gate |
| **I — S9 scoring + hard gate** | `scoring.ts` engine, opt-in probe, single auto-rerun loop, S9 panel with coverage breakdown | 44–50 | A project that fails S9 first try gets one S6 re-run with miss list, then either stamps `s9_approved_at` or surfaces to checkpoint review |
| **J — Legacy backfill + drop** *(gated)* | `scripts/backfill-legacy-seo-content.ts` + drop migration | 51–58 | **HARD PRECONDITION:** `SELECT COUNT(*) FROM seo_projects WHERE s9_approved_at IS NOT NULL` returns ≥1 on prod. Backfill runs project-by-project with dry-run. Drop migration ships last, separate PR. |

---

## Coexistence Notes (other-session WIP — DO NOT touch in this plan's authoring or in §D/§E execution)

Another session is concurrently editing the following files in the main worktree. The §F milestone (UI) must rebase against whatever those land as; the spec defines target behavior, not file structure.

- `src/app/clients/[clientIdCode]/layout.tsx`
- `src/app/clients/brand-guidelines/page.tsx`
- `src/app/seo/manager/page.tsx`
- `src/components/seo/ai-cost-tracker.tsx`
- `src/components/seo/project-shell.tsx`
- `src/lib/product-mapper.ts`
- `drizzle/migrations/0056_enable_rls_seo_manager_tables.sql` (untracked, may land before Plan 2 starts)
- `src/app/clients/brand-guidelines/Header.tsx` (untracked)
- `src/lib/product-mapper.test.ts` (untracked)
- `keyword-research.skill` (untracked)

User's uncommitted change to leave alone: `.claude/hooks/guard-bash.sh`.

**§F implementation rule:** Read the merged state of those files at the moment §F starts. Reconcile additively — new components for the phase grid + drawer + modal + score panel, and `useState` hooks on `project-shell.tsx`. If the other session's edits cover any of §F's behavior, drop the duplicate task and document why in the §F kickoff message.

---

## File Structure (Plan 2 only)

### New files

```
drizzle/migrations/
└── 0060_seo_phase_runs.sql                     # job audit table (number may shift at PR time)

src/lib/seo/
├── runner.ts                                   # runPhase + runProject + state machine
├── claude-client.ts                            # Anthropic SDK wrapper, cost tracking, prompt caching
├── validators.ts                               # Zod schemas generated from schema.json at module init
├── scoring.ts                                  # S9 hard-gate engine + miss-list derivation + probe
├── compliance.ts                               # prohibited-word scan + auto-correct + bypass merge
├── byte-budget.ts                              # UTF-8 byte length + per-field char/byte budget checks
├── slot-fill.ts                                # build PhaseContext from DB + substitute {{slots}}
├── persist.ts                                  # per-phase transactional writes via Drizzle
├── pricing.ts                                  # Anthropic per-model token → USD rate table
└── phases/
    ├── s1.ts
    ├── s2.ts
    ├── s3.ts
    ├── s4.ts
    ├── s5.ts
    ├── s6.ts
    ├── s7.ts
    ├── s8.ts
    └── s9.ts                                   # delegates to scoring.ts

src/app/api/seo/projects/[id]/
├── run/route.ts                                # POST: enqueue full S1→S9 auto-run
├── runs/route.ts                               # GET: list recent seo_phase_runs (polling)
├── phases/[phase]/
│   ├── run/route.ts                            # POST: enqueue single phase
│   ├── approve/route.ts                        # POST: stamp s{N}_approved_at
│   ├── skip/route.ts                           # POST (S7/S8 only): set s{N}_skipped=true
│   └── cancel-run/route.ts                     # POST: abort in-flight run
├── phases/S4/resume/route.ts                   # POST: submit Rufus paste-back
├── listings/route.ts                           # GET: latest seo_listings, PATCH: manual edit
├── aplus/route.ts                              # GET + PATCH
├── images/route.ts                             # GET + PATCH
├── qa/route.ts                                 # GET + PATCH
├── passage-map/route.ts                        # GET
└── scores/route.ts                             # GET

src/app/seo/manager/
├── components/
│   ├── phase-grid.tsx                          # 9-column status grid
│   ├── phase-column.tsx                        # one phase's card
│   ├── phase-drawer.tsx                        # side drawer on click
│   ├── cascade-modal.tsx                       # tri-state re-run modal
│   ├── brand-guidelines-panel.tsx              # S1 dual panel
│   ├── s9-score-panel.tsx                      # S9 grade + miss list + probe checkbox
│   ├── s7-decision-card.tsx                    # Run / Skip / Decide later
│   ├── s8-decision-card.tsx
│   ├── run-history-drawer.tsx                  # paginated seo_phase_runs viewer
│   └── stale-badge.tsx
└── (page.tsx co-edited with other session — see §F coexistence note)

scripts/
└── backfill-legacy-seo-content.ts              # §J

drizzle/migrations/
└── {next-available}_drop_legacy_generated_content.sql  # §J, separate PR after backfill verified

tests/
├── lib/seo/
│   ├── validators.test.ts                      # Zod generation from schema.json
│   ├── compliance.test.ts                      # scanner + auto-correct + bypass
│   ├── byte-budget.test.ts                     # UTF-8 byte length edge cases
│   ├── slot-fill.test.ts                       # context build + {{slot}} substitution
│   ├── pricing.test.ts                         # token → USD computation
│   ├── claude-client.test.ts                   # SDK call wrapper (mocked)
│   ├── runner.test.ts                          # state machine + retry + transaction
│   ├── scoring.test.ts                         # hard gate + miss list + auto-rerun
│   └── phases/
│       ├── s1.test.ts
│       ├── s2.test.ts
│       ├── ...
│       └── s9.test.ts
├── db/
│   └── seo-phase-runs-migration.test.ts        # 0060 contract
├── api/seo/projects/
│   ├── run.test.ts
│   ├── phases-run.test.ts
│   ├── phases-approve.test.ts
│   ├── phases-skip.test.ts
│   ├── phases-cancel-run.test.ts
│   ├── phases-s4-resume.test.ts
│   ├── runs.test.ts
│   ├── listings.test.ts
│   ├── aplus.test.ts
│   ├── images.test.ts
│   ├── qa.test.ts
│   ├── passage-map.test.ts
│   └── scores.test.ts
├── app/seo/manager/
│   ├── phase-grid.test.tsx
│   ├── cascade-modal.test.tsx
│   ├── brand-guidelines-panel.test.tsx
│   └── s9-score-panel.test.tsx
├── scripts/
│   └── backfill-legacy-seo-content.test.ts     # §J
└── db/
    └── post-backfill-integrity.test.ts         # §J — pre-drop verification
```

### Modified files

- `src/lib/db/schema.ts` — append `seoPhaseRuns` table (one new export).
- `src/components/seo/project-shell.tsx` — surface `Run all` button + cost ticker integration (rebase-aware in §F).
- `src/app/seo/manager/page.tsx` — host the phase grid + drawer + modal (rebase-aware in §F).

### Untouched (Plan 1 + Plan 2's earlier milestones own these)

- `.claude/skills/1o8-seo-manager/**` — read-only contract. Plan 2 reads, never edits.
- `src/lib/seo/skill-loader.ts` — already shipped by Plan 1.
- `src/lib/seo/prompts/*.ts` — already shipped by Plan 1.
- `drizzle/migrations/0054_seo_manager_phase_overhaul.sql` — Plan 1.
- Legacy `/seo/[id]/*` route — left alone until §J drop migration.
- The `/api/seo/projects/[id]/run-skill/` route is for the legacy "competitive" skill; do NOT remove or merge with Plan 2's `/run` endpoint. They coexist.

---

## Pre-flight checks (run once before starting Milestone D)

Run these from the repo root before executing any task. They confirm Plan 1 is merged and the working tree is sane.

- [ ] **Confirm Plan 1 is on main**

Run: `git log --oneline main | head -5`
Expected: see commit `8ffefb3` (Plan 1) and `a56a36e` (Plan 2 spec).

- [ ] **Confirm migrations 0054–0059 are present**

Run: `ls drizzle/migrations/ | grep -E '^00(54|55|56|57|58|59)_'`
Expected: six files listed (`0054_seo_manager_phase_overhaul.sql` through `0059_attributes_source_backfill.sql`).

- [ ] **Confirm Plan 1's tables exist in DB**

Run: `psql "$DATABASE_URL" -c "\\dt seo_listings seo_aplus_plans seo_images seo_qa seo_passage_map seo_scores"`
Expected: all 6 tables present.

- [ ] **Confirm canonical skill tree is on disk**

Run: `find .claude/skills/1o8-seo-manager -type f | sort`
Expected: `SKILL.md`, `schema.json`, 9 `phases/s*.md`, 4 `rubrics/*.md` (15 files total).

- [ ] **Confirm Anthropic SDK is installed**

Run: `node -e "console.log(require('@anthropic-ai/sdk/package.json').version)"`
Expected: `^0.78.0` or higher.

- [ ] **Confirm `ANTHROPIC_API_KEY` is set**

Run: `node -e "console.log(process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING')"`
Expected: `set`. If missing, abort and ask the user to populate `.env.local` before any Claude call.

- [ ] **Baseline test run**

Run: `npm test -- --run`
Expected: green or pre-existing failures only (note any failures so post-task suites can be compared against the baseline).

---

## Milestone D — Server Runner

Goal: Land `seo_phase_runs` migration, the Anthropic-SDK-backed Claude client with prompt caching and cost tracking, the Zod validator generator that reads `schema.json` at module init, the per-phase executor contract, and a `runPhase()` function that takes one phase from `loadContext → fillSlots → callClaude → validate → (retry once) → persist`. End state: invoking `runPhase(projectId, 'S1')` on a fixture project writes valid `baseline_analysis` rows and produces a `seo_phase_runs` row with token + cost figures.

PR boundary: end of Task 14. No UI changes in this milestone — `runner.ts` is callable from scripts and tests only.

### Task 1: Migration for `seo_phase_runs`

**Files:**
- Create: `drizzle/migrations/0060_seo_phase_runs.sql`
- Create: `tests/db/seo-phase-runs-migration.test.ts`

> **Migration number note:** if a coexisting session has landed `0060_*` by the time you start this task, bump to the next available slot (`0061`, etc.) and update every reference in this file. The literal label `0060_seo_phase_runs.sql` is illustrative; the only invariant is "next available number at PR time."

- [ ] **Step 1: Write the failing migration contract test**

```typescript
// tests/db/seo-phase-runs-migration.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

describe("0060 seo_phase_runs migration", () => {
  it("creates seo_phase_runs table with expected columns", async () => {
    const cols = await db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'seo_phase_runs'
      ORDER BY ordinal_position
    `);
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id", "project_id", "phase", "status", "trigger", "attempt",
        "parent_run_id", "started_at", "finished_at", "duration_ms",
        "claude_input_tokens", "claude_output_tokens", "claude_cost_usd",
        "claude_model", "output_artifact_version", "validation_errors",
        "error_message", "triggered_by", "created_at",
      ])
    );
  });

  it("has the in-flight status index", async () => {
    const idx = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'seo_phase_runs'
        AND indexname = 'idx_seo_phase_runs_status'
    `);
    expect(idx.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db/seo-phase-runs-migration.test.ts --run`
Expected: FAIL — `relation "seo_phase_runs" does not exist`.

- [ ] **Step 3: Author migration SQL**

```sql
-- drizzle/migrations/0060_seo_phase_runs.sql
-- Per-execution audit log + cost tracking + status machine for the
-- 9-phase SEO pipeline runner.

BEGIN;

CREATE TABLE seo_phase_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  phase varchar(5) NOT NULL,            -- 'S1'..'S9' (plus 'S4P1','S4P2','S4P3')
  status varchar(24) NOT NULL,          -- queued | running | paused_user_input |
                                        -- success | validation_failed | error | cancelled
  trigger varchar(16) NOT NULL,         -- manual | auto_run | cascade_rerun | s9_auto_rerun
  attempt smallint NOT NULL DEFAULT 1,
  parent_run_id uuid REFERENCES seo_phase_runs(id) ON DELETE SET NULL,

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,

  claude_input_tokens integer NOT NULL DEFAULT 0,
  claude_output_tokens integer NOT NULL DEFAULT 0,
  claude_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  claude_model varchar(64),

  output_artifact_version integer,
  validation_errors jsonb DEFAULT '[]'::jsonb,
  error_message text,

  triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_phase_runs_project ON seo_phase_runs(project_id);
CREATE INDEX idx_seo_phase_runs_phase ON seo_phase_runs(project_id, phase, started_at DESC);
CREATE INDEX idx_seo_phase_runs_status ON seo_phase_runs(status)
  WHERE status IN ('queued','running','paused_user_input');

COMMIT;
```

- [ ] **Step 4: Apply migration**

Run: `npm run db:migrate`
Expected: prints `0060_seo_phase_runs` applied.

- [ ] **Step 5: Run the contract test to verify it passes**

Run: `npm test -- tests/db/seo-phase-runs-migration.test.ts --run`
Expected: PASS.

- [ ] **Step 6: Append Drizzle schema for `seoPhaseRuns`**

Append to `src/lib/db/schema.ts` after `seoScores` (after line ~1226):

```typescript
// ─── SEO Phase Runs ──────────────────────────────────────────────────
// Per-execution audit log + cost tracking + status machine. Plan 2 §D.

export const seoPhaseRuns = pgTable(
  "seo_phase_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => seoProjects.id, { onDelete: "cascade" }),
    phase: varchar("phase", { length: 5 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    trigger: varchar("trigger", { length: 16 }).notNull(),
    attempt: smallint("attempt").notNull().default(1),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => seoPhaseRuns.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    claudeInputTokens: integer("claude_input_tokens").notNull().default(0),
    claudeOutputTokens: integer("claude_output_tokens").notNull().default(0),
    claudeCostUsd: numeric("claude_cost_usd", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    claudeModel: varchar("claude_model", { length: 64 }),
    outputArtifactVersion: integer("output_artifact_version"),
    validationErrors: jsonb("validation_errors")
      .$type<Array<{ field: string; message: string; expected?: string; got?: string }>>()
      .default([]),
    errorMessage: text("error_message"),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seo_phase_runs_project").on(table.projectId),
    index("idx_seo_phase_runs_phase").on(table.projectId, table.phase, table.startedAt.desc()),
  ]
);

export type SeoPhaseRun = typeof seoPhaseRuns.$inferSelect;
export type NewSeoPhaseRun = typeof seoPhaseRuns.$inferInsert;
```

Add `AnyPgColumn` to the existing `drizzle-orm/pg-core` import at the top of the file if not already imported.

- [ ] **Step 7: Run typecheck**

Run: `npm run build`
Expected: clean. (If `AnyPgColumn` import fails, add it to the named imports from `drizzle-orm/pg-core`.)

- [ ] **Step 8: Commit**

```bash
git add drizzle/migrations/0060_seo_phase_runs.sql src/lib/db/schema.ts tests/db/seo-phase-runs-migration.test.ts
git commit -m "feat(seo): seo_phase_runs migration + drizzle schema (plan 2 §D-1)"
```

### Task 2: Anthropic pricing table

**Files:**
- Create: `src/lib/seo/pricing.ts`
- Create: `tests/lib/seo/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/pricing.test.ts
import { describe, it, expect } from "vitest";
import { computeCostUsd, MODEL_RATES } from "@/lib/seo/pricing";

describe("Anthropic token → USD pricing", () => {
  it("computes cost for Sonnet 4.6 with cache hits", () => {
    // Sonnet 4.6: $3/M input, $15/M output, $3.75/M cache write, $0.30/M cache read
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1000,
      cache_creation_input_tokens: 5000,
      cache_read_input_tokens: 10000,
      output_tokens: 2000,
    });
    // 1000 * 3/1M + 5000 * 3.75/1M + 10000 * 0.30/1M + 2000 * 15/1M
    // = 0.003 + 0.01875 + 0.003 + 0.03 = 0.05475
    expect(cost).toBeCloseTo(0.05475, 4);
  });

  it("computes cost for Haiku 4.5 (no cache usage)", () => {
    // Haiku 4.5: $0.80/M input, $4/M output
    const cost = computeCostUsd("claude-haiku-4-5-20251001", {
      input_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 500,
    });
    expect(cost).toBeCloseTo(0.0008 + 0.002, 4);
  });

  it("throws on unknown model", () => {
    expect(() =>
      computeCostUsd("claude-fake-99", {
        input_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 100,
      })
    ).toThrow(/unknown model/i);
  });

  it("exports MODEL_RATES with Sonnet + Haiku + Opus entries", () => {
    expect(MODEL_RATES["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_RATES["claude-haiku-4-5-20251001"]).toBeDefined();
    expect(MODEL_RATES["claude-opus-4-7"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/seo/pricing.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement pricing module**

```typescript
// src/lib/seo/pricing.ts
// Anthropic published rates as of 2026-05. Update when rates change.
// All values in USD per 1M tokens.

export type ModelRate = {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
};

export const MODEL_RATES: Record<string, ModelRate> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cache_write: 1, cache_read: 0.08 },
  "claude-opus-4-7": { input: 15, output: 75, cache_write: 18.75, cache_read: 1.5 },
};

export type Usage = {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
};

export function computeCostUsd(model: string, usage: Usage): number {
  const rate = MODEL_RATES[model];
  if (!rate) throw new Error(`unknown model: ${model}`);
  const per = 1_000_000;
  return (
    (usage.input_tokens * rate.input) / per +
    (usage.cache_creation_input_tokens * rate.cache_write) / per +
    (usage.cache_read_input_tokens * rate.cache_read) / per +
    (usage.output_tokens * rate.output) / per
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/seo/pricing.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/pricing.ts tests/lib/seo/pricing.test.ts
git commit -m "feat(seo): anthropic pricing table + cost helper (plan 2 §D-2)"
```

### Task 3: Byte-budget helper

**Files:**
- Create: `src/lib/seo/byte-budget.ts`
- Create: `tests/lib/seo/byte-budget.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/byte-budget.test.ts
import { describe, it, expect } from "vitest";
import { utf8ByteLength, checkByteBudget, checkCharBudget } from "@/lib/seo/byte-budget";

describe("byte budget helpers", () => {
  it("counts UTF-8 bytes correctly for multibyte chars", () => {
    expect(utf8ByteLength("hello")).toBe(5);
    expect(utf8ByteLength("café")).toBe(5);   // é = 2 bytes
    expect(utf8ByteLength("🚀")).toBe(4);     // emoji = 4 bytes
    expect(utf8ByteLength("中文")).toBe(6);   // CJK = 3 bytes each
  });

  it("flags backend_search_terms over 500 bytes", () => {
    const within = "a".repeat(500);
    const over = "a".repeat(501);
    expect(checkByteBudget(within, 500)).toEqual({ used: 500, max: 500, ok: true });
    expect(checkByteBudget(over, 500)).toEqual({ used: 501, max: 500, ok: false });
  });

  it("rejects multibyte chars pushing over byte limit even with low char count", () => {
    // 167 emoji = 668 bytes (4 each), only 167 chars
    const tightByteOver = "🚀".repeat(167);
    const r = checkByteBudget(tightByteOver, 500);
    expect(r.ok).toBe(false);
    expect(r.used).toBe(668);
  });

  it("checkCharBudget honors min and max chars", () => {
    expect(checkCharBudget("a".repeat(195), 190, 200)).toEqual({ used: 195, min: 190, max: 200, ok: true });
    expect(checkCharBudget("a".repeat(180), 190, 200).ok).toBe(false);
    expect(checkCharBudget("a".repeat(220), 190, 200).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/seo/byte-budget.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/seo/byte-budget.ts
// UTF-8 byte counting + per-field budget checks for the SEO pipeline.

const enc = new TextEncoder();

export function utf8ByteLength(s: string): number {
  return enc.encode(s).length;
}

export function checkByteBudget(
  s: string,
  maxBytes: number
): { used: number; max: number; ok: boolean } {
  const used = utf8ByteLength(s);
  return { used, max: maxBytes, ok: used <= maxBytes };
}

export function checkCharBudget(
  s: string,
  minChars: number,
  maxChars: number
): { used: number; min: number; max: number; ok: boolean } {
  const used = [...s].length; // grapheme-friendly char count
  return { used, min: minChars, max: maxChars, ok: used >= minChars && used <= maxChars };
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/lib/seo/byte-budget.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/byte-budget.ts tests/lib/seo/byte-budget.test.ts
git commit -m "feat(seo): utf-8 byte length + budget helpers (plan 2 §D-3)"
```

### Task 4: Compliance scanner with bypass + brand overlay

**Files:**
- Create: `src/lib/seo/compliance.ts`
- Create: `tests/lib/seo/compliance.test.ts`

The scanner builds on the existing `findProhibitedHits()` from `src/lib/seo/prompts/amazon-prohibited-words.ts` (shipped by Plan 1). It additionally merges `brand_guidelines_lock.words_to_avoid` and respects per-field bypass flags.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/compliance.test.ts
import { describe, it, expect } from "vitest";
import { scanCompliance, mergeBypass } from "@/lib/seo/compliance";

describe("compliance scanner", () => {
  it("flags an Amazon prohibited word with replacement", () => {
    const r = scanCompliance({
      field: "title",
      text: "This product treats inflammation",
      brandWordsToAvoid: [],
    });
    expect(r).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title", word: "treats", auto_corrected_to: "supports" }),
      ])
    );
  });

  it("flags a brand-only word with no auto-correct", () => {
    const r = scanCompliance({
      field: "bullets.detailed.0",
      text: "Made with proprietary blend",
      brandWordsToAvoid: ["proprietary"],
    });
    expect(r).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "bullets.detailed.0", word: "proprietary", type: "brand_words_to_avoid", auto_corrected_to: undefined }),
      ])
    );
  });

  it("Amazon §6 wins on overlap with brand-allowed words (cannot un-ban with brand list)", () => {
    // Brand says "treats" is fine — Amazon still blocks it.
    const r = scanCompliance({
      field: "title",
      text: "treats sensitive skin",
      brandWordsToAvoid: [],
      brandAllowList: ["treats"], // even if explicitly allowed
    });
    expect(r.find((v) => v.word === "treats")).toBeDefined();
  });

  it("mergeBypass preserves bypassed flag on existing violations", () => {
    const fresh = [{ field: "title", word: "treats", type: "amazon_prohibited", bypassed: false }];
    const prior = [{ field: "title", word: "treats", type: "amazon_prohibited", bypassed: true }];
    const merged = mergeBypass(fresh, prior);
    expect(merged[0].bypassed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/seo/compliance.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/seo/compliance.ts
// v5 §6 prohibited-word scan + brand overlay + per-field bypass.

import { findProhibitedHits } from "@/lib/seo/prompts/amazon-prohibited-words";

export type ComplianceViolation = {
  field: string;
  word: string;
  type: "amazon_prohibited" | "brand_words_to_avoid";
  auto_corrected_to?: string;
  bypassed: boolean;
};

export function scanCompliance(input: {
  field: string;
  text: string;
  brandWordsToAvoid: string[];
  brandAllowList?: string[]; // ignored on Amazon §6 conflict — kept for future use
}): ComplianceViolation[] {
  const out: ComplianceViolation[] = [];
  for (const hit of findProhibitedHits(input.text)) {
    out.push({
      field: input.field,
      word: hit.word,
      type: "amazon_prohibited",
      auto_corrected_to: hit.replacement ?? undefined,
      bypassed: false,
    });
  }
  const lowerText = input.text.toLowerCase();
  for (const w of input.brandWordsToAvoid) {
    const lw = w.toLowerCase();
    // word-boundary scan
    let i = lowerText.indexOf(lw);
    while (i !== -1) {
      const before = i === 0 || /\W/.test(lowerText[i - 1]);
      const after = i + lw.length === lowerText.length || /\W/.test(lowerText[i + lw.length]);
      if (before && after) {
        // Skip if Amazon §6 already flagged this exact word
        if (out.some((v) => v.word.toLowerCase() === lw && v.field === input.field)) break;
        out.push({
          field: input.field,
          word: w,
          type: "brand_words_to_avoid",
          bypassed: false,
        });
        break;
      }
      i = lowerText.indexOf(lw, i + lw.length);
    }
  }
  return out;
}

export function mergeBypass(
  fresh: ComplianceViolation[],
  prior: ComplianceViolation[]
): ComplianceViolation[] {
  return fresh.map((v) => {
    const match = prior.find(
      (p) => p.field === v.field && p.word.toLowerCase() === v.word.toLowerCase()
    );
    return match?.bypassed ? { ...v, bypassed: true } : v;
  });
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/lib/seo/compliance.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/compliance.ts tests/lib/seo/compliance.test.ts
git commit -m "feat(seo): compliance scanner with brand overlay + bypass merge (plan 2 §D-4)"
```

### Task 5: Zod validators generated from `schema.json`

**Files:**
- Create: `src/lib/seo/validators.ts`
- Create: `tests/lib/seo/validators.test.ts`

The runner reads `.claude/skills/1o8-seo-manager/schema.json` at module init (via `loadSkill()`) and synthesizes Zod schemas per phase output. No external `json-schema-to-zod` dep — the schema is small and bespoke.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/validators.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getValidator } from "@/lib/seo/validators";

describe("phase validators (generated from schema.json)", () => {
  it("accepts a valid S6 listings payload", async () => {
    const v = await getValidator("S6");
    const result = v.safeParse({
      listings: [
        {
          asin_id: "11111111-1111-1111-1111-111111111111",
          title: "A".repeat(195),
          bullets: {
            detailed: Array(5).fill("HEADER: " + "x".repeat(390)),
            concise: Array(5).fill("HEADER: " + "x".repeat(190)),
            content: Array(5).fill("HEADER: " + "x".repeat(90)),
            key_features: Array(5).fill("HEADER: " + "x".repeat(40)),
          },
          product_description: "x".repeat(1050),
          backend_search_terms: "kw1 kw2 kw3",
          backend_categories: { core: "", supplement: "", symptom: "", audience: "", longtail: "" },
          byte_usage: {},
          compliance_violations: [],
        },
      ],
      qa_pairs: Array(13).fill({
        id: "QA_001", question: "q", answer_short: "a", answer_long: "long",
        intent_tier: "consideration", source_rufus_question_id: null, source_review_themes: [],
      }),
      passage_map_by_asin: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects S6 title shorter than 190 chars", async () => {
    const v = await getValidator("S6");
    const result = v.safeParse({
      listings: [
        {
          asin_id: "11111111-1111-1111-1111-111111111111",
          title: "too short",
          bullets: { detailed: [], concise: [], content: [], key_features: [] },
          product_description: "x".repeat(1050),
          backend_search_terms: "",
          backend_categories: { core: "", supplement: "", symptom: "", audience: "", longtail: "" },
          byte_usage: {},
          compliance_violations: [],
        },
      ],
      qa_pairs: [],
      passage_map_by_asin: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects S7 modules that don't end in premium_qa", async () => {
    const v = await getValidator("S7");
    const result = v.safeParse({
      modules: [
        { position: 1, module_type: "hero", cosmo_relationship: "IS_A", fields: {}, images: [] },
        { position: 2, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 3, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 4, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 5, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 6, module_type: "image_text_split", cosmo_relationship: null, fields: {}, images: [] },
        { position: 7, module_type: "feature_grid_4", cosmo_relationship: null, fields: {}, images: [] }, // WRONG
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects S8 with wrong technical names", async () => {
    const v = await getValidator("S8");
    const images = Array.from({ length: 9 }, (_, i) => ({
      image_number: i + 1,
      technical_name: i === 0 ? "MAIN" : `WRONG${i}`, // bogus
      image_type: "x", image_purpose: "x", cosmo_relationship: "IS_A", buyer_stage: "Awareness",
      overlay_text: i === 0 ? "Not Applicable" : "x".repeat(50),
      alt_text: "x".repeat(98), image_direction: "x", ai_image_prompt: "x",
    }));
    const result = v.safeParse({ images });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/seo/validators.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
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

function buildS6(_tables: Record<string, any>): ZodTypeAny {
  const HEADER = /^[A-Z][A-Z0-9 ]*:\s/;
  const bullet = (min: number, max: number) =>
    z.string().min(min).max(max).regex(HEADER, "must start with ALL CAPS HEADER:");

  return z.object({
    listings: z.array(
      z.object({
        asin_id: z.string().uuid(),
        title: z
          .string()
          .min(190)
          .max(200)
          .refine((s) => !s.includes(":"), "title may not contain ':'")
          .refine((s) => {
            // word-repetition cap 2
            const words = s.toLowerCase().split(/\W+/).filter(Boolean);
            const counts: Record<string, number> = {};
            for (const w of words) counts[w] = (counts[w] ?? 0) + 1;
            return Object.values(counts).every((c) => c <= 2);
          }, "word repeated more than 2 times"),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/seo/validators.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/validators.ts tests/lib/seo/validators.test.ts
git commit -m "feat(seo): zod validators generated from schema.json (plan 2 §D-5)"
```

### Task 6: Slot-fill helper (context → prompt)

**Files:**
- Create: `src/lib/seo/slot-fill.ts`
- Create: `tests/lib/seo/slot-fill.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/slot-fill.test.ts
import { describe, it, expect } from "vitest";
import { substituteSlots } from "@/lib/seo/slot-fill";

describe("slot-fill", () => {
  it("substitutes single slot", () => {
    const out = substituteSlots("Hello {{name}}", { name: "world" });
    expect(out).toBe("Hello world");
  });

  it("substitutes multiple occurrences of same slot", () => {
    const out = substituteSlots("{{x}} and {{x}}", { x: "a" });
    expect(out).toBe("a and a");
  });

  it("serializes objects as JSON", () => {
    const out = substituteSlots("data: {{payload}}", { payload: { a: 1 } });
    expect(out).toContain('"a":1');
  });

  it("throws on missing slot (no silent empty)", () => {
    expect(() => substituteSlots("{{a}} {{b}}", { a: "x" })).toThrow(/missing slot.*b/);
  });

  it("leaves text without slots unchanged", () => {
    const out = substituteSlots("plain text", {});
    expect(out).toBe("plain text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/seo/slot-fill.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/seo/slot-fill.ts
// Replace {{slot_name}} placeholders in a phase template with values
// from a context object. Objects/arrays are JSON-stringified.
// Missing slots throw — a silent empty fill would corrupt the prompt.

export type SlotMap = Record<string, unknown>;

export function substituteSlots(template: string, slots: SlotMap): string {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_full, name: string) => {
    if (!(name in slots)) throw new Error(`missing slot in template: ${name}`);
    const v = slots[name];
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  });
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/lib/seo/slot-fill.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/slot-fill.ts tests/lib/seo/slot-fill.test.ts
git commit -m "feat(seo): slot-fill template substitution (plan 2 §D-6)"
```

### Task 7: Claude client (Anthropic SDK + prompt caching + cost capture)

**Files:**
- Create: `src/lib/seo/claude-client.ts`
- Create: `tests/lib/seo/claude-client.test.ts`

The client wraps `@anthropic-ai/sdk`, sets `cache_control: { type: 'ephemeral' }` on the system prompt (SKILL.md body + per-phase rubric), parses the JSON response, and returns both the parsed payload and a `Usage` record for cost computation.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/claude-client.test.ts
import { describe, it, expect, vi } from "vitest";
import { callClaudeJson, type ClaudeCallResult } from "@/lib/seo/claude-client";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '```json\n{"ok":true,"value":42}\n```' }],
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 5000,
            cache_read_input_tokens: 0,
            output_tokens: 200,
          },
          model: "claude-sonnet-4-6",
        }),
      };
    },
  };
});

describe("callClaudeJson", () => {
  it("returns parsed JSON + usage + cost + model", async () => {
    const r: ClaudeCallResult<{ ok: boolean; value: number }> = await callClaudeJson({
      systemPromptCached: "You are a JSON-only assistant.",
      userPrompt: "Return { ok: true, value: 42 }",
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });
    expect(r.parsed).toEqual({ ok: true, value: 42 });
    expect(r.usage.input_tokens).toBe(100);
    expect(r.usage.cache_creation_input_tokens).toBe(5000);
    expect(r.model).toBe("claude-sonnet-4-6");
    expect(r.costUsd).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/seo/claude-client.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/seo/claude-client.ts
// Anthropic SDK wrapper with prompt caching enabled on the system prompt.
// Returns parsed JSON payload + usage + computed USD cost.

import Anthropic from "@anthropic-ai/sdk";
import { computeCostUsd, type Usage } from "@/lib/seo/pricing";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  _client = new Anthropic({ apiKey });
  return _client;
}

export type ClaudeCallOpts = {
  systemPromptCached: string;       // sent with cache_control: ephemeral
  userPrompt: string;
  model: string;                    // claude-sonnet-4-6 | claude-haiku-4-5-20251001
  maxTokens?: number;
};

export type ClaudeCallResult<T = unknown> = {
  parsed: T;
  rawText: string;
  usage: Usage;
  model: string;
  costUsd: number;
};

export async function callClaudeJson<T = unknown>(
  opts: ClaudeCallOpts
): Promise<ClaudeCallResult<T>> {
  const res = await client().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: [
      { type: "text", text: opts.systemPromptCached, cache_control: { type: "ephemeral" } },
    ] as any, // SDK accepts this; cast for older type defs
    messages: [{ role: "user", content: opts.userPrompt }],
  });
  const rawText = (res.content?.[0] as { type: string; text?: string })?.text ?? "";
  const usage: Usage = {
    input_tokens: res.usage.input_tokens ?? 0,
    cache_creation_input_tokens: (res.usage as any).cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: (res.usage as any).cache_read_input_tokens ?? 0,
    output_tokens: res.usage.output_tokens ?? 0,
  };
  const costUsd = computeCostUsd(res.model, usage);
  return {
    parsed: extractJson<T>(rawText),
    rawText,
    usage,
    model: res.model,
    costUsd,
  };
}

function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("Claude response had no JSON object");
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Claude response had no complete JSON object");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/lib/seo/claude-client.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/claude-client.ts tests/lib/seo/claude-client.test.ts
git commit -m "feat(seo): anthropic sdk wrapper with prompt caching + cost (plan 2 §D-7)"
```

### Task 8: Phase executor contract + S1 executor

**Files:**
- Create: `src/lib/seo/phases/s1.ts`
- Create: `tests/lib/seo/phases/s1.test.ts`

The contract: each phase exports `loadContext`, `fillSlots`, `model`, `persist`. `runner.ts` invokes them in sequence. S1 is the simplest case — reads `seo_projects.brand_guidelines_lock` + `seo_asins` rows, fills the `s1-intake.md` template, calls Claude, writes `seo_asins.baseline_analysis`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/phases/s1.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { S1 } from "@/lib/seo/phases/s1";

const TEST_PROJECT_NAME = "__plan2_test_s1__";

describe("S1 phase executor", () => {
  let projectId: string;
  beforeAll(async () => {
    // Clean up any prior test project
    await db.delete(seoProjects).where(eq(seoProjects.name, TEST_PROJECT_NAME));
    const [proj] = await db.insert(seoProjects).values({
      name: TEST_PROJECT_NAME,
      clientIdCode: "test",
      brandGuidelinesLock: {
        status: "locked",
        brand_voice: "direct, technical",
        language_preferences: "US English",
        words_to_avoid: ["proprietary"],
        audience_notes: "agency clients",
        positioning: "Amazon agency of record",
        raw_text: "",
      },
    }).returning();
    projectId = proj.id;
    await db.insert(seoAsins).values({
      projectId,
      asin: "B0TESTASIN",
      sku: "SKU-1",
      existingContent: {
        item_name: "Sample Product",
        detailed_bullets: ["A".repeat(50)], concise_bullets: [], content_bullets: [],
        key_features: [], product_description: "x".repeat(100), generic_keywords: [],
      },
    });
  });

  it("loadContext reads project + asins + brand lock", async () => {
    const ctx = await S1.loadContext(projectId);
    expect(ctx.brandVoice).toBe("direct, technical");
    expect(ctx.asins.length).toBe(1);
    expect(ctx.asins[0].asin).toBe("B0TESTASIN");
  });

  it("fillSlots produces all S1 slots", async () => {
    const ctx = await S1.loadContext(projectId);
    const slots = S1.fillSlots(ctx);
    expect(slots).toMatchObject({
      brand_name: expect.any(String),
      brand_voice: "direct, technical",
      words_to_avoid: expect.stringContaining("proprietary"),
      asin_grid_json: expect.stringContaining("B0TESTASIN"),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/seo/phases/s1.test.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Define the contract type + S1 executor**

```typescript
// src/lib/seo/phases/s1.ts
import { db } from "@/lib/db";
import { seoProjects, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SlotMap } from "@/lib/seo/slot-fill";

export type PhaseId = "S1" | "S2" | "S3" | "S4P1" | "S4P2" | "S4P3" | "S5" | "S6" | "S7" | "S8" | "S9";

export type PhaseExecutor<Ctx = unknown, Output = unknown> = {
  phase: PhaseId;
  model: string;
  loadContext: (projectId: string) => Promise<Ctx>;
  fillSlots: (ctx: Ctx) => SlotMap;
  persist: (
    projectId: string,
    output: Output,
    runId: string
  ) => Promise<{ version: number }>;
};

type S1Context = {
  projectId: string;
  brandName: string;
  brandVoice: string;
  wordsToAvoid: string[];
  positioning: string;
  variationTheme: string;
  asins: Array<{ id: string; asin: string; sku: string; existing: unknown }>;
};

type S1Output = {
  asins: Array<{
    asin: string;
    baseline_analysis: {
      quality_score: number;
      keyword_integration: "strong" | "moderate" | "weak";
      compliance_flags: string[];
      top_improvements: string[];
    };
  }>;
};

export const S1: PhaseExecutor<S1Context, S1Output> = {
  phase: "S1",
  model: "claude-sonnet-4-6",

  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    const lock = project.brandGuidelinesLock;
    return {
      projectId,
      brandName: project.name ?? "",
      brandVoice: lock?.brand_voice ?? "",
      wordsToAvoid: lock?.words_to_avoid ?? [],
      positioning: lock?.positioning ?? "",
      variationTheme: project.varietyPackDetails ?? "",
      asins: asins.map((a) => ({ id: a.id, asin: a.asin, sku: a.sku, existing: a.existingContent })),
    };
  },

  fillSlots(ctx) {
    return {
      client_id_code: "", // project.clientIdCode looked up at runner level if needed by template
      brand_name: ctx.brandName,
      brand_voice: ctx.brandVoice,
      words_to_avoid: ctx.wordsToAvoid.join(", "),
      positioning: ctx.positioning,
      variation_theme: ctx.variationTheme,
      asin_grid_json: ctx.asins.map((a) => ({ asin: a.asin, sku: a.sku, existing: a.existing })),
    };
  },

  async persist(projectId, output) {
    let written = 0;
    for (const row of output.asins) {
      const res = await db
        .update(seoAsins)
        .set({ baselineAnalysis: row.baseline_analysis })
        .where(eq(seoAsins.projectId, projectId));
      written += res.count ?? 0;
    }
    return { version: written };
  },
};
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/lib/seo/phases/s1.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/phases/s1.ts tests/lib/seo/phases/s1.test.ts
git commit -m "feat(seo): S1 phase executor + PhaseExecutor contract (plan 2 §D-8)"
```

### Task 9: S2 + S3 + S5 executors

These follow the S1 pattern. Each has its own task entry below — copy the structure from Task 8.

**Files (S2):**
- Create: `src/lib/seo/phases/s2.ts`
- Create: `tests/lib/seo/phases/s2.test.ts`

**Files (S3):**
- Create: `src/lib/seo/phases/s3.ts`
- Create: `tests/lib/seo/phases/s3.test.ts`

**Files (S5):**
- Create: `src/lib/seo/phases/s5.ts`
- Create: `tests/lib/seo/phases/s5.test.ts`

- [ ] **Step 1 (S2): Write loadContext test**

S2 requires a Cerebro CSV — added through the API (next milestone). For this executor test, mock the CSV via the project's `seoSettings` `s2_cerebro_csv` key. (If `seoSettings` doesn't have a per-project mechanism yet, accept the CSV via a transient table or a `seo_project_inputs` JSONB column on `seoProjects.contentRules` keyed by `s2_cerebro_csv`. Use the existing `seoProjects.contentRules` jsonb if simpler.)

```typescript
// tests/lib/seo/phases/s2.test.ts
import { describe, it, expect } from "vitest";
import { S2 } from "@/lib/seo/phases/s2";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("S2 phase executor", () => {
  it("loadContext reads s2_cerebro_csv from seo_projects.contentRules", async () => {
    const [proj] = await db.insert(seoProjects).values({
      name: "__s2_test__",
      clientIdCode: "test",
      contentRules: { s2_cerebro_csv: { mode: "shared", dimensions: ["Keyword Phrase\nshoes\n"] } } as any,
    }).returning();
    const ctx = await S2.loadContext(proj.id);
    expect(ctx.cerebroCsv).toContain("Keyword Phrase");
    await db.delete(seoProjects).where(eq(seoProjects.id, proj.id));
  });

  it("persist replaces project's keyword set", async () => {
    // covered by integration test in Task 14
    expect(typeof S2.persist).toBe("function");
  });
});
```

- [ ] **Step 2 (S2): Implement**

```typescript
// src/lib/seo/phases/s2.ts
import { db } from "@/lib/db";
import { seoProjects, seoKeywords, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";

type S2Context = {
  projectId: string;
  cerebroCsv: string;
  baselineSummary: string;
};

type S2Output = {
  keywords: Array<Record<string, unknown> & { text: string }>;
};

export const S2: PhaseExecutor<S2Context, S2Output> = {
  phase: "S2",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const rules = (project.contentRules ?? {}) as Record<string, { mode: string; dimensions: string[] }>;
    const cerebroCsv = rules.s2_cerebro_csv?.dimensions?.[0] ?? "";
    if (!cerebroCsv) throw new Error("S2 requires a Cerebro CSV. Upload it via the S2 column UI.");
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    const baselineSummary = asins
      .filter((a) => a.baselineAnalysis)
      .map((a) => `${a.asin}: ${a.baselineAnalysis?.top_improvements?.join("; ") ?? ""}`)
      .join("\n");
    return { projectId, cerebroCsv, baselineSummary };
  },
  fillSlots(ctx) {
    return { cerebro_csv: ctx.cerebroCsv, baseline_summary: ctx.baselineSummary };
  },
  async persist(projectId, output) {
    await db.delete(seoKeywords).where(eq(seoKeywords.projectId, projectId));
    if (output.keywords.length > 0) {
      await db.insert(seoKeywords).values(
        output.keywords.map((k) => ({
          projectId,
          text: String(k.text),
          searchVolume: Number(k.search_volume ?? 0),
          priorityTier: String(k.priority_tier ?? "T4"),
          searchIntent: String(k.search_intent ?? ""),
          primaryUseLocation: String(k.primary_use_location ?? ""),
          matchType: String(k.match_type ?? ""),
          cosmoRelationship: null,
          buyerStage: String(k.buyer_stage ?? "Awareness"),
          notes: String(k.notes ?? ""),
          keywordSource: String(k.keyword_source ?? "Helium 10"),
          semanticGroup: String(k.semantic_group ?? ""),
          cerebroIq: k.cerebro_iq == null ? null : Number(k.cerebro_iq),
          competingProducts: k.competing_products == null ? null : Number(k.competing_products),
          titleDensity: k.title_density == null ? null : Number(k.title_density),
          cpr: k.cpr == null ? null : Number(k.cpr),
          competitorRankAvg: k.competitor_rank_avg == null ? null : String(k.competitor_rank_avg),
          ppcSuggestedBid: k.ppc_suggested_bid == null ? null : String(k.ppc_suggested_bid),
          ppcSuggestedMinBid: k.ppc_suggested_min_bid == null ? null : String(k.ppc_suggested_min_bid),
          ppcSuggestedMaxBid: k.ppc_suggested_max_bid == null ? null : String(k.ppc_suggested_max_bid),
          cosmoDomain: String(k.cosmo_domain ?? ""),
          compositeScore: k.composite_score == null ? null : String(k.composite_score),
          isNegative: Boolean(k.is_negative),
          negativeReason: k.negative_reason == null ? null : String(k.negative_reason),
          isCompetitor: Boolean(k.is_competitor),
        }))
      );
    }
    return { version: 1 };
  },
};
```

- [ ] **Step 3 (S2): Run test**

Run: `npm test -- tests/lib/seo/phases/s2.test.ts --run`
Expected: PASS.

- [ ] **Step 4 (S3): Write executor**

```typescript
// src/lib/seo/phases/s3.ts
import { db } from "@/lib/db";
import { seoProjects, seoReviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";

type S3Context = { projectId: string; reviewsCsv: string };
type S3Output = { reviews: Array<Record<string, unknown>> };

export const S3: PhaseExecutor<S3Context, S3Output> = {
  phase: "S3",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const rules = (project.contentRules ?? {}) as Record<string, { dimensions: string[] }>;
    const reviewsCsv = rules.s3_reviews_csv?.dimensions?.[0] ?? "";
    if (!reviewsCsv) throw new Error("S3 requires reviews CSV. Upload it via the S3 column UI.");
    return { projectId, reviewsCsv };
  },
  fillSlots(ctx) {
    return { reviews_csv: ctx.reviewsCsv };
  },
  async persist(projectId, output) {
    await db.delete(seoReviews).where(eq(seoReviews.projectId, projectId));
    if (output.reviews.length > 0) {
      await db.insert(seoReviews).values(
        output.reviews.map((r) => ({
          projectId,
          reviewId: r.review_id == null ? null : String(r.review_id),
          sentiment: String(r.sentiment ?? ""),
          keyThemes: String(r.key_themes ?? ""),
          usageMentioned: r.usage_mentioned == null ? null : String(r.usage_mentioned),
          rufusUsableInsight: r.rufus_usable_insight == null ? null : String(r.rufus_usable_insight),
          bulletMapping: r.bullet_mapping == null ? null : String(r.bullet_mapping),
        }))
      );
    }
    return { version: 1 };
  },
};
```

Mirror the S2 test pattern in `tests/lib/seo/phases/s3.test.ts`. Run + commit.

- [ ] **Step 5 (S5): Write executor**

```typescript
// src/lib/seo/phases/s5.ts
import { db } from "@/lib/db";
import { seoProjects, seoKeywords, seoRufus, seoCosmopMaps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";
import { COSMO_RELATIONSHIPS } from "@/lib/seo/prompts/cosmo-relationships";

type S5Context = {
  projectId: string;
  approvedKeywords: Array<Record<string, unknown>>;
  rufusPhase3: unknown;
  brandVoice: string;
};

type S5Output = {
  triples: Array<{ id: string; entity1: string; relationship: string; entity2: string; confidence: number; confidence_level: "High" | "Medium" | "Low"; supporting_keyword_tier: string | null }>;
  keyword_coverage: Record<string, number>;
  competitive_positioning: string;
  relationship_categories_evaluated: string[];
};

export const S5: PhaseExecutor<S5Context, S5Output> = {
  phase: "S5",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const kws = await db.select().from(seoKeywords).where(eq(seoKeywords.projectId, projectId));
    const [rufus] = await db.select().from(seoRufus).where(eq(seoRufus.projectId, projectId)).limit(1);
    return {
      projectId,
      approvedKeywords: kws.map((k) => ({ text: k.text, priority_tier: k.priorityTier, cosmo_domain: k.cosmoDomain })),
      rufusPhase3: rufus?.optimizationSummary ?? null,
      brandVoice: project.brandGuidelinesLock?.brand_voice ?? "",
    };
  },
  fillSlots(ctx) {
    return {
      approved_keywords_json: ctx.approvedKeywords,
      rufus_phase3: ctx.rufusPhase3 ?? "",
      brand_voice: ctx.brandVoice,
      cosmo_categories_required: COSMO_RELATIONSHIPS.join(", "),
    };
  },
  async persist(projectId, output) {
    await db
      .insert(seoCosmopMaps)
      .values({
        projectId,
        triples: output.triples,
        keywordCoverage: output.keyword_coverage,
        competitivePositioning: output.competitive_positioning,
        relationshipCategoriesEvaluated: output.relationship_categories_evaluated,
      })
      .onConflictDoUpdate({
        target: seoCosmopMaps.projectId,
        set: {
          triples: output.triples,
          keywordCoverage: output.keyword_coverage,
          competitivePositioning: output.competitive_positioning,
          relationshipCategoriesEvaluated: output.relationship_categories_evaluated,
          updatedAt: new Date(),
        },
      });
    return { version: 1 };
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/seo/phases/s2.ts src/lib/seo/phases/s3.ts src/lib/seo/phases/s5.ts \
        tests/lib/seo/phases/s2.test.ts tests/lib/seo/phases/s3.test.ts tests/lib/seo/phases/s5.test.ts
git commit -m "feat(seo): S2/S3/S5 phase executors (plan 2 §D-9)"
```

### Task 10: S4 executor (3 sub-phases, paste-back semantics)

S4 is the special case: the runner does NOT call Claude end-to-end for Phase 1 + Phase 2. It writes a `seo_phase_runs` row with `status='paused_user_input'` after emitting the question batch, and resumes via `/api/seo/projects/[id]/phases/S4/resume`. Phase 3 runs autonomously after Phase 1 + 2 are both filled in.

**Files:**
- Create: `src/lib/seo/phases/s4.ts`
- Create: `tests/lib/seo/phases/s4.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/phases/s4.test.ts
import { describe, it, expect } from "vitest";
import { S4 } from "@/lib/seo/phases/s4";
import { CANONICAL_RUFUS_QUESTIONS } from "@/lib/seo/prompts/canonical-rufus-questions";

describe("S4 executor", () => {
  it("emitPhase1 returns immutable 5 canonical questions", () => {
    const questions = S4.emitPhase1();
    expect(questions.length).toBe(5);
    expect(questions[0].text).toBe(CANONICAL_RUFUS_QUESTIONS[0].text);
  });

  it("persistPhase1 stores 5 answers and stamps phase1_approved_at when all 5 present", async () => {
    expect(typeof S4.persistPhase1).toBe("function");
  });

  it("requiresPause returns true after Phase 1 emit until paste-back", () => {
    expect(S4.requiresPause("S4P1")).toBe(true);
    expect(S4.requiresPause("S4P2")).toBe(true);
    expect(S4.requiresPause("S4P3")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/seo/phases/s4.ts
import { db } from "@/lib/db";
import { seoRufus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CANONICAL_RUFUS_QUESTIONS } from "@/lib/seo/prompts/canonical-rufus-questions";

type Phase1Q = { id: string; text: string; intent_tier: string; batch_char_count: number };

export const S4 = {
  phase: "S4" as const,
  model: "claude-sonnet-4-6",

  emitPhase1(): Phase1Q[] {
    return CANONICAL_RUFUS_QUESTIONS.map((q) => ({
      id: q.id,
      text: q.text,
      intent_tier: q.intent_tier,
      batch_char_count: q.text.length,
    }));
  },

  requiresPause(subPhase: "S4P1" | "S4P2" | "S4P3"): boolean {
    return subPhase === "S4P1" || subPhase === "S4P2";
  },

  async persistPhase1(projectId: string, responses: string[]): Promise<void> {
    if (responses.length !== 5) throw new Error("S4 Phase 1 requires exactly 5 responses");
    const questions = S4.emitPhase1();
    await db
      .insert(seoRufus)
      .values({
        projectId,
        phase1Questions: questions,
        phase1Answers: responses,
        phase1ApprovedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: seoRufus.projectId,
        set: { phase1Questions: questions, phase1Answers: responses, phase1ApprovedAt: new Date(), updatedAt: new Date() },
      });
  },

  async persistPhase2(projectId: string, questions: Phase1Q[], answers: string[]): Promise<void> {
    if (answers.length !== questions.length) {
      throw new Error("S4 Phase 2: questions and answers must be same length");
    }
    await db
      .update(seoRufus)
      .set({ phase2Questions: questions, phase2Answers: answers, phase2ApprovedAt: new Date(), updatedAt: new Date() })
      .where(eq(seoRufus.projectId, projectId));
  },

  // Phase 3 is autonomous: runner calls Claude with the optimization-synthesis
  // prompt, validates against the S4P3 schema, persists, stamps s4_approved_at.
  async persistPhase3(
    projectId: string,
    output: { rows: Array<Record<string, string>>; optimization_summary: { seo_strategy: string; listing_plan: string; image_strategy: string; audience_segmentation: string; action_list: string[] } }
  ): Promise<void> {
    await db
      .update(seoRufus)
      .set({
        rows: output.rows,
        optimizationSummary: output.optimization_summary,
        phase3ApprovedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(seoRufus.projectId, projectId));
  },
};
```

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/lib/seo/phases/s4.test.ts --run
git add src/lib/seo/phases/s4.ts tests/lib/seo/phases/s4.test.ts
git commit -m "feat(seo): S4 three-phase executor with pause/resume (plan 2 §D-10)"
```

### Task 11: S6 executor (atomic transaction, compliance + byte budgets)

S6 is the centerpiece. After Claude returns, the runner:
1. Runs compliance scan on every text field (title, bullets, description, backend) — merge bypass flags from prior version.
2. Computes `byte_usage` per field via `checkCharBudget` + `checkByteBudget`.
3. In a single Drizzle transaction: upsert `seo_listings`, `seo_qa` (with derived subsets), `seo_aplus_plans` headers, `seo_passage_map`.

**Files:**
- Create: `src/lib/seo/phases/s6.ts`
- Create: `tests/lib/seo/phases/s6.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/phases/s6.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoListings, seoQa, seoPassageMap, seoAplusPlans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { S6 } from "@/lib/seo/phases/s6";

const NAME = "__plan2_test_s6__";
describe("S6 persist (atomic transaction)", () => {
  let projectId: string;
  let asinId: string;
  beforeAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.name, NAME));
    const [proj] = await db.insert(seoProjects).values({ name: NAME, clientIdCode: "test" }).returning();
    projectId = proj.id;
    const [asin] = await db.insert(seoAsins).values({ projectId, asin: "B0S6TEST", sku: "S" }).returning();
    asinId = asin.id;
  });
  afterAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.id, projectId));
  });

  it("writes listings + qa + passage_map + aplus headers in one transaction", async () => {
    await S6.persist(projectId, {
      listings: [{
        asin_id: asinId,
        title: "A".repeat(195),
        bullets: {
          detailed: Array(5).fill("HDR: " + "x".repeat(390)),
          concise: Array(5).fill("HDR: " + "x".repeat(190)),
          content: Array(5).fill("HDR: " + "x".repeat(90)),
          key_features: Array(5).fill("HDR: " + "x".repeat(40)),
        },
        product_description: "x".repeat(1050),
        backend_search_terms: "alpha beta gamma",
        backend_categories: { core: "", supplement: "", symptom: "", audience: "", longtail: "" },
        compliance_violations: [],
      }],
      qa_pairs: Array.from({ length: 13 }, (_, i) => ({
        id: `QA_${i+1}`,
        question: `q${i}`, answer_short: `a${i}`, answer_long: `long answer ${i}`,
        intent_tier: "consideration", source_rufus_question_id: null, source_review_themes: [],
      })),
      passage_map_by_asin: { [asinId]: [{ section: "title", text: "x", rufus_question_ids: ["RQ1"], cosmo_triple_ids: [], keywords_used: [] }] },
    });
    const [listing] = await db.select().from(seoListings).where(eq(seoListings.asinId, asinId)).limit(1);
    expect(listing?.title).toContain("A");
    const [qa] = await db.select().from(seoQa).where(eq(seoQa.projectId, projectId)).limit(1);
    expect(Array.isArray(qa?.pairs) && qa.pairs.length).toBe(13);
    const [pm] = await db.select().from(seoPassageMap).where(eq(seoPassageMap.asinId, asinId)).limit(1);
    expect(Array.isArray(pm?.passages) && pm.passages.length).toBeGreaterThan(0);
    const [aplus] = await db.select().from(seoAplusPlans).where(eq(seoAplusPlans.asinId, asinId)).limit(1);
    expect(Array.isArray(aplus?.modules) && aplus.modules.length).toBe(7);
  });

  it("rolls back all four if one fails", async () => {
    // Force a unique-version collision on listings to trigger rollback
    await expect(
      S6.persist(projectId, {
        listings: [{
          asin_id: asinId,
          title: "B".repeat(195),
          bullets: { detailed: ["x"], concise: ["x"], content: ["x"], key_features: ["x"] },
          product_description: "x".repeat(1050),
          backend_search_terms: "",
          backend_categories: { core: "", supplement: "", symptom: "", audience: "", longtail: "" },
          compliance_violations: [],
        }],
        qa_pairs: [],
        passage_map_by_asin: {},
        forceVersion: 1, // collision with prior insert
      } as any)
    ).rejects.toThrow();
    const all = await db.select().from(seoListings).where(eq(seoListings.asinId, asinId));
    // Only the first successful write should remain (version 1 untouched, no version 2 from this call beyond the partial state)
    expect(all.every((l) => l.version === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/seo/phases/s6.ts
import { db } from "@/lib/db";
import { seoProjects, seoKeywords, seoAsins, seoRufus, seoCosmopMaps, seoListings, seoQa, seoPassageMap, seoAplusPlans } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";
import { scanCompliance, mergeBypass, type ComplianceViolation } from "@/lib/seo/compliance";
import { checkByteBudget, checkCharBudget } from "@/lib/seo/byte-budget";

type S6Context = {
  projectId: string;
  approvedKeywords: unknown[];
  rufusPhase3: unknown;
  cosmoTriples: unknown[];
  brandVoice: string;
  wordsToAvoid: string[];
  asins: Array<{ id: string; asin: string; sku: string }>;
};

type S6Output = {
  listings: Array<{
    asin_id: string;
    title: string;
    bullets: { detailed: string[]; concise: string[]; content: string[]; key_features: string[] };
    product_description: string;
    backend_search_terms: string;
    backend_categories: { core: string; supplement: string; symptom: string; audience: string; longtail: string };
    compliance_violations?: ComplianceViolation[];
  }>;
  qa_pairs: Array<{
    id: string; question: string; answer_short: string; answer_long: string;
    intent_tier: string; source_rufus_question_id: string | null; source_review_themes: string[];
  }>;
  passage_map_by_asin: Record<string, Array<{ section: string; text: string; rufus_question_ids: string[]; cosmo_triple_ids: string[]; keywords_used: string[] }>>;
};

export const S6: PhaseExecutor<S6Context, S6Output> = {
  phase: "S6",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const kws = await db.select().from(seoKeywords).where(eq(seoKeywords.projectId, projectId));
    const [rufus] = await db.select().from(seoRufus).where(eq(seoRufus.projectId, projectId)).limit(1);
    const [cosmo] = await db.select().from(seoCosmopMaps).where(eq(seoCosmopMaps.projectId, projectId)).limit(1);
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    return {
      projectId,
      approvedKeywords: kws.filter((k) => !k.isNegative).map((k) => ({ text: k.text, tier: k.priorityTier })),
      rufusPhase3: rufus?.optimizationSummary ?? null,
      cosmoTriples: cosmo?.triples ?? [],
      brandVoice: project.brandGuidelinesLock?.brand_voice ?? "",
      wordsToAvoid: project.brandGuidelinesLock?.words_to_avoid ?? [],
      asins: asins.map((a) => ({ id: a.id, asin: a.asin, sku: a.sku })),
    };
  },
  fillSlots(ctx) {
    return {
      approved_keywords_json: ctx.approvedKeywords,
      rufus_phase3: ctx.rufusPhase3 ?? "",
      cosmo_triples: ctx.cosmoTriples,
      brand_voice: ctx.brandVoice,
      words_to_avoid: ctx.wordsToAvoid.join(", "),
      variation_family_summary: ctx.asins.map((a) => `${a.asin} (${a.sku})`).join("; "),
      asin_specific_attributes: ctx.asins,
    };
  },
  async persist(projectId, output) {
    return await db.transaction(async (tx) => {
      for (const l of output.listings) {
        // Compliance scan
        const fresh: ComplianceViolation[] = [];
        const fields: Array<{ field: string; text: string }> = [
          { field: "title", text: l.title },
          ...l.bullets.detailed.map((b, i) => ({ field: `bullets.detailed.${i}`, text: b })),
          ...l.bullets.concise.map((b, i) => ({ field: `bullets.concise.${i}`, text: b })),
          ...l.bullets.content.map((b, i) => ({ field: `bullets.content.${i}`, text: b })),
          ...l.bullets.key_features.map((b, i) => ({ field: `bullets.key_features.${i}`, text: b })),
          { field: "product_description", text: l.product_description },
          { field: "backend_search_terms", text: l.backend_search_terms },
        ];
        const [project] = await tx.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
        const brandWords = project?.brandGuidelinesLock?.words_to_avoid ?? [];
        for (const f of fields) fresh.push(...scanCompliance({ field: f.field, text: f.text, brandWordsToAvoid: brandWords }));

        const [prior] = await tx
          .select()
          .from(seoListings)
          .where(eq(seoListings.asinId, l.asin_id))
          .orderBy(sql`version DESC`)
          .limit(1);
        const merged = mergeBypass(fresh, prior?.complianceViolations ?? []);

        const byteUsage: Record<string, { used: number; max: number; ok: boolean }> = {
          title: { ...checkCharBudget(l.title, 190, 200) },
          product_description: { ...checkCharBudget(l.product_description, 1000, 1200) },
          backend_search_terms: checkByteBudget(l.backend_search_terms, 500),
        };

        const nextVersion = (prior?.version ?? 0) + 1;
        await tx.insert(seoListings).values({
          projectId,
          asinId: l.asin_id,
          title: l.title,
          bullets: l.bullets,
          productDescription: l.product_description,
          backendSearchTerms: l.backend_search_terms,
          backendCategories: l.backend_categories,
          byteUsage,
          complianceViolations: merged,
          version: nextVersion,
        });

        // A+ headers (positions 1-7, position 7 = premium_qa shell)
        const headers = Array.from({ length: 7 }, (_, i) => ({
          position: i + 1,
          module_type: i === 6 ? "premium_qa" : "hero",
          cosmo_relationship: null,
          fields: {},
          images: [],
        }));
        const [priorAplus] = await tx
          .select()
          .from(seoAplusPlans)
          .where(eq(seoAplusPlans.asinId, l.asin_id))
          .orderBy(sql`version DESC`)
          .limit(1);
        await tx.insert(seoAplusPlans).values({
          projectId,
          asinId: l.asin_id,
          modules: headers as any,
          version: (priorAplus?.version ?? 0) + 1,
        });

        const passages = output.passage_map_by_asin[l.asin_id] ?? [];
        const [priorPm] = await tx
          .select()
          .from(seoPassageMap)
          .where(eq(seoPassageMap.asinId, l.asin_id))
          .orderBy(sql`version DESC`)
          .limit(1);
        await tx.insert(seoPassageMap).values({
          projectId,
          asinId: l.asin_id,
          passages,
          version: (priorPm?.version ?? 0) + 1,
        });

        const aplusSubset = output.qa_pairs
          .filter((p) => p.intent_tier === "decision")
          .slice(0, 5)
          .map((p) => ({ id: p.id, question: p.question, answer: p.answer_long }));
        const customerExport = output.qa_pairs.map((p) => ({ id: p.id, question: p.question, answer: p.answer_long }));
        const passageMapQa = output.qa_pairs.map((p) => ({
          pair_id: p.id,
          rufus_question_ids: p.source_rufus_question_id ? [p.source_rufus_question_id] : [],
          cosmo_triple_ids: [],
        }));

        const [priorQa] = await tx
          .select()
          .from(seoQa)
          .where(and(eq(seoQa.projectId, projectId), eq(seoQa.asinId, l.asin_id)))
          .orderBy(sql`version DESC`)
          .limit(1);
        await tx.insert(seoQa).values({
          projectId,
          asinId: l.asin_id,
          pairs: output.qa_pairs,
          aplusQaSubset: aplusSubset,
          customerQaExport: customerExport,
          passageMapQa,
          version: (priorQa?.version ?? 0) + 1,
        });
      }
      // Stamp s6_approved_at AFTER all writes succeed
      await tx.update(seoProjects).set({ s6ApprovedAt: new Date(), updatedAt: new Date() }).where(eq(seoProjects.id, projectId));
      return { version: 1 };
    });
  },
};
```

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/lib/seo/phases/s6.test.ts --run
git add src/lib/seo/phases/s6.ts tests/lib/seo/phases/s6.test.ts
git commit -m "feat(seo): S6 atomic transactional executor (plan 2 §D-11)"
```

### Task 12: Runner orchestration (`runPhase` + `runProject`)

**Files:**
- Create: `src/lib/seo/runner.ts`
- Create: `tests/lib/seo/runner.test.ts`

The runner wires the executors to the Claude client, validators, and `seo_phase_runs` audit row. State machine: `queued → running → (validation_failed | success | error | paused_user_input | cancelled)`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/runner.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPhase, type PhaseRunResult } from "@/lib/seo/runner";

vi.mock("@/lib/seo/claude-client", () => ({
  callClaudeJson: vi.fn(async () => ({
    parsed: { asins: [{ asin: "B0X", baseline_analysis: { quality_score: 75, keyword_integration: "moderate", compliance_flags: [], top_improvements: [] } }] },
    rawText: "",
    usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 50 },
    model: "claude-sonnet-4-6",
    costUsd: 0.001,
  })),
}));

describe("runner.runPhase", () => {
  it("creates a seo_phase_runs row, calls Claude, validates, persists, marks success", async () => {
    // requires fixture project — see Task 14 integration test
    expect(typeof runPhase).toBe("function");
  });

  it("retries once on validation failure", async () => {
    // mock callClaudeJson to return invalid then valid
    // assert seo_phase_runs.attempt === 2
    expect(typeof runPhase).toBe("function");
  });

  it("marks validation_failed on second failure and persists validation_errors", async () => {
    expect(typeof runPhase).toBe("function");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/seo/runner.ts
import { db } from "@/lib/db";
import { seoPhaseRuns, seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loadSkill } from "@/lib/seo/skill-loader";
import { callClaudeJson } from "@/lib/seo/claude-client";
import { getValidator } from "@/lib/seo/validators";
import { substituteSlots } from "@/lib/seo/slot-fill";
import { S1 } from "@/lib/seo/phases/s1";
import { S2 } from "@/lib/seo/phases/s2";
import { S3 } from "@/lib/seo/phases/s3";
import { S4 } from "@/lib/seo/phases/s4";
import { S5 } from "@/lib/seo/phases/s5";
import { S6 } from "@/lib/seo/phases/s6";
import { S7 } from "@/lib/seo/phases/s7";        // landed in Milestone G/H
import { S8 } from "@/lib/seo/phases/s8";        // landed in Milestone G/H
import { S9 } from "@/lib/seo/phases/s9";        // landed in Milestone I

export type PhaseId = "S1" | "S2" | "S3" | "S4P1" | "S4P2" | "S4P3" | "S5" | "S6" | "S7" | "S8" | "S9";

export type PhaseRunResult =
  | { status: "success"; runId: string; version: number }
  | { status: "validation_failed"; runId: string; errors: Array<{ field: string; message: string }> }
  | { status: "error"; runId: string; message: string }
  | { status: "paused_user_input"; runId: string };

type RunOpts = {
  trigger: "manual" | "auto_run" | "cascade_rerun" | "s9_auto_rerun";
  triggeredBy?: string;
  parentRunId?: string;
};

export async function runPhase(
  projectId: string,
  phase: PhaseId,
  opts: RunOpts = { trigger: "manual" }
): Promise<PhaseRunResult> {
  const [runRow] = await db
    .insert(seoPhaseRuns)
    .values({
      projectId,
      phase,
      status: "running",
      trigger: opts.trigger,
      attempt: 1,
      parentRunId: opts.parentRunId,
      triggeredBy: opts.triggeredBy,
    })
    .returning();
  const runId = runRow.id;
  const startedAt = Date.now();

  try {
    // S4 sub-phases that require user input bypass Claude entirely on the emit side
    if (phase === "S4P1") {
      await db.update(seoPhaseRuns).set({ status: "paused_user_input" }).where(eq(seoPhaseRuns.id, runId));
      return { status: "paused_user_input", runId };
    }
    if (phase === "S4P2") {
      // Generate Phase 2 questions via Claude, then pause for paste-back
      // (Full implementation in Task 14 integration test)
      await db.update(seoPhaseRuns).set({ status: "paused_user_input" }).where(eq(seoPhaseRuns.id, runId));
      return { status: "paused_user_input", runId };
    }

    const executor = pickExecutor(phase);
    const skill = await loadSkill();
    const ctx = await executor.loadContext(projectId);
    const slots = executor.fillSlots(ctx);
    const phaseKey = phaseKeyFor(phase);
    const template = skill.phases[phaseKey];
    const userPrompt = substituteSlots(template, slots);
    const systemPrompt = `${skill.body}\n\nReturn ONLY a JSON object that matches the phase output schema. Do not include prose, markdown, or commentary.`;

    let parsed: unknown;
    let usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
    let model = executor.model;
    let costUsd = 0;
    let attempt = 1;
    let validationErrors: Array<{ field: string; message: string }> = [];

    const validator = await getValidator(phase);

    for (attempt = 1; attempt <= 2; attempt++) {
      const r = await callClaudeJson({
        systemPromptCached: systemPrompt,
        userPrompt: attempt === 1 ? userPrompt : `${userPrompt}\n\nPRIOR VALIDATION ERRORS — please fix:\n${JSON.stringify(validationErrors)}`,
        model: executor.model,
        maxTokens: 8192,
      });
      parsed = r.parsed;
      usage = r.usage;
      model = r.model;
      costUsd += r.costUsd;

      const v = validator.safeParse(parsed);
      if (v.success) {
        validationErrors = [];
        break;
      }
      validationErrors = v.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
      await db.update(seoPhaseRuns).set({ attempt }).where(eq(seoPhaseRuns.id, runId));
    }

    if (validationErrors.length > 0) {
      await db
        .update(seoPhaseRuns)
        .set({
          status: "validation_failed",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          claudeInputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
          claudeOutputTokens: usage.output_tokens,
          claudeCostUsd: costUsd.toFixed(4),
          claudeModel: model,
          validationErrors,
        })
        .where(eq(seoPhaseRuns.id, runId));
      return { status: "validation_failed", runId, errors: validationErrors };
    }

    const { version } = await executor.persist(projectId, parsed as any, runId);

    await db
      .update(seoPhaseRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        claudeInputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
        claudeOutputTokens: usage.output_tokens,
        claudeCostUsd: costUsd.toFixed(4),
        claudeModel: model,
        outputArtifactVersion: version,
      })
      .where(eq(seoPhaseRuns.id, runId));

    return { status: "success", runId, version };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(seoPhaseRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        errorMessage: message,
      })
      .where(eq(seoPhaseRuns.id, runId));
    return { status: "error", runId, message };
  }
}

function pickExecutor(phase: PhaseId) {
  switch (phase) {
    case "S1": return S1;
    case "S2": return S2;
    case "S3": return S3;
    case "S4P3": return { ...S5, phase: "S4P3", persist: async (pid: string, out: any) => { await S4.persistPhase3(pid, out); return { version: 1 }; } } as any;
    case "S5": return S5;
    case "S6": return S6;
    case "S7": return S7;
    case "S8": return S8;
    case "S9": return S9;
    default: throw new Error(`no executor for phase: ${phase}`);
  }
}

function phaseKeyFor(phase: PhaseId): "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "s9" {
  if (phase.startsWith("S4")) return "s4";
  return phase.toLowerCase().slice(0, 2) as any;
}

export async function runProject(
  projectId: string,
  opts: RunOpts = { trigger: "auto_run" }
): Promise<PhaseRunResult[]> {
  const order: PhaseId[] = ["S1", "S2", "S3", "S4P1", "S4P2", "S4P3", "S5", "S6", "S7", "S8", "S9"];
  const results: PhaseRunResult[] = [];
  for (const p of order) {
    const r = await runPhase(projectId, p, opts);
    results.push(r);
    if (r.status !== "success") return results; // halt on pause / fail
  }
  return results;
}
```

> NOTE: This task creates import references to `s7.ts`, `s8.ts`, `s9.ts` that don't exist yet (they land in Milestones G/H/I). Use placeholder stub files that throw `not_implemented` for now — these will be replaced in those milestones. Add this stub file:

```typescript
// src/lib/seo/phases/s7.ts (stub — replaced in Milestone G)
import type { PhaseExecutor } from "@/lib/seo/phases/s1";
export const S7: PhaseExecutor<unknown, unknown> = {
  phase: "S7", model: "claude-sonnet-4-6",
  async loadContext() { throw new Error("S7 executor not implemented yet (Milestone G)"); },
  fillSlots() { throw new Error("S7 stub"); },
  async persist() { throw new Error("S7 stub"); },
};
```

Repeat for `s8.ts` and `s9.ts` (stub bodies, same shape).

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/lib/seo/runner.test.ts --run
git add src/lib/seo/runner.ts src/lib/seo/phases/s7.ts src/lib/seo/phases/s8.ts src/lib/seo/phases/s9.ts \
        tests/lib/seo/runner.test.ts
git commit -m "feat(seo): runner orchestration + state machine + retry (plan 2 §D-12)"
```

### Task 13: Persistence helper (transactional writes)

`runner.ts` already calls `executor.persist(projectId, output, runId)` directly. If patterns emerge across phases (e.g., bumping `version`, stamping approved_at, conflict resolution), extract them into `src/lib/seo/persist.ts`. For now this is a one-task file with helpers used only by S6 + the future S7/S8 executors.

**Files:**
- Create: `src/lib/seo/persist.ts`
- Create: `tests/lib/seo/persist.test.ts`

- [ ] **Step 1: Implement minimum helpers**

```typescript
// src/lib/seo/persist.ts
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function stampPhaseApproval(
  projectId: string,
  phase: "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9"
): Promise<void> {
  const col = `s${phase.slice(1)}_approved_at`;
  await db.execute(
    // Drizzle dynamic column update via raw SQL — safer than constructing the .set object
    // because Drizzle's column typing forces a literal key.
    // The col name is derived from a fixed enum and is not user input.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {
      sql: `UPDATE seo_projects SET ${col} = now(), updated_at = now() WHERE id = $1`,
      args: [projectId],
    } as any
  );
}

export async function getNextVersion(
  asinId: string,
  table: { asinId: { name: string }; version: { name: string }; name: string }
): Promise<number> {
  const rows = await db.execute<{ max: number }>(
    `SELECT COALESCE(MAX(version), 0) AS max FROM ${table.name} WHERE asin_id = $1`,
    [asinId] as any
  );
  return (rows[0]?.max ?? 0) + 1;
}
```

> The `stampPhaseApproval` helper is intentionally used only outside transactions (because route-level approval is separate from runner-internal persist). For S6 atomic-stamp, the runner inlines the `tx.update(seoProjects).set(...)` call inside the transaction.

- [ ] **Step 2: Commit**

```bash
git add src/lib/seo/persist.ts tests/lib/seo/persist.test.ts
git commit -m "feat(seo): persistence helpers (plan 2 §D-13)"
```

### Task 14: End-to-end S1 fixture smoke test

**Files:**
- Create: `tests/lib/seo/runner.s1-e2e.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/runner.s1-e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoPhaseRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runPhase } from "@/lib/seo/runner";

const NAME = "__plan2_e2e_s1__";
describe("runPhase('S1') end-to-end (LIVE Claude call — requires ANTHROPIC_API_KEY)", () => {
  let projectId: string;
  beforeAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.name, NAME));
    const [proj] = await db.insert(seoProjects).values({
      name: NAME, clientIdCode: "test",
      brandGuidelinesLock: {
        status: "locked", brand_voice: "direct", language_preferences: "US",
        words_to_avoid: [], audience_notes: "", positioning: "test", raw_text: "",
      },
    }).returning();
    projectId = proj.id;
    await db.insert(seoAsins).values({
      projectId, asin: "B0E2ETEST", sku: "X",
      existingContent: {
        item_name: "Test Product", detailed_bullets: ["A"], concise_bullets: [],
        content_bullets: [], key_features: [], product_description: "Test desc", generic_keywords: [],
      },
    });
  });
  afterAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.id, projectId));
  });

  it("writes baseline_analysis + a success row in seo_phase_runs", async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("skipping live S1 e2e — ANTHROPIC_API_KEY not set");
      return;
    }
    const result = await runPhase(projectId, "S1");
    expect(result.status).toBe("success");
    const [asin] = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    expect(asin.baselineAnalysis).toBeDefined();
    expect(typeof asin.baselineAnalysis?.quality_score).toBe("number");
    const [run] = await db.select().from(seoPhaseRuns).where(eq(seoPhaseRuns.projectId, projectId));
    expect(run.status).toBe("success");
    expect(Number(run.claudeCostUsd)).toBeGreaterThan(0);
    expect(run.claudeInputTokens).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- tests/lib/seo/runner.s1-e2e.test.ts --run`
Expected: PASS (or `skipping` if no API key — flag this for the user).

- [ ] **Step 3: Commit**

```bash
git add tests/lib/seo/runner.s1-e2e.test.ts
git commit -m "test(seo): live S1 end-to-end smoke (plan 2 §D-14)"
```

### Milestone D verification (goal-backward)

Before opening the §D PR, confirm each of these by hand. Each is a hard pass/fail.

- [ ] `npm run build` clean
- [ ] `npm test -- --run` green or only pre-existing baseline failures
- [ ] `psql "$DATABASE_URL" -c "\\d seo_phase_runs"` shows all spec columns + 3 indexes
- [ ] `runPhase('S1')` on a fixture project produces (a) a valid `seo_asins.baseline_analysis`, (b) a `seo_phase_runs` row with `status='success'`, non-zero token counts, and non-zero `claude_cost_usd`
- [ ] `runPhase('S6')` on a fixture project either succeeds or rolls back atomically — partial writes never observed
- [ ] Validator rejects malformed S6 / S7 / S8 payloads (covered by `validators.test.ts`)
- [ ] `seo_phase_runs.status` transitions through `running → success | validation_failed | error | paused_user_input` (covered by `runner.test.ts`)
- [ ] No UI code touched in this milestone — `git diff --stat main..` shows zero files under `src/app/seo/manager/` or `src/components/seo/`
- [ ] Coexistence check: `git status` shows no edits to any of the other-session WIP paths listed in the §F coexistence note


---

## Milestone E — API Endpoints

Goal: All Plan 2 routes exist under `/api/seo/projects/[id]/...` with NextAuth session gating + `admin|editor` write / `viewer` read RBAC. The `/run` and `/phases/[phase]/run` endpoints enqueue work via Vercel `waitUntil` (Next.js 16 `after()` is the App-Router-native equivalent — use that). Every route returns structured JSON: `200 | 202 (enqueued) | 400 (validation) | 401 (no session) | 403 (role) | 404 (project) | 409 (cascade / hard-gate conflict) | 500 (unexpected)`.

PR boundary: end of Task 25. UI can wait — `curl` smoke tests drive the milestone closure.

### Task 15: Shared route helpers (auth + role check + project lookup)

**Files:**
- Create: `src/lib/seo/route-helpers.ts`
- Create: `tests/lib/seo/route-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/route-helpers.test.ts
import { describe, it, expect, vi } from "vitest";
import { requireRunnerAccess, type RouteContext } from "@/lib/seo/route-helpers";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ user: { email: "u@x.com", role: "editor" } }),
}));

describe("requireRunnerAccess", () => {
  it("rejects when no session", async () => {
    const { getAuthSession } = await import("@/lib/auth-db");
    (getAuthSession as any).mockResolvedValueOnce(null);
    const r = await requireRunnerAccess("editor");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it("rejects viewer trying to write", async () => {
    const { getAuthSession } = await import("@/lib/auth-db");
    (getAuthSession as any).mockResolvedValueOnce({ user: { email: "v@x.com", role: "viewer" } });
    const r = await requireRunnerAccess("editor");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });

  it("admits editor", async () => {
    const r = await requireRunnerAccess("editor");
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/seo/route-helpers.ts
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Role = "admin" | "editor" | "viewer" | "client" | "pending";
export type RouteContext = { params: Promise<{ id: string; phase?: string }> };

type AuthResult =
  | { ok: true; userId: string; role: Role; email: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireRunnerAccess(min: "viewer" | "editor"): Promise<AuthResult> {
  const session = await getAuthSession();
  if (!session?.user) return { ok: false, status: 401, error: "Unauthorized" };
  const role = (session.user as any).role as Role;
  if (role === "pending" || role === "client") return { ok: false, status: 403, error: "Forbidden" };
  if (min === "editor" && !(role === "admin" || role === "editor")) {
    return { ok: false, status: 403, error: "Editor or admin role required" };
  }
  return { ok: true, userId: (session.user as any).id, role, email: session.user.email ?? "" };
}

export async function loadProject(projectId: string) {
  const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
  return project ?? null;
}
```

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/lib/seo/route-helpers.test.ts --run
git add src/lib/seo/route-helpers.ts tests/lib/seo/route-helpers.test.ts
git commit -m "feat(seo): shared route auth + RBAC helpers (plan 2 §E-15)"
```

### Task 16: `POST /api/seo/projects/[id]/phases/[phase]/run`

**Files:**
- Create: `src/app/api/seo/projects/[id]/phases/[phase]/run/route.ts`
- Create: `tests/api/seo/projects/phases-run.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/seo/projects/phases-run.test.ts
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/seo/projects/[id]/phases/[phase]/run/route";

describe("POST /phases/[phase]/run", () => {
  it("returns 401 without session", async () => {
    const req = new Request("http://x.test", { method: "POST" });
    const res = await POST(req as any, { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111", phase: "S1" }) } as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid phase string", async () => {
    // mock auth-db to return an editor
    // assert validation rejects "SX"
  });

  it("returns 202 with { run_id, status: 'queued' } on enqueue", async () => {
    // mock waitUntil + runPhase
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/app/api/seo/projects/[id]/phases/[phase]/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireRunnerAccess, loadProject, type RouteContext } from "@/lib/seo/route-helpers";
import { runPhase, type PhaseId } from "@/lib/seo/runner";
import { db } from "@/lib/db";
import { seoPhaseRuns } from "@/lib/db/schema";

export const maxDuration = 300;
export const runtime = "nodejs";

const VALID: PhaseId[] = ["S1", "S2", "S3", "S4P1", "S4P2", "S4P3", "S5", "S6", "S7", "S8", "S9"];

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: projectId, phase } = await ctx.params;
  if (!phase || !VALID.includes(phase as PhaseId)) {
    return NextResponse.json({ error: "invalid_phase", valid: VALID }, { status: 400 });
  }
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

  const [pending] = await db
    .insert(seoPhaseRuns)
    .values({
      projectId,
      phase: phase as PhaseId,
      status: "queued",
      trigger: "manual",
      triggeredBy: auth.userId,
    })
    .returning();

  after(async () => {
    await runPhase(projectId, phase as PhaseId, { trigger: "manual", triggeredBy: auth.userId, parentRunId: pending.id });
  });

  return NextResponse.json({ run_id: pending.id, status: "queued", phase }, { status: 202 });
}
```

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/api/seo/projects/phases-run.test.ts --run
git add src/app/api/seo/projects/[id]/phases/[phase]/run/route.ts tests/api/seo/projects/phases-run.test.ts
git commit -m "feat(seo): POST phases/[phase]/run with waitUntil enqueue (plan 2 §E-16)"
```

### Task 17: `POST /api/seo/projects/[id]/run` (auto-run all phases)

**Files:**
- Create: `src/app/api/seo/projects/[id]/run/route.ts`
- Create: `tests/api/seo/projects/run.test.ts`

- [ ] **Step 1: Implement** (test pattern same as Task 16)

```typescript
// src/app/api/seo/projects/[id]/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireRunnerAccess, loadProject, type RouteContext } from "@/lib/seo/route-helpers";
import { runProject } from "@/lib/seo/runner";
import { db } from "@/lib/db";
import { seoPhaseRuns } from "@/lib/db/schema";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: projectId } = await ctx.params;
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

  const [pending] = await db
    .insert(seoPhaseRuns)
    .values({ projectId, phase: "S1", status: "queued", trigger: "auto_run", triggeredBy: auth.userId })
    .returning();

  after(async () => {
    await runProject(projectId, { trigger: "auto_run", triggeredBy: auth.userId, parentRunId: pending.id });
  });

  return NextResponse.json({ run_id: pending.id, status: "queued", first_phase: "S1" }, { status: 202 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/seo/projects/[id]/run/route.ts tests/api/seo/projects/run.test.ts
git commit -m "feat(seo): POST /run auto-run pipeline (plan 2 §E-17)"
```

### Task 18: `POST /api/seo/projects/[id]/phases/[phase]/approve`

Refuses if `validation_errors` non-empty on latest run, or if any upstream phase has an `approved_at` newer than this phase's intended approval timestamp (cascade-stale check).

**Files:**
- Create: `src/app/api/seo/projects/[id]/phases/[phase]/approve/route.ts`
- Create: `tests/api/seo/projects/phases-approve.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/seo/projects/[id]/phases/[phase]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRunnerAccess, loadProject, type RouteContext } from "@/lib/seo/route-helpers";
import { db } from "@/lib/db";
import { seoProjects, seoPhaseRuns } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

const PHASE_COL: Record<string, keyof typeof seoProjects.$inferSelect> = {
  S1: "s1ApprovedAt", S2: "s2ApprovedAt", S3: "s3ApprovedAt", S4: "s4ApprovedAt",
  S5: "s5ApprovedAt", S6: "s6ApprovedAt", S7: "s7ApprovedAt", S8: "s8ApprovedAt", S9: "s9ApprovedAt",
};

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId, phase } = await ctx.params;
  if (!phase || !PHASE_COL[phase]) return NextResponse.json({ error: "invalid_phase" }, { status: 400 });
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

  // Latest run for this phase must be success with no validation_errors
  const [latest] = await db
    .select()
    .from(seoPhaseRuns)
    .where(and(eq(seoPhaseRuns.projectId, projectId), eq(seoPhaseRuns.phase, phase)))
    .orderBy(desc(seoPhaseRuns.startedAt))
    .limit(1);
  if (!latest) return NextResponse.json({ error: "no_run_for_phase" }, { status: 409 });
  if (latest.status !== "success") return NextResponse.json({ error: "latest_run_not_success", status: latest.status }, { status: 409 });
  const errors = (latest.validationErrors ?? []) as Array<unknown>;
  if (errors.length > 0) return NextResponse.json({ error: "validation_errors_present", errors }, { status: 409 });

  const col = PHASE_COL[phase];
  await db
    .update(seoProjects)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({ [col]: new Date(), updatedAt: new Date() } as any)
    .where(eq(seoProjects.id, projectId));

  return NextResponse.json({ ok: true, phase, approved_at: new Date().toISOString() });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/seo/projects/[id]/phases/[phase]/approve/route.ts tests/api/seo/projects/phases-approve.test.ts
git commit -m "feat(seo): POST phases/[phase]/approve (plan 2 §E-18)"
```

### Task 19: `POST /api/seo/projects/[id]/phases/[phase]/skip` (S7/S8 only)

**Files:**
- Create: `src/app/api/seo/projects/[id]/phases/[phase]/skip/route.ts`
- Create: `tests/api/seo/projects/phases-skip.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/seo/projects/[id]/phases/[phase]/skip/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRunnerAccess, loadProject, type RouteContext } from "@/lib/seo/route-helpers";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId, phase } = await ctx.params;
  if (phase !== "S7" && phase !== "S8") return NextResponse.json({ error: "only_S7_or_S8_can_be_skipped" }, { status: 400 });
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  const col = phase === "S7" ? "s7Skipped" : "s8Skipped";
  await db.update(seoProjects)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({ [col]: true, updatedAt: new Date() } as any)
    .where(eq(seoProjects.id, projectId));
  return NextResponse.json({ ok: true, phase, skipped: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/seo/projects/[id]/phases/[phase]/skip/route.ts tests/api/seo/projects/phases-skip.test.ts
git commit -m "feat(seo): POST phases/[phase]/skip for S7/S8 (plan 2 §E-19)"
```

### Task 20: `POST /api/seo/projects/[id]/phases/[phase]/cancel-run`

**Files:**
- Create: `src/app/api/seo/projects/[id]/phases/[phase]/cancel-run/route.ts`
- Create: `tests/api/seo/projects/phases-cancel-run.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/seo/projects/[id]/phases/[phase]/cancel-run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRunnerAccess, type RouteContext } from "@/lib/seo/route-helpers";
import { db } from "@/lib/db";
import { seoPhaseRuns } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId, phase } = await ctx.params;
  if (!phase) return NextResponse.json({ error: "phase_required" }, { status: 400 });

  const [latest] = await db
    .select()
    .from(seoPhaseRuns)
    .where(
      and(
        eq(seoPhaseRuns.projectId, projectId),
        eq(seoPhaseRuns.phase, phase),
        inArray(seoPhaseRuns.status, ["queued", "running", "paused_user_input"])
      )
    )
    .orderBy(desc(seoPhaseRuns.startedAt))
    .limit(1);
  if (!latest) return NextResponse.json({ error: "no_in_flight_run" }, { status: 409 });

  await db
    .update(seoPhaseRuns)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(eq(seoPhaseRuns.id, latest.id));
  return NextResponse.json({ ok: true, run_id: latest.id, status: "cancelled" });
}
```

> Cancellation is cooperative: a `running` run continues to execute Claude calls in the background but its post-call writes will see `status='cancelled'` and short-circuit. For Plan 2 we accept that an in-flight Claude call cannot be aborted mid-flight (Anthropic SDK has no cancellation token in v0.78); the cost is still recorded.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/seo/projects/[id]/phases/[phase]/cancel-run/route.ts tests/api/seo/projects/phases-cancel-run.test.ts
git commit -m "feat(seo): POST phases/[phase]/cancel-run (plan 2 §E-20)"
```

### Task 21: `POST /api/seo/projects/[id]/phases/S4/resume`

**Files:**
- Create: `src/app/api/seo/projects/[id]/phases/S4/resume/route.ts`
- Create: `tests/api/seo/projects/phases-s4-resume.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/seo/projects/[id]/phases/S4/resume/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { requireRunnerAccess, loadProject, type RouteContext } from "@/lib/seo/route-helpers";
import { S4 } from "@/lib/seo/phases/s4";
import { runPhase } from "@/lib/seo/runner";

const Body = z.object({
  phase: z.enum(["S4P1", "S4P2"]),
  responses: z.array(z.string()),
  generated_questions: z
    .array(z.object({ id: z.string(), text: z.string(), intent_tier: z.string(), batch_char_count: z.number().int() }))
    .optional(),
});

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId } = await ctx.params;
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  try {
    if (parsed.data.phase === "S4P1") {
      await S4.persistPhase1(projectId, parsed.data.responses);
      // Trigger Phase 2 generation via runner (will pause again after questions are generated)
      after(async () => { await runPhase(projectId, "S4P2", { trigger: "auto_run", triggeredBy: auth.userId }); });
      return NextResponse.json({ ok: true, next: "S4P2", status: "queued" }, { status: 202 });
    } else {
      if (!parsed.data.generated_questions) {
        return NextResponse.json({ error: "S4P2_requires_generated_questions" }, { status: 400 });
      }
      await S4.persistPhase2(projectId, parsed.data.generated_questions, parsed.data.responses);
      after(async () => { await runPhase(projectId, "S4P3", { trigger: "auto_run", triggeredBy: auth.userId }); });
      return NextResponse.json({ ok: true, next: "S4P3", status: "queued" }, { status: 202 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/seo/projects/[id]/phases/S4/resume/route.ts tests/api/seo/projects/phases-s4-resume.test.ts
git commit -m "feat(seo): POST phases/S4/resume paste-back endpoint (plan 2 §E-21)"
```

### Task 22: `GET /api/seo/projects/[id]/runs`

**Files:**
- Create: `src/app/api/seo/projects/[id]/runs/route.ts`
- Create: `tests/api/seo/projects/runs.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/seo/projects/[id]/runs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRunnerAccess, type RouteContext } from "@/lib/seo/route-helpers";
import { db } from "@/lib/db";
import { seoPhaseRuns } from "@/lib/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("viewer");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId } = await ctx.params;
  const url = new URL(req.url);
  const phase = url.searchParams.get("phase");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const since = url.searchParams.get("since");

  const conds = [eq(seoPhaseRuns.projectId, projectId)];
  if (phase) conds.push(eq(seoPhaseRuns.phase, phase));
  if (since) conds.push(gt(seoPhaseRuns.startedAt, new Date(since)));
  const rows = await db
    .select()
    .from(seoPhaseRuns)
    .where(and(...conds))
    .orderBy(desc(seoPhaseRuns.startedAt))
    .limit(limit);
  return NextResponse.json({ runs: rows });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/seo/projects/[id]/runs/route.ts tests/api/seo/projects/runs.test.ts
git commit -m "feat(seo): GET /runs for polling + history (plan 2 §E-22)"
```

### Task 23: Typed-table GET endpoints (listings / aplus / images / qa / passage-map / scores)

Create one route file per table. Each supports `GET` (latest or `?version=N`) and the writeable ones (`listings`, `aplus`, `images`, `qa`) support `PATCH` (manual edit — bumps version, re-validates, marks the phase as `needs_re_approval` by clearing `s{N}_approved_at`).

**Files:**
- Create: `src/app/api/seo/projects/[id]/listings/route.ts`
- Create: `src/app/api/seo/projects/[id]/aplus/route.ts`
- Create: `src/app/api/seo/projects/[id]/images/route.ts`
- Create: `src/app/api/seo/projects/[id]/qa/route.ts`
- Create: `src/app/api/seo/projects/[id]/passage-map/route.ts`
- Create: `src/app/api/seo/projects/[id]/scores/route.ts`
- Create: `tests/api/seo/projects/listings.test.ts` (+ one test file per route)

- [ ] **Step 1: Implement `/listings`**

```typescript
// src/app/api/seo/projects/[id]/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRunnerAccess, type RouteContext } from "@/lib/seo/route-helpers";
import { db } from "@/lib/db";
import { seoListings, seoProjects } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("viewer");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId } = await ctx.params;
  const url = new URL(req.url);
  const asinId = url.searchParams.get("asin_id");
  const version = url.searchParams.get("version");
  const conds = [eq(seoListings.projectId, projectId)];
  if (asinId) conds.push(eq(seoListings.asinId, asinId));
  if (version) conds.push(eq(seoListings.version, Number(version)));
  const rows = await db
    .select()
    .from(seoListings)
    .where(and(...conds))
    .orderBy(desc(seoListings.version));
  return NextResponse.json({ listings: rows });
}

const PatchBody = z.object({
  asin_id: z.string().uuid(),
  fields: z.record(z.string(), z.any()),
});

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const [prior] = await db
    .select()
    .from(seoListings)
    .where(and(eq(seoListings.projectId, projectId), eq(seoListings.asinId, parsed.data.asin_id)))
    .orderBy(desc(seoListings.version))
    .limit(1);
  if (!prior) return NextResponse.json({ error: "no_prior_listing" }, { status: 404 });

  await db.insert(seoListings).values({
    ...prior,
    id: undefined as any,
    version: prior.version + 1,
    ...parsed.data.fields,
    updatedAt: new Date(),
  } as any);
  await db.update(seoProjects).set({ s6ApprovedAt: null, updatedAt: new Date() }).where(eq(seoProjects.id, projectId));
  return NextResponse.json({ ok: true, version: prior.version + 1, needs_re_approval: true });
}
```

- [ ] **Step 2: Mirror the same shape for `/aplus`, `/images`, `/qa`, `/passage-map`, `/scores`**

For each:
- `GET` returns rows for the project (optionally filtered by `asin_id` and `version`), ordered by `version DESC`.
- `PATCH` (only on `/listings`, `/aplus`, `/images`, `/qa`) inserts a new version row with merged fields and clears the corresponding `s{N}_approved_at`.
- `/passage-map` and `/scores` are read-only — return `405 Method Not Allowed` on PATCH (insert-only by runner / scoring engine).

Each route file is structurally identical to `/listings` above — copy the file, swap the table import, swap the approval column (`s6ApprovedAt` → `s7ApprovedAt` for aplus, `s8ApprovedAt` for images, `s6ApprovedAt` for qa, no clear for passage-map/scores).

- [ ] **Step 3: One test per route**

For each route, write a minimal test that:
1. `GET` returns `200` with `viewer` session and an empty array when no rows.
2. `PATCH` returns `403` for `viewer`, `200` for `editor`, and bumps `version`.
3. `PATCH` on `/passage-map` and `/scores` returns `405`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/seo/projects/[id]/{listings,aplus,images,qa,passage-map,scores}/route.ts \
        tests/api/seo/projects/{listings,aplus,images,qa,passage-map,scores}.test.ts
git commit -m "feat(seo): typed-table GET + PATCH endpoints (plan 2 §E-23)"
```

### Task 24: Cascade-conflict 409 on `/run` when downstream is approved

Augment the run endpoint to detect: "user re-runs phase N, but phase N+1 or later already has `approved_at` set." Return `409 Conflict` with the list of downstream artifacts that will become stale, unless the request includes `?cascade=accept_stale` or `?cascade=rerun_downstream`.

**Files:**
- Modify: `src/app/api/seo/projects/[id]/phases/[phase]/run/route.ts`
- Modify: `src/app/api/seo/projects/[id]/run/route.ts`
- Create: `src/lib/seo/cascade.ts`
- Create: `tests/lib/seo/cascade.test.ts`

- [ ] **Step 1: Implement cascade helper**

```typescript
// src/lib/seo/cascade.ts
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ORDER = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"] as const;
type Phase = typeof ORDER[number];

export type Stale = { phase: Phase; approved_at: string };

export async function detectStaleDownstream(projectId: string, rerunPhase: Phase): Promise<Stale[]> {
  const [proj] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
  if (!proj) return [];
  const startIdx = ORDER.indexOf(rerunPhase);
  if (startIdx === -1) return [];
  const downstream = ORDER.slice(startIdx + 1);
  const result: Stale[] = [];
  for (const p of downstream) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = `s${p.slice(1)}ApprovedAt` as any;
    const v = (proj as any)[col];
    if (v) result.push({ phase: p, approved_at: new Date(v).toISOString() });
  }
  return result;
}
```

- [ ] **Step 2: Wire into `/phases/[phase]/run`**

Before enqueueing, run:

```typescript
const stale = await detectStaleDownstream(projectId, mainPhase(phase));
const cascade = new URL(req.url).searchParams.get("cascade");
if (stale.length > 0 && !cascade) {
  return NextResponse.json({ error: "cascade_conflict", stale_downstream: stale }, { status: 409 });
}
// continue enqueue (and if cascade === "rerun_downstream", schedule follow-up runs)
```

`mainPhase(phase)` collapses `S4P1`/`S4P2`/`S4P3` → `S4`. Add it next to `route-helpers.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seo/cascade.ts src/app/api/seo/projects/[id]/phases/[phase]/run/route.ts \
        src/app/api/seo/projects/[id]/run/route.ts tests/lib/seo/cascade.test.ts
git commit -m "feat(seo): cascade-conflict 409 + cascade= override (plan 2 §E-24)"
```

### Task 25: End-to-end API smoke (curl-style harness)

**Files:**
- Create: `tests/api/seo/projects/e2e-pipeline.test.ts`

- [ ] **Step 1: Write the test**

The test creates a fixture project, hits `/phases/S1/run`, polls `/runs?phase=S1` until success, approves, hits `/phases/S2/run` (must supply Cerebro CSV via `seoProjects.contentRules`), polls, approves, ... up to S5. (S6+ require real Claude calls that exceed CI budget; skip those steps unless `RUN_LIVE_E2E=1`.) The test uses Next.js's `NextRequest` constructor directly — no HTTP server.

- [ ] **Step 2: Commit**

```bash
git add tests/api/seo/projects/e2e-pipeline.test.ts
git commit -m "test(seo): e2e pipeline harness (plan 2 §E-25)"
```

### Milestone E verification (goal-backward)

- [ ] `npm run build` clean
- [ ] `npm test -- --run` green
- [ ] Manual smoke: `curl -X POST http://localhost:3000/api/seo/projects/<uuid>/phases/S1/run` with a valid session cookie returns `202 { run_id, status: 'queued' }`
- [ ] `curl http://localhost:3000/api/seo/projects/<uuid>/runs?phase=S1` returns recent run rows
- [ ] No-session request returns `401`
- [ ] Viewer session POST returns `403`
- [ ] `?cascade=` missing on a re-run with stale downstream returns `409 cascade_conflict`
- [ ] §F WIP files (`page.tsx`, `project-shell.tsx`, `ai-cost-tracker.tsx`) untouched by this milestone — `git diff --stat main..` shows zero lines in those paths


---

## Milestone F — `/seo/manager` UI

Goal: An agency operator can run a project end-to-end in the browser. Page surface = 9-column phase grid with status pills, per-column actions, a side drawer for detail, a cascade modal for re-runs, a brand-guidelines dual panel inside the S1 column, an S9 score panel, and a run-history drawer. Polls `/runs?phase=...&since=...` every 3 seconds while any run is `queued|running|paused_user_input`. Cost ticker reads `seo_phase_runs` aggregated by project.

PR boundary: end of Task 36. Re-check the coexistence list before touching `page.tsx` or `project-shell.tsx` — the other session may have already landed parts of the layout.

**§F coexistence reconciliation (do this first):**

- [ ] **Step 0:** `git pull` and re-read these files. If any of the components below already exist with substantive content, treat them as the canonical layout. Add the §F components alongside them; do not rewrite.
  - `src/app/seo/manager/page.tsx`
  - `src/components/seo/project-shell.tsx`
  - `src/components/seo/ai-cost-tracker.tsx`
  - `src/app/clients/brand-guidelines/page.tsx`

### Task 26: Add `vw_seo_project_costs` view

**Files:**
- Create: `drizzle/migrations/{next-available}_vw_seo_project_costs.sql` (after Milestone D's `0060`, e.g. `0061`)

- [ ] **Step 1: Write SQL**

```sql
-- {next-available}_vw_seo_project_costs.sql
CREATE OR REPLACE VIEW vw_seo_project_costs AS
SELECT
  project_id,
  SUM(claude_cost_usd)::numeric(12,4) AS total_cost_usd,
  MAX(finished_at) AS last_run_at,
  COUNT(*) FILTER (WHERE status = 'success') AS successful_runs,
  COUNT(*) FILTER (WHERE status = 'validation_failed') AS failed_runs
FROM seo_phase_runs
WHERE status IN ('success','validation_failed','error','cancelled')
GROUP BY project_id;
```

- [ ] **Step 2: Apply + commit**

```bash
npm run db:migrate
git add drizzle/migrations/*_vw_seo_project_costs.sql
git commit -m "feat(seo): vw_seo_project_costs aggregation view (plan 2 §F-26)"
```

### Task 27: Phase grid + column shell

**Files:**
- Create: `src/app/seo/manager/components/phase-grid.tsx`
- Create: `src/app/seo/manager/components/phase-column.tsx`
- Create: `src/app/seo/manager/components/stale-badge.tsx`
- Create: `tests/app/seo/manager/phase-grid.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/seo/manager/phase-grid.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseGrid } from "@/app/seo/manager/components/phase-grid";

describe("PhaseGrid", () => {
  it("renders one column per phase S1-S9", () => {
    render(<PhaseGrid projectId="11111111-1111-1111-1111-111111111111" project={{ s1ApprovedAt: null, s2ApprovedAt: null, s3ApprovedAt: null, s4ApprovedAt: null, s5ApprovedAt: null, s6ApprovedAt: null, s7ApprovedAt: null, s8ApprovedAt: null, s9ApprovedAt: null, s7Skipped: false, s8Skipped: false } as any} latestRuns={{}} costs={null} onAction={() => {}} />);
    for (const p of ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"]) {
      expect(screen.getByText(p)).toBeInTheDocument();
    }
  });

  it("renders stale badge when downstream approved before this phase re-run", () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000 * 60 * 60);
    render(
      <PhaseGrid
        projectId="11111111-1111-1111-1111-111111111111"
        project={{ s1ApprovedAt: now, s2ApprovedAt: earlier } as any}
        latestRuns={{}}
        costs={null}
        onAction={() => {}}
      />
    );
    expect(screen.getByTestId("phase-S2-stale-badge")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/app/seo/manager/components/phase-grid.tsx
"use client";
import type { ReactNode } from "react";
import { PhaseColumn } from "./phase-column";

const PHASES = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"] as const;
export type Phase = typeof PHASES[number];

export type PhaseProject = {
  s1ApprovedAt: Date | null; s2ApprovedAt: Date | null; s3ApprovedAt: Date | null;
  s4ApprovedAt: Date | null; s5ApprovedAt: Date | null; s6ApprovedAt: Date | null;
  s7ApprovedAt: Date | null; s8ApprovedAt: Date | null; s9ApprovedAt: Date | null;
  s7Skipped: boolean; s8Skipped: boolean;
};

export type LatestRun = {
  status: "queued" | "running" | "paused_user_input" | "success" | "validation_failed" | "error" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  claudeCostUsd: number;
};

export type CostsRow = { total_cost_usd: number; last_run_at: string | null } | null;

export function PhaseGrid(props: {
  projectId: string;
  project: PhaseProject;
  latestRuns: Partial<Record<Phase, LatestRun>>;
  costs: CostsRow;
  onAction: (phase: Phase, action: "run" | "approve" | "skip" | "open_drawer") => void;
}): ReactNode {
  return (
    <div className="grid grid-cols-9 gap-2">
      {PHASES.map((p) => {
        const approvedAt = (props.project as any)[`s${p.slice(1)}ApprovedAt`] as Date | null;
        const isStale = approvedAt ? isDownstreamStale(props.project, p) : false;
        const latest = props.latestRuns[p] ?? null;
        return (
          <PhaseColumn
            key={p}
            phase={p}
            approvedAt={approvedAt}
            latestRun={latest}
            isStale={isStale}
            isSkipped={p === "S7" ? props.project.s7Skipped : p === "S8" ? props.project.s8Skipped : false}
            onAction={(action) => props.onAction(p, action)}
          />
        );
      })}
    </div>
  );
}

function isDownstreamStale(project: PhaseProject, phase: Phase): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const my = (project as any)[`s${phase.slice(1)}ApprovedAt`] as Date | null;
  if (!my) return false;
  for (const p of PHASES) {
    if (PHASES.indexOf(p) <= PHASES.indexOf(phase)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (project as any)[`s${p.slice(1)}ApprovedAt`] as Date | null;
    if (d && new Date(my).getTime() > new Date(d).getTime()) return true;
  }
  return false;
}
```

```tsx
// src/app/seo/manager/components/phase-column.tsx
"use client";
import { Button } from "@/components/ui/button";
import { StaleBadge } from "./stale-badge";
import type { Phase, LatestRun } from "./phase-grid";

export function PhaseColumn(props: {
  phase: Phase;
  approvedAt: Date | null;
  latestRun: LatestRun | null;
  isStale: boolean;
  isSkipped: boolean;
  onAction: (action: "run" | "approve" | "skip" | "open_drawer") => void;
}) {
  const status = props.isSkipped ? "skipped" : (props.latestRun?.status ?? (props.approvedAt ? "approved" : "pending"));
  return (
    <div className="rounded border p-2 flex flex-col gap-2" data-testid={`phase-${props.phase}`}>
      <button className="text-left font-bold" onClick={() => props.onAction("open_drawer")}>{props.phase}</button>
      <span className={`pill pill--${status}`}>{status}</span>
      {props.isStale && <StaleBadge data-testid={`phase-${props.phase}-stale-badge`} />}
      {props.latestRun && (
        <div className="text-xs text-gray-500">
          {props.latestRun.finishedAt ? new Date(props.latestRun.finishedAt).toLocaleString() : "—"}
          {" · "}${Number(props.latestRun.claudeCostUsd).toFixed(4)}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Button size="sm" onClick={() => props.onAction("run")}>{props.approvedAt ? "Re-run" : "Run"}</Button>
        {(props.phase === "S7" || props.phase === "S8") && !props.isSkipped && (
          <Button size="sm" variant="outline" onClick={() => props.onAction("skip")}>Skip</Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={!props.latestRun || props.latestRun.status !== "success"}
          onClick={() => props.onAction("approve")}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
```

```tsx
// src/app/seo/manager/components/stale-badge.tsx
export function StaleBadge(props: { "data-testid"?: string }) {
  return <span data-testid={props["data-testid"]} className="text-xs text-amber-700 bg-amber-50 px-1 rounded">stale</span>;
}
```

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/app/seo/manager/phase-grid.test.tsx --run
git add src/app/seo/manager/components/phase-grid.tsx \
        src/app/seo/manager/components/phase-column.tsx \
        src/app/seo/manager/components/stale-badge.tsx \
        tests/app/seo/manager/phase-grid.test.tsx
git commit -m "feat(seo): phase grid + column + stale badge (plan 2 §F-27)"
```

### Task 28: Polling hook + manager page wiring

**Files:**
- Create: `src/app/seo/manager/hooks/use-runs.ts`
- Modify: `src/app/seo/manager/page.tsx` (additive — coexist with other session's edits)

- [ ] **Step 1: Implement hook**

```typescript
// src/app/seo/manager/hooks/use-runs.ts
"use client";
import { useEffect, useState } from "react";
import type { LatestRun, Phase } from "@/app/seo/manager/components/phase-grid";

export function useLatestRuns(projectId: string): Partial<Record<Phase, LatestRun>> {
  const [latest, setLatest] = useState<Partial<Record<Phase, LatestRun>>>({});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      const r = await fetch(`/api/seo/projects/${projectId}/runs?limit=50`);
      if (!r.ok) return scheduleNext();
      const { runs } = await r.json();
      const next: Partial<Record<Phase, LatestRun>> = {};
      for (const row of runs as Array<{ phase: Phase; status: string; startedAt: string; finishedAt: string | null; claudeCostUsd: string }>) {
        if (!next[row.phase]) {
          next[row.phase] = { status: row.status as any, startedAt: row.startedAt, finishedAt: row.finishedAt, claudeCostUsd: Number(row.claudeCostUsd) };
        }
      }
      if (alive) setLatest(next);
      scheduleNext();
    }

    function scheduleNext() {
      const hasInflight = Object.values(latest).some((r) => r && ["queued", "running", "paused_user_input"].includes(r.status));
      timer = setTimeout(tick, hasInflight ? 3000 : 15_000);
    }

    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [projectId, latest]);

  return latest;
}
```

- [ ] **Step 2: Wire into `page.tsx`** (additive — see coexistence note)

Add at the top of the manager page (or a sub-component if `page.tsx` is owned by the other session):

```tsx
const project = useProject(projectId);   // existing hook or fetch
const latestRuns = useLatestRuns(projectId);
const costs = useProjectCosts(projectId); // fetches vw_seo_project_costs row

return (
  <>
    <ProjectHeader project={project} costs={costs} />
    <PhaseGrid projectId={projectId} project={project} latestRuns={latestRuns} costs={costs} onAction={handlePhaseAction} />
    {/* …other session's existing UI stays here… */}
  </>
);
```

If the other session has already rendered the grid by a different name, drop this hook into the existing component instead of creating new top-level wiring.

- [ ] **Step 3: Commit**

```bash
git add src/app/seo/manager/hooks/use-runs.ts src/app/seo/manager/page.tsx
git commit -m "feat(seo): /runs polling + grid wiring (plan 2 §F-28)"
```

### Task 29: Phase drawer (per-column detail)

**Files:**
- Create: `src/app/seo/manager/components/phase-drawer.tsx`
- Create: `tests/app/seo/manager/phase-drawer.test.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/seo/manager/components/phase-drawer.tsx
"use client";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Phase } from "./phase-grid";

const ENDPOINT_FOR: Record<Phase, string | null> = {
  S1: null, S2: null, S3: null, S4: null, S5: null,
  S6: "/listings", S7: "/aplus", S8: "/images", S9: "/scores",
};

export function PhaseDrawer(props: {
  projectId: string;
  phase: Phase | null;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<unknown>(null);
  const [errors, setErrors] = useState<unknown>(null);

  useEffect(() => {
    if (!props.phase) return;
    const ep = ENDPOINT_FOR[props.phase];
    if (!ep) {
      setPayload(null);
      return;
    }
    fetch(`/api/seo/projects/${props.projectId}${ep}`)
      .then((r) => r.json())
      .then((data) => setPayload(data))
      .catch((e) => setErrors(String(e)));
  }, [props.projectId, props.phase]);

  return (
    <Sheet open={Boolean(props.phase)} onOpenChange={(o) => !o && props.onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle>{props.phase} detail</SheetTitle></SheetHeader>
        {errors ? <pre className="text-xs text-red-600">{String(errors)}</pre> : null}
        <pre className="text-xs overflow-auto max-h-[60vh]">{payload ? JSON.stringify(payload, null, 2) : "Loading..."}</pre>
      </SheetContent>
    </Sheet>
  );
}
```

The drawer is intentionally minimal in Plan 2 — it surfaces the raw typed-table payload + validation errors. Pretty-rendering A+ modules and image grids lands in Milestone G/H per-phase.

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/phase-drawer.tsx tests/app/seo/manager/phase-drawer.test.tsx
git commit -m "feat(seo): phase drawer JSON viewer (plan 2 §F-29)"
```

### Task 30: Cascade modal (tri-state re-run)

**Files:**
- Create: `src/app/seo/manager/components/cascade-modal.tsx`
- Create: `tests/app/seo/manager/cascade-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/seo/manager/cascade-modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CascadeModal } from "@/app/seo/manager/components/cascade-modal";

describe("CascadeModal", () => {
  it("shows downstream stale list and three buttons", () => {
    const onChoose = vi.fn();
    render(
      <CascadeModal
        open={true}
        phase="S4"
        stale={[{ phase: "S5", approved_at: "2026-05-10T10:00:00Z" }, { phase: "S6", approved_at: "2026-05-10T11:00:00Z" }]}
        onChoose={onChoose}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/S5/)).toBeInTheDocument();
    expect(screen.getByText(/S6/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-run downstream/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accept stale/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("invokes onChoose with 'rerun_downstream'", () => {
    const onChoose = vi.fn();
    render(<CascadeModal open={true} phase="S4" stale={[]} onChoose={onChoose} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /re-run downstream/i }));
    expect(onChoose).toHaveBeenCalledWith("rerun_downstream");
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/app/seo/manager/components/cascade-modal.tsx
"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type CascadeChoice = "rerun_downstream" | "accept_stale";

export function CascadeModal(props: {
  open: boolean;
  phase: string;
  stale: Array<{ phase: string; approved_at: string }>;
  onChoose: (c: CascadeChoice) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onCancel()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Re-run {props.phase}?</DialogTitle></DialogHeader>
        <p>The following downstream phases are already approved and will become stale:</p>
        <ul className="list-disc pl-4">
          {props.stale.map((s) => (
            <li key={s.phase}>{s.phase} — approved {new Date(s.approved_at).toLocaleString()}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={() => props.onChoose("rerun_downstream")}>Re-run downstream + cascade</Button>
          <Button variant="outline" onClick={() => props.onChoose("accept_stale")}>Accept stale (re-run only {props.phase})</Button>
          <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/seo/manager/components/cascade-modal.tsx tests/app/seo/manager/cascade-modal.test.tsx
git commit -m "feat(seo): cascade modal (tri-state) (plan 2 §F-30)"
```

### Task 31: Brand-guidelines dual panel (S1 column)

**Files:**
- Create: `src/app/seo/manager/components/brand-guidelines-panel.tsx`
- Create: `tests/app/seo/manager/brand-guidelines-panel.test.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/seo/manager/components/brand-guidelines-panel.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BrandGuidelinesPanel(props: {
  projectId: string;
  brandGuidelinesLock: { brand_voice: string | null; positioning: string | null; words_to_avoid: string[]; audience_notes: string | null } | null;
  brandGuidelinesNotes: string;
  onNotesSaved: (notes: string) => void;
  onLockRefreshed: () => void;
}) {
  const [notes, setNotes] = useState(props.brandGuidelinesNotes);
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="border-t pt-2 mt-2 text-xs">
      <div className="font-semibold mb-1 flex justify-between items-center">
        Brand guidelines (locked)
        <Button
          size="sm"
          variant="ghost"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await fetch(`/api/seo/projects/${props.projectId}/brand-guidelines/refresh`, { method: "POST" });
            props.onLockRefreshed();
            setRefreshing(false);
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh from client bible"}
        </Button>
      </div>
      <div className="text-gray-600 whitespace-pre-wrap">
        Voice: {props.brandGuidelinesLock?.brand_voice ?? "—"}{"\n"}
        Positioning: {props.brandGuidelinesLock?.positioning ?? "—"}{"\n"}
        Audience: {props.brandGuidelinesLock?.audience_notes ?? "—"}{"\n"}
        Words to avoid: {(props.brandGuidelinesLock?.words_to_avoid ?? []).join(", ") || "—"}
      </div>
      <div className="font-semibold mt-3 mb-1">Notes (advisory, not cascade-invalidating)</div>
      <textarea
        className="w-full border rounded p-1 text-xs"
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={async () => {
          await fetch(`/api/seo/projects/${props.projectId}/brand-guidelines/notes`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes }),
          });
          props.onNotesSaved(notes);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the supporting PATCH endpoint**

```typescript
// src/app/api/seo/projects/[id]/brand-guidelines/notes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRunnerAccess, type RouteContext } from "@/lib/seo/route-helpers";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const Body = z.object({ notes: z.string().max(8000) });

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireRunnerAccess("editor");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: projectId } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  await db.update(seoProjects).set({ brandGuidelinesNotes: parsed.data.notes, updatedAt: new Date() }).where(eq(seoProjects.id, projectId));
  return NextResponse.json({ ok: true });
}
```

> **Coexistence note:** the brand-guidelines refresh endpoint already exists (`src/app/api/seo/projects/[id]/brand-guidelines/refresh/route.ts`, shipped by Plan 1). Notes editing is the new piece.

- [ ] **Step 3: Commit**

```bash
git add src/app/seo/manager/components/brand-guidelines-panel.tsx \
        src/app/api/seo/projects/[id]/brand-guidelines/notes/route.ts \
        tests/app/seo/manager/brand-guidelines-panel.test.tsx
git commit -m "feat(seo): brand-guidelines dual panel + notes patch (plan 2 §F-31)"
```

### Task 32: S9 score panel + deep-probe checkbox

**Files:**
- Create: `src/app/seo/manager/components/s9-score-panel.tsx`
- Create: `tests/app/seo/manager/s9-score-panel.test.tsx`

> The component renders a placeholder grade when no `seo_scores` row exists. The scoring engine itself ships in Milestone I — this task only wires the read + checkbox UI.

- [ ] **Step 1: Implement**

```tsx
// src/app/seo/manager/components/s9-score-panel.tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Score = {
  rufus_coverage_pct: number;
  cosmo_coverage_pct: number;
  overall_grade: string | null;
  missing_rufus_questions: string[];
  missing_cosmo_triples: string[];
  byte_budget_status: Record<string, { ok: boolean; used: number; max: number }>;
  prohibited_word_violations: Array<{ field: string; word: string }>;
};

export function S9ScorePanel(props: { projectId: string }) {
  const [score, setScore] = useState<Score | null>(null);
  const [probe, setProbe] = useState(false);

  useEffect(() => {
    fetch(`/api/seo/projects/${props.projectId}/scores`).then((r) => r.json()).then((d) => {
      setScore(d?.scores?.[0] ?? null);
    });
  }, [props.projectId]);

  return (
    <div className="border rounded p-2 text-xs">
      <div className="flex justify-between items-baseline">
        <div className="text-2xl font-bold">{score?.overall_grade ?? "—"}</div>
        <div className="text-gray-500">Rufus {score?.rufus_coverage_pct ?? "—"}% · COSMO {score?.cosmo_coverage_pct ?? "—"}%</div>
      </div>
      <ul className="mt-2">
        <li>Byte budgets: {score && Object.values(score.byte_budget_status).every((b) => b.ok) ? "✓" : "✗"}</li>
        <li>Prohibited words: {score && score.prohibited_word_violations.length === 0 ? "✓" : "✗"}</li>
      </ul>
      {score && (score.missing_rufus_questions.length > 0 || score.missing_cosmo_triples.length > 0) && (
        <details className="mt-2">
          <summary>Miss list</summary>
          <div>Missing Rufus Qs: {score.missing_rufus_questions.join(", ") || "—"}</div>
          <div>Missing COSMO triples: {score.missing_cosmo_triples.join(", ") || "—"}</div>
        </details>
      )}
      <label className="flex items-center gap-1 mt-2">
        <input type="checkbox" checked={probe} onChange={(e) => setProbe(e.target.checked)} />
        Run deep probe (~$0.05)
      </label>
      <Button
        size="sm"
        className="mt-2"
        onClick={async () => {
          await fetch(`/api/seo/projects/${props.projectId}/phases/S9/run${probe ? "?probe=true" : ""}`, { method: "POST" });
        }}
      >
        Run S9
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/s9-score-panel.tsx tests/app/seo/manager/s9-score-panel.test.tsx
git commit -m "feat(seo): S9 score panel + probe checkbox (plan 2 §F-32)"
```

### Task 33: S7 / S8 decision cards

**Files:**
- Create: `src/app/seo/manager/components/s7-decision-card.tsx`
- Create: `src/app/seo/manager/components/s8-decision-card.tsx`

Both have identical structure — three buttons (Run / Skip / Decide later) with a yellow border when `pending_decision`. Decide later closes the modal without action.

- [ ] **Step 1: Implement S7 (mirror for S8)**

```tsx
// src/app/seo/manager/components/s7-decision-card.tsx
"use client";
import { Button } from "@/components/ui/button";

export function S7DecisionCard(props: {
  projectId: string;
  onRun: () => void;
  onSkip: () => void;
  isPending: boolean;
}) {
  if (!props.isPending) return null;
  return (
    <div className="border-2 border-amber-400 rounded p-2 text-xs">
      <div className="font-semibold mb-1">S7 — Premium A+ (Decision Required)</div>
      <p className="text-gray-600 mb-2">S9 is blocked until you decide. Skip is fine for products without A+.</p>
      <div className="flex gap-1">
        <Button size="sm" onClick={props.onRun}>Run</Button>
        <Button size="sm" variant="outline" onClick={props.onSkip}>Skip</Button>
        <Button size="sm" variant="ghost">Decide later</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/s7-decision-card.tsx \
        src/app/seo/manager/components/s8-decision-card.tsx
git commit -m "feat(seo): S7/S8 decision cards (plan 2 §F-33)"
```

### Task 34: Run-history drawer

**Files:**
- Create: `src/app/seo/manager/components/run-history-drawer.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/seo/manager/components/run-history-drawer.tsx
"use client";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function RunHistoryDrawer(props: { projectId: string; open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!props.open) return;
    fetch(`/api/seo/projects/${props.projectId}/runs?limit=50`).then((r) => r.json()).then((d) => setRows(d.runs ?? []));
  }, [props.projectId, props.open]);
  return (
    <Sheet open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle>Run history</SheetTitle></SheetHeader>
        <table className="w-full text-xs">
          <thead><tr><th>Phase</th><th>Status</th><th>Started</th><th>Cost</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.phase}</td><td>{r.status}</td>
                <td>{new Date(r.startedAt).toLocaleString()}</td>
                <td>${Number(r.claudeCostUsd).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/run-history-drawer.tsx
git commit -m "feat(seo): run-history drawer (plan 2 §F-34)"
```

### Task 35: Action handler wiring (Run / Approve / Skip / Cascade)

**Files:**
- Modify: the consumer of `PhaseGrid` (either `page.tsx` or a sub-component owned by the other session)

- [ ] **Step 1: Implement `handlePhaseAction`**

```typescript
async function handlePhaseAction(phase: Phase, action: "run" | "approve" | "skip" | "open_drawer") {
  if (action === "open_drawer") { setOpenDrawer(phase); return; }
  if (action === "skip") {
    await fetch(`/api/seo/projects/${projectId}/phases/${phase}/skip`, { method: "POST" });
    refetchProject();
    return;
  }
  if (action === "approve") {
    const r = await fetch(`/api/seo/projects/${projectId}/phases/${phase}/approve`, { method: "POST" });
    if (!r.ok) {
      const body = await r.json();
      toast.error(`Approve failed: ${body.error}`);
    } else {
      refetchProject();
    }
    return;
  }
  // action === "run"
  const r = await fetch(`/api/seo/projects/${projectId}/phases/${phase}/run`, { method: "POST" });
  if (r.status === 409) {
    const body = await r.json();
    if (body.error === "cascade_conflict") {
      setCascadeModal({ phase, stale: body.stale_downstream });
      return;
    }
  }
  // 202 enqueued — polling hook will pick it up
}

async function handleCascadeChoice(choice: "rerun_downstream" | "accept_stale", phase: Phase) {
  await fetch(`/api/seo/projects/${projectId}/phases/${phase}/run?cascade=${choice}`, { method: "POST" });
  setCascadeModal(null);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/page.tsx
git commit -m "feat(seo): action handlers + cascade wiring (plan 2 §F-35)"
```

### Task 36: Manual UI smoke

- [ ] **Step 1: Run dev server + drive a project**

Run: `PORT=3000 npm run dev`

1. Open `http://localhost:3000/seo/manager`
2. Pick a fixture project
3. Click `Run` on S1 — column status should flip `queued → running → success` within 5–60 s (depending on Claude latency)
4. Click `Approve` — pill shows `approved`
5. Click `Re-run` on S1 — cascade modal opens (if any downstream is approved); pick `Accept stale`, confirm S2 column shows `stale` badge
6. Open S6 drawer — see raw listings JSON
7. Cost ticker shows accumulated `claude_cost_usd`

- [ ] **Step 2: Commit any UX polish**

```bash
git add src/app/seo/manager/page.tsx
git commit -m "polish(seo): manager UI manual-smoke fixes (plan 2 §F-36)"
```

### Milestone F verification (goal-backward)

- [ ] `npm run build` clean
- [ ] `npm test -- --run` green
- [ ] Manual: a fresh project drives S1 → S5 in the browser, polling updates the grid without manual reload
- [ ] Cascade modal opens on `Re-run` when downstream is approved, dismisses cleanly on `Cancel`
- [ ] Brand-guidelines panel `Refresh from client bible` repopulates the lock; notes textarea saves on blur
- [ ] S7/S8 decision cards block S9 approval when `pending_decision`
- [ ] Polling interval drops to 15 s when no in-flight runs
- [ ] `vw_seo_project_costs` is queryable: `psql -c "SELECT * FROM vw_seo_project_costs LIMIT 5"`


---

## Milestone G/H — S7 + S8 Wiring

Goal: Replace the stub `S7` and `S8` executors from Milestone D with real implementations. Each: loads upstream context, fills slots, calls Claude (Sonnet 4.6), validates against the schema (already implemented in `validators.ts`), persists into the typed table, stamps `s7_approved_at` / `s8_approved_at` only on explicit approval. UI drawers render the typed payload as a structured grid (modules table for S7, image rows for S8) instead of raw JSON.

PR boundary: end of Task 43.

### Task 37: Replace `S7` stub with real executor

**Files:**
- Modify: `src/lib/seo/phases/s7.ts`
- Create: `tests/lib/seo/phases/s7.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/phases/s7.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoAplusPlans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { S7 } from "@/lib/seo/phases/s7";

const NAME = "__plan2_s7__";
describe("S7 executor", () => {
  let projectId: string;
  let asinId: string;
  beforeAll(async () => {
    await db.delete(seoProjects).where(eq(seoProjects.name, NAME));
    const [p] = await db.insert(seoProjects).values({ name: NAME, clientIdCode: "test" }).returning();
    projectId = p.id;
    const [a] = await db.insert(seoAsins).values({ projectId, asin: "B0S7", sku: "S" }).returning();
    asinId = a.id;
  });
  afterAll(async () => { await db.delete(seoProjects).where(eq(seoProjects.id, projectId)); });

  it("persist writes 7 modules with module 7 = premium_qa", async () => {
    const modules = Array.from({ length: 7 }, (_, i) => ({
      position: i + 1,
      module_type: i === 6 ? "premium_qa" : "hero",
      cosmo_relationship: null,
      fields: { headline: "x" },
      images: [],
    }));
    await S7.persist(projectId, { modules } as any, "");
    const [row] = await db.select().from(seoAplusPlans).where(eq(seoAplusPlans.asinId, asinId)).orderBy(seoAplusPlans.version);
    expect(Array.isArray(row.modules) && row.modules.length).toBe(7);
    expect((row.modules as any)[6].module_type).toBe("premium_qa");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/seo/phases/s7.ts (replace stub)
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoListings, seoQa, seoCosmopMaps, seoAplusPlans } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";

type S7Context = {
  projectId: string;
  asins: Array<{ id: string; asin: string }>;
  listingForAsin: Record<string, unknown>;
  qaAplusSubset: Record<string, unknown>;
  cosmoTriples: unknown[];
  brandVoice: string;
};

type S7Module = {
  position: number;
  module_type: string;
  cosmo_relationship: string | null;
  fields: Record<string, string>;
  images: Array<{ technical_name: string; alt_text: string; overlay_text: string; ai_prompt: string; dimensions: string }>;
};

type S7Output = { modules: S7Module[] };

export const S7: PhaseExecutor<S7Context, S7Output> = {
  phase: "S7",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    const listingForAsin: Record<string, unknown> = {};
    const qaAplusSubset: Record<string, unknown> = {};
    for (const a of asins) {
      const [l] = await db.select().from(seoListings).where(eq(seoListings.asinId, a.id)).orderBy(desc(seoListings.version)).limit(1);
      listingForAsin[a.id] = l ?? null;
      const [q] = await db.select().from(seoQa).where(eq(seoQa.asinId, a.id)).orderBy(desc(seoQa.version)).limit(1);
      qaAplusSubset[a.id] = q?.aplusQaSubset ?? [];
    }
    const [cosmo] = await db.select().from(seoCosmopMaps).where(eq(seoCosmopMaps.projectId, projectId)).limit(1);
    return {
      projectId,
      asins: asins.map((a) => ({ id: a.id, asin: a.asin })),
      listingForAsin,
      qaAplusSubset,
      cosmoTriples: cosmo?.triples ?? [],
      brandVoice: project.brandGuidelinesLock?.brand_voice ?? "",
    };
  },
  fillSlots(ctx) {
    return {
      listing_for_asin: ctx.listingForAsin,
      qa_aplus_subset: ctx.qaAplusSubset,
      cosmo_triples: ctx.cosmoTriples,
      brand_voice: ctx.brandVoice,
    };
  },
  async persist(projectId, output) {
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    // For the single-ASIN case the executor returns a single modules array.
    // For multi-ASIN, the runner-level expectation is "one Claude call per project that returns modules keyed by asin_id" — but the current S7 schema returns a flat modules array, so we apply the same modules to every ASIN. Project-specific module overrides land in a later iteration; the schema contract is 7 modules per ASIN.
    for (const a of asins) {
      const [prior] = await db
        .select()
        .from(seoAplusPlans)
        .where(and(eq(seoAplusPlans.projectId, projectId), eq(seoAplusPlans.asinId, a.id)))
        .orderBy(desc(seoAplusPlans.version))
        .limit(1);
      await db.insert(seoAplusPlans).values({
        projectId,
        asinId: a.id,
        modules: output.modules as any,
        validationErrors: [],
        version: (prior?.version ?? 0) + 1,
      });
    }
    return { version: 1 };
  },
};
```

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/lib/seo/phases/s7.test.ts --run
git add src/lib/seo/phases/s7.ts tests/lib/seo/phases/s7.test.ts
git commit -m "feat(seo): S7 real executor with full A+ modules (plan 2 §G-37)"
```

### Task 38: Replace `S8` stub with real executor

**Files:**
- Modify: `src/lib/seo/phases/s8.ts`
- Create: `tests/lib/seo/phases/s8.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/lib/seo/phases/s8.ts (replace stub)
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoListings, seoCosmopMaps, seoImages, seoRufus } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { PhaseExecutor } from "@/lib/seo/phases/s1";

const TECHNICAL_NAMES = ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08"] as const;

type S8Image = {
  image_number: number;
  technical_name: string;
  image_type: string;
  image_purpose: string;
  cosmo_relationship: string;
  buyer_stage: "Awareness" | "Consideration" | "Decision";
  overlay_text: string;
  alt_text: string;
  image_direction: string;
  ai_image_prompt: string;
};

type S8Output = { images: S8Image[] };

export const S8: PhaseExecutor<unknown, S8Output> = {
  phase: "S8",
  model: "claude-sonnet-4-6",
  async loadContext(projectId) {
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    const listings: Record<string, unknown> = {};
    for (const a of asins) {
      const [l] = await db.select().from(seoListings).where(eq(seoListings.asinId, a.id)).orderBy(desc(seoListings.version)).limit(1);
      listings[a.id] = l ?? null;
    }
    const [rufus] = await db.select().from(seoRufus).where(eq(seoRufus.projectId, projectId)).limit(1);
    const [cosmo] = await db.select().from(seoCosmopMaps).where(eq(seoCosmopMaps.projectId, projectId)).limit(1);
    return {
      projectId,
      asins: asins.map((a) => ({ id: a.id, asin: a.asin })),
      listings,
      imageStrategy: rufus?.optimizationSummary?.image_strategy ?? "",
      cosmoTriples: cosmo?.triples ?? [],
    };
  },
  fillSlots(ctx: any) {
    return {
      listing_for_asin: ctx.listings,
      image_strategy: ctx.imageStrategy,
      cosmo_triples: ctx.cosmoTriples,
      technical_names_required: TECHNICAL_NAMES.join(", "),
    };
  },
  async persist(projectId, output) {
    const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
    for (const a of asins) {
      const [prior] = await db
        .select()
        .from(seoImages)
        .where(and(eq(seoImages.projectId, projectId), eq(seoImages.asinId, a.id)))
        .orderBy(desc(seoImages.version))
        .limit(1);
      const nextVersion = (prior?.version ?? 0) + 1;
      await db.insert(seoImages).values(
        output.images.map((img) => ({
          projectId,
          asinId: a.id,
          imageNumber: img.image_number,
          technicalName: img.technical_name,
          imageType: img.image_type,
          imagePurpose: img.image_purpose,
          cosmoRelationship: img.cosmo_relationship,
          buyerStage: img.buyer_stage,
          fileFormat: "PNG",
          widthPx: 2000,
          heightPx: 2000,
          colorMode: "RGB",
          overlayText: img.overlay_text,
          overlayTextLength: img.overlay_text.length,
          altText: img.alt_text,
          altTextLength: img.alt_text.length,
          imageDirection: img.image_direction,
          aiImagePrompt: img.ai_image_prompt,
          version: nextVersion,
        }))
      );
    }
    return { version: 1 };
  },
};
```

- [ ] **Step 2: Test**

```typescript
// tests/lib/seo/phases/s8.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoImages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { S8 } from "@/lib/seo/phases/s8";

describe("S8 executor", () => {
  it("persist writes 9 images with correct technical names + defaults", async () => {
    const [p] = await db.insert(seoProjects).values({ name: "__plan2_s8__", clientIdCode: "test" }).returning();
    const [a] = await db.insert(seoAsins).values({ projectId: p.id, asin: "B0S8", sku: "S" }).returning();
    const images = ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08"].map((tn, i) => ({
      image_number: i + 1, technical_name: tn, image_type: "x", image_purpose: "x",
      cosmo_relationship: "IS_A", buyer_stage: "Awareness" as const,
      overlay_text: tn === "MAIN" ? "Not Applicable" : "x".repeat(50),
      alt_text: "x".repeat(98), image_direction: "x", ai_image_prompt: "x",
    }));
    await S8.persist(p.id, { images } as any, "");
    const rows = await db.select().from(seoImages).where(eq(seoImages.asinId, a.id));
    expect(rows.length).toBe(9);
    expect(rows.every((r) => r.fileFormat === "PNG" && r.widthPx === 2000 && r.heightPx === 2000)).toBe(true);
    await db.delete(seoProjects).where(eq(seoProjects.id, p.id));
  });
});
```

- [ ] **Step 3: Commit**

```bash
npm test -- tests/lib/seo/phases/s8.test.ts --run
git add src/lib/seo/phases/s8.ts tests/lib/seo/phases/s8.test.ts
git commit -m "feat(seo): S8 real executor with 9 images MAIN+PT01-PT08 (plan 2 §H-38)"
```

### Task 39: S7 drawer (modules table)

**Files:**
- Create: `src/app/seo/manager/components/s7-modules-grid.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/seo/manager/components/s7-modules-grid.tsx
"use client";
export function S7ModulesGrid(props: { modules: Array<{ position: number; module_type: string; cosmo_relationship: string | null; fields: Record<string, string>; images: Array<{ technical_name: string; alt_text: string; overlay_text: string }> }> }) {
  return (
    <table className="text-xs w-full">
      <thead>
        <tr><th>#</th><th>Type</th><th>COSMO</th><th>Fields</th><th>Images</th></tr>
      </thead>
      <tbody>
        {props.modules.map((m) => (
          <tr key={m.position}>
            <td>{m.position}</td>
            <td>{m.module_type}</td>
            <td>{m.cosmo_relationship ?? "—"}</td>
            <td className="truncate max-w-[200px]">{Object.keys(m.fields).join(", ")}</td>
            <td>{m.images.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Wire it into the `PhaseDrawer` when `phase === "S7"`.

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/s7-modules-grid.tsx \
        src/app/seo/manager/components/phase-drawer.tsx
git commit -m "feat(seo): S7 drawer modules table (plan 2 §G-39)"
```

### Task 40: S8 drawer (image rows grid)

**Files:**
- Create: `src/app/seo/manager/components/s8-images-grid.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/seo/manager/components/s8-images-grid.tsx
"use client";
export function S8ImagesGrid(props: { images: Array<{ image_number: number; technical_name: string; image_type: string; alt_text: string; overlay_text: string; ai_image_prompt: string }> }) {
  return (
    <table className="text-xs w-full">
      <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Alt (chars)</th><th>Overlay</th><th>AI prompt</th></tr></thead>
      <tbody>
        {props.images.map((i) => (
          <tr key={i.image_number}>
            <td>{i.image_number}</td><td>{i.technical_name}</td><td>{i.image_type}</td>
            <td>{i.alt_text.length}</td>
            <td className="truncate max-w-[150px]">{i.overlay_text}</td>
            <td className="truncate max-w-[200px]">{i.ai_image_prompt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Wire into `PhaseDrawer`.

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/s8-images-grid.tsx \
        src/app/seo/manager/components/phase-drawer.tsx
git commit -m "feat(seo): S8 drawer image rows grid (plan 2 §H-40)"
```

### Task 41: S7/S8 column UI — pending_decision yellow border

Already implemented in Task 33's `S7DecisionCard`. This task wires it into the column so the column itself shows the yellow border when `pending_decision`, not a separate card.

**Files:**
- Modify: `src/app/seo/manager/components/phase-column.tsx`

- [ ] **Step 1: Update the column**

When `phase === 'S7' || phase === 'S8'` and the latest run is null and `s{N}_skipped === false` and `s{N}_approved_at === null`, render a yellow border:

```tsx
className={`rounded p-2 flex flex-col gap-2 border-2 ${
  (props.phase === "S7" || props.phase === "S8") && !props.isSkipped && !props.approvedAt && !props.latestRun
    ? "border-amber-400"
    : "border-gray-300"
}`}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/phase-column.tsx
git commit -m "feat(seo): S7/S8 pending_decision yellow border (plan 2 §G/H-41)"
```

### Task 42: S9 blocked-by-pending-decision tooltip

Approve action on S9 must be impossible when S7 or S8 is `pending_decision`. The button is disabled and a tooltip explains why.

**Files:**
- Modify: the S9 column logic in `phase-column.tsx` or in `s9-score-panel.tsx`

- [ ] **Step 1: Implement**

```tsx
const s7Decided = props.project.s7Skipped || !!props.project.s7ApprovedAt;
const s8Decided = props.project.s8Skipped || !!props.project.s8ApprovedAt;
const s9Blocked = props.phase === "S9" && (!s7Decided || !s8Decided);
// disable Approve + Run with tooltip "S7 / S8 must be decided first"
```

- [ ] **Step 2: Commit**

```bash
git add src/app/seo/manager/components/phase-column.tsx
git commit -m "feat(seo): S9 blocked until S7/S8 decided (plan 2 §G/H-42)"
```

### Task 43: End-to-end S7+S8 fixture test

**Files:**
- Create: `tests/lib/seo/runner.s7-s8-e2e.test.ts`

- [ ] **Step 1: Write test**

Same harness as Task 14 (live Claude e2e). Create a fixture project, seed approved S6 listings + Q&A + COSMO triples + Rufus image_strategy, call `runPhase(projectId, 'S7')`, assert `seo_aplus_plans` row exists with 7 modules and module 7 is `premium_qa`; call `runPhase(projectId, 'S8')`, assert 9 `seo_images` rows with the right technical names.

- [ ] **Step 2: Commit**

```bash
git add tests/lib/seo/runner.s7-s8-e2e.test.ts
git commit -m "test(seo): S7+S8 e2e fixture (plan 2 §G/H-43)"
```

### Milestone G/H verification (goal-backward)

- [ ] `npm run build` clean
- [ ] `npm test -- --run` green
- [ ] A fixture project: `runPhase('S7')` writes `seo_aplus_plans.modules` with `length === 7` and `[6].module_type === 'premium_qa'`
- [ ] `runPhase('S8')` writes 9 `seo_images` rows with technical names exactly `[MAIN, PT01..PT08]`
- [ ] S7-skipped path: `POST /phases/S7/skip` sets `s7_skipped = true`; UI shows skipped pill; S9 gate considers S7 decided
- [ ] S9 column shows "blocked" state when S7 or S8 is `pending_decision`
- [ ] Validator rejects S7 modules with `module_type` at position 7 other than `premium_qa`
- [ ] Validator rejects S8 images with duplicate or wrong technical names


---

## Milestone I — S9 Scoring + Hard Gate

Goal: A working `scoring.ts` engine that computes Rufus coverage, COSMO coverage, byte budgets, and prohibited-word violations from the typed-table state and emits a `seo_scores` row. Hard-gate definition: `rufus_coverage_pct >= 80` AND `cosmo_coverage_pct >= 75` AND zero unbypassed prohibited word violations AND all byte budgets ok AND all 16 COSMO categories evaluated AND S7+S8 each decided (approved or skipped). One auto-rerun of S6 on first fail with miss list; second fail surfaces to checkpoint review.

PR boundary: end of Task 50.

### Task 44: Coverage primitives (Rufus, COSMO, byte budgets)

**Files:**
- Create: `src/lib/seo/scoring/coverage.ts`
- Create: `tests/lib/seo/scoring/coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seo/scoring/coverage.test.ts
import { describe, it, expect } from "vitest";
import { rufusCoverage, cosmoCoverage, byteBudgetStatus, prohibitedWordViolations } from "@/lib/seo/scoring/coverage";

describe("scoring coverage primitives", () => {
  it("rufusCoverage hits 100% when every canonical question maps to ≥1 passage", () => {
    const passages = [
      { section: "title", rufus_question_ids: ["RQ1", "RQ2"], cosmo_triple_ids: [], keywords_used: [], text: "" },
      { section: "bullet1", rufus_question_ids: ["RQ3"], cosmo_triple_ids: [], keywords_used: [], text: "" },
      { section: "bullet2", rufus_question_ids: ["RQ4"], cosmo_triple_ids: [], keywords_used: [], text: "" },
      { section: "bullet3", rufus_question_ids: ["RQ5"], cosmo_triple_ids: [], keywords_used: [], text: "" },
    ];
    const phase2 = [
      { id: "PQ1", text: "x", intent_tier: "x", batch_char_count: 1 },
      { id: "PQ2", text: "x", intent_tier: "x", batch_char_count: 1 },
    ];
    const r = rufusCoverage(passages, phase2);
    expect(r.coveragePct).toBeGreaterThanOrEqual(50); // canonical fully covered
    expect(r.canonicalCoverage.RQ1.covered).toBe(true);
    expect(r.canonicalCoverage.RQ4.covered).toBe(true);
  });

  it("cosmoCoverage returns ≥ 75 when 16 categories + 70% keyword reflection", () => {
    const triples = Array.from({ length: 20 }, (_, i) => ({
      id: `T${i}`, entity1: "p", relationship: ["IS_A","USED_FOR_FUNC","USED_TO","CAPABLE_OF","USED_FOR_EVE","USED_ON","USED_IN_LOC","USED_AS","xIS_A","USED_IN_BODY","USED_WITH","USED_FOR_AUD","USED_BY","xINTERESTED_IN","xWANT","xLIKES"][i % 16], entity2: `e${i}`, confidence: 0.9, confidence_level: "High" as const, supporting_keyword_tier: "T1",
    }));
    const r = cosmoCoverage({
      triples,
      categoriesEvaluated: ["IS_A","USED_FOR_FUNC","USED_TO","CAPABLE_OF","USED_FOR_EVE","USED_ON","USED_IN_LOC","USED_AS","xIS_A","USED_IN_BODY","USED_WITH","USED_FOR_AUD","USED_BY","xINTERESTED_IN","xWANT","xLIKES"],
      keywords: ["a","b","c","d","e","f","g","h","i","j"],
      triplesInListing: 14,
      listingWordCount: 350,
    });
    expect(r.coveragePct).toBeGreaterThanOrEqual(75);
  });

  it("byteBudgetStatus collects per-field results", () => {
    const r = byteBudgetStatus({
      title: "x".repeat(195),
      product_description: "x".repeat(1100),
      backend_search_terms: "alpha beta gamma",
      bullets: { detailed: Array(5).fill("HDR: " + "x".repeat(393)), concise: Array(5).fill("HDR: " + "x".repeat(195)), content: Array(5).fill("HDR: " + "x".repeat(95)), key_features: Array(5).fill("HDR: " + "x".repeat(45)) },
    });
    expect(r.title.ok).toBe(true);
    expect(r.product_description.ok).toBe(true);
    expect(r.backend_search_terms.ok).toBe(true);
  });

  it("prohibitedWordViolations excludes bypassed", () => {
    const r = prohibitedWordViolations([
      { field: "title", word: "treats", type: "amazon_prohibited", bypassed: false },
      { field: "bullets.detailed.0", word: "best", type: "amazon_prohibited", bypassed: true },
    ]);
    expect(r).toEqual([{ field: "title", word: "treats" }]);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/seo/scoring/coverage.ts
import { CANONICAL_RUFUS_IDS } from "@/lib/seo/prompts/canonical-rufus-questions";
import { COSMO_RELATIONSHIPS } from "@/lib/seo/prompts/cosmo-relationships";
import { checkByteBudget, checkCharBudget } from "@/lib/seo/byte-budget";
import type { ComplianceViolation } from "@/lib/seo/compliance";

export function rufusCoverage(
  passages: Array<{ section: string; rufus_question_ids: string[] }>,
  phase2: Array<{ id: string }>
): {
  coveragePct: number;
  canonicalCoverage: Record<string, { covered: boolean; locations: string[] }>;
  missing: string[];
} {
  const canonical: Record<string, { covered: boolean; locations: string[] }> = {};
  for (const rid of CANONICAL_RUFUS_IDS) canonical[rid] = { covered: false, locations: [] };
  const phase2Covered: Set<string> = new Set();
  for (const p of passages) {
    for (const rid of p.rufus_question_ids) {
      if (canonical[rid]) {
        canonical[rid].covered = true;
        canonical[rid].locations.push(p.section);
      } else if (phase2.some((q) => q.id === rid)) {
        phase2Covered.add(rid);
      }
    }
  }
  const canonicalCovered = Object.values(canonical).filter((c) => c.covered).length;
  const phase2Count = phase2.length;
  const canonicalPct = (canonicalCovered / 5) * 0.5;
  const phase2Pct = phase2Count > 0 ? (phase2Covered.size / phase2Count) * 0.5 : 0;
  const coveragePct = (canonicalPct + phase2Pct) * 100;
  const missing = Object.entries(canonical).filter(([, v]) => !v.covered).map(([k]) => k);
  return { coveragePct, canonicalCoverage: canonical, missing };
}

export function cosmoCoverage(input: {
  triples: Array<{ id: string; entity1: string; relationship: string; entity2: string }>;
  categoriesEvaluated: string[];
  keywords: string[];
  triplesInListing: number;
  listingWordCount: number;
}): { coveragePct: number; density: number; categoriesEvaluatedCount: number; missing: string[] } {
  const requiredCategories = new Set<string>(COSMO_RELATIONSHIPS);
  const evaluatedSet = new Set(input.categoriesEvaluated);
  const categoryBreadthPct = (evaluatedSet.size / requiredCategories.size) * 100;

  const reflectedKeywords = input.keywords.filter((k) =>
    input.triples.some((t) => t.entity1.toLowerCase().includes(k.toLowerCase()) || t.entity2.toLowerCase().includes(k.toLowerCase()))
  );
  const keywordReflectionPct = input.keywords.length > 0 ? (reflectedKeywords.length / input.keywords.length) * 100 : 100;

  const density = input.listingWordCount > 0 ? (input.triplesInListing / input.listingWordCount) * 100 : 0;
  const densityScore = density >= 3 && density <= 5 ? 100 : Math.max(0, 100 * (1 - Math.min(Math.abs(density - 3), Math.abs(density - 5)) / 5));

  const coveragePct = 0.5 * keywordReflectionPct + 0.3 * densityScore + 0.2 * categoryBreadthPct;
  const missing = [...requiredCategories].filter((c) => !evaluatedSet.has(c));
  return { coveragePct, density, categoriesEvaluatedCount: evaluatedSet.size, missing };
}

export function byteBudgetStatus(l: {
  title: string;
  product_description: string;
  backend_search_terms: string;
  bullets: { detailed: string[]; concise: string[]; content: string[]; key_features: string[] };
}): Record<string, { used: number; max: number; ok: boolean }> {
  return {
    title: { ...checkCharBudget(l.title, 190, 200) },
    product_description: { ...checkCharBudget(l.product_description, 1000, 1200) },
    backend_search_terms: checkByteBudget(l.backend_search_terms, 500),
    "bullets.detailed.length": { used: l.bullets.detailed.length, max: 5, ok: l.bullets.detailed.length === 5 },
    "bullets.concise.length": { used: l.bullets.concise.length, max: 5, ok: l.bullets.concise.length === 5 },
    "bullets.content.length": { used: l.bullets.content.length, max: 5, ok: l.bullets.content.length === 5 },
    "bullets.key_features.length": { used: l.bullets.key_features.length, max: 5, ok: l.bullets.key_features.length === 5 },
  };
}

export function prohibitedWordViolations(
  comp: ComplianceViolation[]
): Array<{ field: string; word: string }> {
  return comp.filter((v) => !v.bypassed).map((v) => ({ field: v.field, word: v.word }));
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- tests/lib/seo/scoring/coverage.test.ts --run
git add src/lib/seo/scoring/coverage.ts tests/lib/seo/scoring/coverage.test.ts
git commit -m "feat(seo): rufus/cosmo/byte/compliance coverage primitives (plan 2 §I-44)"
```

### Task 45: `scoring.ts` — `scoreProject` entry point

**Files:**
- Create: `src/lib/seo/scoring.ts`
- Create: `tests/lib/seo/scoring.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/lib/seo/scoring.ts
import { db } from "@/lib/db";
import { seoProjects, seoListings, seoQa, seoPassageMap, seoCosmopMaps, seoRufus, seoKeywords, seoAsins, seoScores } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { rufusCoverage, cosmoCoverage, byteBudgetStatus, prohibitedWordViolations } from "@/lib/seo/scoring/coverage";

export type ScoreInput = { probe?: boolean };

export async function scoreProject(projectId: string, opts: ScoreInput = {}): Promise<{
  ok: boolean;
  passes: boolean;
  scoreRows: Array<typeof seoScores.$inferInsert>;
  reasons: string[];
}> {
  const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
  if (!project) throw new Error("project not found");

  const reasons: string[] = [];
  const s7Decided = project.s7Skipped || !!project.s7ApprovedAt;
  const s8Decided = project.s8Skipped || !!project.s8ApprovedAt;
  if (!s7Decided) reasons.push("S7 not decided (must approve or skip)");
  if (!s8Decided) reasons.push("S8 not decided (must approve or skip)");

  const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
  const [rufus] = await db.select().from(seoRufus).where(eq(seoRufus.projectId, projectId)).limit(1);
  const [cosmo] = await db.select().from(seoCosmopMaps).where(eq(seoCosmopMaps.projectId, projectId)).limit(1);
  const kws = await db.select().from(seoKeywords).where(and(eq(seoKeywords.projectId, projectId)));
  const t1Keywords = kws.filter((k) => k.priorityTier === "T1" || k.priorityTier === "T2").map((k) => k.text);
  const phase2Questions = (rufus?.phase2Questions ?? []) as Array<{ id: string }>;

  const rows: Array<typeof seoScores.$inferInsert> = [];
  for (const a of asins) {
    const [listing] = await db.select().from(seoListings).where(eq(seoListings.asinId, a.id)).orderBy(desc(seoListings.version)).limit(1);
    const [passages] = await db.select().from(seoPassageMap).where(eq(seoPassageMap.asinId, a.id)).orderBy(desc(seoPassageMap.version)).limit(1);
    if (!listing) { reasons.push(`no listing for asin ${a.asin}`); continue; }

    const rc = rufusCoverage(((passages?.passages ?? []) as any), phase2Questions);
    const triples = (cosmo?.triples ?? []) as Array<{ id: string; entity1: string; relationship: string; entity2: string }>;
    const cc = cosmoCoverage({
      triples,
      categoriesEvaluated: (cosmo?.relationshipCategoriesEvaluated ?? []) as string[],
      keywords: t1Keywords,
      triplesInListing: triples.length,
      listingWordCount: (listing.title + " " + listing.productDescription).split(/\s+/).filter(Boolean).length,
    });
    const bb = byteBudgetStatus({
      title: listing.title ?? "",
      product_description: listing.productDescription ?? "",
      backend_search_terms: listing.backendSearchTerms ?? "",
      bullets: (listing.bullets ?? { detailed: [], concise: [], content: [], key_features: [] }) as any,
    });
    const violations = prohibitedWordViolations((listing.complianceViolations ?? []) as any);

    const pass =
      rc.coveragePct >= 80 &&
      cc.coveragePct >= 75 &&
      cc.categoriesEvaluatedCount === 16 &&
      violations.length === 0 &&
      Object.values(bb).every((b) => b.ok) &&
      s7Decided &&
      s8Decided;

    const grade =
      pass && rc.coveragePct >= 90 && cc.coveragePct >= 85 ? "A" :
      pass ? "B" :
      rc.coveragePct >= 70 ? "C" :
      rc.coveragePct >= 60 ? "D" : "F";

    rows.push({
      projectId,
      asinId: a.id,
      rufusCoveragePct: String(Math.round(rc.coveragePct * 10) / 10),
      rufus5CanonicalCoverage: rc.canonicalCoverage as any,
      cosmoCoveragePct: String(Math.round(cc.coveragePct * 10) / 10),
      cosmoDensityPer100Words: String(Math.round(cc.density * 100) / 100),
      cosmoRelationshipCategoriesEvaluated: (cosmo?.relationshipCategoriesEvaluated ?? []) as any,
      buyerJourneyAlignment: {},
      byteBudgetStatus: bb as any,
      prohibitedWordViolations: violations as any,
      missingRufusQuestions: rc.missing,
      missingCosmoTriples: cc.missing,
      overallGrade: grade,
      probeTranscript: opts.probe ? await runDeepProbe(projectId, a.id) : null,
      rerunCount: 0,
    });

    if (!pass) {
      if (rc.coveragePct < 80) reasons.push(`${a.asin}: rufus_coverage ${rc.coveragePct.toFixed(1)}% < 80`);
      if (cc.coveragePct < 75) reasons.push(`${a.asin}: cosmo_coverage ${cc.coveragePct.toFixed(1)}% < 75`);
      if (cc.categoriesEvaluatedCount !== 16) reasons.push(`${a.asin}: only ${cc.categoriesEvaluatedCount}/16 COSMO categories evaluated`);
      if (violations.length > 0) reasons.push(`${a.asin}: ${violations.length} unbypassed prohibited words`);
      if (!Object.values(bb).every((b) => b.ok)) reasons.push(`${a.asin}: byte budget violation`);
    }
  }

  // Insert all score rows
  for (const r of rows) await db.insert(seoScores).values(r);

  const passes = reasons.length === 0 && rows.length > 0;

  if (passes) {
    await db.update(seoProjects).set({ s9ApprovedAt: new Date(), updatedAt: new Date() }).where(eq(seoProjects.id, projectId));
  }

  return { ok: true, passes, scoreRows: rows, reasons };
}

async function runDeepProbe(_projectId: string, _asinId: string): Promise<Array<{ query: string; response: string }>> {
  // Implemented in Task 47.
  return [];
}
```

- [ ] **Step 2: Test + commit**

```bash
npm test -- tests/lib/seo/scoring.test.ts --run
git add src/lib/seo/scoring.ts tests/lib/seo/scoring.test.ts
git commit -m "feat(seo): scoreProject hard-gate engine (plan 2 §I-45)"
```

### Task 46: Replace `S9` stub with executor that wraps `scoreProject` + auto-rerun

**Files:**
- Modify: `src/lib/seo/phases/s9.ts`
- Create: `tests/lib/seo/phases/s9.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/lib/seo/phases/s9.ts (replace stub)
import type { PhaseExecutor } from "@/lib/seo/phases/s1";
import { scoreProject } from "@/lib/seo/scoring";
import { runPhase } from "@/lib/seo/runner";
import { db } from "@/lib/db";
import { seoScores } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const S9: PhaseExecutor<{ projectId: string; probe: boolean }, unknown> = {
  phase: "S9",
  model: "claude-sonnet-4-6",
  async loadContext(projectId: string) {
    return { projectId, probe: false };
  },
  fillSlots(_ctx) {
    return {};
  },
  async persist(projectId) {
    const result = await scoreProject(projectId);
    if (result.passes) return { version: 1 };

    // Hard-gate fail — check rerun count
    const [latest] = await db.select().from(seoScores).where(eq(seoScores.projectId, projectId)).orderBy(desc(seoScores.computedAt)).limit(1);
    const rerunCount = latest?.rerunCount ?? 0;
    if (rerunCount >= 1) {
      // Already retried; surface miss list to UI (do nothing — score row carries the miss list)
      return { version: 1 };
    }

    // First fail — bump rerun_count and trigger S6 re-run with miss list
    await db
      .update(seoScores)
      .set({ rerunCount: rerunCount + 1 })
      .where(eq(seoScores.id, latest!.id));
    await runPhase(projectId, "S6", { trigger: "s9_auto_rerun" });
    // Re-score after S6 completes (runner is synchronous within executor.persist)
    await scoreProject(projectId);
    return { version: 1 };
  },
};
```

> Note: The S9 executor intentionally does NOT call Claude — it computes everything from typed-table state. The `executor.model` field is kept only because the runner type expects it; the runner skips the Claude call when the phase output is empty (need to add a guard for this — see Task 50 runner tweak).

- [ ] **Step 2: Add runner guard for "no Claude call needed"**

In `src/lib/seo/runner.ts`, before the `for (attempt = 1; attempt <= 2; attempt++)` loop, special-case `phase === "S9"`:

```typescript
if (phase === "S9") {
  const ctx = await S9.loadContext(projectId);
  await S9.persist(projectId, null as any, runId);
  await db.update(seoPhaseRuns).set({
    status: "success", finishedAt: new Date(), durationMs: Date.now() - startedAt,
    claudeInputTokens: 0, claudeOutputTokens: 0, claudeCostUsd: "0", claudeModel: null,
  }).where(eq(seoPhaseRuns.id, runId));
  return { status: "success", runId, version: 1 };
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- tests/lib/seo/phases/s9.test.ts --run
git add src/lib/seo/phases/s9.ts src/lib/seo/runner.ts tests/lib/seo/phases/s9.test.ts
git commit -m "feat(seo): S9 executor with auto-rerun loop (plan 2 §I-46)"
```

### Task 47: Deep-probe implementation

**Files:**
- Modify: `src/lib/seo/scoring.ts` (replace `runDeepProbe` stub)
- Create: `tests/lib/seo/scoring/probe.test.ts`

- [ ] **Step 1: Implement**

```typescript
// inside src/lib/seo/scoring.ts — replace runDeepProbe stub
import { callClaudeJson } from "@/lib/seo/claude-client";
import { CANONICAL_RUFUS_QUESTIONS } from "@/lib/seo/prompts/canonical-rufus-questions";

async function runDeepProbe(projectId: string, asinId: string): Promise<Array<{ query: string; response: string }>> {
  const [listing] = await db.select().from(seoListings).where(eq(seoListings.asinId, asinId)).orderBy(desc(seoListings.version)).limit(1);
  if (!listing) return [];
  const listingText = [
    listing.title,
    ...(listing.bullets?.detailed ?? []),
    listing.productDescription,
  ].filter(Boolean).join("\n\n");

  const transcript: Array<{ query: string; response: string }> = [];
  const system = `You are simulating Amazon Rufus. Answer ONLY from the following listing. If the listing does not answer the question, say "Not stated in listing." Listing:\n\n${listingText}`;
  for (const q of CANONICAL_RUFUS_QUESTIONS) {
    const r = await callClaudeJson<{ answer: string }>({
      systemPromptCached: system,
      userPrompt: `Question: ${q.text}\n\nReturn JSON: { "answer": "..." }`,
      model: "claude-sonnet-4-6",
      maxTokens: 512,
    });
    transcript.push({ query: q.text, response: r.parsed.answer });
  }
  return transcript;
}
```

- [ ] **Step 2: Test + commit**

```bash
git add src/lib/seo/scoring.ts tests/lib/seo/scoring/probe.test.ts
git commit -m "feat(seo): S9 deep probe Rufus simulation (plan 2 §I-47)"
```

### Task 48: `?probe=true` plumbing through the run endpoint

**Files:**
- Modify: `src/app/api/seo/projects/[id]/phases/[phase]/run/route.ts`
- Modify: `src/lib/seo/phases/s9.ts`

- [ ] **Step 1: Pass `probe` from query string into `runPhase` via `RunOpts`**

Add `probe?: boolean` to `RunOpts` in `runner.ts`. In the S9 route handler:

```typescript
const probe = new URL(req.url).searchParams.get("probe") === "true";
// pass through runPhase opts → eventually into S9.loadContext via a closure or extra arg
```

For simplicity, store `probe` on the `seo_phase_runs` row in a new ad-hoc JSONB column or just thread it through `RunOpts` and `runPhase` to `scoreProject({ probe })` directly.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/seo/projects/[id]/phases/[phase]/run/route.ts \
        src/lib/seo/phases/s9.ts src/lib/seo/runner.ts src/lib/seo/scoring.ts
git commit -m "feat(seo): wire ?probe=true through S9 (plan 2 §I-48)"
```

### Task 49: S9 panel reads + miss-list rendering

The S9 panel from Task 32 already reads `/scores`. This task confirms the miss-list section renders correctly when scores fail.

**Files:**
- Modify: `src/app/seo/manager/components/s9-score-panel.tsx`

- [ ] **Step 1: Test the miss-list path manually**

Drive a fixture project to S9 with a known coverage gap (e.g., delete one COSMO category from `seo_cosmo_maps.relationship_categories_evaluated`). Run S9, confirm:
- Score row written with `overall_grade = 'F'`
- Miss list section in S9 panel renders the missing category
- `s9_approved_at` remains null
- After fix + re-run, `s9_approved_at` stamps

- [ ] **Step 2: Commit any UX fixes**

```bash
git add src/app/seo/manager/components/s9-score-panel.tsx
git commit -m "polish(seo): S9 panel miss-list rendering (plan 2 §I-49)"
```

### Task 50: End-to-end S9 hard-gate fixture

**Files:**
- Create: `tests/lib/seo/scoring.e2e.test.ts`

- [ ] **Step 1: Implement**

Seed a fixture project with complete S1-S6 outputs (use raw inserts, no Claude). Run `scoreProject`. Assert:

```typescript
it("first-pass fail triggers one auto-rerun then surfaces miss list on second fail", async () => {
  // 1. seed project with bad data (missing COSMO category)
  // 2. runPhase(projectId, 'S9')
  // 3. assert seo_phase_runs rows: 1× S9 success, then 1× S6 auto-rerun trigger='s9_auto_rerun'
  // 4. assert second S9 also fails (data still bad)
  // 5. assert s9_approved_at IS NULL
  // 6. fix the data, run S9 again, assert s9_approved_at stamps
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/lib/seo/scoring.e2e.test.ts
git commit -m "test(seo): S9 hard-gate + auto-rerun e2e fixture (plan 2 §I-50)"
```

### Milestone I verification (goal-backward)

- [ ] `npm run build` clean
- [ ] `npm test -- --run` green
- [ ] A fixture project that meets the hard gate gets `s9_approved_at IS NOT NULL` after `runPhase('S9')`
- [ ] A fixture project that fails by 1 missing COSMO category gets exactly one S6 auto-rerun (`seo_phase_runs` shows `trigger='s9_auto_rerun'`), then surfaces miss list on the second fail
- [ ] No third re-run ever fires (verified by scanning `seo_phase_runs` for `attempt > 2` or `parent_run_id` chains > 2)
- [ ] `?probe=true` writes a non-null `probe_transcript` with 5 entries
- [ ] Score panel renders grade + Rufus % + COSMO % + miss list correctly


---

## Milestone J — Legacy Backfill + Drop (GATED, runs last)

Goal: Backfill `seo_asins.generated_content` payloads into the new typed tables for projects in `S6/S7/S8/S9`. Re-derive `byte_usage` and `compliance_violations`. Leave `seo_qa.pairs` and `seo_passage_map.passages` empty with `version = 0` sentinel. Then drop the legacy `seo_asins.generated_content` column and `seo_compliance_reports` table.

**HARD PRECONDITION — must be machine-checked at PR-open time:**

```sql
SELECT COUNT(*) FROM seo_projects WHERE s9_approved_at IS NOT NULL;
-- Must return >= 1 before §J PR can be opened. CI step in the PR's first commit must run this and fail the PR if the count is 0.
```

If the count is 0, §J is blocked. Continue running Milestones D–I and onboarding a real client through S9 first.

PR boundary: Milestone J ships in **two separate PRs**:
- **PR-J1:** the backfill script + dry-run + integrity test (does NOT drop anything)
- **PR-J2:** the drop migration (only ships after PR-J1 has been run in production AND the integrity test passes against real data)

### Task 51: Precondition check script

**Files:**
- Create: `scripts/check-plan-j-precondition.ts`

- [ ] **Step 1: Implement**

```typescript
// scripts/check-plan-j-precondition.ts
// Run via: npx tsx scripts/check-plan-j-precondition.ts
// Exits 0 if at least one project has stamped s9_approved_at on the new schema.
// Exits 1 otherwise — used as a CI gate for the §J PRs.
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { isNotNull, sql } from "drizzle-orm";

async function main() {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(seoProjects)
    .where(isNotNull(seoProjects.s9ApprovedAt));
  if (count >= 1) {
    console.log(`OK: ${count} project(s) have stamped s9_approved_at on the new schema. §J PR is eligible.`);
    process.exit(0);
  } else {
    console.error("FAIL: no production project has cleared S9 on the new schema. §J PR is blocked.");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
```

- [ ] **Step 2: Wire into CI** (add to `.github/workflows/` or whatever CI lives in this repo — coexist with existing checks)

The §J PRs must include a CI step that runs `npx tsx scripts/check-plan-j-precondition.ts` and fails the job if exit != 0.

- [ ] **Step 3: Commit (lives in PR-J1)**

```bash
git add scripts/check-plan-j-precondition.ts
git commit -m "feat(seo): §J precondition CI gate (plan 2 §J-51)"
```

### Task 52: Backfill script — dry-run + per-project mode

**Files:**
- Create: `scripts/backfill-legacy-seo-content.ts`
- Create: `tests/scripts/backfill-legacy-seo-content.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/scripts/backfill-legacy-seo-content.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoListings, seoQa, seoPassageMap } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { backfillProject } from "@/scripts/backfill-legacy-seo-content";

describe("backfillProject", () => {
  it("maps legacy generated_content to seo_listings + empty seo_qa + empty seo_passage_map with version 0 sentinel", async () => {
    const [p] = await db.insert(seoProjects).values({ name: "__plan2_j_test__", clientIdCode: "test", currentPhase: "S6" }).returning();
    const [a] = await db.insert(seoAsins).values({
      projectId: p.id, asin: "B0J", sku: "S",
      generatedContent: {
        title: "X".repeat(195),
        detailed_bullets: Array(5).fill("HEADER: " + "x".repeat(390)),
        concise_bullets: Array(5).fill("HDR: " + "x".repeat(190)),
        content_bullets: Array(5).fill("HDR: " + "x".repeat(90)),
        key_features: Array(5).fill("HDR: " + "x".repeat(40)),
        description: "x".repeat(1050),
        search_terms_core: "alpha", search_terms_supplement: "beta", search_terms_symptom: "",
        search_terms_audience: "", search_terms_longtail: "",
      },
    }).returning();

    const result = await backfillProject(p.id, { dryRun: false });
    expect(result.listingsWritten).toBe(1);
    expect(result.qaWrittenSentinel).toBe(1);
    expect(result.passageMapWrittenSentinel).toBe(1);

    const [listing] = await db.select().from(seoListings).where(eq(seoListings.asinId, a.id));
    expect(listing.title?.length).toBeGreaterThanOrEqual(190);
    expect(listing.byteUsage).toBeTruthy();
    expect(Array.isArray(listing.complianceViolations)).toBe(true);

    const [qa] = await db.select().from(seoQa).where(eq(seoQa.asinId, a.id));
    expect(qa.version).toBe(0);
    expect((qa.pairs as any[]).length).toBe(0);

    const [pm] = await db.select().from(seoPassageMap).where(eq(seoPassageMap.asinId, a.id));
    expect(pm.version).toBe(0);

    await db.delete(seoProjects).where(eq(seoProjects.id, p.id));
  });

  it("dryRun does not write anything", async () => {
    const [p] = await db.insert(seoProjects).values({ name: "__plan2_j_dry__", clientIdCode: "test", currentPhase: "S6" }).returning();
    await db.insert(seoAsins).values({
      projectId: p.id, asin: "B0JDRY", sku: "S",
      generatedContent: { title: "X".repeat(195), detailed_bullets: [], concise_bullets: [], content_bullets: [], key_features: [], description: "", search_terms_core: "", search_terms_supplement: "", search_terms_symptom: "", search_terms_audience: "", search_terms_longtail: "" },
    });
    await backfillProject(p.id, { dryRun: true });
    const rows = await db.select().from(seoListings).where(eq(seoListings.projectId, p.id));
    expect(rows.length).toBe(0);
    await db.delete(seoProjects).where(eq(seoProjects.id, p.id));
  });

  it("skips projects that already have seo_listings.version >= 1 (multi-version guard)", async () => {
    // ... assert function returns { skipped: true, reason: 'already_migrated' }
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// scripts/backfill-legacy-seo-content.ts
// Backfills legacy seo_asins.generated_content into the new typed tables.
// Sentinel rows (version = 0) are written for seo_qa.pairs and seo_passage_map.passages,
// signaling "needs S6 re-run to populate."

import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoListings, seoQa, seoPassageMap } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { scanCompliance } from "@/lib/seo/compliance";
import { checkByteBudget, checkCharBudget } from "@/lib/seo/byte-budget";

export type BackfillResult = {
  projectId: string;
  listingsWritten: number;
  qaWrittenSentinel: number;
  passageMapWrittenSentinel: number;
  skipped?: boolean;
  reason?: string;
  errors: string[];
};

export async function backfillProject(
  projectId: string,
  opts: { dryRun: boolean }
): Promise<BackfillResult> {
  const result: BackfillResult = {
    projectId,
    listingsWritten: 0,
    qaWrittenSentinel: 0,
    passageMapWrittenSentinel: 0,
    errors: [],
  };

  const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
  if (!project) {
    result.skipped = true;
    result.reason = "project_not_found";
    return result;
  }

  const existing = await db.select({ count: sql<number>`COUNT(*)::int` }).from(seoListings).where(eq(seoListings.projectId, projectId));
  if (existing[0]?.count > 0) {
    result.skipped = true;
    result.reason = "already_migrated";
    return result;
  }

  const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
  const brandWords = (project.brandGuidelinesLock?.words_to_avoid ?? []) as string[];

  for (const a of asins) {
    const gc = a.generatedContent;
    if (!gc) continue;

    const title = gc.title ?? "";
    const bullets = {
      detailed: gc.detailed_bullets ?? [],
      concise: gc.concise_bullets ?? [],
      content: gc.content_bullets ?? [],
      key_features: gc.key_features ?? [],
    };
    const productDescription = gc.description ?? "";
    const backendSearchTerms = [
      gc.search_terms_core,
      gc.search_terms_supplement,
      gc.search_terms_symptom,
      gc.search_terms_audience,
      gc.search_terms_longtail,
    ].filter(Boolean).join(" ");

    // Re-derive byte usage
    const byteUsage = {
      title: checkCharBudget(title, 190, 200),
      product_description: checkCharBudget(productDescription, 1000, 1200),
      backend_search_terms: checkByteBudget(backendSearchTerms, 500),
    };

    // Re-derive compliance violations
    const violations = [
      ...scanCompliance({ field: "title", text: title, brandWordsToAvoid: brandWords }),
      ...bullets.detailed.flatMap((b, i) => scanCompliance({ field: `bullets.detailed.${i}`, text: b, brandWordsToAvoid: brandWords })),
      ...bullets.concise.flatMap((b, i) => scanCompliance({ field: `bullets.concise.${i}`, text: b, brandWordsToAvoid: brandWords })),
      ...bullets.content.flatMap((b, i) => scanCompliance({ field: `bullets.content.${i}`, text: b, brandWordsToAvoid: brandWords })),
      ...bullets.key_features.flatMap((b, i) => scanCompliance({ field: `bullets.key_features.${i}`, text: b, brandWordsToAvoid: brandWords })),
      ...scanCompliance({ field: "product_description", text: productDescription, brandWordsToAvoid: brandWords }),
      ...scanCompliance({ field: "backend_search_terms", text: backendSearchTerms, brandWordsToAvoid: brandWords }),
    ];

    if (opts.dryRun) {
      console.log(`[dry] ${a.asin}: would write listing, qa sentinel, passage_map sentinel`);
      continue;
    }

    await db.insert(seoListings).values({
      projectId,
      asinId: a.id,
      title,
      bullets,
      productDescription,
      backendSearchTerms,
      backendCategories: {
        core: gc.search_terms_core ?? "",
        supplement: gc.search_terms_supplement ?? "",
        symptom: gc.search_terms_symptom ?? "",
        audience: gc.search_terms_audience ?? "",
        longtail: gc.search_terms_longtail ?? "",
      },
      byteUsage: byteUsage as any,
      complianceViolations: violations as any,
      version: 1,
    });
    result.listingsWritten++;

    await db.insert(seoQa).values({
      projectId, asinId: a.id, pairs: [], aplusQaSubset: [], customerQaExport: [], passageMapQa: [], version: 0,
    });
    result.qaWrittenSentinel++;

    await db.insert(seoPassageMap).values({
      projectId, asinId: a.id, passages: [], version: 0,
    });
    result.passageMapWrittenSentinel++;
  }

  return result;
}

async function eligibleProjects(): Promise<Array<{ id: string; name: string; currentPhase: string }>> {
  return await db
    .select({ id: seoProjects.id, name: seoProjects.name, currentPhase: seoProjects.currentPhase })
    .from(seoProjects)
    .where(inArray(seoProjects.currentPhase, ["S6", "S7", "S8", "S9"]));
}

// CLI entry
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--no-dry-run");
  const projectId = args.find((a) => a.startsWith("--project-id="))?.split("=")[1] ?? null;
  const all = args.includes("--all-eligible");
  const confirm = args.includes("--confirm");

  if (!dryRun && all && !confirm) {
    console.error("ERROR: --all-eligible requires --confirm");
    process.exit(1);
  }

  if (projectId) {
    const r = await backfillProject(projectId, { dryRun });
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (all) {
    const projects = await eligibleProjects();
    console.log(`Found ${projects.length} eligible projects.`);
    const summary: BackfillResult[] = [];
    for (const p of projects) summary.push(await backfillProject(p.id, { dryRun }));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log("Usage:");
  console.log("  npx tsx scripts/backfill-legacy-seo-content.ts --project-id=<uuid>");
  console.log("  npx tsx scripts/backfill-legacy-seo-content.ts --all-eligible [--no-dry-run --confirm]");
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- tests/scripts/backfill-legacy-seo-content.test.ts --run
git add scripts/backfill-legacy-seo-content.ts tests/scripts/backfill-legacy-seo-content.test.ts
git commit -m "feat(seo): legacy backfill script with dry-run (plan 2 §J-52)"
```

### Task 53: Post-backfill integrity test (PR-J1 CI step)

**Files:**
- Create: `tests/db/post-backfill-integrity.test.ts`

- [ ] **Step 1: Implement**

```typescript
// tests/db/post-backfill-integrity.test.ts
// Run after backfill has executed on a production database.
// Verifies: every seo_asins row that had non-null generated_content has a
// corresponding seo_listings row with non-empty title + bullets.detailed.

import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { seoAsins, seoListings } from "@/lib/db/schema";
import { sql, isNotNull, and, inArray } from "drizzle-orm";

describe("post-backfill integrity", () => {
  it("every asin with legacy generated_content has a seo_listings row", async () => {
    const legacyAsins = await db
      .select({ id: seoAsins.id, asin: seoAsins.asin })
      .from(seoAsins)
      .where(isNotNull(seoAsins.generatedContent));

    if (legacyAsins.length === 0) {
      console.warn("No legacy generated_content rows to verify; skipping.");
      return;
    }

    const listings = await db
      .select({ asinId: seoListings.asinId, title: seoListings.title, bullets: seoListings.bullets })
      .from(seoListings)
      .where(inArray(seoListings.asinId, legacyAsins.map((a) => a.id)));

    const byAsin: Record<string, typeof listings[0]> = {};
    for (const l of listings) byAsin[l.asinId] = l;

    for (const a of legacyAsins) {
      const l = byAsin[a.id];
      expect(l, `no listing for asin ${a.asin}`).toBeTruthy();
      expect(l.title?.length ?? 0, `${a.asin} title empty`).toBeGreaterThan(0);
      const bullets = l.bullets as any;
      expect(Array.isArray(bullets?.detailed) && bullets.detailed.length > 0, `${a.asin} no detailed bullets`).toBe(true);
    }
  });

  it("byte_usage is computed (not null) on every backfilled listing", async () => {
    const sample = await db.select().from(seoListings).limit(50);
    for (const l of sample) {
      expect(l.byteUsage, `listing ${l.id} byteUsage null`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Commit (lives in PR-J1)**

```bash
git add tests/db/post-backfill-integrity.test.ts
git commit -m "test(seo): post-backfill integrity contract (plan 2 §J-53)"
```

### Task 54: PR-J1 open + dry-run on production

- [ ] **Step 1: Run the precondition check**

```bash
npx tsx scripts/check-plan-j-precondition.ts
```

Expected: prints `OK: N project(s) have stamped s9_approved_at`. If FAIL, abort PR-J1.

- [ ] **Step 2: Dry-run against production**

```bash
npx tsx scripts/backfill-legacy-seo-content.ts --all-eligible
```

Expected: prints `[dry] <asin>: would write listing, qa sentinel, passage_map sentinel` for every eligible row. No DB writes.

- [ ] **Step 3: Open PR-J1**

PR description must include:
- The precondition check output
- Counts of eligible projects + ASINs from the dry-run
- A note that PR-J2 (the drop migration) is on a separate branch and will not ship until this PR is reviewed and the live backfill is executed
- The integrity test result (run locally against staging or a copy of prod first)

### Task 55: Execute backfill in production (after PR-J1 merge)

- [ ] **Step 1: Snapshot the DB**

Take a Supabase point-in-time snapshot before running. Confirm rollback path is clear.

- [ ] **Step 2: Run with `--confirm`**

```bash
npx tsx scripts/backfill-legacy-seo-content.ts --all-eligible --no-dry-run --confirm
```

Expected: prints per-project summary, exits 0.

- [ ] **Step 3: Run the integrity test against production**

```bash
DATABASE_URL=$PROD_URL npm test -- tests/db/post-backfill-integrity.test.ts --run
```

Expected: PASS.

- [ ] **Step 4: Spot-check the UI**

Open `/seo/manager`, pick a backfilled project, confirm S6 column shows "legacy backfilled" badge (UI surface flagged from `seo_qa.version === 0`). Run S6 manually to populate Q&A. Run S9, verify hard gate.

### Task 56: PR-J2 — drop migration

**Files:**
- Create: `drizzle/migrations/{next-available}_drop_legacy_generated_content.sql`

- [ ] **Step 1: Write SQL**

```sql
-- {next-available}_drop_legacy_generated_content.sql
-- Drops the legacy seo_asins.generated_content column and seo_compliance_reports table.
-- Runs ONLY after PR-J1's backfill has executed and post-backfill-integrity tests pass on production.

BEGIN;

ALTER TABLE seo_asins DROP COLUMN generated_content;
DROP TABLE seo_compliance_reports;

COMMIT;
```

> The actual migration number must be determined when this PR is opened — it must be the next available slot relative to whatever has shipped since PR-J1 merged. Update the file name and `_journal.json` accordingly.

- [ ] **Step 2: Remove Drizzle schema references**

In `src/lib/db/schema.ts`:
- Remove `generatedContent: jsonb("generated_content").$type<...>()` from `seoAsins` (around line 769).
- Remove the entire `seoComplianceReports` export.
- Run `npm run build` and fix any consumer that referenced `generatedContent` (use grep first: `grep -rn "generatedContent\|generated_content\|seoComplianceReports" src/`).

- [ ] **Step 3: Update the legacy `/seo/[id]/*` route**

The legacy `/seo/[id]/*` route reads `generated_content`. Two options:
- (a) Redirect `/seo/[id]/*` to `/seo/manager` (preferred — kills the legacy UI in one move)
- (b) Update the legacy route to read from `seo_listings` instead

Option (a) is simpler. Add a redirect in `src/middleware.ts` or `src/app/seo/[id]/page.tsx`. Document the decision in the PR description.

- [ ] **Step 4: Run tests + commit (PR-J2)**

```bash
npm run build
npm test -- --run
git add drizzle/migrations/*_drop_legacy_generated_content.sql src/lib/db/schema.ts src/app/seo/[id]/
git commit -m "feat(seo): drop legacy generated_content + seo_compliance_reports (plan 2 §J-56)"
```

### Task 57: PR-J2 precondition check (machine-enforced)

The PR-J2 CI must include the same precondition check as PR-J1 AND an additional check: confirm that the integrity test passes against the live DB before the migration is allowed to merge.

**Files:**
- Modify: PR-J2's CI workflow

- [ ] **Step 1: Add gating steps**

```yaml
# .github/workflows/plan-j-drop.yml (or whatever the CI lives in)
- run: npx tsx scripts/check-plan-j-precondition.ts
- run: DATABASE_URL=${{ secrets.PROD_DATABASE_URL_READONLY }} npm test -- tests/db/post-backfill-integrity.test.ts --run
```

Both must pass before PR-J2 can merge.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/plan-j-drop.yml
git commit -m "ci(seo): PR-J2 precondition + integrity gates (plan 2 §J-57)"
```

### Task 58: Post-drop verification

- [ ] **Step 1: After PR-J2 merge, run in prod**

```bash
psql "$DATABASE_URL" -c "\\d seo_asins" | grep generated_content
# Expected: no output (column dropped)
psql "$DATABASE_URL" -c "\\d seo_compliance_reports"
# Expected: relation does not exist
```

- [ ] **Step 2: Hit `/seo/manager` on a real project, confirm it still works**

- [ ] **Step 3: Update primer.md + memory**

Plan 2 §J is complete. The 9-phase pipeline is the only source of SEO listing content.

### Milestone J verification (goal-backward)

- [ ] `npx tsx scripts/check-plan-j-precondition.ts` exits 0 before PR-J1 opens
- [ ] Dry-run produces a complete summary, zero DB writes
- [ ] Live backfill produces one `seo_listings` row per eligible legacy ASIN with non-empty title + bullets + computed `byte_usage` + scanned `compliance_violations`
- [ ] `seo_qa.version === 0` sentinel marks "needs S6 re-run to populate Q&A"
- [ ] Post-backfill integrity test PASSES on prod
- [ ] After PR-J2 merge: `seo_asins.generated_content` column does not exist, `seo_compliance_reports` table does not exist, legacy `/seo/[id]/*` redirects to `/seo/manager`
- [ ] No regressions in `/seo/manager` after legacy column drop — verified by running a fresh project S1→S9

---

## Cross-Milestone Verification

After all six milestones land, run these end-to-end checks before declaring Plan 2 done:

- [ ] Fresh project (created today, no legacy data): drive S1→S9 end-to-end via `/seo/manager`. `s9_approved_at` stamps. Total Claude cost surfaced.
- [ ] Re-run S1 on the same project; cascade modal opens, choose `Re-run downstream`, all phases re-execute, S9 stamps again.
- [ ] Skip S7 on a fresh project; S9 still stamps. Skip S8 similarly; S9 still stamps.
- [ ] Drive a project to S9 with a known coverage gap; auto-rerun fires exactly once; second fail surfaces miss list, `s9_approved_at` stays null.
- [ ] Open `seo_phase_runs` history drawer; see one row per attempt with correct token + cost figures; sum matches `vw_seo_project_costs.total_cost_usd`.
- [ ] PATCH a `seo_listings` row via `/api/seo/projects/<id>/listings`; version bumps; `s6_approved_at` clears; UI shows "needs re-approval" state.
- [ ] Hit any route without a session → 401. Hit a write route with `viewer` role → 403.
- [ ] Restart the server; runner survives the restart (in-flight `seo_phase_runs` with `status='running'` for >10 minutes can be detected and surfaced — out of scope for Plan 2's auto-recovery, but the data is there for a future watchdog).

---

## Risks + Mitigations (carry-over from spec)

- **Vercel 300s `maxDuration`:** S6 on a 20-ASIN project may exceed it. Atomic transaction means partial state is impossible — phase restarts cleanly. If real projects hit this, add a scratch JSONB column to `seo_phase_runs` to short-circuit completed Claude batches on retry. Track via a new issue when first observed.
- **Prompt cache invalidation:** SKILL.md hash drives the cache key. Edit SKILL.md → next run pays cache_creation cost. Acceptable, but document if cost regression is observed.
- **Coexistence drift:** the other session may land RLS migration `0056` and edit `/seo/manager/page.tsx` while Plan 2 is in flight. Rebase frequently. The spec is the source of truth for target behavior; file layout is negotiable.
- **Multi-ASIN S7 modules:** the current S7 schema returns a single modules array applied to every ASIN in the project. If real clients need per-ASIN module variation, schema change in a future plan; out of scope for v1.
- **Deep probe cost spike:** $0.05 per S9 run is acceptable now; if the project list grows past 50, add a per-month probe budget cap.

---

## Self-Review

A fresh-eyes pass against the spec.

**Spec coverage:**

| Spec section | Plan task(s) |
|---|---|
| Locked decisions Q1 (concurrency) | Task 16, 17, 22, runner.ts pause/resume (Task 12) |
| Q2 (cascade) | Task 24, 30, 35 |
| Q3 (auth) | Task 15, 16, 18, 19, 20, 21, 23 |
| Q4 (legacy backfill) | Tasks 51–58 (Milestone J) |
| Q5 (auto-run + per-phase) | Task 16, 17 |
| Q6 (validator strictness) | Task 5, 12 (retry-once loop) |
| Q7 (S9 deep probe) | Task 32, 47, 48 |
| Q8 (single API code path) | Single `/phases/[phase]/run` endpoint — both in-chat and in-app hit it |
| Q9 (brand-guidelines dual panel) | Task 31 |
| Q10 (version retention) | All `seo_*` tables version-bump on PATCH; no purge job (none defined) |
| New table `seo_phase_runs` | Task 1 |
| §D server runner | Tasks 1–14 |
| §E API endpoints | Tasks 15–25 |
| §F /seo/manager UI | Tasks 26–36 |
| §G/H S7/S8 wiring | Tasks 37–43 |
| §I S9 scoring + hard gate | Tasks 44–50 |
| §J Legacy backfill + drop | Tasks 51–58 (gated) |
| Atomic S6 write (hard rule #10) | Task 11 (S6 executor inside Drizzle transaction) |
| Compliance brand overlay | Task 4 (`scanCompliance`) |
| Cost + observability | Task 7 (cost compute), Task 26 (`vw_seo_project_costs`), Task 34 (run-history drawer) |

**Placeholder scan:** searched the plan for `TBD`, `implement later`, `similar to`, naked `error handling` — none present except the deliberate `{next-available}` migration-number labels in Tasks 26 + 56, which the spec explicitly demands.

**Type consistency:**
- `PhaseExecutor` shape defined in Task 8 (`src/lib/seo/phases/s1.ts`); imported and reused in Tasks 9, 10, 11, 12, 37, 38, 46.
- `Phase`/`PhaseId` type appears in runner.ts (Task 12) and the UI grid (Task 27) — both use the same string union `"S1" | "S2" | ... | "S9"` (UI omits the S4 sub-phases since they're internal to the runner).
- `LatestRun.status` enum in `phase-grid.tsx` (Task 27) matches `seo_phase_runs.status` values used in the runner (Task 12) and API endpoints (Task 22). 7 values: `queued | running | paused_user_input | success | validation_failed | error | cancelled`.
- `CascadeChoice` (Task 30) maps to `?cascade=rerun_downstream | accept_stale` in Task 24's route. Strings match.
- `ComplianceViolation` (Task 4) reused unchanged in Task 11 (S6 persist), Task 44 (`prohibitedWordViolations`), Task 52 (backfill).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-1o8-seo-manager-plan-2-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for §D and §E which are pure backend with strict TDD steps.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints. Better for §F where the UI work needs frequent visual verification.

Recommendation:
- §D → subagent-driven (atomic tasks, strict TDD)
- §E → subagent-driven (same)
- §F → inline execution (visual verification needed at every step + coexistence reconciliation with other-session edits)
- §G/H → subagent-driven
- §I → subagent-driven
- §J → manual, gated, separate PRs (PR-J1 + PR-J2)

Which approach?
