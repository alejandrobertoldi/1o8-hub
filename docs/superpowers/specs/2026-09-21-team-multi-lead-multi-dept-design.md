# Team org chart: multi-lead + multi-department membership

**Date:** 2026-09-21
**Status:** Approved design, pending implementation plan (`/writing-plans`)
**Clean base:** commit `2b99d2f2c` on `main` (decoupled-lead feature + AM/PM-band column removal, already live in prod via migrations 0115/0116/0117).

## Problem

Two limitations of the current data model, both rooted in single-value scalar columns on `users`:

1. **A lead cannot lead more than one department.** `users.leads_department` is a single `team_department` enum. `PUT /api/team/department-leads` sets that one column on the chosen user (`src/app/api/team/department-leads/route.ts:69-73`). Assigning a person a *second* department overwrites the first: make Manu lead Design and his `leads_department` flips `seo → design`, silently dropping his SEO lead. There is no way for one person to lead two departments at once. This is a live bug, not just a missing feature.

2. **A member cannot belong to more than one department.** `users.department` is a single `team_department` enum. A person who works in both Design and SEO can only be recorded in one.

Both are real: e.g. Manu is SEO Lead **and** Data Lead by job title, and `job_titles` already encodes leadership the scalar column cannot hold.

## Decisions (locked)

- **Multi-lead → junction table** `user_department_leads(user_id, department)`, `PRIMARY KEY(user_id, department)` + `UNIQUE(department)`. Each department keeps ≤1 lead; a person may hold many rows. This junction becomes the **single source of truth** for who leads what.
- **Multi-department membership → array column** `users.departments team_department[]` (NOT a parallel junction). Membership has no cross-row constraint and no per-edge metadata, so an array is the right shape and matches the schema's existing multi-value pattern (`job_titles text[]`, `allowed_sections jsonb`). Blast radius stays small: `department` stays on the users row, so the GET select, PATCH field-routing, access tiers, and user-detail editor each change in one place.
- **Company-scale chart counts each membership.** A person in Design+SEO adds 1 to each bar. `total` becomes total assignments (relabel), so bars sum to it. No "primary department" concept.
- **The vestigial "Department lead: Yes/No" editor is removed** from user-detail, and `is_department_lead` is dropped from the PATCH routable fields / validation / enforcement. The DB column stays (additive-only).
- **Source-of-truth ruling:** after this work, `user_department_leads` = truth for leadership; `job_titles` "X Lead" strings = cosmetic display only; `leads_department` and `is_department_lead` = frozen vestigial (kept per additive-only, unused by the org tree).
- **Additive only.** No column drops, no data destruction. `2b99d2f2c` is unpushed; nothing pushed/applied without a separate per-action OK.

## Why leads = junction but membership = array (the asymmetry is deliberate)

The lead junction genuinely needs `UNIQUE(department)` — a cross-row constraint (two different users must not both lead Design) that a Postgres array column cannot enforce without an exclusion constraint and a custom operator. Membership has no such constraint (many people per dept, a person in many depts). Forcing membership into a symmetric junction would add a whole route + query + cache path for a plain many-to-many tag with zero edge attributes. So: junction where a constraint requires it, array where it does not.

## Schema changes (`src/lib/db/schema.ts`) — all additive

1. New table `user_department_leads`:
   ```
   user_department_leads(
     user_id     uuid           NOT NULL REFERENCES users(id),
     department  team_department NOT NULL,
     PRIMARY KEY (user_id, department)
   )
   -- plus: CREATE UNIQUE INDEX idx_user_department_leads_one_per_dept
   --       ON user_department_leads (department)
   ```
   `department` is `NOT NULL` here, so — unlike the *partial* indexes in 0116/0117 (which were on a nullable `users.leads_department` and therefore had to live in SQL) — this is a plain `UNIQUE` index that drizzle expresses cleanly. Declare it in `schema.ts` as a `uniqueIndex("idx_user_department_leads_one_per_dept").on(table.department)`; the same DDL also goes in the migration `.sql`. No comment-only workaround needed.

2. New column on `users`:
   ```
   departments team_department[] NOT NULL DEFAULT '{}'
   ```
   Parallel to `job_titles`. `users.department` (scalar) left in place, vestigial.

3. `leads_department` and `is_department_lead` remain, frozen and unused. Update their `schema.ts` comments to say the junction supersedes them.

## Migration 0118

Files: `drizzle/migrations/0118_team_multi_dept.sql` + `scripts/run-migration-0118.ts` (model exactly on `scripts/run-migration-0117.ts`: `dotenv` → `.env.local`, `DATABASE_URL` with `:6543`→`:5432`, `sql.unsafe(ddl)`, then a verify query; throw on failure).

DDL, in order:
1. `CREATE TABLE user_department_leads (...)` + `CREATE UNIQUE INDEX ... ON user_department_leads(department)`.
2. `ALTER TABLE users ADD COLUMN departments team_department[] NOT NULL DEFAULT '{}'`.
3. Backfill membership from the scalar:
   `UPDATE users SET departments = ARRAY[department] WHERE department IS NOT NULL AND departments = '{}'`.
4. Seed the leads junction from the authoritative scalar:
   `INSERT INTO user_department_leads (user_id, department) SELECT id, leads_department FROM users WHERE leads_department IS NOT NULL ON CONFLICT DO NOTHING`.
   (Verified holders as of 2026-09-21: admin→Jake, design→Amir, seo→Manu, ppc→Luis.)
5. Seed the one title-implied lead the scalar cannot hold — **data→Manu** — explicitly and idempotently:
   `INSERT INTO user_department_leads (user_id, department) SELECT id, 'data' FROM users WHERE email = 'manu@marketfoundry.agency' ON CONFLICT DO NOTHING`.
   Rationale: regex-parsing `job_titles` in SQL is fragile; this is a single known row. **Before writing the migration, re-run the read-only probe** (`scripts/_tmp-leads-dept-probe.ts` pattern) to confirm data→Manu is the *only* title-implied lead missing from the scalar; if others exist, add explicit seed lines per person.
6. Verify block: junction table exists, its unique index exists, `users.departments` column exists, and row counts are sane (`≥4` lead rows, membership backfill count matches non-null `department` count).

## Data layer (`src/lib/team/departments.ts`)

- `OrgMember`:
  - `department: string | null` → `departments: string[]`
  - `leadsDepartment: string | null` → `leadsDepartments: string[]`
  - remove `isDepartmentLead`.
- `buildOrgTree`:
  - member match `m.department === id` → `m.departments.includes(id)` (a person renders a card under **each** of their departments; `rest.filter(...)` and `candidates` both switch).
  - lead lookup `m.leadsDepartment === id` → `m.leadsDepartments.includes(id)`.
  - unassigned = `departments` empty (`!m.departments.some(isTeamDepartment)`).
- `buildCompanyScale`: input `{ departments: string[] }[]`; count each membership; `total` = total assignments (chart relabels).
- Keep `TEAM_DEPARTMENTS`, labels, colors, `ORG_LEVEL_DEPARTMENTS` (AM/PM still bands, not columns) unchanged.

## API

- `GET /api/team` (`src/app/api/team/route.ts`): select `users.departments`; drop `department`/`isDepartmentLead`/`leadsDepartment` scalars from the returned shape. Aggregate `leadsDepartments` per user from `user_department_leads` — one extra `SELECT user_id, department FROM user_department_leads` grouped in application code by user id (no lateral join). Return `{ ...user, departments, leadsDepartments, jobTitles: displayJobTitles(...) }`.
- `PUT /api/team/department-leads` (`.../department-leads/route.ts`): unchanged contract `{ department, userId | null }`. Body becomes, in one transaction:
  `DELETE FROM user_department_leads WHERE department = $department;`
  and, when `userId` is a string, `INSERT INTO user_department_leads (user_id, department) VALUES ($userId, $department)`.
  Clear is keyed on **department**, so a person's other lead rows are untouched — this is what fixes the "removed from the first" bug. `UNIQUE(department)` still guarantees one lead per dept. Keep the existing 404-on-unknown-user, 400 validation, and audit log.
- `PATCH /api/team/[userId]` (`.../[userId]/route.ts`):
  - `department` field → `departments` (array). Add a `validateValue` branch that validates an array of `TeamDepartment` (mirror `normalizeJobTitles`: array, each a string, each `isTeamDepartment`, dedupe, cap length at the enum size). Route it into `userUpdates.departments`.
  - **Remove** `isDepartmentLead` from `FIELD_TIERS`, `USERS_PATCH_FIELDS`, the `validateValue` branch, and delete the lead-uniqueness enforcement block (`[userId]/route.ts:312-349`).
  - Leads are never edited through this route (they go through `department-leads`), so nothing lead-related is added here.

## Access (`src/lib/team/access.ts`)

- `FIELD_TIERS`: `department: "admin"` → `departments: "admin"`; remove `isDepartmentLead`.
- `USERS_PATCH_FIELDS`: `department` → `departments`; remove `isDepartmentLead`.

## UI

- `src/components/team/team-org-tree.tsx`:
  - `MemberCard`: render each department in `member.departments` (the single-dept `<p>` becomes a list); badge shows `Leads {joined leadsDepartments labels}` e.g. "Leads SEO, Data".
  - Per-column Lead dropdown unchanged (still one lead per dept via the route). `col.lead` derivation switches to the array membership in `buildOrgTree`; the dropdown still calls `department-leads` with `{ department, userId }`.
- `src/components/team/user-detail.tsx`:
  - "Department" single-select → multi-select for `departments` (model on `job-titles-field.tsx`, or a checkbox group over `TEAM_DEPARTMENT_OPTIONS`), saving via `patch.mutate({ departments: [...] })`.
  - **Remove** the "Department lead: Yes/No" `EditableField` (`user-detail.tsx:359-368`).
- `src/components/team/company-scale-chart.tsx`: consume `departments: string[]`; relabel `total` as assignments where the copy implies a headcount.
- `src/components/team/team-directory.tsx`: `TeamMember`/`OrgMember` type update flows through automatically; verify the `queryFn` shape matches the new GET payload.

## Testing

Predict counts before running (proves existence + non-deletion).
- `src/lib/team/departments.test.ts`: multi-dept member appears as a card under each of their departments; membership counting in `buildCompanyScale` (a 2-dept person adds 2 to the total); multi-lead badge (`leadsDepartments` with two entries); unassigned = empty array.
- `src/app/api/team/department-leads/route.test.ts`: assigning a second department to an existing lead leaves the first intact; `UNIQUE(department)` swap replaces the prior holder; `userId: null` clears only that department.
- `src/app/api/team/[userId]/route.test.ts`: `departments` array validator (valid array, bad element → 400, unknown key still 400 before 403); `isDepartmentLead` is now an unknown field (→ 400).
- `src/app/api/team/route.test.ts`: GET returns `departments` + aggregated `leadsDepartments`.
- Run `npm run test -- src/lib/team src/app/api/team`, then `tsc --noEmit` (unfiltered, judged by filename; team files must be clean, rest is pre-existing noise).

## Out of scope

- Open gap (b): empty departments render no Lead dropdown (need ≥1 member). Unchanged; fold in only if Manu asks.
- No changes to `client_id_code` / INTERNAL_TEAMS axis.
- No push, deploy, or migration apply without a separate explicit per-action OK.

## Migration numbering

Verified 2026-09-21: `drizzle/migrations` ends at 0115/0116/0117 → next free is **0118**. Mechanism is `.sql` file + bespoke `scripts/run-migration-0118.ts` (model on 0117), NOT drizzle-kit / `db:generate`.
