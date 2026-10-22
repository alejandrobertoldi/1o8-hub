# Team Hours Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team members log time-range entries against clients on a `/hours` page; admins see per-member and per-client hour totals in an Hours view on `/admin/users`.

**Architecture:** New `time_entries` Postgres table (additive migration script — NEVER drizzle-kit migrate). Pure validation lib (`src/lib/hours/validation.ts`) + thin query lib (`src/lib/hours/queries.ts`) consumed by three API routes under `/api/hours`. Two UI surfaces: `/hours` (React Query + shadcn, all team roles) and `src/components/admin/hours-overview.tsx` mounted as a view toggle on the existing Users admin page.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (postgres), NextAuth v5 (`getAuthSession` from `@/lib/auth-db`), React Query, shadcn/ui, sonner, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-hours-tracker-design.md`

## Global Constraints

- NEVER push or deploy. Local commits only. `origin main` auto-deploys production.
- DEV DB **is** PROD Supabase (shared with 1o8Hub). DB changes are additive-only, applied via `npx tsx scripts/_apply-0083.ts` — never `drizzle-kit migrate`/`push`.
- Stage explicit files only — never `git add .` or `git add -A`.
- Commit trailer (exact): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Times are `"HH:MM"` 24h strings in all API payloads. Postgres `time` columns return `"HH:MM:SS"` — always trim with `.slice(0, 5)` when serializing.
- Internal (non-client) time uses the literal client code `INTERNAL`.
- Entries cannot cross midnight (`end > start`, same day). Overlapping same-day entries are SAVED but reported back as warnings — never rejected.
- Touching edges (09:00–10:00 vs 10:00–11:00) are NOT overlaps.
- Team roles = `admin` | `editor` | `viewer`. Roles `client`/`prospect`/`pending` get 403 from all `/api/hours*` routes.
- No new `allowedSections` / `CONFIGURABLE_SECTIONS` entry — access is by role only.
- `hours` is Drizzle `numeric` → JS **string**. Convert with `String(n)` on write, `Number(s)` on read.
- Dev server: `PORT=3000 npm run dev` (already running in this session via preview server `mfhub-dev`).

---

### Task 1: Database — `time_entries` table

**Files:**
- Modify: `src/lib/db/schema.ts` (add `time` to the pg-core import at line ~1-20; append table after the `users` table block, line ~109)
- Create: `drizzle/migrations/0083_time_entries.sql`
- Create: `scripts/_apply-0083.ts`

**Interfaces:**
- Produces: `timeEntries` Drizzle table export. Row type: `{ id: string; userId: string; clientIdCode: string; entryDate: string; startTime: string; endTime: string; hours: string; note: string | null; createdAt: Date; updatedAt: Date | null }`.

- [ ] **Step 1: Add `time` to the pg-core import in `src/lib/db/schema.ts`**

The import block at the top currently includes `date` but not `time`. Add `time,` after `date,`.

- [ ] **Step 2: Append the table definition to `src/lib/db/schema.ts`** (directly after the `users` table, before the `VariationData` comment block):

```ts
// ─── Time Entries (team hours tracker) ───────────────────────────────
// One row per logged work session: user × client × date × time range.
// clientIdCode is a soft reference to aac.clientIdCode; the literal
// "INTERNAL" marks non-client time. Entries never cross midnight.
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    clientIdCode: text("client_id_code").notNull(),
    entryDate: date("entry_date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    hours: numeric("hours", { precision: 4, scale: 2 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_time_entries_user_date").on(t.userId, t.entryDate),
    index("idx_time_entries_client_date").on(t.clientIdCode, t.entryDate),
  ]
);
```

- [ ] **Step 3: Create `drizzle/migrations/0083_time_entries.sql`**

```sql
CREATE TABLE IF NOT EXISTS "time_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "client_id_code" text NOT NULL,
  "entry_date" date NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "hours" numeric(4,2) NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz,
  CONSTRAINT "time_entries_end_after_start" CHECK ("end_time" > "start_time")
);

CREATE INDEX IF NOT EXISTS "idx_time_entries_user_date"
  ON "time_entries" ("user_id", "entry_date");
CREATE INDEX IF NOT EXISTS "idx_time_entries_client_date"
  ON "time_entries" ("client_id_code", "entry_date");
```

- [ ] **Step 4: Create `scripts/_apply-0083.ts`** (same pattern as `scripts/_apply-0082.ts`):

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0083_time_entries.sql",
    "utf8"
  );
  console.log("Applying 0083_time_entries.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'time_entries'
  `);
  console.log("time_entries table:", tbl);
  if ((tbl as unknown[]).length !== 1) throw new Error("time_entries table missing");
  console.log("0083 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Typecheck, then apply**

Run: `npx tsc --noEmit` → expect no new errors.
Run: `npx tsx scripts/_apply-0083.ts`
Expected output ends with: `0083 applied OK.`
⚠️ This writes to the shared PROD Supabase. It is additive (CREATE TABLE IF NOT EXISTS) — that is allowed by the house rules. If `.env.local` has no working DATABASE_URL (it was overwritten by `vercel link` on 07-10), STOP and report to the user instead of improvising credentials.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0083_time_entries.sql scripts/_apply-0083.ts
git commit -m "feat(hours): add time_entries table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Validation library (pure functions, TDD)

**Files:**
- Create: `src/lib/hours/validation.ts`
- Test: `src/lib/hours/validation.test.ts`

**Interfaces:**
- Produces (exact signatures — later tasks import these):

```ts
export function parseTimeToMinutes(t: string): number | null;
export function minutesToTime(mins: number): string; // "HH:MM"
export type NormalizedRange = { startTime: string; endTime: string; hours: number };
export type RangeInput = { startTime: string; endTime?: string; durationHours?: number };
export function normalizeRange(input: RangeInput):
  | { ok: true; range: NormalizedRange }
  | { ok: false; error: string };
export type OverlapCandidate = { id: string; clientIdCode: string; startTime: string; endTime: string };
export function findOverlaps(
  range: { startTime: string; endTime: string },
  others: OverlapCandidate[]
): OverlapCandidate[];
export function isValidDateString(d: string): boolean; // strict YYYY-MM-DD
```

- [ ] **Step 1: Write the failing tests — `src/lib/hours/validation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeRange,
  findOverlaps,
  isValidDateString,
  parseTimeToMinutes,
} from "./validation";

describe("normalizeRange", () => {
  it("accepts start/end and computes hours", () => {
    const r = normalizeRange({ startTime: "09:00", endTime: "11:30" });
    expect(r).toEqual({
      ok: true,
      range: { startTime: "09:00", endTime: "11:30", hours: 2.5 },
    });
  });

  it("converts durationHours to endTime exactly", () => {
    const r = normalizeRange({ startTime: "09:00", durationHours: 2.5 });
    expect(r).toEqual({
      ok: true,
      range: { startTime: "09:00", endTime: "11:30", hours: 2.5 },
    });
  });

  it("rejects end <= start (zero-length)", () => {
    const r = normalizeRange({ startTime: "09:00", endTime: "09:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects end before start (would cross midnight)", () => {
    const r = normalizeRange({ startTime: "23:00", endTime: "01:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects duration that crosses midnight", () => {
    const r = normalizeRange({ startTime: "23:00", durationHours: 2 });
    expect(r.ok).toBe(false);
  });

  it("rejects zero and negative durations", () => {
    expect(normalizeRange({ startTime: "09:00", durationHours: 0 }).ok).toBe(false);
    expect(normalizeRange({ startTime: "09:00", durationHours: -1 }).ok).toBe(false);
  });

  it("rejects providing both endTime and durationHours", () => {
    const r = normalizeRange({ startTime: "09:00", endTime: "10:00", durationHours: 1 });
    expect(r.ok).toBe(false);
  });

  it("rejects providing neither endTime nor durationHours", () => {
    expect(normalizeRange({ startTime: "09:00" }).ok).toBe(false);
  });

  it("rejects malformed times", () => {
    expect(normalizeRange({ startTime: "9am", endTime: "10:00" }).ok).toBe(false);
    expect(normalizeRange({ startTime: "09:00", endTime: "25:00" }).ok).toBe(false);
  });
});

describe("findOverlaps", () => {
  const others = [
    { id: "a", clientIdCode: "X", startTime: "09:00:00", endTime: "10:00:00" },
    { id: "b", clientIdCode: "Y", startTime: "13:00:00", endTime: "15:00:00" },
  ];

  it("detects a true overlap", () => {
    const hits = findOverlaps({ startTime: "09:30", endTime: "10:30" }, others);
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });

  it("touching edges are NOT overlaps", () => {
    const hits = findOverlaps({ startTime: "10:00", endTime: "13:00" }, others);
    expect(hits).toEqual([]);
  });

  it("containment counts as overlap", () => {
    const hits = findOverlaps({ startTime: "13:30", endTime: "14:00" }, others);
    expect(hits.map((h) => h.id)).toEqual(["b"]);
  });
});

describe("isValidDateString", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(isValidDateString("2026-07-16")).toBe(true);
  });
  it("rejects garbage and impossible dates", () => {
    expect(isValidDateString("16/07/2026")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("parseTimeToMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("09:30:00")).toBe(570);
  });
  it("returns null for invalid input", () => {
    expect(parseTimeToMinutes("24:00")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hours/validation.test.ts`
Expected: FAIL — cannot resolve `./validation`.

- [ ] **Step 3: Implement `src/lib/hours/validation.ts`**

```ts
/**
 * Pure validation/normalization helpers for the team hours tracker.
 * Times are "HH:MM" 24h strings; Postgres `time` values ("HH:MM:SS")
 * are also accepted by parseTimeToMinutes.
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTimeToMinutes(t: string): number | null {
  const m = TIME_RE.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isValidDateString(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  const parsed = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

export type NormalizedRange = { startTime: string; endTime: string; hours: number };
export type RangeInput = { startTime: string; endTime?: string; durationHours?: number };

export function normalizeRange(
  input: RangeInput
): { ok: true; range: NormalizedRange } | { ok: false; error: string } {
  const start = parseTimeToMinutes(input.startTime ?? "");
  if (start === null) {
    return { ok: false, error: "Invalid start time — expected HH:MM" };
  }

  const hasEnd = input.endTime !== undefined;
  const hasDuration = input.durationHours !== undefined;
  if (hasEnd === hasDuration) {
    return { ok: false, error: "Provide exactly one of endTime or durationHours" };
  }

  let end: number;
  if (hasEnd) {
    const parsed = parseTimeToMinutes(input.endTime as string);
    if (parsed === null) {
      return { ok: false, error: "Invalid end time — expected HH:MM" };
    }
    end = parsed;
  } else {
    const dur = input.durationHours as number;
    if (!Number.isFinite(dur) || dur <= 0) {
      return { ok: false, error: "Duration must be greater than 0" };
    }
    end = start + Math.round(dur * 60);
  }

  if (end >= 24 * 60) {
    return { ok: false, error: "Entries cannot cross midnight — log two entries" };
  }
  if (end <= start) {
    return { ok: false, error: "End time must be after start time" };
  }

  const hours = Math.round(((end - start) / 60) * 100) / 100;
  return {
    ok: true,
    range: { startTime: minutesToTime(start), endTime: minutesToTime(end), hours },
  };
}

export type OverlapCandidate = {
  id: string;
  clientIdCode: string;
  startTime: string;
  endTime: string;
};

/** Strict interval overlap: s < otherEnd && otherStart < e. Touching edges do not overlap. */
export function findOverlaps(
  range: { startTime: string; endTime: string },
  others: OverlapCandidate[]
): OverlapCandidate[] {
  const s = parseTimeToMinutes(range.startTime);
  const e = parseTimeToMinutes(range.endTime);
  if (s === null || e === null) return [];
  return others.filter((o) => {
    const os = parseTimeToMinutes(o.startTime);
    const oe = parseTimeToMinutes(o.endTime);
    if (os === null || oe === null) return false;
    return s < oe && os < e;
  });
}
```

Note on the 24:00 test expectation: `parseTimeToMinutes("24:00")` is null because TIME_RE caps hours at 23 — midnight-exact end times are rejected by design.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hours/validation.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/validation.ts src/lib/hours/validation.test.ts
git commit -m "feat(hours): time range validation + overlap detection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Query lib + `GET`/`POST /api/hours`

**Files:**
- Create: `src/lib/hours/queries.ts`
- Create: `src/app/api/hours/route.ts`
- Test: `src/app/api/hours/route.test.ts`

**Interfaces:**
- Consumes: `normalizeRange`, `findOverlaps`, `isValidDateString` from Task 2; `timeEntries` from Task 1.
- Produces (later tasks import from `@/lib/hours/queries`):

```ts
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export function clientCodeExists(code: string): Promise<boolean>;
export function listEntries(userId: string, from: string, to: string): Promise<TimeEntryRow[]>;
export function entriesOnDate(userId: string, entryDate: string, excludeId?: string): Promise<TimeEntryRow[]>;
export function insertEntry(v: { userId: string; clientIdCode: string; entryDate: string; startTime: string; endTime: string; hours: number; note: string | null }): Promise<TimeEntryRow>;
export function getEntryById(id: string): Promise<TimeEntryRow | null>;
export function updateEntry(id: string, v: { clientIdCode: string; entryDate: string; startTime: string; endTime: string; hours: number; note: string | null }): Promise<TimeEntryRow>;
export function deleteEntry(id: string): Promise<void>;
export function summaryRows(from: string, to: string): Promise<{ userId: string; userName: string | null; userEmail: string; clientIdCode: string; totalHours: string }[]>;
```

- Produces (API contract, used by Tasks 6-7):
  - `GET /api/hours?from&to[&userId]` → `{ entries: ApiEntry[] }`
  - `POST /api/hours` body `{ entryDate, clientIdCode, startTime, endTime? , durationHours?, note? }` → 201 `{ entry: ApiEntry, overlaps: { id, clientIdCode, startTime, endTime }[] }`
  - `ApiEntry = { id, userId, clientIdCode, entryDate, startTime: "HH:MM", endTime: "HH:MM", hours: number, note: string | null }`

- [ ] **Step 1: Write `src/lib/hours/queries.ts`** (thin Drizzle wrappers — no unit tests of their own; route tests mock this module, and Task 8 exercises the real thing against the dev server):

```ts
import { db } from "@/lib/db";
import { timeEntries, aac, users } from "@/lib/db/schema";
import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";

export type TimeEntryRow = typeof timeEntries.$inferSelect;

export async function clientCodeExists(code: string): Promise<boolean> {
  if (code === "INTERNAL") return true;
  const [row] = await db
    .select({ c: aac.clientIdCode })
    .from(aac)
    .where(eq(aac.clientIdCode, code))
    .limit(1);
  return Boolean(row);
}

export function listEntries(userId: string, from: string, to: string) {
  return db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to)
      )
    )
    .orderBy(asc(timeEntries.entryDate), asc(timeEntries.startTime));
}

export function entriesOnDate(userId: string, entryDate: string, excludeId?: string) {
  const conds = [eq(timeEntries.userId, userId), eq(timeEntries.entryDate, entryDate)];
  if (excludeId) conds.push(ne(timeEntries.id, excludeId));
  return db.select().from(timeEntries).where(and(...conds));
}

export async function insertEntry(v: {
  userId: string;
  clientIdCode: string;
  entryDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
}): Promise<TimeEntryRow> {
  const [row] = await db
    .insert(timeEntries)
    .values({ ...v, hours: String(v.hours) })
    .returning();
  return row;
}

export async function getEntryById(id: string): Promise<TimeEntryRow | null> {
  const [row] = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateEntry(
  id: string,
  v: {
    clientIdCode: string;
    entryDate: string;
    startTime: string;
    endTime: string;
    hours: number;
    note: string | null;
  }
): Promise<TimeEntryRow> {
  const [row] = await db
    .update(timeEntries)
    .set({ ...v, hours: String(v.hours), updatedAt: new Date() })
    .where(eq(timeEntries.id, id))
    .returning();
  return row;
}

export async function deleteEntry(id: string): Promise<void> {
  await db.delete(timeEntries).where(eq(timeEntries.id, id));
}

export function summaryRows(from: string, to: string) {
  return db
    .select({
      userId: timeEntries.userId,
      userName: users.name,
      userEmail: users.email,
      clientIdCode: timeEntries.clientIdCode,
      totalHours: sql<string>`sum(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(and(gte(timeEntries.entryDate, from), lte(timeEntries.entryDate, to)))
    .groupBy(timeEntries.userId, users.name, users.email, timeEntries.clientIdCode);
}
```

- [ ] **Step 2: Write the failing route tests — `src/app/api/hours/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  clientCodeExists: vi.fn(),
  listEntries: vi.fn(),
  insertEntry: vi.fn(),
  entriesOnDate: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import {
  clientCodeExists,
  listEntries,
  insertEntry,
  entriesOnDate,
} from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ADMIN = { user: { id: "admin-1", role: "admin" } };
const VIEWER = { user: { id: "viewer-1", role: "viewer" } };
const CLIENT = { user: { id: "client-1", role: "client" } };

function getReq(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/hours");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/hours", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const DB_ROW = {
  id: "e1",
  userId: "viewer-1",
  clientIdCode: "PURA",
  entryDate: "2026-07-16",
  startTime: "09:00:00",
  endTime: "11:30:00",
  hours: "2.50",
  note: null,
  createdAt: new Date(),
  updatedAt: null,
};

describe("GET /api/hours", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq({ from: "2026-07-13", to: "2026-07-19" }));
    expect(res.status).toBe(401);
  });

  it("403 for client role", async () => {
    asMock(getAuthSession).mockResolvedValue(CLIENT);
    const res = await GET(getReq({ from: "2026-07-13", to: "2026-07-19" }));
    expect(res.status).toBe(403);
  });

  it("400 without from/to", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    const res = await GET(getReq({}));
    expect(res.status).toBe(400);
  });

  it("returns own entries with HH:MM times and numeric hours", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(listEntries).mockResolvedValue([DB_ROW]);
    const res = await GET(getReq({ from: "2026-07-13", to: "2026-07-19" }));
    const json = await res.json();
    expect(listEntries).toHaveBeenCalledWith("viewer-1", "2026-07-13", "2026-07-19");
    expect(json.entries[0]).toMatchObject({
      id: "e1",
      startTime: "09:00",
      endTime: "11:30",
      hours: 2.5,
    });
  });

  it("non-admin requesting another userId gets 403", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    const res = await GET(
      getReq({ from: "2026-07-13", to: "2026-07-19", userId: "someone-else" })
    );
    expect(res.status).toBe(403);
  });

  it("admin can request another userId", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(listEntries).mockResolvedValue([]);
    const res = await GET(
      getReq({ from: "2026-07-13", to: "2026-07-19", userId: "viewer-1" })
    );
    expect(res.status).toBe(200);
    expect(listEntries).toHaveBeenCalledWith("viewer-1", "2026-07-13", "2026-07-19");
  });
});

describe("POST /api/hours", () => {
  beforeEach(() => vi.clearAllMocks());

  const VALID_BODY = {
    entryDate: "2026-07-16",
    clientIdCode: "PURA",
    startTime: "09:00",
    endTime: "11:30",
    note: null,
  };

  it("403 for client role", async () => {
    asMock(getAuthSession).mockResolvedValue(CLIENT);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("400 for unknown client code", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(false);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("400 for invalid range (end before start)", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    const res = await POST(
      postReq({ ...VALID_BODY, startTime: "11:00", endTime: "09:00" })
    );
    expect(res.status).toBe(400);
  });

  it("400 for invalid entryDate", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    const res = await POST(postReq({ ...VALID_BODY, entryDate: "16/07/2026" }));
    expect(res.status).toBe(400);
  });

  it("creates entry via durationHours and returns empty overlaps", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(insertEntry).mockResolvedValue(DB_ROW);
    const res = await POST(
      postReq({
        entryDate: "2026-07-16",
        clientIdCode: "PURA",
        startTime: "09:00",
        durationHours: 2.5,
        note: null,
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(insertEntry).toHaveBeenCalledWith({
      userId: "viewer-1",
      clientIdCode: "PURA",
      entryDate: "2026-07-16",
      startTime: "09:00",
      endTime: "11:30",
      hours: 2.5,
      note: null,
    });
    expect(json.overlaps).toEqual([]);
  });

  it("saves overlapping entry AND reports the conflict", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([
      { ...DB_ROW, id: "existing", startTime: "10:00:00", endTime: "12:00:00" },
    ]);
    asMock(insertEntry).mockResolvedValue(DB_ROW);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(insertEntry).toHaveBeenCalled(); // saved despite overlap
    expect(json.overlaps).toEqual([
      { id: "existing", clientIdCode: "PURA", startTime: "10:00", endTime: "12:00" },
    ]);
  });

  it("accepts INTERNAL without hitting client lookup rejection", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(insertEntry).mockResolvedValue({ ...DB_ROW, clientIdCode: "INTERNAL" });
    const res = await POST(postReq({ ...VALID_BODY, clientIdCode: "INTERNAL" }));
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/api/hours/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 4: Implement `src/app/api/hours/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import {
  normalizeRange,
  findOverlaps,
  isValidDateString,
} from "@/lib/hours/validation";
import {
  clientCodeExists,
  listEntries,
  insertEntry,
  entriesOnDate,
  type TimeEntryRow,
} from "@/lib/hours/queries";

const TEAM_ROLES = ["admin", "editor", "viewer"];

type SessionUser = { id: string; role: string };

export async function requireTeamUser(): Promise<
  { user: SessionUser } | NextResponse
> {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as unknown as SessionUser;
  if (!TEAM_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user };
}

export function serializeEntry(row: TimeEntryRow) {
  return {
    id: row.id,
    userId: row.userId,
    clientIdCode: row.clientIdCode,
    entryDate: row.entryDate,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    hours: Number(row.hours),
    note: row.note,
  };
}

/** Shared body validation for POST (here) and PATCH ([id]/route.ts). */
export async function validateEntryBody(body: {
  entryDate?: unknown;
  clientIdCode?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  durationHours?: unknown;
  note?: unknown;
}): Promise<
  | { ok: true; data: { entryDate: string; clientIdCode: string; startTime: string; endTime: string; hours: number; note: string | null } }
  | { ok: false; error: string }
> {
  const entryDate = typeof body.entryDate === "string" ? body.entryDate : "";
  if (!isValidDateString(entryDate)) {
    return { ok: false, error: "Invalid entryDate — expected YYYY-MM-DD" };
  }

  const clientIdCode =
    typeof body.clientIdCode === "string" ? body.clientIdCode.trim() : "";
  if (!clientIdCode || !(await clientCodeExists(clientIdCode))) {
    return { ok: false, error: `Unknown client code: ${clientIdCode || "(empty)"}` };
  }

  const norm = normalizeRange({
    startTime: typeof body.startTime === "string" ? body.startTime : "",
    endTime: typeof body.endTime === "string" ? body.endTime : undefined,
    durationHours:
      typeof body.durationHours === "number" ? body.durationHours : undefined,
  });
  if (!norm.ok) return norm;

  const note =
    typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim() : null;

  return {
    ok: true,
    data: { entryDate, clientIdCode, ...norm.range, note },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const requestedUserId = req.nextUrl.searchParams.get("userId");
  let userId = auth.user.id;
  if (requestedUserId && requestedUserId !== auth.user.id) {
    if (auth.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = requestedUserId;
  }

  const rows = await listEntries(userId, from, to);
  return NextResponse.json({ entries: rows.map(serializeEntry) });
}

export async function POST(req: NextRequest) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = await validateEntryBody(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { data } = validated;

  const sameDay = await entriesOnDate(auth.user.id, data.entryDate);
  const overlaps = findOverlaps(
    { startTime: data.startTime, endTime: data.endTime },
    sameDay.map((r) => ({
      id: r.id,
      clientIdCode: r.clientIdCode,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
    }))
  );

  const row = await insertEntry({ userId: auth.user.id, ...data });

  return NextResponse.json(
    { entry: serializeEntry(row), overlaps },
    { status: 201 }
  );
}
```

Note: Next.js App Router only treats HTTP-verb exports as handlers; the extra exports (`requireTeamUser`, `serializeEntry`, `validateEntryBody`) are imported by `[id]/route.ts` and `summary/route.ts` in Tasks 4-5. If `npm run build` complains about non-verb exports from a route file, move those three helpers to a new file `src/lib/hours/route-helpers.ts` instead and update imports — behavior identical.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/hours/route.test.ts src/lib/hours/validation.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/lib/hours/queries.ts src/app/api/hours/route.ts src/app/api/hours/route.test.ts
git commit -m "feat(hours): GET/POST /api/hours with overlap warnings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `PATCH`/`DELETE /api/hours/[id]`

**Files:**
- Create: `src/app/api/hours/[id]/route.ts`
- Test: `src/app/api/hours/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireTeamUser`, `serializeEntry`, `validateEntryBody` from Task 3's route (or `@/lib/hours/route-helpers` if relocated); `getEntryById`, `updateEntry`, `deleteEntry`, `entriesOnDate` from `@/lib/hours/queries`; `findOverlaps` from `@/lib/hours/validation`.
- Produces: `PATCH /api/hours/[id]` (full body, same shape as POST) → 200 `{ entry, overlaps }`; `DELETE /api/hours/[id]` → 200 `{ ok: true }`. Owner-or-admin on both.

- [ ] **Step 1: Write the failing tests — `src/app/api/hours/[id]/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  clientCodeExists: vi.fn(),
  entriesOnDate: vi.fn(),
  getEntryById: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  listEntries: vi.fn(),
  insertEntry: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import {
  clientCodeExists,
  entriesOnDate,
  getEntryById,
  updateEntry,
  deleteEntry,
} from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const OWNER = { user: { id: "owner-1", role: "viewer" } };
const OTHER = { user: { id: "other-1", role: "editor" } };
const ADMIN = { user: { id: "admin-1", role: "admin" } };

const DB_ROW = {
  id: "e1",
  userId: "owner-1",
  clientIdCode: "PURA",
  entryDate: "2026-07-16",
  startTime: "09:00:00",
  endTime: "11:30:00",
  hours: "2.50",
  note: null,
  createdAt: new Date(),
  updatedAt: null,
};

const BODY = {
  entryDate: "2026-07-16",
  clientIdCode: "PURA",
  startTime: "10:00",
  endTime: "12:00",
  note: "updated",
};

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/hours/e1", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "e1" }) };

describe("PATCH /api/hours/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
  });

  it("404 when entry does not exist", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(null);
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(404);
  });

  it("403 when a non-admin edits someone else's entry", async () => {
    asMock(getAuthSession).mockResolvedValue(OTHER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(403);
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it("owner can update; overlap check excludes the entry itself", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    asMock(updateEntry).mockResolvedValue({
      ...DB_ROW,
      startTime: "10:00:00",
      endTime: "12:00:00",
      hours: "2.00",
      note: "updated",
    });
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(200);
    expect(entriesOnDate).toHaveBeenCalledWith("owner-1", "2026-07-16", "e1");
    const json = await res.json();
    expect(json.entry.hours).toBe(2);
  });

  it("admin can update anyone's entry (overlaps computed against the OWNER's day)", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    asMock(updateEntry).mockResolvedValue(DB_ROW);
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(200);
    expect(entriesOnDate).toHaveBeenCalledWith("owner-1", "2026-07-16", "e1");
  });
});

describe("DELETE /api/hours/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 when a non-admin deletes someone else's entry", async () => {
    asMock(getAuthSession).mockResolvedValue(OTHER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(403);
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("owner can delete", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(deleteEntry).toHaveBeenCalledWith("e1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/hours/[id]/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement `src/app/api/hours/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  requireTeamUser,
  serializeEntry,
  validateEntryBody,
} from "../route";
import { findOverlaps } from "@/lib/hours/validation";
import {
  getEntryById,
  updateEntry,
  deleteEntry,
  entriesOnDate,
} from "@/lib/hours/queries";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwned(id: string, user: { id: string; role: string }) {
  const entry = await getEntryById(id);
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (entry.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return entry;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const entry = await loadOwned(id, auth.user);
  if (entry instanceof NextResponse) return entry;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = await validateEntryBody(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { data } = validated;

  // Overlaps are computed against the entry OWNER's other entries that day,
  // excluding the entry being edited.
  const sameDay = await entriesOnDate(entry.userId, data.entryDate, id);
  const overlaps = findOverlaps(
    { startTime: data.startTime, endTime: data.endTime },
    sameDay.map((r) => ({
      id: r.id,
      clientIdCode: r.clientIdCode,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
    }))
  );

  const updated = await updateEntry(id, data);
  return NextResponse.json({ entry: serializeEntry(updated), overlaps });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const entry = await loadOwned(id, auth.user);
  if (entry instanceof NextResponse) return entry;

  await deleteEntry(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/hours/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/hours/[id]/route.ts" "src/app/api/hours/[id]/route.test.ts"
git commit -m "feat(hours): PATCH/DELETE /api/hours/[id] with ownership checks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `GET /api/hours/summary` (admin pivots)

**Files:**
- Create: `src/app/api/hours/summary/route.ts`
- Test: `src/app/api/hours/summary/route.test.ts`

**Interfaces:**
- Consumes: `summaryRows` from `@/lib/hours/queries`; `isValidDateString` from `@/lib/hours/validation`; `getAuthSession` from `@/lib/auth-db`.
- Produces (Task 7 consumes this):

```ts
type Summary = {
  byMember: {
    userId: string;
    name: string | null;
    email: string;
    totalHours: number;
    clients: { clientIdCode: string; hours: number }[];
  }[];
  byClient: {
    clientIdCode: string;
    totalHours: number;
    members: { userId: string; name: string | null; hours: number }[];
  }[];
};
```

Both lists sorted by `totalHours` descending; nested lists sorted by `hours` descending.

- [ ] **Step 1: Write the failing tests — `src/app/api/hours/summary/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({ summaryRows: vi.fn() }));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { summaryRows } from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function req(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/hours/summary");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const RANGE = { from: "2026-07-01", to: "2026-07-31" };

describe("GET /api/hours/summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for non-admin team member", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "v1", role: "viewer" } });
    const res = await GET(req(RANGE));
    expect(res.status).toBe(403);
  });

  it("401 unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(req(RANGE));
    expect(res.status).toBe(401);
  });

  it("400 with missing/invalid range", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const res = await GET(req({ from: "2026-07-01" }));
    expect(res.status).toBe(400);
  });

  it("pivots rows into byMember and byClient, sorted by hours desc", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin" } });
    asMock(summaryRows).mockResolvedValue([
      { userId: "u1", userName: "Ana", userEmail: "ana@mf.io", clientIdCode: "PURA", totalHours: "10.50" },
      { userId: "u1", userName: "Ana", userEmail: "ana@mf.io", clientIdCode: "INTERNAL", totalHours: "2.00" },
      { userId: "u2", userName: "Bo", userEmail: "bo@mf.io", clientIdCode: "PURA", totalHours: "20.00" },
    ]);

    const res = await GET(req(RANGE));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.byMember).toEqual([
      {
        userId: "u2", name: "Bo", email: "bo@mf.io", totalHours: 20,
        clients: [{ clientIdCode: "PURA", hours: 20 }],
      },
      {
        userId: "u1", name: "Ana", email: "ana@mf.io", totalHours: 12.5,
        clients: [
          { clientIdCode: "PURA", hours: 10.5 },
          { clientIdCode: "INTERNAL", hours: 2 },
        ],
      },
    ]);

    expect(json.byClient).toEqual([
      {
        clientIdCode: "PURA", totalHours: 30.5,
        members: [
          { userId: "u2", name: "Bo", hours: 20 },
          { userId: "u1", name: "Ana", hours: 10.5 },
        ],
      },
      {
        clientIdCode: "INTERNAL", totalHours: 2,
        members: [{ userId: "u1", name: "Ana", hours: 2 }],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/hours/summary/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement `src/app/api/hours/summary/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isValidDateString } from "@/lib/hours/validation";
import { summaryRows } from "@/lib/hours/queries";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const rows = await summaryRows(from, to);

  const byMemberMap = new Map<
    string,
    { userId: string; name: string | null; email: string; totalHours: number; clients: { clientIdCode: string; hours: number }[] }
  >();
  const byClientMap = new Map<
    string,
    { clientIdCode: string; totalHours: number; members: { userId: string; name: string | null; hours: number }[] }
  >();

  for (const r of rows) {
    const hours = Number(r.totalHours);

    let member = byMemberMap.get(r.userId);
    if (!member) {
      member = { userId: r.userId, name: r.userName, email: r.userEmail, totalHours: 0, clients: [] };
      byMemberMap.set(r.userId, member);
    }
    member.totalHours = Math.round((member.totalHours + hours) * 100) / 100;
    member.clients.push({ clientIdCode: r.clientIdCode, hours });

    let client = byClientMap.get(r.clientIdCode);
    if (!client) {
      client = { clientIdCode: r.clientIdCode, totalHours: 0, members: [] };
      byClientMap.set(r.clientIdCode, client);
    }
    client.totalHours = Math.round((client.totalHours + hours) * 100) / 100;
    client.members.push({ userId: r.userId, name: r.userName, hours });
  }

  const byMember = [...byMemberMap.values()]
    .map((m) => ({ ...m, clients: m.clients.sort((a, b) => b.hours - a.hours) }))
    .sort((a, b) => b.totalHours - a.totalHours);
  const byClient = [...byClientMap.values()]
    .map((c) => ({ ...c, members: c.members.sort((a, b) => b.hours - a.hours) }))
    .sort((a, b) => b.totalHours - a.totalHours);

  return NextResponse.json({ byMember, byClient });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/hours/summary/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the FULL hours test suite + typecheck**

Run: `npx vitest run src/lib/hours src/app/api/hours && npx tsc --noEmit`
Expected: all PASS, no new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/hours/summary/route.ts src/app/api/hours/summary/route.test.ts
git commit -m "feat(hours): admin summary endpoint with member/client pivots

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `/hours` page + navigation

**Files:**
- Create: `src/app/hours/page.tsx`
- Create: `src/components/hours/hours-tracker.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (topLevelItems array, ~line 57)
- Modify: `src/components/layout/top-nav.tsx` (matching nav array, ~line 151)
- Modify: `src/components/layout/command-palette.tsx` (~line 67, next to the Calendar entry)

**Interfaces:**
- Consumes: `GET/POST /api/hours` + `PATCH/DELETE /api/hours/[id]` (Tasks 3-4); `GET /api/clients` (existing — returns `{ clientIdCode, clientName }[]`; check the exact response shape in `src/app/api/clients/route.ts` before wiring, it may be wrapped in an object).
- Produces: route `/hours`.

No component unit tests (spec scopes testing to validation + API). Verification is manual against the running dev server in Step 4.

- [ ] **Step 1: Create `src/components/hours/hours-tracker.tsx`**

Client component. Follow the codebase's existing React Query + shadcn idioms (look at a mid-size page like `src/app/calendar/page.tsx` for query patterns if needed). Complete implementation:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  normalizeRange,
  findOverlaps,
  minutesToTime,
  parseTimeToMinutes,
} from "@/lib/hours/validation";

type ApiEntry = {
  id: string;
  userId: string;
  clientIdCode: string;
  entryDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
};

type ClientOption = { clientIdCode: string; clientName: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday..Sunday range containing `today`. */
function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: isoDate(monday), to: isoDate(sunday) };
}

export function HoursTracker() {
  const queryClient = useQueryClient();
  const week = useMemo(currentWeekRange, []);

  const [mode, setMode] = useState<"range" | "duration">("range");
  const [entryDate, setEntryDate] = useState(() => isoDate(new Date()));
  const [clientIdCode, setClientIdCode] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      const json = await res.json();
      // /api/clients returns an array of { clientIdCode, clientName }
      return Array.isArray(json) ? json : json.clients;
    },
  });

  const { data: entries = [], isLoading } = useQuery<ApiEntry[]>({
    queryKey: ["hours", week.from, week.to],
    queryFn: async () => {
      const res = await fetch(`/api/hours?from=${week.from}&to=${week.to}`);
      if (!res.ok) throw new Error("Failed to load hours");
      return (await res.json()).entries;
    },
  });

  // Live end-time preview in duration mode
  const computedEnd = useMemo(() => {
    if (mode !== "duration") return null;
    const start = parseTimeToMinutes(startTime);
    const dur = Number(duration);
    if (start === null || !Number.isFinite(dur) || dur <= 0) return null;
    const end = start + Math.round(dur * 60);
    return end < 24 * 60 ? minutesToTime(end) : null;
  }, [mode, startTime, duration]);

  const createEntry = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        entryDate,
        clientIdCode,
        startTime,
        note: note || null,
      };
      if (mode === "range") body.endTime = endTime;
      else body.durationHours = Number(duration);

      const res = await fetch("/api/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save entry");
      return json as { entry: ApiEntry; overlaps: ApiEntry[] };
    },
    onSuccess: ({ overlaps }) => {
      queryClient.invalidateQueries({ queryKey: ["hours"] });
      setEndTime("");
      setDuration("");
      setNote("");
      if (overlaps.length > 0) {
        const o = overlaps[0];
        toast.warning(
          `Overlaps an existing entry: ${o.clientIdCode} ${o.startTime}–${o.endTime}`
        );
      } else {
        toast.success("Hours logged");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hours/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hours"] });
      toast.success("Entry deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Client-side pre-submit validation mirrors the server
  const canSubmit = useMemo(() => {
    if (!clientIdCode || !entryDate) return false;
    const input =
      mode === "range"
        ? { startTime, endTime }
        : { startTime, durationHours: Number(duration) };
    return normalizeRange(input).ok;
  }, [clientIdCode, entryDate, mode, startTime, endTime, duration]);

  // Badge overlapping entries per day (same rule as the server)
  const overlapIds = useMemo(() => {
    const ids = new Set<string>();
    const byDay = new Map<string, ApiEntry[]>();
    for (const e of entries) {
      const list = byDay.get(e.entryDate) ?? [];
      list.push(e);
      byDay.set(e.entryDate, list);
    }
    for (const list of byDay.values()) {
      for (const e of list) {
        const others = list.filter((o) => o.id !== e.id);
        if (findOverlaps(e, others).length > 0) ids.add(e.id);
      }
    }
    return ids;
  }, [entries]);

  const weekTotal = entries.reduce((sum, e) => sum + e.hours, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="hours-date">Date</label>
          <Input
            id="hours-date"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Client</label>
          <Select value={clientIdCode} onValueChange={setClientIdCode}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INTERNAL">Internal (non-client)</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                  {c.clientName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="hours-start">Start</label>
          <Input
            id="hours-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-28"
          />
        </div>

        {mode === "range" ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="hours-end">End</label>
            <Input
              id="hours-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-28"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="hours-duration">
              Hours{computedEnd ? ` (ends ${computedEnd})` : ""}
            </label>
            <Input
              id="hours-duration"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-28"
              placeholder="2.5"
            />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMode(mode === "range" ? "duration" : "range")}
        >
          {mode === "range" ? "Use duration" : "Use end time"}
        </Button>

        <div className="min-w-48 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="hours-note">Note (optional)</label>
          <Input
            id="hours-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you work on?"
          />
        </div>

        <Button
          onClick={() => createEntry.mutate()}
          disabled={!canSubmit || createEntry.isPending}
        >
          Log hours
        </Button>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">
            This week ({week.from} → {week.to})
          </h2>
          <span className="text-sm text-muted-foreground">
            Total: {Math.round(weekTotal * 100) / 100}h
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Note</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hours logged this week yet.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.entryDate}</TableCell>
                  <TableCell>
                    {e.clientIdCode}
                    {overlapIds.has(e.id) && (
                      <Badge variant="outline" className="ml-2 text-amber-600">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        overlap
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.startTime}–{e.endTime}
                  </TableCell>
                  <TableCell className="text-right">{e.hours}h</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {e.note}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEntry.mutate(e.id)}
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

Adjust imports to whatever actually exists in `src/components/ui/` (e.g. if there is no `Select`, use the pattern the SEO or products pages use for client dropdowns). Read `DESIGN.md` before finalizing any visual choices — spacing/colors must follow it.

- [ ] **Step 2: Create `src/app/hours/page.tsx`**

```tsx
"use client";

import { useSession } from "next-auth/react";
import { HoursTracker } from "@/components/hours/hours-tracker";

const TEAM_ROLES = ["admin", "editor", "viewer"];

export default function HoursPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === "loading") return null;
  if (!role || !TEAM_ROLES.includes(role)) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You don&apos;t have access to the hours tracker.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Hours</h1>
        <p className="text-sm text-muted-foreground">
          Log where your working time went, per client.
        </p>
      </div>
      <HoursTracker />
    </div>
  );
}
```

Before writing this, check how sibling pages (e.g. `src/app/calendar/page.tsx`) structure their header — if they use `PageMetaSlot` or a shared layout wrapper, match it.

- [ ] **Step 3: Add nav entries**

In `src/components/layout/app-sidebar.tsx`: add `Clock` to the lucide import, then in `topLevelItems` (after the Calendar item):

```ts
{ title: "Hours", href: "/hours", icon: Clock, visible: role === "admin" || role === "editor" || role === "viewer" },
```

In `src/components/layout/top-nav.tsx`: same item in the equivalent array (~line 151), matching that file's local idiom for `visible`.

In `src/components/layout/command-palette.tsx` (~line 67): `{ label: "Hours", href: "/hours", icon: Clock },` with `Clock` added to its lucide import.

- [ ] **Step 4: Verify against the running dev server**

Run: `npx tsc --noEmit` → no new errors.
With the dev server on port 3000 (preview server `mfhub-dev`), open `http://localhost:3000/hours` as a logged-in team user:
- Form renders with client dropdown populated.
- Log an entry 09:00–11:30 → appears in week list, total 2.5h.
- Log 10:00 + 1h duration same day → saved AND warning toast about overlap; both rows show overlap badge.
- Delete both entries → list empties.
- "Hours" appears in the sidebar.
⚠️ If local login is broken (known risk: `.env.local` overwritten 07-10), verify what you can (page compiles/renders redirect) and report the blocker instead of claiming success.

- [ ] **Step 5: Commit**

```bash
git add src/app/hours/page.tsx src/components/hours/hours-tracker.tsx src/components/layout/app-sidebar.tsx src/components/layout/top-nav.tsx src/components/layout/command-palette.tsx
git commit -m "feat(hours): /hours page with dual-mode entry and week list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Admin Hours view in the Users section

**Files:**
- Create: `src/components/admin/hours-overview.tsx`
- Modify: `src/app/admin/users/page.tsx` (add a view toggle; keep the diff minimal — this file is 1021 lines and must NOT absorb the new feature's logic)

**Interfaces:**
- Consumes: `GET /api/hours/summary?from&to` (Task 5's `Summary` shape).

- [ ] **Step 1: Create `src/components/admin/hours-overview.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";

type Summary = {
  byMember: {
    userId: string;
    name: string | null;
    email: string;
    totalHours: number;
    clients: { clientIdCode: string; hours: number }[];
  }[];
  byClient: {
    clientIdCode: string;
    totalHours: number;
    members: { userId: string; name: string | null; hours: number }[];
  }[];
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

export function HoursOverview() {
  const initial = useMemo(currentMonthRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [pivot, setPivot] = useState<"member" | "client">("client");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<Summary>({
    queryKey: ["hours-summary", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/hours/summary?from=${from}&to=${to}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load summary");
      return res.json();
    },
  });

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="hours-from">From</label>
          <Input id="hours-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="hours-to">To</label>
          <Input id="hours-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="flex gap-1">
          <Button
            variant={pivot === "client" ? "default" : "outline"}
            size="sm"
            onClick={() => setPivot("client")}
          >
            By client
          </Button>
          <Button
            variant={pivot === "member" ? "default" : "outline"}
            size="sm"
            onClick={() => setPivot("member")}
          >
            By member
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : pivot === "client" ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.byClient ?? []).map((c) => (
              <>
                <TableRow
                  key={c.clientIdCode}
                  className="cursor-pointer"
                  onClick={() => toggle(c.clientIdCode)}
                >
                  <TableCell>
                    {expanded.has(c.clientIdCode) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{c.clientIdCode}</TableCell>
                  <TableCell className="text-right">{c.totalHours}h</TableCell>
                </TableRow>
                {expanded.has(c.clientIdCode) &&
                  c.members.map((m) => (
                    <TableRow key={`${c.clientIdCode}-${m.userId}`} className="bg-muted/40">
                      <TableCell />
                      <TableCell className="pl-8 text-muted-foreground">
                        {m.name ?? m.userId}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {m.hours}h
                      </TableCell>
                    </TableRow>
                  ))}
              </>
            ))}
            {(data?.byClient ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No hours logged in this range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Team member</TableHead>
              <TableHead className="text-right">Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.byMember ?? []).map((m) => (
              <>
                <TableRow
                  key={m.userId}
                  className="cursor-pointer"
                  onClick={() => toggle(m.userId)}
                >
                  <TableCell>
                    {expanded.has(m.userId) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{m.name ?? m.email}</TableCell>
                  <TableCell className="text-right">{m.totalHours}h</TableCell>
                </TableRow>
                {expanded.has(m.userId) &&
                  m.clients.map((c) => (
                    <TableRow key={`${m.userId}-${c.clientIdCode}`} className="bg-muted/40">
                      <TableCell />
                      <TableCell className="pl-8 text-muted-foreground">
                        {c.clientIdCode}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {c.hours}h
                      </TableCell>
                    </TableRow>
                  ))}
              </>
            ))}
            {(data?.byMember ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No hours logged in this range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

Note: React fragments inside `TableBody` maps need keys — if lint complains, wrap each group in `<Fragment key={...}>` (import `Fragment` from react).

- [ ] **Step 2: Mount it in `src/app/admin/users/page.tsx`**

Read the file first (it is 1021 lines). Make the smallest possible change:
1. Add imports: `import { HoursOverview } from "@/components/admin/hours-overview";` and add `Clock` to the existing lucide import if not present.
2. Inside the page component, add: `const [adminView, setAdminView] = useState<"users" | "hours">("users");`
3. Find the top of the page's rendered content (immediately after the `PageMetaSlot` element or the outermost content wrapper). Insert a two-button toggle:

```tsx
<div className="mb-4 flex gap-1">
  <Button
    variant={adminView === "users" ? "default" : "outline"}
    size="sm"
    onClick={() => setAdminView("users")}
  >
    <UsersIcon className="mr-1.5 h-4 w-4" />
    Users
  </Button>
  <Button
    variant={adminView === "hours" ? "default" : "outline"}
    size="sm"
    onClick={() => setAdminView("hours")}
  >
    <Clock className="mr-1.5 h-4 w-4" />
    Hours
  </Button>
</div>
{adminView === "hours" ? (
  <HoursOverview />
) : (
  <>{/* existing page content, unchanged */}</>
)}
```

Wrap the EXISTING content in the conditional rather than restructuring it. Do not move or reformat existing JSX beyond the minimal wrap.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run src/lib/hours src/app/api/hours`
Expected: clean.
In the browser (port 3000): `/admin/users` as admin → toggle to Hours → current-month summary renders, By client / By member pivots both work, rows expand. Log an entry on `/hours` first so there is data.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/hours-overview.tsx src/app/admin/users/page.tsx
git commit -m "feat(hours): admin hours overview in Users section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all NEW tests pass. Pre-existing failures allowed ONLY if they are the known ~36 report-route failures from the `@/lib/api-auth` mock missing `getEffectiveAccountId` — compare against a `git stash`-free baseline if unsure. Any new failure is yours: fix it.

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: no new lint errors; build succeeds. (If the build rejects the helper exports from `src/app/api/hours/route.ts`, apply the relocation noted in Task 3 Step 4.)

- [ ] **Step 3: End-to-end smoke against dev server**

On `http://localhost:3000`: log in → `/hours` → create range entry, create duration entry that overlaps (expect warning toast + badge), delete one → `/admin/users` → Hours toggle → both pivots show the remaining entry. Clean up any test entries created in PROD-shared data (`INTERNAL` test rows: delete them via the UI).

- [ ] **Step 4: Report**

Report results honestly, including anything skipped (e.g. login broken locally) and the exact commands run. Do NOT push — remind the user that deploy requires their explicit OK.
