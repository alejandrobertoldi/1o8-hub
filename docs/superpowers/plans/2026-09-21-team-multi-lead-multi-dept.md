# Team multi-lead + multi-department membership — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one person lead multiple departments (junction table) and belong to multiple departments (array column), fixing the scalar-overwrite bug where assigning a second lead department silently drops the first.

**Architecture:** Additive schema change on top of commit `2b99d2f2c`. Leadership moves from the single `users.leads_department` column to a `user_department_leads(user_id, department)` junction with `UNIQUE(department)` (≤1 lead per dept, a person may hold many). Membership moves from the single `users.department` column to a `users.departments team_department[]` array (matches the existing `job_titles` pattern). The old scalar columns and `is_department_lead` stay in place, frozen and unused.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + `postgres` driver, PostgreSQL (Supabase), Vitest, React 19 + shadcn/ui, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-21-team-multi-lead-multi-dept-design.md`

## Global Constraints

- **Additive only.** No column drops, no destructive DDL. `users.department`, `users.leads_department`, `users.is_department_lead` are kept vestigial.
- **No push / deploy / migration apply / merge without a separate explicit per-action OK.** Local commits are fine. `2b99d2f2c` and the spec commit are already unpushed.
- **Migrations:** `.sql` file in `drizzle/migrations/` + bespoke `scripts/run-migration-00NN.ts` (model on `scripts/run-migration-0117.ts`). NEVER drizzle-kit / `db:generate` / `db:migrate`. Next free number is **0118**.
- **tsc:** `node_modules/.bin/tsc --noEmit`, unfiltered, ~2 min, judged BY FILENAME. Team files must be clean; the rest of the tree has pre-existing noise (do not cross-apply).
- **vitest does not typecheck** — always follow a green test run with tsc.
- **Dates are `YYYY-MM-DD` strings** across module boundaries, never `Date`.
- **git:** explicit pathspec on every `add` AND `commit`; never `git add .`; `-m` before `--`. Keep `graphify-out/*`, `.claude/*` out of commits.
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Source-of-truth ruling:** `user_department_leads` is the single truth for leadership; `job_titles` "X Lead" strings are cosmetic display only; `leads_department` + `is_department_lead` are frozen vestigial.
- **Single source of enum values:** `TEAM_DEPARTMENTS` in `src/lib/team/departments.ts`; the `team_department` pgEnum stays in lockstep.

---

## File Structure

- `src/lib/db/schema.ts` — add `userDepartmentLeads` table + `users.departments` array column (Task 1).
- `drizzle/migrations/0118_team_multi_dept.sql` + `scripts/run-migration-0118.ts` — migration (Task 2, NOT executed without OK).
- `src/lib/team/departments.ts` + `.test.ts` — `OrgMember` shape, `buildOrgTree`, `buildCompanyScale`, new `normalizeDepartments` (Task 3).
- `src/app/api/team/route.ts` + `.test.ts` — GET returns `departments` + aggregated `leadsDepartments` (Task 4).
- `src/app/api/team/department-leads/route.ts` + `.test.ts` — PUT writes the junction (Task 5).
- `src/app/api/team/[userId]/route.ts` + `.test.ts`, `src/lib/team/access.ts` — PATCH `departments`, remove `isDepartmentLead` (Task 6).
- `src/components/team/{team-org-tree,user-detail,company-scale-chart,team-directory}.tsx` — UI (Task 7).

---

### Task 1: Schema — junction table + departments array column

**Files:**
- Modify: `src/lib/db/schema.ts` (users table block ~135-214; add new table after the `users` table definition)

**Interfaces:**
- Produces: `users.departments` (`team_department[]`, not null, default `[]`); `userDepartmentLeads` table with columns `userId` (uuid, FK → users.id), `department` (teamDepartmentEnum), composite PK `(userId, department)`, unique index `idx_user_department_leads_one_per_dept` on `department`.

- [ ] **Step 1: Add the `departments` array column to `users`**

In `src/lib/db/schema.ts`, immediately after the `department` column (currently line ~185), add:

```ts
    // Multi-department membership (0118). Parallel to job_titles. A person may
    // sit in several departments; the org tree renders a card under each.
    // The scalar `department` above is left vestigial (additive-only).
    departments: teamDepartmentEnum("departments").array().notNull().default([]),
```

- [ ] **Step 2: Update the vestigial-column comments**

Edit the `leadsDepartment` comment block (~191-198) to append:

```ts
    // SUPERSEDED by the user_department_leads junction (0118). Frozen vestigial;
    // buildOrgTree now reads the junction, aggregated as leadsDepartments[].
```

- [ ] **Step 3: Add the junction table**

After the `users` table's closing (after its indexes block), add a new table. Confirm `primaryKey` and `uniqueIndex` are imported from `drizzle-orm/pg-core` at the top of the file; add them to the existing import if missing.

```ts
/**
 * Which departments each person LEADS (0118). Replaces the single
 * users.leads_department scalar so one person can lead several departments.
 * UNIQUE(department) keeps at most one lead per department; the composite PK
 * lets a person hold many rows. Source of truth for org-tree leadership.
 */
export const userDepartmentLeads = pgTable(
  "user_department_leads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    department: teamDepartmentEnum("department").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.department] }),
    uniqueIndex("idx_user_department_leads_one_per_dept").on(t.department),
  ]
);
```

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -E "schema\.ts"`
Expected: no lines (no new errors in schema.ts). Whole-tree baseline noise is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(team): schema for department-leads junction + departments array

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/db/schema.ts
```

---

### Task 2: Migration 0118 (files only — DO NOT RUN without a per-action OK)

**Files:**
- Create: `drizzle/migrations/0118_team_multi_dept.sql`
- Create: `scripts/run-migration-0118.ts`

**Interfaces:**
- Consumes: schema from Task 1.
- Produces: the DDL + runner. Running it is a separate, explicitly-authorized action.

- [ ] **Step 1: Re-run the read-only lead probe to confirm the seed set**

Before writing the seeds, confirm which title-implied leads the scalar never held. Model on the existing untracked `scripts/_tmp-leads-dept-probe.ts` (READ-ONLY). Expected from 2026-09-21: scalar holders admin→Jake, design→Amir, seo→Manu, ppc→Luis; the only title-implied lead missing from the scalar is **data→Manu**. If the probe shows others, add an explicit seed line per person in Step 2 (same `INSERT … WHERE email = … ON CONFLICT DO NOTHING` shape).

- [ ] **Step 2: Write the migration SQL**

Create `drizzle/migrations/0118_team_multi_dept.sql`:

```sql
-- 0118_team_multi_dept.sql
--
-- Additive only. Two changes:
--   1. user_department_leads junction: one person may lead many departments,
--      each department still has at most one lead (UNIQUE(department)). Replaces
--      the single users.leads_department scalar as source of truth.
--   2. users.departments array: a person may belong to many departments.
-- The scalar users.department / users.leads_department / users.is_department_lead
-- columns are LEFT IN PLACE, frozen and unused.

CREATE TABLE "user_department_leads" (
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "department" "public"."team_department" NOT NULL,
  PRIMARY KEY ("user_id", "department")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_department_leads_one_per_dept"
  ON "user_department_leads" ("department");
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN "departments" "public"."team_department"[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
-- Backfill membership from the scalar so nothing regresses.
UPDATE "users"
SET "departments" = ARRAY["department"]::"public"."team_department"[]
WHERE "department" IS NOT NULL
  AND "departments" = '{}';
--> statement-breakpoint
-- Seed the leads junction from the authoritative scalar (4 rows on 2026-09-21).
INSERT INTO "user_department_leads" ("user_id", "department")
SELECT "id", "leads_department" FROM "users"
WHERE "leads_department" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Seed the one title-implied lead the scalar could not hold: data -> Manu.
INSERT INTO "user_department_leads" ("user_id", "department")
SELECT "id", 'data'::"public"."team_department" FROM "users"
WHERE "email" = 'manu@marketfoundry.agency'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Write the runner**

Create `scripts/run-migration-0118.ts` (model exactly on `scripts/run-migration-0117.ts`):

```ts
/**
 * Migration 0118: department-leads junction + users.departments array.
 * Run with: npx tsx scripts/run-migration-0118.ts
 * DO NOT run without an explicit per-action OK — this writes production data.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true, override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running migration 0118: multi-dept junction + array...");
  const ddl = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0118_team_multi_dept.sql"),
    "utf8"
  );
  await sql.unsafe(ddl);
  const [{ has_table, has_idx, has_col, lead_rows }] = await sql<
    { has_table: boolean; has_idx: boolean; has_col: boolean; lead_rows: number }[]
  >`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_name = 'user_department_leads') AS has_table,
      EXISTS (SELECT 1 FROM pg_indexes
              WHERE indexname = 'idx_user_department_leads_one_per_dept') AS has_idx,
      EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'departments') AS has_col,
      (SELECT COUNT(*)::int FROM user_department_leads) AS lead_rows
  `;
  if (!has_table || !has_idx || !has_col || lead_rows < 4) {
    throw new Error(
      `0118 verify failed: table=${has_table} idx=${has_idx} col=${has_col} lead_rows=${lead_rows}`
    );
  }
  console.log(`Migration 0118 applied successfully (lead_rows=${lead_rows}).`);
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0118 failed:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Typecheck the runner**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -E "run-migration-0118"`
Expected: no lines.

- [ ] **Step 5: Commit (do NOT run the migration)**

```bash
git add drizzle/migrations/0118_team_multi_dept.sql scripts/run-migration-0118.ts
git commit -m "feat(team): migration 0118 for department-leads junction + array (not applied)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- drizzle/migrations/0118_team_multi_dept.sql scripts/run-migration-0118.ts
```

> **STOP:** Applying 0118 needs an explicit per-action OK from Manu. Ask before running `npx tsx scripts/run-migration-0118.ts`.

---

### Task 3: Data layer — `departments.ts` (`OrgMember`, `buildOrgTree`, `buildCompanyScale`, `normalizeDepartments`)

**Files:**
- Modify: `src/lib/team/departments.ts`
- Test: `src/lib/team/departments.test.ts`

**Interfaces:**
- Produces:
  - `OrgMember` with `departments: string[]` and `leadsDepartments: string[]` (no `department`, no `leadsDepartment`, no `isDepartmentLead`).
  - `buildCompanyScale(members: { departments: string[] }[]): CompanyScale` — counts each membership.
  - `normalizeDepartments(value: unknown): { ok: TeamDepartment[] } | { error: string }`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/team/departments.test.ts`: (a) update the import to add `normalizeDepartments`; (b) update the `person` helper; (c) rewrite the `buildCompanyScale` and `buildOrgTree` blocks; (d) add a `normalizeDepartments` block.

Replace the `buildCompanyScale` describe block with:

```ts
describe("buildCompanyScale", () => {
  it("counts each membership; a person in two departments hits both bars", () => {
    const scale = buildCompanyScale([
      { departments: ["design", "seo"] },
      { departments: ["design"] },
      { departments: [] },
      { departments: ["unknown"] },
    ]);
    // design 2, seo 1, unassigned 2 (empty + all-invalid); total = sum = 5
    expect(scale.total).toBe(5);
    expect(scale.rows.find((r) => r.id === "design")?.count).toBe(2);
    expect(scale.rows.find((r) => r.id === "seo")?.count).toBe(1);
    expect(scale.rows.find((r) => r.id === "unassigned")?.count).toBe(2);
    expect(scale.rows.find((r) => r.id === "finance")).toBeUndefined();
  });

  it("returns a zero total with no rows for an empty team", () => {
    expect(buildCompanyScale([])).toEqual({ total: 0, rows: [] });
  });
});
```

Replace the `person` helper and the `buildOrgTree` describe block with:

```ts
describe("buildOrgTree", () => {
  const person = (
    id: string,
    name: string,
    title: string,
    departments: string[] = [],
    leadsDepartments: string[] = []
  ): OrgMember => ({
    id,
    name,
    email: `${id}@marketfoundry.agency`,
    image: null,
    jobTitle: title,
    jobTitles: [title],
    departments,
    leadsDepartments,
  });

  it("splits four levels; account/project management are bands not columns", () => {
    const tree = buildOrgTree([
      person("jake", "Jake", "President"),
      person("manu", "Manu", "Account Manager", ["account_management"], ["account_management"]),
      person("hamid", "Hamid", "Project Manager", ["project_management"]),
      person("alvin", "Alvin", "Designer", ["design"]),
      person("ruslan", "Ruslan", "PPC Manager", ["ppc"]),
    ]);
    expect(tree.president.map((m) => m.id)).toEqual(["jake"]);
    expect(tree.ams.map((m) => m.id)).toEqual(["manu"]);
    expect(tree.pms.map((m) => m.id)).toEqual(["hamid"]);
    expect(tree.departments.map((d) => d.id)).toEqual(["design", "ppc"]);
    expect(tree.departments.some((d) => d.id === "account_management")).toBe(false);
  });

  it("renders a multi-department member under EACH of their departments", () => {
    const tree = buildOrgTree([
      person("sam", "Sam", "Designer", ["design", "seo"]),
    ]);
    expect(tree.departments.find((d) => d.id === "design")?.members.map((m) => m.id)).toEqual(["sam"]);
    expect(tree.departments.find((d) => d.id === "seo")?.members.map((m) => m.id)).toEqual(["sam"]);
  });

  it("surfaces a lead from OUTSIDE the department, keyed on leadsDepartments", () => {
    const tree = buildOrgTree([
      person("manu", "Manu", "Account Manager", ["account_management"], ["design", "data"]),
      person("alvin", "Alvin", "Designer", ["design"]),
    ]);
    const design = tree.departments.find((d) => d.id === "design");
    expect(design?.lead?.id).toBe("manu");
    expect(design?.members.map((m) => m.id)).toEqual(["alvin"]);
  });
});

describe("normalizeDepartments", () => {
  it("dedupes and preserves order for valid ids", () => {
    expect(normalizeDepartments(["design", "seo", "design"])).toEqual({
      ok: ["design", "seo"],
    });
  });
  it("accepts an empty list", () => {
    expect(normalizeDepartments([])).toEqual({ ok: [] });
  });
  it("rejects a non-array", () => {
    expect(normalizeDepartments("design")).toEqual({
      error: "departments must be an array of department ids",
    });
  });
  it("rejects an unknown id", () => {
    expect(normalizeDepartments(["design", "engineering"])).toEqual({
      error: `departments must all be one of ${TEAM_DEPARTMENTS.join(", ")}`,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/team/departments.test.ts`
Expected: FAIL (type errors / `normalizeDepartments` not exported / `departments` not on `OrgMember`).

- [ ] **Step 3: Update `OrgMember` and the functions**

In `src/lib/team/departments.ts`:

Replace the `OrgMember` type (currently ~144-156) with:

```ts
export type OrgMember = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  jobTitle: string | null;
  jobTitles: string[];
  // Departments this person is a MEMBER of (0118 array). Empty = unassigned.
  departments: string[];
  // Departments this person LEADS (0118 junction, aggregated). May be empty.
  leadsDepartments: string[];
};
```

In `buildOrgTree`, change the department loop body (currently ~216-230):

```ts
  for (const id of TEAM_DEPARTMENTS) {
    if (ORG_LEVEL_DEPARTMENTS.has(id)) continue;
    const candidates = members.filter((m) => m.departments.includes(id)).sort(byName);
    if (candidates.length === 0) continue;
    departments.push({
      id,
      label: TEAM_DEPARTMENT_LABELS[id],
      color: TEAM_DEPARTMENT_COLORS[id],
      lead: members.find((m) => m.leadsDepartments.includes(id)) ?? null,
      members: rest.filter((m) => m.departments.includes(id)),
      candidates,
    });
  }
  const unassignedRest = rest.filter(
    (m) => !m.departments.some(isTeamDepartment)
  );
```

Replace `buildCompanyScale` (currently ~250-279) with:

```ts
export function buildCompanyScale(
  members: { departments: string[] }[]
): CompanyScale {
  const counts = new Map<TeamDepartment | "unassigned", number>();
  let total = 0;
  for (const m of members) {
    const valid = m.departments.filter(isTeamDepartment);
    if (valid.length === 0) {
      counts.set("unassigned", (counts.get("unassigned") ?? 0) + 1);
      total += 1;
      continue;
    }
    for (const d of valid) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
      total += 1;
    }
  }
  const rows: CompanyScaleRow[] = TEAM_DEPARTMENTS.filter(
    (id) => (counts.get(id) ?? 0) > 0
  ).map((id) => ({
    id,
    label: TEAM_DEPARTMENT_LABELS[id],
    count: counts.get(id) ?? 0,
    color: TEAM_DEPARTMENT_COLORS[id],
  }));
  const unassigned = counts.get("unassigned") ?? 0;
  if (unassigned > 0) {
    rows.push({
      id: "unassigned",
      label: "Unassigned",
      count: unassigned,
      color: TEAM_DEPARTMENT_COLORS.unassigned,
    });
  }
  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { total, rows };
}
```

Add `normalizeDepartments` (near `normalizeJobTitles`):

```ts
/** Coerce a PATCH payload into a clean, deduped department-id list. */
export function normalizeDepartments(
  value: unknown
): { ok: TeamDepartment[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "departments must be an array of department ids" };
  }
  const seen = new Set<string>();
  const out: TeamDepartment[] = [];
  for (const item of value) {
    if (!isTeamDepartment(item)) {
      return {
        error: `departments must all be one of ${TEAM_DEPARTMENTS.join(", ")}`,
      };
    }
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return { ok: out };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/team/departments.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/team/departments.ts src/lib/team/departments.test.ts
git commit -m "feat(team): array membership + junction leads in buildOrgTree/buildCompanyScale

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/team/departments.ts src/lib/team/departments.test.ts
```

---

### Task 4: GET `/api/team` — return `departments` + aggregated `leadsDepartments`

**Files:**
- Modify: `src/app/api/team/route.ts`
- Test: `src/app/api/team/route.test.ts`

**Interfaces:**
- Consumes: `userDepartmentLeads`, `users.departments` (Task 1); `displayJobTitles` (existing).
- Produces: each item `{ ...tier0, departments: string[], leadsDepartments: string[], jobTitles: string[] }`; no `department`/`isDepartmentLead`/`leadsDepartment` scalar keys.

- [ ] **Step 1: Write/adjust the failing test**

In `src/app/api/team/route.test.ts` (match the file's existing `vi.mock` pattern for `@/lib/auth-db` and `@/lib/db`), add a test asserting the new shape. Two `db.select` calls now happen — the users select and the leads select — so mock `db.select` to return the users rows on the first call and the lead rows on the second (e.g. `mockReturnValueOnce`). Assert:

```ts
it("returns departments array and aggregated leadsDepartments", async () => {
  // first select -> users; second select -> user_department_leads rows
  // (mock both per the file's chain pattern)
  const res = await GET();
  const body = await res.json();
  const manu = body.find((u: { email: string }) => u.email.startsWith("manu"));
  expect(manu.departments).toEqual(["account_management"]);
  expect(manu.leadsDepartments.sort()).toEqual(["data", "seo"]);
  expect("isDepartmentLead" in manu).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/api/team/route.test.ts`
Expected: FAIL (route still returns scalar `department`/`isDepartmentLead`; no `leadsDepartments`).

- [ ] **Step 3: Update the route**

In `src/app/api/team/route.ts`:
- Import the junction: `import { users, userDepartmentLeads } from "@/lib/db/schema";`
- In the select projection, replace `department: users.department, isDepartmentLead: users.isDepartmentLead, leadsDepartment: users.leadsDepartment` with `departments: users.departments,`.
- After the `allUsers` query, aggregate leads and merge:

```ts
  const leadRows = await db
    .select({
      userId: userDepartmentLeads.userId,
      department: userDepartmentLeads.department,
    })
    .from(userDepartmentLeads);
  const leadsByUser = new Map<string, string[]>();
  for (const r of leadRows) {
    const arr = leadsByUser.get(r.userId) ?? [];
    arr.push(r.department);
    leadsByUser.set(r.userId, arr);
  }

  return NextResponse.json(
    allUsers.map((u) => ({
      ...u,
      jobTitles: displayJobTitles(u.jobTitle, u.jobTitles),
      leadsDepartments: leadsByUser.get(u.id) ?? [],
    }))
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/api/team/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/team/route.ts src/app/api/team/route.test.ts
git commit -m "feat(team): GET /api/team returns departments + aggregated leadsDepartments

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/app/api/team/route.ts src/app/api/team/route.test.ts
```

---

### Task 5: PUT `/api/team/department-leads` — write the junction

**Files:**
- Modify: `src/app/api/team/department-leads/route.ts`
- Test: `src/app/api/team/department-leads/route.test.ts`

**Interfaces:**
- Consumes: `userDepartmentLeads` (Task 1).
- Produces: same HTTP contract `{ department, userId | null }`; the txn now does a `DELETE … WHERE department = $department` then, when `userId` is a string, an `INSERT (userId, department)`.

- [ ] **Step 1: Update the tests**

In `src/app/api/team/department-leads/route.test.ts`, the txn now calls `tx.delete(...).where(...)` and `tx.insert(...).values(...)` instead of `tx.update`. Update the `beforeEach` tx mock and the assertions:

```ts
let txDeleteWhere: ReturnType<typeof vi.fn>;
let txInsertValues: ReturnType<typeof vi.fn>;
let tx: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  txDeleteWhere = vi.fn().mockResolvedValue(undefined);
  txInsertValues = vi.fn().mockResolvedValue(undefined);
  tx = {
    delete: vi.fn().mockReturnValue({ where: txDeleteWhere }),
    insert: vi.fn().mockReturnValue({ values: txInsertValues }),
  };
  asMock(db.transaction).mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));
  asMock(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      { id: THEM, email: "alvin@marketfoundry.agency" },
    ]),
  });
});
```

Update the assign/clear assertions:

```ts
it("assigns a lead: clears the dept's prior holder then inserts, in one txn", async () => {
  asMock(getAuthSession).mockResolvedValue({
    user: { id: "u1", role: "admin", email: "a@x", name: "Admin" },
  });
  const res = await PUT(putReq({ department: "seo", userId: THEM }));
  expect(res.status).toBe(200);
  expect(db.transaction).toHaveBeenCalledTimes(1);
  expect(tx.delete).toHaveBeenCalledTimes(1);
  expect(txInsertValues).toHaveBeenCalledWith(
    expect.objectContaining({ userId: THEM, department: "seo" })
  );
});

it("clears a lead when userId is null (delete only, no insert)", async () => {
  asMock(getAuthSession).mockResolvedValue({
    user: { id: "u1", role: "admin", email: "a@x", name: "Admin" },
  });
  const res = await PUT(putReq({ department: "design", userId: null }));
  expect(res.status).toBe(200);
  expect(tx.delete).toHaveBeenCalledTimes(1);
  expect(tx.insert).not.toHaveBeenCalled();
});
```

Keep the 401/403/400-unknown-department tests. The "assigns from OUTSIDE the department" test still holds (no 'must belong' guard); update its assertion to the insert form above (it no longer sets `leadsDepartment`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/app/api/team/department-leads/route.test.ts`
Expected: FAIL (route still uses `tx.update` / `users.leadsDepartment`).

- [ ] **Step 3: Update the route**

In `src/app/api/team/department-leads/route.ts`:
- Import: `import { users, userDepartmentLeads } from "@/lib/db/schema";`
- Replace the transaction body (currently ~62-75) with:

```ts
  await db.transaction(async (tx) => {
    // Clear this department's current lead (keyed on DEPARTMENT, so the chosen
    // person's OTHER lead rows are untouched — this is the multi-lead fix).
    await tx
      .delete(userDepartmentLeads)
      .where(eq(userDepartmentLeads.department, department));
    if (typeof userId === "string") {
      await tx
        .insert(userDepartmentLeads)
        .values({ userId, department });
    }
  });
```

- The `eq` import already exists. The candidate lookup (404) and the audit log stay unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/app/api/team/department-leads/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/team/department-leads/route.ts src/app/api/team/department-leads/route.test.ts
git commit -m "feat(team): department-leads PUT writes the junction (multi-lead safe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/app/api/team/department-leads/route.ts src/app/api/team/department-leads/route.test.ts
```

---

### Task 6: PATCH `/api/team/[userId]` + `access.ts` — `departments` array, remove `isDepartmentLead`

**Files:**
- Modify: `src/lib/team/access.ts`
- Modify: `src/app/api/team/[userId]/route.ts`
- Test: `src/app/api/team/[userId]/route.test.ts`

**Interfaces:**
- Consumes: `normalizeDepartments` (Task 3), `users.departments` (Task 1).
- Produces: PATCH accepts `departments: string[]` (admin-tier); `isDepartmentLead` and scalar `department` are no longer writable fields.

- [ ] **Step 1: Write/adjust the failing tests**

In `src/app/api/team/[userId]/route.test.ts` (match its existing mock pattern), add/adjust:

```ts
it("accepts a departments array from an admin", async () => {
  // admin session; departments -> writable at admin tier
  const res = await PATCH(patchReq({ departments: ["design", "seo"] }), ctx(TARGET));
  expect(res.status).toBe(200);
});

it("400s a departments array with an unknown id", async () => {
  const res = await PATCH(patchReq({ departments: ["design", "engineering"] }), ctx(TARGET));
  expect(res.status).toBe(400);
});

it("400s isDepartmentLead (no longer a known field)", async () => {
  const res = await PATCH(patchReq({ isDepartmentLead: true }), ctx(TARGET));
  expect(res.status).toBe(400);
});
```

(Reuse the file's existing helpers for building the request and params context; if the file previously tested `department`/`isDepartmentLead`, replace those cases.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/app/api/team/[userId]/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `access.ts`**

In `src/lib/team/access.ts`:
- In `FIELD_TIERS`: replace `department: "admin",` with `departments: "admin",`; **delete** `isDepartmentLead: "admin",`.
- In `USERS_PATCH_FIELDS`: replace `"department"` with `"departments"`; **delete** `"isDepartmentLead"`.

- [ ] **Step 4: Update the route**

In `src/app/api/team/[userId]/route.ts`:
- Import `normalizeDepartments` from `@/lib/team/departments` (add to the existing import).
- In `validateValue`: **delete** the `department` branch (~162-167) and the `isDepartmentLead` branch (~172-176); add:

```ts
  if (field === "departments") {
    const result = normalizeDepartments(value);
    return "error" in result ? result.error : null;
  }
```

- In the `userUpdates` routing loop, add a `departments` case (alongside the `jobTitles` case) so the stored value is the normalized enum array:

```ts
      } else if (k === "departments") {
        const normalized = normalizeDepartments(next);
        if ("error" in normalized) throw new Error(normalized.error);
        userUpdates.departments = normalized.ok;
      } else {
```

- **Delete** the lead-uniqueness block that references `isDepartmentLead`/scalar `department` (currently ~312-349: the `nextDepartment` computation, the two `isDepartmentLead` guards, and the `tx.update(...).set({ isDepartmentLead: false })` clear inside the transaction). The transaction keeps only the `userUpdates` write and the `profileUpdates` upsert.
- The `target` select's `department: users.department` field is now unused; leave it or drop it (harmless either way).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/app/api/team/[userId]/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Full team suite + tsc**

Run: `npm run test -- src/lib/team src/app/api/team`
Expected: all green. Then:
Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -E "src/(lib/team|app/api/team)"`
Expected: no lines.

- [ ] **Step 7: Commit**

```bash
git add src/lib/team/access.ts src/app/api/team/[userId]/route.ts src/app/api/team/[userId]/route.test.ts
git commit -m "feat(team): PATCH accepts departments array; drop is_department_lead writes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/team/access.ts src/app/api/team/[userId]/route.ts src/app/api/team/[userId]/route.test.ts
```

---

### Task 7: UI — org tree, user-detail, company-scale chart, directory types

**Files:**
- Modify: `src/components/team/team-org-tree.tsx`
- Modify: `src/components/team/user-detail.tsx`
- Modify: `src/components/team/company-scale-chart.tsx`
- Modify: `src/components/team/team-directory.tsx`

**Interfaces:**
- Consumes: `OrgMember` with `departments`/`leadsDepartments` (Task 3); GET payload (Task 4).
- Produces: cards showing every membership + a multi-lead badge; a multi-select departments editor; a chart labelled by assignments.

- [ ] **Step 1: `team-org-tree.tsx` — MemberCard multi-dept + multi-lead badge**

Replace the single-department `<p>` and the single-lead badge (currently ~69-78) with:

```tsx
          {member.departments.filter(isTeamDepartment).map((d) => (
            <p
              key={d}
              className="mt-0.5 truncate text-[10px] font-bold uppercase text-muted-foreground"
            >
              {TEAM_DEPARTMENT_LABELS[d as TeamDepartment]}
            </p>
          ))}
          {member.leadsDepartments.filter(isTeamDepartment).length > 0 ? (
            <span className="mt-1 inline-block rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[9px] font-bold uppercase text-brand">
              Leads{" "}
              {member.leadsDepartments
                .filter(isTeamDepartment)
                .map((d) => TEAM_DEPARTMENT_LABELS[d as TeamDepartment])
                .join(", ")}
            </span>
          ) : null}
```

(`isTeamDepartment`, `TEAM_DEPARTMENT_LABELS`, `TeamDepartment` are already imported.)

- [ ] **Step 2: `user-detail.tsx` — multi-select departments, remove lead toggle**

- Replace the single-select "Department" `EditableField` (~351-358) with a multi-select. If a checkbox/multi-select field component is not already available, model on `job-titles-field.tsx`; the minimal in-place version:

```tsx
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Departments
          </span>
          <div className="flex flex-wrap gap-2">
            {TEAM_DEPARTMENT_OPTIONS.map((opt) => {
              const checked = user.departments.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!can("departments")}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...user.departments, opt.value]
                        : user.departments.filter((d) => d !== opt.value);
                      patch.mutate({ departments: next });
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
```

- **Delete** the "Department lead" `EditableField` (~359-368) entirely.
- Ensure the local `user` type/prop carries `departments: string[]` (from the GET payload) and no longer references `user.department`/`user.isDepartmentLead`. Update the type where the detail data is fetched/typed.

- [ ] **Step 3: `company-scale-chart.tsx` — consume `departments`, relabel total**

Read the file first. Update its member prop type from `{ department: string | null }` to `{ departments: string[] }` so `buildCompanyScale(members)` typechecks. Where the copy labels `total` as a headcount (e.g. "N people"), relabel to assignments (e.g. "N assignments") since a multi-dept person is counted per membership.

- [ ] **Step 4: `team-directory.tsx` — type update**

Update the `TeamMember` type (~10-15): it extends `OrgMember`, which now has `departments`/`leadsDepartments` and no `department`/`isDepartmentLead`. Remove any now-dead `department`/`isDepartmentLead` references; the `queryFn` shape already matches the new GET payload.

- [ ] **Step 5: Typecheck the components**

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -E "src/components/team"`
Expected: no lines. (tsc errors from the removed `department`/`isDepartmentLead`/`leadsDepartment` fields are the guide — resolve each.)

- [ ] **Step 6: Component tests (if any touch these) + full team suite**

Run: `npm run test -- src/components/team src/lib/team src/app/api/team`
Expected: green (or only pre-existing unrelated failures — judge by file).

- [ ] **Step 7: Commit**

```bash
git add src/components/team/team-org-tree.tsx src/components/team/user-detail.tsx src/components/team/company-scale-chart.tsx src/components/team/team-directory.tsx
git commit -m "feat(team): org tree + editor render multi-department membership and multi-lead

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/components/team/team-org-tree.tsx src/components/team/user-detail.tsx src/components/team/company-scale-chart.tsx src/components/team/team-directory.tsx
```

---

## Final verification (after all tasks)

- [ ] `npm run test -- src/lib/team src/app/api/team src/components/team` — all green (predict: departments.test additions pass; route tests pass; component tests pass).
- [ ] `node_modules/.bin/tsc --noEmit 2>&1 | grep -E "src/(lib/team|app/api/team|components/team)|schema\.ts|run-migration-0118"` — no lines.
- [ ] Migration 0118 committed but **not applied** — ask Manu for a per-action OK to run `npx tsx scripts/run-migration-0118.ts`, then browser-verify `/team` (a person under multiple department columns; a lead badge listing multiple departments; assigning a second lead department does not drop the first).
- [ ] Nothing pushed. Report `git rev-list --left-right --count origin/main...HEAD` and hand off.

## Self-Review notes

- **Spec coverage:** schema (T1), migration+seeds+probe (T2), data layer incl. `normalizeDepartments` + membership counting (T3), GET aggregation (T4), PUT junction + multi-lead fix (T5), PATCH array + `is_department_lead` removal + access tiers (T6), UI incl. removed toggle + relabelled chart (T7). Out-of-scope gap (b) left out per spec.
- **Type consistency:** `departments: string[]` and `leadsDepartments: string[]` used identically across `OrgMember`, GET, directory, org tree, user-detail; `normalizeDepartments` signature matches its call sites in T6; junction table name `userDepartmentLeads` / `user_department_leads` consistent across T1/T2/T4/T5.
- **Ordering:** T1→T2 (schema before migration), T3 before T4/T6 (they import `normalizeDepartments`/`OrgMember`), T4/T5/T6 before T7 (UI consumes the payload). Tasks 4–6 are independently reviewable.
