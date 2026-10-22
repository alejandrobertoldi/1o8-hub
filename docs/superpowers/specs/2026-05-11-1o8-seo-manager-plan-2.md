# 1o8 SEO Manager — Plan 2 Spec (Runtime Layer)

**Date:** 2026-05-11
**Status:** Brainstorm complete, awaiting user spec review before `/writing-plans`
**Predecessor:** Plan 1 (PR #23, merged as `8ffefb3` on 2026-05-11)
**Plan 1 spec:** `docs/superpowers/specs/2026-05-06-1o8-seo-manager-design.md`
**Plan 1 plan:** `docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md`
**Source process doc:** `AMAZON_SEO_GPT_v5_COMPLETE.md`

## Goal

Make the 9-phase pipeline actually run. Plan 1 delivered the typed-table schema (`seo_listings`, `seo_aplus_plans`, `seo_images`, `seo_qa`, `seo_passage_map`, `seo_scores`), the canonical `.claude/skills/1o8-seo-manager/` tree (SKILL.md + 9 phase files + 4 rubrics + schema.json), and `loadSkill()`. Plan 2 wires the **server-side runner** that imports the skill, calls Claude, validates against `schema.json`, persists transactionally, and exposes a `/seo/manager` UI that orchestrates phases per project. End state: a user can drive a fresh project from S1 through S9 in the app, hit the 80/75 hard gate, and stamp `s9_approved_at`. Legacy `/seo/[id]/*` route remains untouched until the §J backfill ships.

## Locked Decisions (from brainstorm Q1-Q10)

| # | Decision | Choice |
|---|---|---|
| Q1 | Runner concurrency model | **B — Background job table** (`seo_phase_runs`) + Vercel `waitUntil` + UI polling. Routes enqueue + return 202 with `run_id`; runner persists token usage and final status. |
| Q2 | Re-run cascade semantics | **A — Stale preserved, tri-state per-phase button** ("Re-run downstream / Accept stale / Cancel"). No data wiped; UI shows stale-badge where `approved_at < downstream.approved_at`. |
| Q3 | API auth model | **Routes require NextAuth session** (existing pattern, RBAC-scoped). **Runner uses Supabase service role** for DB writes (RLS bypass). RLS migration `0056` (owned by another session) lands separately; runner-DB connection already uses service role. |
| Q4 | Legacy backfill safety | **(a)** §J migration number = *dynamic, "next available at write time"* — locked label is `drop_legacy_generated_content.sql`, number assigned at PR time. **(b)** Backfill scope = projects with `current_phase ∈ {S6, S7, S8, S9}` by default, with opt-in override per-project. **(c)** Re-derivable fields (`byte_usage`, `compliance_violations`) computed on backfill; unknowable fields (passage_map cross-refs, A+ images) left empty with `version = 0` sentinel. |
| Q5 | Auto-run vs step-by-step | **C — Both.** `POST /api/seo/projects/[id]/run` runs the full pipeline (auto-pause at S4 Rufus). `POST /api/seo/projects/[id]/phases/[phase]/run` advances exactly one phase. UI surfaces both. |
| Q6 | Validator strictness | **(a)** On 2nd validation failure, persist partial output with `validation_errors[]` populated; phase approval button stays gated until errors clear. **(b)** Validators are Zod schemas, generated from `schema.json` at build time via a small inline generator (no full `json-schema-to-zod` dep). |
| Q7 | S9 deep probe | **Opt-in checkbox** on S9 panel ("Run deep probe — adds ~$0.05 in Claude cost"). 5 canonical Rufus questions only. Sonnet 4.6. Transcript persisted to `seo_scores.probe_transcript`. |
| Q8 | In-chat vs in-app code path | **Single code path through API.** Both modes call `/api/seo/projects/{id}/phases/{phase}/run`. In-app UI uses fetch; in-chat skill calls API via the user's authenticated session. Server-side runner is one function: `runPhase(projectId, phase)`. |
| Q9 | Brand-guidelines editor | **Dual panel in S1 column.** Top = read-only mirror of `brand_guidelines_lock` (sourced from `client_brand_guidelines` via `renderBrandGuidelinesMd()`) with a "Refresh from client bible" button. Bottom = editable textarea over `brand_guidelines_notes`. Notes edits do NOT cascade-invalidate downstream phases; lock refresh does. |
| Q10 | Version retention | **Keep all versions forever.** UI shows latest by default with a "View history" link per artifact. No purge job. Storage is cheap; audit trail is the deliverable. |

## Architecture

**Single source of truth** is still `.claude/skills/1o8-seo-manager/SKILL.md`. Plan 2 adds three layers on top:

```
┌─ /seo/manager (UI) ─────────────────────────────────────┐
│   9-column phase grid · cascade modal · S9 score panel  │
│   brand-guidelines dual panel · run-history drawer      │
└───────────────────────┬─────────────────────────────────┘
                        │ fetch (NextAuth session)
┌───────────────────────▼─────────────────────────────────┐
│ API routes (/api/seo/projects/[id]/...)                 │
│  - POST run            (auto-run all phases)            │
│  - POST phases/[p]/run (single phase)                   │
│  - GET  runs           (job status, polling)            │
│  - GET  listings|aplus|images|qa|passage-map|scores     │
│  - POST phases/[p]/approve · skip · cancel-run          │
└───────────────────────┬─────────────────────────────────┘
                        │ runPhase(projectId, phase)
┌───────────────────────▼─────────────────────────────────┐
│ src/lib/seo/runner.ts                                   │
│   1. loadSkill()  →  src/lib/seo/skill-loader.ts        │
│   2. build phase context (read project state)           │
│   3. fill slots, call Anthropic SDK (Sonnet 4.6)        │
│   4. validate output (Zod from schema.json)             │
│   5. retry-once on validation fail                      │
│   6. persist in PG transaction (Drizzle)                │
│   7. update seo_phase_runs row + cost                   │
└───────────────────────┬─────────────────────────────────┘
                        │ uses
                  src/lib/seo/phases/s{1..9}.ts
                  src/lib/seo/validators.ts
                  src/lib/seo/scoring.ts (S9)
                  src/lib/seo/compliance.ts
                  src/lib/seo/byte-budget.ts
```

## Schema Delta (Plan 2)

Only one new table. All other Plan 2 work uses the typed tables Plan 1 already shipped.

### New table: `seo_phase_runs`

Per-execution audit log + cost tracking + status machine.

```sql
CREATE TABLE seo_phase_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES seo_projects(id) ON DELETE CASCADE,
  phase varchar(5) NOT NULL,            -- 'S1'..'S9' (plus 'S4P1','S4P2','S4P3' for sub-phases)
  status varchar(24) NOT NULL,          -- 'queued' | 'running' | 'paused_user_input' |
                                        -- 'success' | 'validation_failed' | 'error' | 'cancelled'
  trigger varchar(16) NOT NULL,         -- 'manual' | 'auto_run' | 'cascade_rerun' | 's9_auto_rerun'
  attempt smallint NOT NULL DEFAULT 1,
  parent_run_id uuid REFERENCES seo_phase_runs(id) ON DELETE SET NULL,

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,

  claude_input_tokens integer NOT NULL DEFAULT 0,
  claude_output_tokens integer NOT NULL DEFAULT 0,
  claude_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  claude_model varchar(64),

  output_artifact_version integer,      -- version written to seo_listings/etc on success
  validation_errors jsonb DEFAULT '[]'::jsonb,
  error_message text,

  triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_seo_phase_runs_project ON seo_phase_runs(project_id);
CREATE INDEX idx_seo_phase_runs_phase ON seo_phase_runs(project_id, phase, started_at DESC);
CREATE INDEX idx_seo_phase_runs_status ON seo_phase_runs(status) WHERE status IN ('queued','running','paused_user_input');
```

No other schema changes. Migration number assigned at implementation time (next available after `0056`).

## Milestones

Plan 2 ships in five independently-testable milestones. Each leaves the repo type-checked + test-passing. The natural PR boundary is end of milestone, but bundled merges are allowed.

| Milestone | Focus | Ships when |
|---|---|---|
| **D — Server runner** | `runner.ts`, 9 phase executors, validators, cost tracking, `seo_phase_runs` migration | `runPhase('S1')` on a fixture project produces a valid `seo_asins.baseline_analysis` write + run row, end-to-end |
| **E — API endpoints** | All routes under `/api/seo/projects/[id]/{run,phases,runs,listings,aplus,images,qa,passage-map,scores}` | Postman/curl can drive a project S1→S6 with auth, validation errors surface as 4xx with structured body |
| **F — /seo/manager UI** | 9-column phase grid + drawer + cascade modal + brand-guidelines dual panel + run-history viewer | An agency operator can run a project S1→S9 in the browser, see cost per phase, view re-run history |
| **G/H — S7/S8 wiring** | Phase executors + UI columns + Run/Skip/Decide-later state + validators (7 modules, premium_qa @ pos 7, 9 images MAIN+PT01-PT08) | An S7-approved + S8-approved project shows full A+ plan + 9 image rows; an S7-skipped project sets `s7_skipped=true` and S9 passes its gate |
| **I — S9 scoring + hard gate** | `scoring.ts` engine, opt-in probe, single auto-rerun loop, S9 panel with coverage breakdown | A project that fails S9 first try gets one S6 re-run with miss list, then either stamps `s9_approved_at` or surfaces to checkpoint review |
| **J — Legacy backfill + drop** | `scripts/backfill-legacy-seo-content.ts` + `N_drop_legacy_generated_content.sql` | **GATE:** at least one production project on the new schema has `s9_approved_at IS NOT NULL`. Backfill runs project-by-project with dry-run mode. Drop migration executed last. |

## §D — Server Runner

**Entry points:**
- `runPhase(projectId, phase, opts?): Promise<PhaseRunResult>` — single phase
- `runProject(projectId, opts?): Promise<ProjectRunResult>` — auto-run S1→S9, auto-pause at S4 Phase 1 + Phase 2 (waiting for human Rufus paste-back)
- Both create `seo_phase_runs` rows up-front, transition status through the machine, persist token + cost on every Claude call

**Per-phase executor contract** (`src/lib/seo/phases/s{1..9}.ts`):
```ts
export interface PhaseExecutor {
  phase: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9'
  loadContext(projectId: string): Promise<PhaseContext>   // reads upstream tables
  fillSlots(ctx: PhaseContext, skill: LoadedSkill): SlotMap
  callClaude(prompt: string, opts: ClaudeCallOpts): Promise<ClaudeResponse>
  validate(output: unknown): { ok: true; data: T } | { ok: false; errors: ValidationError[] }
  persist(tx: PgTx, projectId: string, output: T): Promise<{ version: number }>
}
```

Runner orchestrates: `loadContext → fillSlots → callClaude → validate → (retry once) → persist`. The persist step is wrapped in a Drizzle transaction so partial writes can never escape (S6 is the canonical case — `seo_listings + seo_qa + seo_aplus_plans` headers + `seo_passage_map` written together or not at all).

**Claude SDK integration** (`src/lib/seo/claude-client.ts`):
- Anthropic SDK with **prompt caching enabled** on the system prompt (SKILL.md body) and per-phase prompt skeleton. SKILL.md + rubrics are ~5K tokens of static context — caching slashes per-run cost.
- Default model: `claude-sonnet-4-6`. S9 probe uses same. S1 baseline + S3 review classification optionally route to `claude-haiku-4-5-20251001` (controlled by `SEO_PHASE_MODEL_OVERRIDE` env, default = Sonnet everywhere for correctness).
- Per-call we record `usage.input_tokens`, `usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens`, `usage.output_tokens` and compute `claude_cost_usd` against the model's published rates.

**Validators** (`src/lib/seo/validators.ts`):
- At module init, parse `.claude/skills/1o8-seo-manager/schema.json` and synthesize Zod schemas for each phase output. Char ranges, byte ranges, fixed-length arrays, enum strings — all enforced.
- Each phase calls `validate(output)` after Claude returns. First fail → retry once with `validation_errors` appended to the prompt. Second fail → persist with `validation_errors` populated, set `seo_phase_runs.status = 'validation_failed'`. Phase approval button in UI stays disabled until errors clear (either by manual edit or by re-run).

**S4 pause/resume:**
- Entering S4 Phase 1, runner inserts a row with `status='paused_user_input'`, surfaces the 5 immutable canonical questions to the UI, halts.
- User pastes 5 Rufus responses → UI POSTs to `/api/seo/projects/[id]/phases/S4/resume` with `{ phase: 'S4P1', responses: string[] }` → runner resumes, persists, transitions to S4 Phase 2 (same pause pattern with 10-15 generated questions), then S4 Phase 3 runs autonomously.

## §E — API Endpoints

All routes are server-only Next.js App Router handlers under `src/app/api/seo/projects/[id]/`. All require an authed NextAuth session; role check: `admin | editor` can write, `viewer` read-only.

| Route | Method | Purpose |
|---|---|---|
| `/run` | POST | Auto-run S1→S9. Returns `{ run_id, status: 'queued', first_phase: 'S1' }`. Background work via `waitUntil`. |
| `/phases/[phase]/run` | POST | Run single phase. Returns `{ run_id, status }`. |
| `/phases/[phase]/approve` | POST | Stamp `s{N}_approved_at`. Refuses if `validation_errors` non-empty or if cascade-stale upstream exists. |
| `/phases/[phase]/skip` | POST | S7/S8 only. Sets `s{7,8}_skipped=true`. Counts as "decided" for S9 gate. |
| `/phases/S4/resume` | POST | Submit Rufus paste-back to unblock a paused S4 sub-phase. |
| `/phases/[phase]/cancel-run` | POST | Abort an in-flight run. Sets `status='cancelled'` on the latest `seo_phase_runs` row. |
| `/runs` | GET | Query string `?phase=&limit=&since=`. Returns recent runs for polling + history. |
| `/listings` `/aplus` `/images` `/qa` `/passage-map` `/scores` | GET | Read latest version (default) or `?version=N`. Returns the typed-table row(s). |
| `/listings` etc. | PATCH | Manual edit (admin/editor). Bumps version, re-validates, sets phase to "needs re-approval". |

**Auth model:** All routes wrap `auth()` (NextAuth v5) and check `session.user.role`. Service-role DB connection is server-only via the cached Drizzle client in `src/lib/db/index.ts` — no client ever sees the service key.

**Error contract:** Validation failures return `400` with `{ error: 'validation_failed', errors: [{ field, message, expected, got }] }`. Hard-gate failures (S9 won't approve) return `409` with miss list. Cascade conflicts return `409` with affected-downstream summary.

## §F — /seo/manager UI

**Layout:**
- Page header: project picker (dropdown of `seo_projects` rows scoped to the current user's clients), "Run all" button, AI cost ticker (reads from the in-progress `ai-cost-tracker.tsx` component — coexists with the other session's edits; reads a new view `vw_seo_project_costs` defined as `SELECT project_id, SUM(claude_cost_usd) AS total_cost_usd, MAX(finished_at) AS last_run_at FROM seo_phase_runs WHERE status='success' GROUP BY project_id`).
- 9-column phase grid. Each column = 1 phase, sorted S1→S9. Per-column UI:
  - Status pill (queued / running / paused / success / validation_failed / error / cancelled / skipped / pending_decision)
  - Last run timestamp + cost
  - Action buttons: **Run** (or **Re-run**), **Approve** (gated), **Skip** (S7/S8 only), **History** (opens run-history drawer)
  - Stale badge if any upstream phase was re-run after this phase's `approved_at`
- Side drawer (opens on column click): full phase detail — input slots preview, latest output (typed-table contents), validation errors, run history, manual-edit (PATCH) modal.
- Cascade modal: triggered when user clicks "Re-run" on a non-leaf phase. Lists every downstream artifact that will become stale. Three buttons: **Re-run this phase + auto-cascade through approved downstream**, **Re-run this phase only (downstream stays approved but flagged stale)**, **Cancel**.

**S1 column extras (brand guidelines dual panel):**
- Top sub-panel: read-only render of `seo_projects.brand_guidelines_lock` (markdown via `renderBrandGuidelinesMd()`). Button: "Refresh from client bible" → calls `/api/seo/projects/[id]/brand-guidelines/refresh` (already exists, Plan 1 shipped it).
- Bottom sub-panel: editable textarea over `seo_projects.brand_guidelines_notes` (text column from main, line 674 of schema). Auto-save on blur. Edits do NOT cascade-invalidate downstream phases (notes are advisory).

**S9 column extras (score panel):**
- Top: Rufus % | COSMO % | overall grade (A-F) — large numerals
- Middle: 4 sub-checks (canonical Rufus coverage, COSMO density, byte budgets, compliance) with green/red
- Bottom: "Run deep probe" checkbox + cost estimate. If checked on next run, scoring engine calls Claude separately with the canonical 5 questions to simulate Rufus answering from listing alone.
- Miss list (when failed): expandable section listing `missing_rufus_questions` and `missing_cosmo_triples` with anchor links into S6's output for manual fix or re-run.

**S7/S8 columns:** if status is `pending_decision`, the column shows three buttons of equal weight — **Run**, **Skip**, **Decide later** — and a yellow border alerting the user that S9 is blocked until decided.

**Coexistence:** the other session is concurrently editing `src/app/seo/manager/page.tsx`, `src/components/seo/project-shell.tsx`, and `src/components/seo/ai-cost-tracker.tsx`. Plan 2's implementation plan will reconcile against whatever those land as — the spec defines target behavior, not file structure.

## §G/§H — S7 + S8 Wiring

Most of the work is already declared in `phases/s7-aplus.md` and `phases/s8-images.md`. Plan 2 adds:

- `src/lib/seo/phases/s7.ts` — load S6 listing + Q&A subset + COSMO triples, call Claude, validate 7-module structure (position 7 = `premium_qa`, max 1 `comparison_table_*`), persist to `seo_aplus_plans.modules`.
- `src/lib/seo/phases/s8.ts` — load S6 listing + S4 image strategy + S5 COSMO triples, call Claude, validate 9 image rows with fixed technical names (MAIN + PT01..PT08), persist to `seo_images`.
- Validators import `schema.json.tables.seo_aplus_plans` and `seo_images` — char ranges + structural constraints all derive from there.
- UI for S7: drawer shows 7-module preview with cosmo_relationship tags + image-slot placeholders.
- UI for S8: drawer shows 9-row grid with technical_name, image_type, alt_text length, overlay_text length, AI prompt preview.

## §I — S9 Scoring Engine

`src/lib/seo/scoring.ts` exports `scoreProject(projectId, opts: { probe: boolean }): Promise<seoScoresInsertPayload>`.

**Hard gate** (from `phases/s9-score.md`):
1. `rufus_coverage_pct >= 80`
2. `cosmo_coverage_pct >= 75`
3. `prohibited_word_violations.length === 0` (excluding bypassed)
4. All `byte_budget_status[*].ok === true`
5. `cosmo_relationship_categories_evaluated.length === 16`
6. S7 + S8 each have `(s{N}_approved_at IS NOT NULL OR s{N}_skipped = true)`

**Auto-rerun loop:** if any gate fails on first S9 run, runner increments `seo_scores.rerun_count`, queues an `S6` re-run tagged `trigger='s9_auto_rerun'`, passes `missing_rufus_questions[]` + `missing_cosmo_triples[]` into S6's slots, re-scores. **Exactly one re-run.** Second fail surfaces to UI with the miss list and a "Manual fix required" badge — `s9_approved_at` stays null.

**Deep probe (opt-in):**
- Triggered by `?probe=true` query param or the S9 panel checkbox
- Calls Claude separately with: the final listing text (title + bullets + description) + the 5 canonical Rufus question types from `rubrics/rufus-coverage.md` + a system prompt instructing Claude to roleplay as Rufus answering only from the listing
- Transcript persisted to `seo_scores.probe_transcript`
- Probe results inform but do NOT change the hard gate (gate is structural; probe is qualitative)

**Persistence:** `seo_scores` is **insert-only** per run (no upsert). `score_version` bumps. UI shows latest by default.

## §J — Legacy Backfill (gated, runs last)

**Gate condition (hard, machine-checked at PR time):**
```sql
SELECT COUNT(*) FROM seo_projects WHERE s9_approved_at IS NOT NULL;
-- Must return >= 1 before §J ships.
```

If the count is 0, §J PR is blocked. The spec is explicit: §J never lands on a hypothetical pass — it lands only after a real production project has cleared S9 end-to-end on the new schema.

**Backfill script:** `scripts/backfill-legacy-seo-content.ts`
- Reads `seo_asins` rows with `generated_content IS NOT NULL` and `seo_projects.current_phase ∈ ('S6','S7','S8','S9')`
- Per ASIN, maps legacy fields to new tables:
  - `generated_content.title` → `seo_listings.title`
  - `generated_content.detailed_bullets / concise_bullets / content_bullets / key_features` → `seo_listings.bullets`
  - `generated_content.description` → `seo_listings.product_description`
  - `generated_content.search_terms_*` → merged into `seo_listings.backend_search_terms` (joined by space, capped to 500 bytes)
  - **Re-derives** `byte_usage` (real char/byte counts) and `compliance_violations` (re-runs the prohibited-word scanner from `src/lib/seo/prompts/amazon-prohibited-words.ts`)
  - `seo_qa` written with empty `pairs[]` and `version=0` sentinel — flagged in UI as "legacy backfilled — re-run S6 to populate Q&A"
  - `seo_passage_map` written with empty `passages[]` and `version=0` — same flag
  - `seo_aplus_plans` not written by backfill (A+ requires S7 explicit run)
  - `seo_images` not written by backfill (images require S8 explicit run)
- **Modes:**
  - `--dry-run` (default) — prints would-be writes, no DB changes
  - `--project-id <uuid>` — backfill a single project
  - `--all-eligible` — backfill all eligible projects (requires `--confirm` flag and an interactive y/N prompt)

**Drop migration:** `drizzle/migrations/{next-number}_drop_legacy_generated_content.sql`
```sql
BEGIN;
ALTER TABLE seo_asins DROP COLUMN generated_content;
DROP TABLE seo_compliance_reports;
COMMIT;
```
Runs ONLY after backfill is confirmed clean (separate PR after backfill verification on prod data).

**Verification test:** `tests/db/post-backfill-integrity.test.ts`
- Asserts: for every `seo_asins` row that had non-null `generated_content` before backfill, a corresponding `seo_listings` row exists with non-empty `title` and non-empty `bullets.detailed`.
- Asserts: `byte_usage.title.ok` and `byte_usage.description.ok` are computed (not null).
- Runs as part of the §J PR's CI.

## Cost + Observability

- Every Claude call records token usage and dollar cost on `seo_phase_runs`. Per-project total surfaces in the AI cost tracker (existing component, coexisting edits in `src/components/seo/ai-cost-tracker.tsx`).
- Per-phase median cost is logged for cost regression alerting (out of scope for Plan 2, but the data is there).
- Failed runs preserve `error_message` + `validation_errors` for postmortem.
- Run history per project visible in UI via the run-history drawer (paginated, last 50 by default).

## Compliance + Brand Guidelines Overlay

- Prohibited-word scan runs on every S6 write (in `compliance.ts`, exists by Plan 1's prompt module). Bypassed violations require explicit user override stored in `seo_listings.compliance_violations[].bypassed === true`.
- Brand `words_to_avoid` overlays the prohibited list at scan time (`seo_projects.brand_guidelines_lock.words_to_avoid`). Amazon §6 prohibited list always wins on conflict — brand-allowed words can still be blocked if they appear in v5 §6.
- Auto-corrections (treats→supports, etc.) apply at write time; the original word is preserved in `compliance_violations[].word` for audit.

## Failure Modes + UX

| Failure | Where | UI surface |
|---|---|---|
| Claude API timeout / 5xx | Runner | `seo_phase_runs.error_message`, status=`error`, retry button in column |
| Schema validation fail (1st) | Validator | Silent retry once with errors appended to prompt |
| Schema validation fail (2nd) | Validator | Partial write with `validation_errors[]`, status=`validation_failed`, approval gated |
| S4 Rufus paste timeout | User | `status='paused_user_input'` indefinitely; UI prompts; project resumable from any device |
| S9 hard-gate fail (1st) | Scoring | Auto-S6 re-run with miss list, `rerun_count++` |
| S9 hard-gate fail (2nd) | Scoring | Miss list visible, manual fix required, `s9_approved_at` stays null |
| Cascade conflict (re-run upstream with approved downstream) | API | 409 with downstream summary, UI cascade modal |
| Compliance bypass requested | UI | Per-field override checkbox, recorded on `compliance_violations[].bypassed=true` |
| Backfill ASIN unmappable | Script | Logged + skipped, summary report at end, dry-run reveals before commit |

## Out of Scope (Plan 2)

- Multi-account / multi-team RBAC beyond the existing 5-role NextAuth setup (admin/editor/viewer/client/pending)
- Real-time collaboration (two users editing same project simultaneously) — last-write-wins is acceptable; PATCH endpoints bump `version` so conflicting writes don't overwrite each other silently
- Export to Amazon flat file (CSV/XLSX) — separate work, may be a Plan 3 if needed
- Programmatic A+ image generation (Plan 2 produces AI prompts; humans or a separate pipeline render the images)
- Migration of legacy projects' S1-S5 data — Plan 2 §J only backfills S6 outputs because earlier phases were not durably stored in the legacy schema in a shape that maps cleanly. Legacy S1-S5 stays read-only on the legacy `/seo/[id]/*` route.

## Open Questions / Known Risks

- **RLS migration `0056` is in flight in another session.** Plan 2's runner uses service role + DB-side bypass, but if the other session changes the RLS policies after Plan 2 lands, runner reads from the API (which is session-scoped) may need a session-aware Drizzle client. Spec flags this for reconciliation in the implementation plan.
- **Coexistence with parallel `/seo/manager` edits.** The other session is editing `src/app/seo/manager/page.tsx`, `src/components/seo/project-shell.tsx`, `ai-cost-tracker.tsx`. Spec defines target behavior; implementation plan must rebase against whatever those land as.
- **Vercel `maxDuration` cap vs S6 atomicity.** Pro plan = 300s. S6 on a 20-ASIN project may exceed that. S6's final PG write is atomic by contract (SKILL.md hard rule #10) — `seo_listings + seo_qa + seo_aplus_plans` headers + `seo_passage_map` go in together or not at all. So mid-phase timeout means the whole phase restarts (no partial DB state to recover). Two mitigations: **(a)** stash the in-flight Claude batch outputs (titles, bullets, etc.) on `seo_phase_runs` as a scratch column so on retry the runner can short-circuit completed Claude calls and pick up from the next batch — Claude tokens are the expensive part, not DB writes; **(b)** if even that's insufficient, fall back to Inngest or a dedicated worker (out of scope for v1, but `seo_phase_runs` already supports it). Phases other than S6 are short enough that a single 300s budget covers them.
- **Prompt-cache invalidation on SKILL.md edits.** If a developer edits SKILL.md or a phase file, the Anthropic prompt cache must invalidate. Mitigation: hash the loaded skill body + per-phase file into a cache key suffix; runner sends `cache_control: { type: 'ephemeral' }` with a TTL.
- **Backfill on multi-version projects.** A project with `seo_listings.version > 1` already on the new schema must not be overwritten by backfill. Script checks for existing typed-table rows and skips/aborts per project.

## Next Steps

1. User reviews this spec (this file).
2. On approval, run `/writing-plans` to produce the Plan 2 implementation plan. Plan should sequence: §D runner → §E APIs → §F UI → §G/H S7/S8 → §I S9 → §J backfill (last, gated).
3. Implementation plan is a separate later artifact — do **not** write it in the spec session.

## Reference

- Plan 1 spec: `docs/superpowers/specs/2026-05-06-1o8-seo-manager-design.md`
- Plan 1 plan: `docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md`
- Plan 1 merge commit: `8ffefb3` (PR #23, merged 2026-05-11)
- Schema (merged): `src/lib/db/schema.ts:660-1230`
- Skill tree: `.claude/skills/1o8-seo-manager/`
- Skill loader: `src/lib/seo/skill-loader.ts`
- Phase 1 migration: `drizzle/migrations/0054_seo_manager_phase_overhaul.sql`
- Legacy route (untouched): `src/app/seo/[id]/*`
- Existing keyword-research skill (in-chat only, separate): `.claude/skills/keyword-research/`
- Anthropic SDK + prompt caching: see `claude-api` skill in `.claude/CLAUDE.md`
- Source process doc: `AMAZON_SEO_GPT_v5_COMPLETE.md`
