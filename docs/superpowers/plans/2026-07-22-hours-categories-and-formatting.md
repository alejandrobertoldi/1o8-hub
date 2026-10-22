# Hours Categories + Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory, admin-managed work Category to hours logging, plus four formatting/layout fixes on the `/hours` page.

**Architecture:** New additive `hour_categories` table + nullable `time_entries.category` text column (label stored as text, not FK, so admin edits never orphan history). Category is required on create (POST), optional on edit (PATCH), via a `{ requireCategory }` option on the shared `validateEntryBody`. A team-gated read endpoint feeds the logging dropdowns; an `admin`-gated CRUD endpoint + `/admin/hour-categories` page manages the list. Formatting changes are pure functions + JSX layout.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (Postgres/Supabase), NextAuth v5, React 19 + React Query, shadcn/ui, Vitest 4, Tailwind v4.

## Global Constraints

- DEV DB **is** PROD Supabase. Additive only. NEVER `drizzle-kit migrate`. NEVER drop the `end_time > start_time` CHECK. Additive SQL is authorized for this feature; show the exact SQL before running.
- A `next dev` server is running — typecheck with `npx tsc --noEmit`, NEVER `next build` (clobbers the dev `.next`).
- Any shell command containing `.env` is HARD-BLOCKED. Migration scripts `import "dotenv/config"` then **dynamically import** `@/lib/db` AFTER; run via `npx tsx scripts/...`.
- Stage explicit files, never `git add .`. Do not `git add .`, stash, checkout, or restore.
- Brand = Burnt Orange `#FF751F` = `text-brand`. No "red" — errors use `text-destructive`. Read DESIGN.md before colour/spacing on the admin page.
- Owner-only hours invariant (commit `ce74a508`) is unchanged: nobody edits/deletes another user's entry.
- Category stored as the **label text**. `category` column is nullable; legacy rows stay `NULL`.
- Seed categories, `sort_order` ascending: `PPC, SEO, Design, Asana, Gmail, Drive, Markup, Meetings, Other`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- `src/lib/db/schema.ts` — MODIFY: add `hourCategories` table; add `category` col to `timeEntries`.
- `scripts/2026-07-22-hours-categories-migration.ts` — CREATE: additive SQL runner.
- `src/lib/hours/queries.ts` — MODIFY: category queries; `category` in insert/update.
- `src/lib/hours/validation.ts` — MODIFY: `formatHoursMinutes` zero-pad.
- `src/lib/hours/validation.test.ts` — MODIFY: format assertions.
- `src/app/api/hours/route.ts` — MODIFY: `validateEntryBody` opts + `category`; `serializeEntry` + `category`; POST call.
- `src/app/api/hours/route.test.ts` — MODIFY: mock `isActiveCategory`; category tests.
- `src/app/api/hours/[id]/route.ts` — MODIFY: PATCH passes `requireCategory:false`; category into update.
- `src/app/api/hours/[id]/route.test.ts` — MODIFY: mock `isActiveCategory`; PATCH category tests.
- `src/app/api/hours/categories/route.ts` — CREATE: team-gated GET active categories.
- `src/app/api/hours/categories/route.test.ts` — CREATE.
- `src/app/api/admin/hour-categories/route.ts` — CREATE: admin GET/POST/PATCH.
- `src/app/api/admin/hour-categories/route.test.ts` — CREATE.
- `src/components/hours/hours-tracker.tsx` — MODIFY: dropdown width, category select (form+edit), category column, filters row, `dayLabel`, categories query.
- `src/app/admin/hour-categories/page.tsx` — CREATE: admin management page.
- Admin nav link — MODIFY the file that lists `/admin/*` links (confirm at execution).

---

### Task 1: Additive schema (table + column + seed)

**Files:**
- Modify: `src/lib/db/schema.ts` (after `timeEntries`, ~line 139)
- Create: `scripts/2026-07-22-hours-categories-migration.ts`

**Interfaces:**
- Produces: `hourCategories` drizzle table (`id, name, active, sortOrder, createdAt`); `timeEntries.category` (`text`, nullable).

- [ ] **Step 1: Add the Drizzle model.** In `src/lib/db/schema.ts`, add `category: text("category")` to the `timeEntries` column object (nullable — no `.notNull()`), immediately after the `note` column. Then add this table after the `timeEntries` block:

```ts
export const hourCategories = pgTable("hour_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Verify `boolean` and `integer` are already imported from `drizzle-orm/pg-core` at the top of the file; add them to the import if missing.

- [ ] **Step 2: Write the migration script.**

```ts
// scripts/2026-07-22-hours-categories-migration.ts
import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS hour_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const seed = ["PPC", "SEO", "Design", "Asana", "Gmail", "Drive", "Markup", "Meetings", "Other"];
  for (let i = 0; i < seed.length; i++) {
    await db.execute(sql`
      INSERT INTO hour_categories (name, sort_order)
      VALUES (${seed[i]}, ${i})
      ON CONFLICT (name) DO NOTHING
    `);
  }

  await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS category text`);

  const cats = await db.execute(sql`SELECT name, sort_order FROM hour_categories ORDER BY sort_order`);
  console.log("hour_categories:", cats.rows ?? cats);
  const col = await db.execute(sql`
    SELECT column_name, is_nullable, data_type FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'category'
  `);
  console.log("time_entries.category:", col.rows ?? col);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Surface the exact SQL to the user, then run it.** (Human OK already given; the operator shows the three statements above and runs:)

Run: `npx tsx scripts/2026-07-22-hours-categories-migration.ts`
Expected: prints 9 seeded categories in order and `category | YES | text`.

- [ ] **Step 4: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/db/schema.ts scripts/2026-07-22-hours-categories-migration.ts
git commit -m "feat(hours): add hour_categories table + time_entries.category (additive)"
```

---

### Task 2: Category queries

**Files:**
- Modify: `src/lib/hours/queries.ts`

**Interfaces:**
- Consumes: `hourCategories` from Task 1.
- Produces:
  - `listActiveCategories(): Promise<{ id: string; name: string }[]>`
  - `listAllCategories(): Promise<{ id: string; name: string; active: boolean; sortOrder: number }[]>`
  - `isActiveCategory(name: string): Promise<boolean>`
  - `insertCategory(v: { name: string; sortOrder?: number }): Promise<{ id: string; name: string; active: boolean; sortOrder: number }>`
  - `updateCategory(id: string, v: { name?: string; active?: boolean; sortOrder?: number }): Promise<{ id: string; name: string; active: boolean; sortOrder: number }>`
  - `insertEntries` / `updateEntry` value types gain `category: string | null`.

These are thin Drizzle wrappers over the real (prod) DB. Per project convention the queries module is **mocked** in API tests, so there are no standalone unit tests here — behaviour is covered by Tasks 3–6.

- [ ] **Step 1: Add category to the queries.** Add `hourCategories` to the schema import on line 2, and `desc` is not needed (use `asc`). Append:

```ts
export function listActiveCategories() {
  return db
    .select({ id: hourCategories.id, name: hourCategories.name })
    .from(hourCategories)
    .where(eq(hourCategories.active, true))
    .orderBy(asc(hourCategories.sortOrder), asc(hourCategories.name));
}

export function listAllCategories() {
  return db
    .select({
      id: hourCategories.id,
      name: hourCategories.name,
      active: hourCategories.active,
      sortOrder: hourCategories.sortOrder,
    })
    .from(hourCategories)
    .orderBy(asc(hourCategories.sortOrder), asc(hourCategories.name));
}

export async function isActiveCategory(name: string): Promise<boolean> {
  const [row] = await db
    .select({ id: hourCategories.id })
    .from(hourCategories)
    .where(and(eq(hourCategories.name, name), eq(hourCategories.active, true)))
    .limit(1);
  return Boolean(row);
}

export async function insertCategory(v: { name: string; sortOrder?: number }) {
  const [row] = await db
    .insert(hourCategories)
    .values({ name: v.name, sortOrder: v.sortOrder ?? 0 })
    .returning({
      id: hourCategories.id,
      name: hourCategories.name,
      active: hourCategories.active,
      sortOrder: hourCategories.sortOrder,
    });
  return row;
}

export async function updateCategory(
  id: string,
  v: { name?: string; active?: boolean; sortOrder?: number }
) {
  const set: Partial<{ name: string; active: boolean; sortOrder: number }> = {};
  if (v.name !== undefined) set.name = v.name;
  if (v.active !== undefined) set.active = v.active;
  if (v.sortOrder !== undefined) set.sortOrder = v.sortOrder;
  const [row] = await db
    .update(hourCategories)
    .set(set)
    .where(eq(hourCategories.id, id))
    .returning({
      id: hourCategories.id,
      name: hourCategories.name,
      active: hourCategories.active,
      sortOrder: hourCategories.sortOrder,
    });
  return row;
}
```

- [ ] **Step 2: Add `category` to `insertEntries` value type.** In the `insertEntries` `values` array type (lines ~38-46), add `category: string | null;` after `note`. The existing `.values({ ...v, hours: String(v.hours) })` passes it through unchanged.

- [ ] **Step 3: Add `category` to `updateEntry`.** In `updateEntry`'s `v` param type (lines ~72-79) add `category: string | null;` after `note`. The existing `.set({ ...v, ... })` passes it through.

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit` — Expected: fails only where `insertEntries`/`updateEntry` callers don't yet pass `category` (fixed in Tasks 3–4). If it errors elsewhere, fix here.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/hours/queries.ts
git commit -m "feat(hours): category queries + category on insert/update value types"
```

---

### Task 3: POST requires category

**Files:**
- Modify: `src/app/api/hours/route.ts`
- Test: `src/app/api/hours/route.test.ts`

**Interfaces:**
- Consumes: `isActiveCategory` (Task 2), `insertEntries` with `category` (Task 2).
- Produces: `validateEntryBody(body, opts: { requireCategory: boolean })` returning `category: string | null`; `serializeEntry` returning `category`.

- [ ] **Step 1: Write failing tests.** In `route.test.ts`, add `isActiveCategory: vi.fn()` to the `vi.mock("@/lib/hours/queries", ...)` object (line 5-10) and to the import (line 14-19). Add `import { isActiveCategory } from "@/lib/hours/queries";` (fold into existing import). Then add:

```ts
describe("POST /api/hours category", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(insertEntries).mockResolvedValue([{ ...DB_ROW, category: "PPC" }]);
  });

  const validBody = {
    entryDate: "2026-07-16", clientIdCode: "PURA",
    startTime: "09:00", endTime: "11:30",
  };

  it("400 when category missing", async () => {
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/category/i);
  });

  it("400 when category is not an active category", async () => {
    asMock(isActiveCategory).mockResolvedValue(false);
    const res = await POST(postReq({ ...validBody, category: "Nope" }));
    expect(res.status).toBe(400);
  });

  it("201 and round-trips category on a valid entry", async () => {
    const res = await POST(postReq({ ...validBody, category: "PPC" }));
    expect(res.status).toBe(201);
    expect((await res.json()).entries[0].category).toBe("PPC");
    expect(asMock(insertEntries).mock.calls[0][0][0]).toMatchObject({ category: "PPC" });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail.** Run: `npx vitest run src/app/api/hours/route.test.ts` — Expected: the 3 new tests FAIL (category not validated / undefined in output).

- [ ] **Step 3: Implement.** In `route.ts`:

Update `serializeEntry` to include category (after `note`):
```ts
    note: row.note,
    category: row.category,
```

Change `validateEntryBody` signature and body-parse to accept opts + category:
```ts
export async function validateEntryBody(
  body: {
    entryDate?: unknown; clientIdCode?: unknown; startTime?: unknown;
    endTime?: unknown; durationHours?: unknown; note?: unknown; category?: unknown;
  },
  opts: { requireCategory: boolean }
): Promise<
  | { ok: true; entryDate: string; clientIdCode: string; note: string | null; category: string | null; segments: Segment[] }
  | { ok: false; error: string }
> {
```
Add category validation just before the final `return` (after the `note` line):
```ts
  const categoryRaw = typeof body.category === "string" ? body.category.trim() : "";
  let category: string | null = null;
  if (categoryRaw) {
    if (!(await isActiveCategory(categoryRaw))) {
      return { ok: false, error: `Unknown or inactive category: ${categoryRaw}` };
    }
    category = categoryRaw;
  } else if (opts.requireCategory) {
    return { ok: false, error: "A category is required" };
  }

  return { ok: true, entryDate, clientIdCode, note, category, segments: shift.segments };
```
Add `isActiveCategory` to the `@/lib/hours/queries` import at the top.

In `POST`, update the call and the insert:
```ts
  const validated = await validateEntryBody(body, { requireCategory: true });
  ...
  const { entryDate, clientIdCode, note, category, segments } = validated;
  ...
    insertValues.push({
      userId: auth.user.id, clientIdCode, entryDate: segDate,
      startTime: seg.startTime, endTime: seg.endTime, hours: seg.hours,
      note, category,
    });
```

- [ ] **Step 4: Run tests, verify pass.** Run: `npx vitest run src/app/api/hours/route.test.ts` — Expected: all PASS (existing + 3 new).

- [ ] **Step 5: Commit.**
```bash
git add src/app/api/hours/route.ts src/app/api/hours/route.test.ts
git commit -m "feat(hours): POST requires an active category; serialize category"
```

---

### Task 4: PATCH accepts optional category

**Files:**
- Modify: `src/app/api/hours/[id]/route.ts`
- Test: `src/app/api/hours/[id]/route.test.ts`

**Interfaces:**
- Consumes: `validateEntryBody(body, { requireCategory: false })` (Task 3), `updateEntry` with `category` (Task 2).

- [ ] **Step 1: Write failing tests.** In `[id]/route.test.ts`, add `isActiveCategory: vi.fn()` to the queries `vi.mock` + import (mirror Task 3). Ensure `updateEntry` mock resolves a row including `category`. Add:

```ts
describe("PATCH /api/hours/[id] category", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue({ user: { id: "u1", role: "editor" } });
    asMock(getEntryById).mockResolvedValue({ ...DB_ROW, userId: "u1" });
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(updateEntry).mockImplementation(async (_id, v) => ({ ...DB_ROW, userId: "u1", ...v, hours: "2.50" }));
  });

  const base = { entryDate: "2026-07-16", clientIdCode: "PURA", startTime: "09:00", endTime: "11:30" };

  it("succeeds without a category (legacy row stays uncategorised)", async () => {
    const res = await PATCH(patchReq({ ...base }), ctx("e1"));
    expect(res.status).toBe(200);
    expect(asMock(updateEntry).mock.calls[0][1]).toMatchObject({ category: null });
  });

  it("sets a category on edit", async () => {
    const res = await PATCH(patchReq({ ...base, category: "SEO" }), ctx("e1"));
    expect(res.status).toBe(200);
    expect(asMock(updateEntry).mock.calls[0][1]).toMatchObject({ category: "SEO" });
  });

  it("400 on an inactive category", async () => {
    asMock(isActiveCategory).mockResolvedValue(false);
    const res = await PATCH(patchReq({ ...base, category: "Dead" }), ctx("e1"));
    expect(res.status).toBe(400);
  });
});
```
(Use the file's existing `patchReq`/`ctx` helpers; if names differ, match them.)

- [ ] **Step 2: Run tests, verify fail.** Run: `npx vitest run "src/app/api/hours/[id]/route.test.ts"` — Expected: new tests FAIL.

- [ ] **Step 3: Implement.** In `[id]/route.ts` PATCH: change the call to `validateEntryBody(body, { requireCategory: false })`, and add `category` to the `data` object:
```ts
  const data = {
    entryDate: validated.entryDate,
    clientIdCode: validated.clientIdCode,
    startTime: seg.startTime,
    endTime: seg.endTime,
    hours: seg.hours,
    note: validated.note,
    category: validated.category,
  };
```

- [ ] **Step 4: Run tests, verify pass.** Run: `npx vitest run "src/app/api/hours/[id]/route.test.ts"` — Expected: all PASS.

- [ ] **Step 5: Commit.**
```bash
git add "src/app/api/hours/[id]/route.ts" "src/app/api/hours/[id]/route.test.ts"
git commit -m "feat(hours): PATCH accepts an optional category (legacy rows editable)"
```

---

### Task 5: Team-gated categories list endpoint

**Files:**
- Create: `src/app/api/hours/categories/route.ts`
- Test: `src/app/api/hours/categories/route.test.ts`

**Interfaces:**
- Consumes: `requireTeamUser` (from `../route`), `listActiveCategories` (Task 2).
- Produces: `GET /api/hours/categories` → `{ categories: { id, name }[] }`.

- [ ] **Step 1: Write failing test.**
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({ listActiveCategories: vi.fn() }));
import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { listActiveCategories } from "@/lib/hours/queries";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe("GET /api/hours/categories", () => {
  beforeEach(() => vi.clearAllMocks());
  it("401 unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("403 for a non-team role", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "c1", role: "client" } });
    expect((await GET()).status).toBe(403);
  });
  it("200 returns active categories", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "v1", role: "viewer" } });
    asMock(listActiveCategories).mockResolvedValue([{ id: "1", name: "PPC" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).categories).toEqual([{ id: "1", name: "PPC" }]);
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npx vitest run src/app/api/hours/categories/route.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.**
```ts
import { NextResponse } from "next/server";
import { requireTeamUser } from "../route";
import { listActiveCategories } from "@/lib/hours/queries";

export async function GET() {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;
  const categories = await listActiveCategories();
  return NextResponse.json({ categories });
}
```

- [ ] **Step 4: Run, verify pass.** Run: `npx vitest run src/app/api/hours/categories/route.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/app/api/hours/categories/route.ts src/app/api/hours/categories/route.test.ts
git commit -m "feat(hours): GET /api/hours/categories (team-gated active list)"
```

---

### Task 6: Admin category CRUD endpoint

**Files:**
- Create: `src/app/api/admin/hour-categories/route.ts`
- Test: `src/app/api/admin/hour-categories/route.test.ts`

**Interfaces:**
- Consumes: `getAuthSession`, `listAllCategories`, `insertCategory`, `updateCategory` (Task 2).
- Produces: `GET` (all), `POST {name, sortOrder?}`, `PATCH {id, name?, active?, sortOrder?}`; all `role === "admin"` gated.

- [ ] **Step 1: Write failing tests.**
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  listAllCategories: vi.fn(), insertCategory: vi.fn(), updateCategory: vi.fn(),
}));
import { GET, POST, PATCH } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { listAllCategories, insertCategory, updateCategory } from "@/lib/hours/queries";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const ADMIN = { user: { id: "a1", role: "admin" } };
const req = (body: unknown, method = "POST") =>
  new NextRequest("http://localhost/api/admin/hour-categories", { method, body: JSON.stringify(body) });

describe("admin hour-categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a non-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "v1", role: "viewer" } });
    expect((await GET()).status).toBe(403);
  });

  it("GET lists all categories for an admin", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(listAllCategories).mockResolvedValue([{ id: "1", name: "PPC", active: true, sortOrder: 0 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).categories).toHaveLength(1);
  });

  it("POST 400 on empty name", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    expect((await POST(req({ name: "  " }))).status).toBe(400);
  });

  it("POST adds a category", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(insertCategory).mockResolvedValue({ id: "9", name: "Legal", active: true, sortOrder: 9 });
    const res = await POST(req({ name: "Legal", sortOrder: 9 }));
    expect(res.status).toBe(201);
    expect(asMock(insertCategory).mock.calls[0][0]).toMatchObject({ name: "Legal" });
  });

  it("PATCH toggles active", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(updateCategory).mockResolvedValue({ id: "1", name: "PPC", active: false, sortOrder: 0 });
    const res = await PATCH(req({ id: "1", active: false }, "PATCH"));
    expect(res.status).toBe(200);
    expect(asMock(updateCategory).mock.calls[0][1]).toMatchObject({ active: false });
  });

  it("PATCH 400 without id", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    expect((await PATCH(req({ active: false }, "PATCH"))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npx vitest run src/app/api/admin/hour-categories/route.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.**
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { listAllCategories, insertCategory, updateCategory } from "@/lib/hours/queries";

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const categories = await listAllCategories();
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A category name is required" }, { status: 400 });
  const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : undefined;
  try {
    const category = await insertCategory({ name, sortOrder });
    return NextResponse.json({ category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That category already exists" }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const patch: { name?: string; active?: boolean; sortOrder?: number } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
  const category = await updateCategory(id, patch);
  return NextResponse.json({ category });
}
```

- [ ] **Step 4: Run, verify pass.** Run: `npx vitest run src/app/api/admin/hour-categories/route.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/app/api/admin/hour-categories/route.ts src/app/api/admin/hour-categories/route.test.ts
git commit -m "feat(hours): admin CRUD for hour categories (role=admin gated)"
```

---

### Task 7: `formatHoursMinutes` zero-padded

**Files:**
- Modify: `src/lib/hours/validation.ts:135-143`
- Test: `src/lib/hours/validation.test.ts:114-128`

- [ ] **Step 1: Update the failing assertions.** Replace the `describe("formatHoursMinutes", ...)` cases with:
```ts
describe("formatHoursMinutes", () => {
  it("formats hours and minutes zero-padded", () => {
    expect(formatHoursMinutes(8.08)).toBe("08h 05m");
    expect(formatHoursMinutes(1.5)).toBe("01h 30m");
  });
  it("keeps whole hours as HHh 00m", () => {
    expect(formatHoursMinutes(1)).toBe("01h 00m");
    expect(formatHoursMinutes(2)).toBe("02h 00m");
  });
  it("keeps sub-hour as 00h MMm", () => {
    expect(formatHoursMinutes(0.5)).toBe("00h 30m");
    expect(formatHoursMinutes(0)).toBe("00h 00m");
  });
  it("does not truncate 3-digit hour totals", () => {
    expect(formatHoursMinutes(123.5)).toBe("123h 30m");
  });
  it("returns em dash for non-finite", () => {
    expect(formatHoursMinutes(NaN)).toBe("—");
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npx vitest run src/lib/hours/validation.test.ts` — Expected: FAIL (old format `8h 5m`).

- [ ] **Step 3: Implement.** Replace the body of `formatHoursMinutes`:
```ts
export function formatHoursMinutes(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}
```
(Update the JSDoc example above it to `2 → "02h 00m"`.)

- [ ] **Step 4: Run, verify pass.** Run: `npx vitest run src/lib/hours/validation.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/hours/validation.ts src/lib/hours/validation.test.ts
git commit -m "feat(hours): zero-padded HHh MMm hours format"
```

---

### Task 8: Logging-page UI — dropdowns, category, filters, date

**Files:**
- Modify: `src/components/hours/hours-tracker.tsx`

**Interfaces:**
- Consumes: `GET /api/hours/categories` (Task 5), category on `POST`/`PATCH`/`GET` (Tasks 3-4).

This is a single-file UI task. No unit test (component behaviour is verified by tsc + manual dogfood). Do all sub-steps, then typecheck once, then commit.

- [ ] **Step 1: Widen the time dropdowns (item 1).** In `TimeSelect`, change both `<SelectTrigger className="w-16" ...>` to `className="w-20"` (two occurrences, lines ~80 and ~93).

- [ ] **Step 2: Reformat the day label (item 4).** Replace `dayLabel`:
```ts
/** "2026-07-20" -> "2026-07-20 Mon". Parses as local date parts, not UTC. */
function dayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
  return `${dateStr} ${weekday}`;
}
```

- [ ] **Step 3: Add category to the `ApiEntry` type** (after `note`): `category: string | null;`.

- [ ] **Step 4: Load categories + add form state.** After the `clients` `useQuery` block, add:
```ts
  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["hours-categories"],
    queryFn: async () => {
      const res = await fetch("/api/hours/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      return (await res.json()).categories;
    },
  });
```
Add form state near `clientIdCode`: `const [category, setCategory] = useState("");`.
Add edit state near `editNote`: `const [editCategory, setEditCategory] = useState("");`.

- [ ] **Step 5: Send category on create + reset.** In `createEntry.mutationFn`, add `category` to `body`:
```ts
      const body: Record<string, unknown> = {
        entryDate, clientIdCode, category, startTime, note: note || null,
      };
```
In `onSuccess`, add `setCategory("");` next to the other resets.

- [ ] **Step 6: Gate submit on category (bootstrapping guard).** In `canSubmit`, add `category`:
```ts
    if (!clientIdCode || !entryDate || !category) return false;
```
(Add `category` to the `useMemo` dependency array.)

- [ ] **Step 7: Add the Category select to the form.** After the Client `<div className="space-y-1">…</div>` block, insert:
```tsx
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground">Category</label>
          {categories.length === 0 ? (
            <p className="flex h-9 items-center text-xs text-muted-foreground">
              Ask an admin to add categories
            </p>
          ) : (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
```

- [ ] **Step 8: Wire category into edit.** In `startEdit`, add `setEditCategory(entry.category ?? "");`. In the `updateEntry` mutation payload type add `category: string | null;`, in `saveEdit` pass `category: editCategory || null,`, and update the `updateEntry.mutationFn` `body` to include `category` (it spreads `body` already — confirm `category` is in the payload object passed to fetch).

- [ ] **Step 9: Add the Category column header.** In `<TableHeader>`, add `<TableHead>Category</TableHead>` between the Client head and the Time head. Update the two empty-state `colSpan={6}` to `colSpan={7}`.

- [ ] **Step 10: Render category in summary rows.** In the day-summary `<TableRow>`, add a cell after the Client cell that shows distinct categories for the day. First compute per-group categories in `dayGroups`:
```ts
      const categoriesForDay = Array.from(
        new Set(dayEntries.map((e) => e.category).filter((c): c is string => Boolean(c)))
      );
      return { date, entries: dayEntries, totalHours: dayTotalHours, clients, categories: categoriesForDay };
```
Then the summary cell:
```tsx
                      <TableCell className="py-0.5">
                        <div className="flex flex-wrap gap-1">
                          {day.categories.map((c) => (
                            <Badge key={c} variant="outline">{c}</Badge>
                          ))}
                        </div>
                      </TableCell>
```

- [ ] **Step 11: Render category in detail rows + edit row.** In the non-editing detail `<TableRow>`, add a cell after the Client cell: `<TableCell className="py-0.5 text-muted-foreground">{e.category ?? "—"}</TableCell>`. In the editing `<TableRow>`, add after the client-select cell a category-select cell:
```tsx
                              <TableCell className="py-0.5">
                                <Select value={editCategory} onValueChange={setEditCategory}>
                                  <SelectTrigger className="h-8 w-36 text-sm">
                                    <SelectValue placeholder="Category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categories.map((c) => (
                                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
```
Verify every row branch (summary, detail, editing, loading, empty) now renders **7** cells so columns stay aligned.

- [ ] **Step 12: Move filters beside the preset buttons (item 3).** Wrap the preset-button `div` and the filters `div` in a single flex row with `justify-between`, and move that block above the `This week (…)/Total` header. Concretely: change the preset container to `className="mb-3 flex flex-wrap items-center justify-between gap-2"` and move the existing filters `div` (the client filter + note search) inside it, right after the three preset buttons (keep the buttons in their own inner `div className="flex gap-1"`). Leave the `This week (…) — Total:` header where it is (now below the combined row).

- [ ] **Step 13: Typecheck.** Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 14: Commit.**
```bash
git add src/components/hours/hours-tracker.tsx
git commit -m "feat(hours): category select + column, wider time dropdowns, filters row, date format"
```

---

### Task 9: Admin category management page

**Files:**
- Create: `src/app/admin/hour-categories/page.tsx`
- Modify: the admin nav file (confirm which lists `/admin/*` links, e.g. `src/components/layout/app-sidebar.tsx`)

This page mirrors an existing `/admin/*` page's structure and role-gate. No unit test (UI); verify via tsc + manual.

- [ ] **Step 1: Read an existing admin page for the pattern.** Read `src/app/admin/ai/page.tsx` to copy its auth-gate/redirect + layout conventions (client vs server component, how it fetches, how it uses the brand tokens). Match it.

- [ ] **Step 2: Build the page.** A table listing all categories (from `GET /api/admin/hour-categories`) with: inline-editable name, an active toggle (PATCH `{id, active}`), a sort-order number, and an "add" row (POST `{name, sortOrder}`). Use React Query with key `["admin-hour-categories"]`; invalidate on each mutation. Use shadcn `Table`, `Input`, `Button`, `Switch`/toggle already in the repo. Errors via `toast` (sonner). No literal "red" — use `text-destructive`. Follow DESIGN.md spacing/brand.

- [ ] **Step 3: Add the nav link.** In the admin nav file, add a link to `/admin/hour-categories` labelled e.g. "Hour Categories", guarded the same way other admin links are (visible to `role === "admin"`).

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 5: Commit.**
```bash
git add src/app/admin/hour-categories/page.tsx <admin-nav-file>
git commit -m "feat(admin): hour-categories management page + nav link"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run all hours tests.** Run: `npx vitest run src/app/api/hours src/app/api/admin/hour-categories src/lib/hours` — Expected: all PASS (the prior 71 + new).
- [ ] **Step 2: Typecheck the whole project.** Run: `npx tsc --noEmit` — Expected: clean.
- [ ] **Step 3: Manual dogfood** (dev server on :3000): log an entry with a category (mandatory gate blocks empty); confirm it shows in the Category column; edit a legacy entry to add a category; add/rename/deactivate a category in `/admin/hour-categories` and confirm a deactivated one drops out of the logging dropdown but stays on historical rows; confirm dropdowns aren't clipped, date reads `2026-07-20 Mon`, hours read `00h 02m`, filters sit beside the preset buttons.
- [ ] **Step 4: Report PASS/FAIL with evidence.** Do not claim done without the test + tsc output.

---

## Self-Review

**Spec coverage:** item 1 (dropdown width) → Task 8.1; item 2 (category) → Tasks 1–6, 8, 9; item 3 (filters) → Task 8.12; item 4 (date) → Task 8.2; item 5 (hours format) → Task 7. Admin-managed list → Tasks 6, 9. Bootstrapping guard → Task 8.7. Mandatory-on-create/optional-on-edit → Tasks 3, 4. All covered.

**Placeholder scan:** the only deferred specifics are the admin nav filename (Task 9.3 — "confirm which") and the admin page's exact JSX (Task 9.2 — instructed to copy `/admin/ai`'s pattern), both because the existing pattern must be read at execution; every code-bearing step elsewhere has complete code.

**Type consistency:** `category: string | null` used consistently across `serializeEntry`, `validateEntryBody` return, `insertEntries`/`updateEntry` value types, `ApiEntry`, and the mutation payloads. `isActiveCategory`, `listActiveCategories`, `listAllCategories`, `insertCategory`, `updateCategory` names match between Task 2 (definition) and Tasks 3–6 (consumers). `validateEntryBody(body, { requireCategory })` signature matches both call sites (Task 3 POST=true, Task 4 PATCH=false).
