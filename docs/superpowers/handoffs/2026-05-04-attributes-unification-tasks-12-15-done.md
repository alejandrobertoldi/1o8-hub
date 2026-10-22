# Handoff: Attributes Unification — Tasks 12-15 done, resume at Task 16

**Date:** 2026-05-04
**Branch:** `feat/attributes-unification` in worktree `/Users/manu/1o8Hub/.worktrees/attributes-unification`
**Plan:** [docs/superpowers/plans/2026-05-01-attributes-table-unification-plan.md](../plans/2026-05-01-attributes-table-unification-plan.md)
**Reason for handoff:** Tasks 16 + 17 deferred to a fresh session — Task 16 includes a destructive DDL operation (`DROP TABLE category_attributes`) and a meaningful refactor of `template-sheet-builder.ts` + its 13 unit tests. Better executed with a fresh context budget.

## What's done in this session (committed on branch)

Branch tip: `f650ccd`. Build green. `npx vitest run src/lib`: **197/197 across 25 files** (was 191/24 at session start; +6 new from Task 14).

| Task | Status | Commit(s) | Notes |
|------|--------|-----------|-------|
| 12a | ✅ done + reviewed | `4009177`, `d454f07` | Helper `getAttributesForCategory()` + 3 simple readers (theme-values, theme-options, observability). Code-quality reviewer caught observability double-counting — fixed in `d454f07`. |
| 12b | ✅ done + reviewed | `8b8cab6`, `0020e50` | 4 template-request route readers. Implementer introduced `toCategoryAttributeShim()` in `template-requests/route.ts:309-338` to keep `template-sheet-builder.ts` + its 13 tests untouched. Helper `.orderBy(attributes.id)` added in `0020e50` for deterministic iteration order. |
| 12c | ✅ done + reviewed | `7f2f5ac`, `e48e541` | Last 3 readers: GET endpoint (group by `referenceGroup`, narrowed payload), PATCH endpoint (jsonb_set on isKey), UI component (drop hide-toggle + bibleFieldMatch badge), sync page rename. Authorized scope expansion in `sync-tables.ts` (the `column_attributes` orchestrator switch had to move with the page id). **Code-quality review caught a Critical bug**: PATCH was writing `"true"`/`"false"` JSON strings instead of JSON booleans into `category_meta`. Fixed in `e48e541` using `to_jsonb(... ::boolean)` matching Task 10's pattern at `upsert.ts:141`. |
| 13 | ✅ done | `a5bf17a` | Extend `syncAttributes()` in `sync-tables.ts` to read the 4 new BQ columns (`vcLabel`, `sbLabel`, `alrLabel`, `clrLabel`). 12-line mechanical migration. Reviews skipped (calibrated deviation — pure find/replace + 4 inserts; no architectural decisions). |
| 14 | ✅ done | `7313f13` | TDD: new `src/lib/variation-theme.ts` + tests. 6 tests added. Verbatim plan source — no deviation. |
| 15 | ✅ done w/ concerns | `f650ccd` | API + page changes for VP detection via `master.is_vp`. Implementer flagged 2 extra `vpFlavors` consumers — verified neither feeds the variations page (so no UI regression). |

`grep -rln "categoryAttributes\b" src/ scripts/` after this session: ONLY `src/lib/db/schema.ts`. Migration of consumers is complete.

## Important nits raised by reviewers (not blockers, address in Task 16-17)

These accumulated across 12a/12b/12c reviews. Most are addressed naturally by Task 16 cleanup; some need explicit attention.

1. **`audit/route.ts:83` types `requirement: sql<string>` but JSONB extract returns null** when `category_meta` entry has no `requirement` field. `AuditGap.requirement` (line 16) typed `string` but receives `null` at runtime. Fix in Task 16 cleanup OR Task 17 verification: widen interface to `string | null` AND change SQL type, OR add `COALESCE(..., '')`. *Task 12 spec reviewer (round 12a) flagged this; Task 11's original implementer also called it out.*
2. **`audit/route.ts:99-105` carries a `bibleFieldMatch: r.generalLabel` shim** in the `auditableAttrs.map(...)` call. Comments say "shim → maps to attributes.generalLabel directly post-merge". Task 16 should delete this shim and rename downstream `attr.bibleFieldMatch!` references in the per-product audit loop (lines 158-218) to `attr.generalLabel`.
3. **`template-requests/route.ts:309-338` `toCategoryAttributeShim()`** expands `AttributeCategoryRow` → legacy `CategoryAttribute` shape with lossy defaults (`groupName: ""`, `sortOrder: 0`, `hideFromTemplate: false`, `localLabel = generalLabel`, `bibleFieldMatch = generalLabel`, `amazonFieldName = generalLabel`, `requirement = r.requirement ?? ""`). Task 16 should delete this shim and update `template-sheet-builder.ts` to consume `AttributeCategoryRow[]` directly. *This is the largest cleanup item — see Task 16 brief below.*
4. **`hideFromTemplate` UI feature retired silently**. Task 12b's shim sets `hideFromTemplate: false` for all rows, so any production rows that had `hide_from_template = true` are now visible in templates. Verification candidate for Task 17. (One-liner pre-flight: `psql ... -c "SELECT COUNT(*) FROM category_attributes WHERE hide_from_template = true"`. If 0, no behavior change ships. If >0, those rows' authors should be told.)
5. **Per-attribute `sortOrder` lost** for templates (12b's shim sets all to 0). Within a `requirement` bucket, column ordering is now `attributes.id` order (stable post-`0020e50`). Pre-migration was the curated `category_attributes.sort_order`. Acceptable for Required/Conditionally Required buckets (everything ships anyway); affects Recommended/Optional bucket UX. Verification candidate for Task 17.
6. **`columnAttributes` Drizzle alias still in `src/lib/db/schema.ts:301-302`**. Comment says "REMOVE after Phase F readers migrate." Phase F is now done. Task 16 should delete the alias.
7. **`${JSON.stringify(...)}::jsonb` antipattern** at THREE sites:
   - `scripts/import-aac.ts:82,90` (raw_data — pre-existing, primer-flagged)
   - `src/lib/category-definitions/upsert.ts:143-144` (category_meta entry — Task 10 plan-verbatim, primer-flagged)
   - `src/app/api/attributes/template-requests/[id]/finalize/route.ts:143` (raw_column_values merge — pre-existing per `git log`, originated in `81aa181`)
   
   None are blockers. Worth a single follow-up commit converting all three to `${sql.json(obj)}` (the project standard JSON binding helper). Out of scope for Task 16; a standalone tidy commit would do.
8. **Two extra `vpFlavors` consumers without `isVp`** (Task 15 DONE_WITH_CONCERNS):
   - `src/app/api/products/[id]/family/route.ts:169` — verified does NOT feed the variations page (page doesn't call this route). Safe to defer; family-fetched rows would silently get `isVP=false` if anything ever consumes them through the new pattern. Verification candidate.
   - `src/app/api/ppc/forecast-tool/products/route.ts:46` — different consumer, different (already correct) detection pattern using `varietyPackItemCount`. Out of scope.

## Resume point: Task 16 (medium → larger than the plan describes)

**Plan section:** `### Task 16: Drop category_attributes (separate migration 0048)` (~plan line 1844).

The plan describes Task 16 as "drop the table + drop the schema entries". Real scope is bigger because the shim cleanup is implicit. Recommend splitting into 2 sub-dispatches:

### Task 16-prep (code only, no DB execution)

**Files to MODIFY:**
- `src/lib/db/schema.ts` — delete the `categoryAttributes` pgTable export (lines 512-537) AND the `CategoryAttribute` / `NewCategoryAttribute` type exports (lines 1389-1390) AND the `columnAttributes` alias (lines 301-302).
- `src/app/api/attributes/audit/route.ts` — delete the `bibleFieldMatch` shim at lines 99-105 and rename downstream `attr.bibleFieldMatch!` references in the per-product audit loop (lines 158-218) to `attr.generalLabel`. Also fix the `sql<string>` → `sql<string | null>` type-honesty issue at line 83 + widen `AuditGap.requirement` to `string | null` at line 16, OR `COALESCE(...->'requirement', '')` to keep the always-string contract.
- `src/app/api/attributes/template-requests/route.ts` — delete `toCategoryAttributeShim()` at lines 309-338 and the `.map(toCategoryAttributeShim)` at the result-push call site.
- `src/lib/template-sheet-builder.ts` — change `TemplateCategorySheet.attributes: CategoryAttribute[]` to `attributes: AttributeCategoryRow[]`. Delete every reference to `localLabel`, `groupName`, `sortOrder`, `hideFromTemplate`, `bibleFieldMatch`, `amazonFieldName` inside the builder body. Replace with `generalLabel` everywhere they were used as the canonical attribute key.
- `src/lib/template-sheet-builder.test.ts` (assumed location — verify) — update all 13 unit tests' fixture rows to use `AttributeCategoryRow` shape.

**Files to CREATE:**
- `drizzle/migrations/0048_drop_category_attributes.sql` (3-line migration: `BEGIN; DROP TABLE IF EXISTS category_attributes; COMMIT;`)
- `scripts/run-migration-0048-drop-category-attributes.ts` (template = `scripts/run-migration-0047-*.ts`; uses postgres.js with `:6543/` → `:5432/`)

**Build & test:**
- `npm run build` MUST stay green. The schema deletions force the shim cleanups — that's deliberate.
- `npx vitest run src/lib` should still pass (197/197 + whatever delta from re-shaping the 13 builder tests). If any tests need to be deleted because their fixtures no longer make sense (e.g., `groupName` rendering tests), document and delete; don't keep dead tests.

**Commit (single):**
```
feat(db): drop category_attributes table + cleanup shims (Phase H)
```

### Task 16-deploy (DB execution — needs user awareness)

The plan note: "**ONLY** run this task after Phase F is fully deployed and the audit endpoint has run cleanly against post-migration data for at least 24 hours". Since this branch isn't merged yet, do NOT run the migration in the worktree. Defer until:
1. Branch is merged to main
2. Vercel deployment is green
3. Audit endpoint has been used in production for at least 24 hours
4. `pg_dump` has been taken per Step 1 of the plan

The migration runner script lands in 16-prep but is NOT executed. Document this in the commit body.

### Task 17 (verification only)

After Task 16-prep is committed and the migration has been run in prod:

1. Full build + lint + test: `npm run build && npm run lint && npm test`. Pre-existing failures listed in primer.md (`clr-import/route.test.ts`, `monthly-report chromium`) are still acceptable — no new failures.
2. Walk through spec acceptance criteria in `docs/superpowers/specs/2026-05-01-attributes-table-unification-design.md` §Acceptance criteria.
3. Empirically verify each behavior caveat from this session:
   - Pre-flight: count old `category_attributes WHERE hide_from_template = true` to know if the silent feature retirement matters.
   - Manual `/api/attributes/audit` parity check (deferred from Task 11).
   - Manual `/admin/sync` click-to-sync still triggers `attributes` table refresh.
   - Manual `/admin/attributes` (the category-attributes UI) still renders without the eye-toggle / matched badge.
   - Manual VP product detail in `/variations/[id]` — VP badge renders for known VP products, doesn't render for non-VP.
4. Resolve the type-honesty fix in `audit/route.ts:83` (Item 1 above) if not done in 16-prep.
5. Optional cleanup commit converting the 3 `${JSON.stringify(...)}::jsonb` antipattern sites (Item 7 above) to `${sql.json(obj)}`.

## Branch state

- Branch tip: `f650ccd`
- Worktree env: `.env.local` symlinked, node_modules installed
- DB direct port 5432 for DDL via postgres.js (`.replace(":6543/", ":5432/")`); pooler 6543 for app
- psql NOT installed — use postgres.js via tsx for any DB queries
- `npm run build` GREEN
- `npx vitest run src/lib` GREEN (197/197 across 25 files; was 191/24 at session start)
- `graphify-out/` is dirty (post-edit hook regen) — never staged

## How to continue (copy-paste prompt for fresh session)

```
Working in /Users/manu/1o8Hub/.worktrees/attributes-unification on branch
feat/attributes-unification. Resume executing the 17-task plan at
docs/superpowers/plans/2026-05-01-attributes-table-unification-plan.md
using superpowers:subagent-driven-development.

Tasks 1-15 are complete and reviewed. Read this handoff first:
docs/superpowers/handoffs/2026-05-04-attributes-unification-tasks-12-15-done.md

Resume at Task 16 — split into 16-prep (code-only) and 16-deploy
(DB execution after merge). The handoff doc has the full file
inventory and rationale for the split.

Worktree env: .env.local symlinked, node_modules installed. DB direct
port 5432 for DDL via postgres.js (.replace(":6543/", ":5432/")); pooler
6543 for app. psql NOT installed — use postgres.js via tsx for any DB
queries. Build is currently green at branch tip f650ccd. Tests 197/197.

Patterns to keep applying:
- Two-stage review per task (spec compliance first, then code quality).
  Both rounds caught real bugs in this session: observability double-
  counting and a JSON-string-vs-boolean corruption bug in the PATCH
  handler. Don't skip even when tasks look obvious.
- Implementer briefs MUST include verbatim plan source AND a pre-grepped
  list of files in scope.
- Watch for plan bugs: Tasks 8, 9, 10 had plan bugs the implementer
  fixed mid-flight. Implementers are authorized to fix plan issues
  provided the deviation is documented.
- Long implementer prompts can hit stream-idle timeouts at ~7 min /
  22 tool calls. Recovery: fresh continuation agent with "Step N
  already done in working tree".
- Task 16's biggest cleanup is `template-sheet-builder.ts` + its 13
  unit tests — the test rewrites alone could approach a Task-11-sized
  diff. If the brief gets unwieldy, split builder tests into a
  separate sub-dispatch.

After Task 16-prep merges to main + deploys + 24h burn-in, run
Task 16-deploy (pg_dump + run migration runner + verify in DB)
followed by Task 17 (acceptance checklist). 16-deploy is a
destructive DDL — confirm with the user before executing.
```

## Lessons learned (process notes for the next session)

1. **Code-quality review consistently catches what spec compliance misses.** Task 12a: observability double-counting was a behavior bug invisible to spec compliance (the spec was followed verbatim, but the spec didn't account for `columnAttributes` being an alias of `attributes`). Task 12c: JSON-string-vs-boolean was caught by the reviewer empirically running the SQL. Both round trips proved their value. Do NOT skip code quality reviews on routes that touch JSONB.

2. **Mechanical tasks tolerate skipped reviews.** Tasks 13, 14, 15 had verbatim plan source with no architectural decisions. I skipped formal two-stage review on those and the build/test guards caught nothing — implementers reported correct work. Calibrated deviation OK for trivial diffs; use judgment.

3. **Helper additions are safe.** Adding `referenceGroup` to `AttributeCategoryRow` (12c) and `.orderBy(attributes.id)` (12b post-fix) were both purely additive and had no consumer impact. Worth doing as quality-of-life touchups when in the file anyway.

4. **Authorized scope expansions are FINE if documented.** 12c's `sync-tables.ts` rename + Task 12 plan-verbatim shim choice in 12b — both were explicit deviations the implementer documented. Both made the migration cleaner. Pattern: "the spec said do X, but Y was needed for correctness; I did Y and explained why in the commit body" is the right shape.

5. **Avoid running destructive ops** mid-implementation. Task 16's `DROP TABLE` is correctly deferred until after deployment burn-in. Code-only commits give the same forward progress without risk.

## Files touched in this session (all committed)

```
src/app/admin/sync/page.tsx                                      |  2 +-
src/app/api/admin/observability/route.ts                          | 25 ++++++--
src/app/api/attributes/template-requests/[id]/diff/route.ts       | 16 ++--
src/app/api/attributes/template-requests/[id]/finalize/route.ts   | 16 ++--
src/app/api/attributes/template-requests/[id]/route.ts            | 25 ++++----
src/app/api/attributes/template-requests/route.ts                 | 63 +++++++++++--
src/app/api/category-definitions/[productType]/attributes/[id]/route.ts | 65 ++++++++++++--
src/app/api/category-definitions/[productType]/route.ts           | 49 +++++-----
src/app/api/portal/products/route.ts                              |  1 +
src/app/api/products/route.ts                                     |  1 +
src/app/api/products/theme-values/route.ts                        | 78 ++++++++++++-----
src/app/api/variations/theme-options/route.ts                     | 75 ++++++++++++-----
src/app/variations/[id]/page.tsx                                  |  4 +-
src/components/admin/category-attributes.tsx                      | 96 ++--------------------
src/lib/category-meta-queries.ts                                  | 36 ++++++++ (NEW)
src/lib/sync-tables.ts                                            | 18 +++--
src/lib/variation-theme.test.ts                                   | 38 +++++++++ (NEW)
src/lib/variation-theme.ts                                        | 26 ++++++ (NEW)
docs/superpowers/handoffs/2026-05-04-attributes-unification-tasks-12-15-done.md (this file, NEW)
```

Total: 9 commits across 18 files (3 new). 197 tests pass, build green.

## What changed semantically (one-line summaries)

- All consumers of `categoryAttributes` now read `attributes.category_meta` JSONB.
- Helper `getAttributesForCategory(mp, productType)` returns 8 fields per row including `referenceGroup`.
- The `category_attributes` table itself still exists (Task 16 drops it). The Drizzle export still exists. The `columnAttributes` alias still exists.
- Three shims-for-minimal-diff exist that Task 16 will delete: `bibleFieldMatch` shim in audit route, `toCategoryAttributeShim()` in template-requests route, the `sql<string>` type lie at audit/route.ts:83.
- Two latent behavior changes ship with this branch: `hideFromTemplate` UI feature is silently gone; per-attribute `sortOrder` collapses within requirement buckets. Both were authorized by the plan and documented in commits.
