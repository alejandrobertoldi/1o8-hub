# Handoff: Attributes Unification — Tasks 10-11 done, resume at Task 12

**Date:** 2026-05-04
**Branch:** `feat/attributes-unification` in worktree `/Users/manu/1o8Hub/.worktrees/attributes-unification`
**Plan:** [docs/superpowers/plans/2026-05-01-attributes-table-unification-plan.md](../plans/2026-05-01-attributes-table-unification-plan.md)
**Reason for handoff:** Context depleted (27% → ~10% remaining after Tasks 10 + 11).

## What's done in this session (committed on branch)

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| 10. Rewrite `upsertCategoryDefinitions` | ✅ done + 2-stage reviewed (APPROVED_WITH_NITS) | `b9d504e` | First implementer hit a stream-idle timeout after Step 1 (matcher wrapper); second implementer picked up from Step 2 with the wrapper already uncommitted in the working tree. Test suite now 191/191 (was 190; +1 new SQL-chunk-substring assertion test). |
| 11. Audit endpoint reads `category_meta` | ✅ done + 2-stage reviewed (APPROVED_WITH_NITS) | `812cd75` | Single-file diff +27/-16. Used the `bibleFieldMatch` spread shim so the per-product audit loop (lines 158-218) was untouched. Manual `/api/attributes/audit` parity check deferred to Task 17 acceptance. |

Branch tip: `812cd75`. Build green. `npx vitest run src/lib`: 24 files / 191 tests pass.

## Important nits raised by reviewers (non-blocking, worth tracking)

These were flagged APPROVED_WITH_NITS — not blockers, but accumulate them for a final cleanup pass or for Task 17 acceptance.

1. **`upsert.ts:143-144` uses `${JSON.stringify(entry)}::jsonb` antipattern** — already known from primer (also in `scripts/import-aac.ts:82,90`). Plan source was verbatim; functionally fine for current entry shape. Convert to project-standard JSON binding helper in a future cleanup.
2. **`upsert.test.ts` two pre-existing `.catch()`-swallow tests are misleading no-ops** post-Task-10 — they only assert function-shape because mocks throw immediately. Worth deleting in a follow-up.
3. **No test for the unmatched-field path in upsert.ts** (`db.insert(clrUnmatchedFields)`) — plan didn't require, but adding one would prevent silent regression of the new audit-log behavior.
4. **`audit/route.ts:83` types `requirement` as `sql<string>` but the JSONB extract returns `null`** when an attribute's `category_meta` has the (mp, pt) key but no `requirement` field (e.g. isKey-only matches). `AuditGap.requirement` (interface field, line 16) typed `string` will receive `null` at runtime — latent crash risk if any consumer does `.toLowerCase()` etc. Fix: widen interface OR `COALESCE(..., '')` in SQL.
5. **`audit/route.ts:84-94` COALESCE asymmetry is uncommented** — `isKey` is COALESCE'd, `requirement` is not. A drive-by reader will think it's a bug. Add a one-line comment explaining intent.

## Resume point: Task 12 (medium-large)

**Plan section:** `### Task 12: Migrate the remaining categoryAttributes readers` (around plan line 1530).

This is the **biggest remaining task** — the plan's own File Structure note says 5+ routes consume `categoryAttributes` rows. Per Task 11 setting the pattern (`category_meta` JSONB extraction with `?` jsonb-key-exists guards + COALESCE for nullable JSONB extracts + spread-shim for `bibleFieldMatch`), this task applies the same migration to each remaining reader.

**Likely complexity:** medium-large. ~5 files, similar shape but each needs its own caller-specific WHERE + select tweaks.

**Recommended approach:** Pre-grep ALL `categoryAttributes` callers before drafting the brief. The handoff from 2026-05-03 noted "5+ routes per plan File Structure" — verify the actual list. There may also be UI components reading the response shapes and they don't need to change (still get same JSON shape post-shim).

**Tasks remaining (6 of 17):**

| Task | Likely scope | Notes |
|------|--------------|-------|
| 12 | medium-large | Migrate remaining categoryAttributes readers (5+ files per File Structure). Apply Task 11 pattern. |
| 13 | small | Extend `syncAttributes()` to read 4 new BQ columns |
| 14 | small | `parseVariationTheme` + `isVariationAttribute` helpers |
| 15 | small | Replace UI 'Variety Pack' string-match with `master.is_vp` |
| 16 | medium | Drop `category_attributes` (separate migration `0048_drop_category_attributes.sql` + runner + Drizzle schema). Also implicitly: delete the `bibleFieldMatch` shim used in Tasks 10-11. |
| 17 | verification | Final acceptance checklist (no code). Manual API parity check for `/api/attributes/audit` lives here. |

## Branch state

- Branch tip: `812cd75`
- Worktree env: `.env.local` symlinked, node_modules installed
- DB direct port 5432 for DDL via postgres.js (`.replace(":6543/", ":5432/")`); pooler 6543 for app
- psql NOT installed — use postgres.js via tsx for any DB queries
- `npm run build` GREEN
- `npx vitest run src/lib` GREEN (191/191 across 24 files)
- `graphify-out/` is dirty (post-edit hook regen) — never staged

## How to continue (copy-paste prompt for fresh session)

```
Working in /Users/manu/1o8Hub/.worktrees/attributes-unification on branch
feat/attributes-unification. Resume executing the 17-task plan at
docs/superpowers/plans/2026-05-01-attributes-table-unification-plan.md
using superpowers:subagent-driven-development.

Tasks 1-11 are complete and reviewed. Read this handoff first:
docs/superpowers/handoffs/2026-05-04-attributes-unification-tasks-10-11-done.md

Resume at Task 12: Migrate remaining categoryAttributes readers (medium-large
scope, ~5 files). Apply the same pattern Task 11 established for the audit
route.

Worktree env: .env.local symlinked, node_modules installed. DB direct port
5432 for DDL via postgres.js (.replace(":6543/", ":5432/")); pooler 6543 for
app. psql NOT installed — use postgres.js via tsx for any DB queries.
Build is currently green at branch tip 812cd75.

Patterns to keep applying:
- Two-stage review per task (spec compliance first, then code quality)
- Implementer briefs MUST include verbatim plan source AND a pre-grepped
  list of files in scope so the implementer doesn't need to discover them
- Watch for plan bugs / off-spec callers (Tasks 8, 9 had real plan bugs)
- Implementers are authorized to fix plan issues mid-execution provided
  the deviation is documented in commits + final reports
- Task 12 is BIG — consider breaking it into per-file sub-tasks if the
  brief gets unwieldy. Each file is roughly the size of Task 11.

Open primer-level concerns (background, not blocking unification):
- Sales WIP stash@{1} on claude/youthful-bhaskara
- Campaign Manager handoff docs/superpowers/handoffs/2026-04-28-campaign-manager-section.md
- ALR 413 risk at src/components/onboarding/alr-link-phase.tsx:58
- scripts/import-aac.ts:82,90 has ${JSON.stringify(...)}::jsonb antipattern
  on raw_data — same antipattern landed in Task 10 (upsert.ts:143-144).
  Worth a single follow-up commit converting both call sites to the project
  standard JSON binding helper.
```

## Lessons learned (process, applies to future sessions)

1. **Long implementer prompts can hit stream idle timeouts** — Task 10's first dispatch ran 7+ minutes through 22 tool calls before timing out. The agent had completed Step 1 only. Recovery: dispatch a fresh continuation agent with "Step 1 already done in working tree (uncommitted)" and the remaining plan source. Cost: one extra implementer round-trip but no work lost.

2. **Spec reviewers continue to be cheap and high-signal** — Task 11 spec review was 23 seconds and confirmed every line. Don't skip even when tasks are "obvious mechanical migrations".

3. **Code quality reviewers find latent type-honesty issues** — Task 11's "`sql<string>` is a type lie" finding is the kind of thing only an independent re-read catches. Worth running every time.

4. **Task size discipline:** Task 11 (single file, ~15 lines of replacement, plan-verbatim SQL) was a perfect "small" task and fit comfortably in remaining context. Task 10 (single file but dense SQL + new test pattern) was at the upper bound. Task 12 (5+ files) should be split if it lands in a context-constrained session.

5. **Manual integration steps (Step 5 in Task 11) are correctly deferrable to Task 17** — don't burn an implementer dispatch on something that requires `curl` against a running dev server.

## Files touched in this session (committed)

- Task 10 (`b9d504e`): src/lib/category-attribute-matcher.ts, src/lib/category-definitions/upsert.{ts,test.ts}
- Task 11 (`812cd75`): src/app/api/attributes/audit/route.ts

Commit this handoff before exiting if you'd like it tracked. Otherwise just stash/discard.
