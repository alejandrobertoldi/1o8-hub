# Portal Per-Client Section Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move portal section visibility from per-user (`users.allowed_sections`) to per-client (`aac.allowed_sections`) and add a Sheet editor on `/portal` AdminPortalLanding as the sole place to manage it.

**Architecture:** Single new column on the `aac` table holds the visibility array. NextAuth session callback resolves it as the union across a user's assigned clients. A new `PATCH /api/clients/[clientIdCode]/sections` endpoint writes it. UI is a shadcn Sheet opened from a gear icon on each client card. All prior per-card and banner toggles are deleted.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, PostgreSQL (Supabase), NextAuth v5, shadcn/ui (Sheet, Checkbox, Button), TanStack Query, Vitest.

**Spec:** `/Users/manu/1o8Hub/docs/superpowers/specs/2026-05-28-portal-per-client-section-panel-design.md`

**Phase order (deviates from original brief):** foundation first (schema → session → API → UI add) then cleanup (delete inline toggles, /admin/users prune). This keeps the admin functional at every commit; we never have a window where the toggles are gone but the Sheet doesn't exist.

---

## Phase 1 — Foundation: schema, migration, session resolution

### Task 1: Backup current state

**Files:**
- Create: `scripts/migrations/2026-05-28-portal-per-client-sections/backup.sql`

- [ ] **Step 1: Write backup script**

```sql
-- scripts/migrations/2026-05-28-portal-per-client-sections/backup.sql
-- Rollback snapshots — run before migration.sql.
-- Restores via INSERT INTO ... SELECT FROM backup tables.

DROP TABLE IF EXISTS "_backup_aac_2026_05_28";
CREATE TABLE "_backup_aac_2026_05_28" AS
  SELECT * FROM "aac";

DROP TABLE IF EXISTS "_backup_users_sections_2026_05_28";
CREATE TABLE "_backup_users_sections_2026_05_28" AS
  SELECT id, email, role, client_id_code, allowed_sections
  FROM users
  WHERE role IN ('client','prospect');

-- Verify
SELECT COUNT(*) AS aac_rows FROM "_backup_aac_2026_05_28";
SELECT COUNT(*) AS users_rows FROM "_backup_users_sections_2026_05_28";
```

- [ ] **Step 2: Commit backup script (do not run yet)**

```bash
git add scripts/migrations/2026-05-28-portal-per-client-sections/backup.sql
git commit -m "$(cat <<'EOF'
feat(portal): backup script for per-client section migration

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Write migration SQL

**Files:**
- Create: `scripts/migrations/2026-05-28-portal-per-client-sections/migration.sql`

- [ ] **Step 1: Write migration**

```sql
-- scripts/migrations/2026-05-28-portal-per-client-sections/migration.sql
-- ALTER aac to add allowed_sections, then backfill from existing user grants.
-- Idempotent: re-running won't double-apply (UPDATE matches on clientIdCode).

-- 1. Add column with default matching DEFAULT_CLIENT_SECTIONS in src/lib/permissions.ts
ALTER TABLE "aac"
  ADD COLUMN IF NOT EXISTS "allowed_sections" text[] NOT NULL
  DEFAULT ARRAY[
    'timeline','sales','products','seo','design','reports','finances',
    'brandstory','aplus','listing-images','storefront','files','finance-reports'
  ]::text[];

-- 2. Backfill: for each client_id_code seen on a client/prospect user,
--    write the union of those users' allowed_sections to the aac row.
WITH user_unions AS (
  SELECT
    TRIM(unnested_code) AS code,
    array_agg(DISTINCT section) AS union_sections
  FROM users u
  CROSS JOIN LATERAL unnest(string_to_array(u.client_id_code, ',')) AS unnested_code
  CROSS JOIN LATERAL unnest(u.allowed_sections) AS section
  WHERE u.role IN ('client','prospect')
    AND u.client_id_code IS NOT NULL
    AND u.allowed_sections IS NOT NULL
  GROUP BY TRIM(unnested_code)
)
UPDATE "aac" a
SET allowed_sections = uu.union_sections
FROM user_unions uu
WHERE uu.code = a.client_id_code
  AND uu.union_sections IS NOT NULL
  AND array_length(uu.union_sections, 1) > 0;

-- 3. Verification queries (read-only; copy results into PR description)
SELECT
  client_id_code,
  client_name,
  allowed_sections,
  array_length(allowed_sections, 1) AS section_count
FROM "aac"
ORDER BY client_id_code;
```

- [ ] **Step 2: Commit migration**

```bash
git add scripts/migrations/2026-05-28-portal-per-client-sections/migration.sql
git commit -m "$(cat <<'EOF'
feat(portal): migration SQL — add aac.allowed_sections + backfill

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Run backup against Supabase (REQUIRES USER CONFIRMATION)**

Stop and ask user to confirm before running. Then:

```bash
# Read DATABASE_URL from .env.local
psql "$DATABASE_URL" -f scripts/migrations/2026-05-28-portal-per-client-sections/backup.sql
```

Expected: prints two row counts (`aac_rows`, `users_rows`).

- [ ] **Step 4: Run migration against Supabase (REQUIRES USER CONFIRMATION)**

```bash
psql "$DATABASE_URL" -f scripts/migrations/2026-05-28-portal-per-client-sections/migration.sql
```

Expected: `ALTER TABLE`, `UPDATE N` (where N = # of clients with users), final SELECT showing every aac row with a populated `allowed_sections`.

---

### Task 3: Update Drizzle schema

**Files:**
- Modify: `/Users/manu/1o8Hub/src/lib/db/schema.ts:319-342`

- [ ] **Step 1: Add `allowedSections` to the `aac` table definition**

Locate the `aac` table block at line 319. Add the new column after `clientLogoUrl`:

```ts
// in the columns object of the aac pgTable, after clientLogoUrl: text("client_logo_url"),
allowedSections: text("allowed_sections")
  .array()
  .notNull()
  .default([
    "timeline","sales","products","seo","design","reports","finances",
    "brandstory","aplus","listing-images","storefront","files","finance-reports",
  ]),
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors. If schema-type mismatch appears, the array type may need explicit `.$type<string[]>()` — add it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(db): declare aac.allowed_sections in Drizzle schema

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rewrite session callback to resolve per-client sections

**Files:**
- Locate (do not assume path): run `grep -rn "session.*callback\|jwt.*callback\|authorize" src/lib/auth.ts src/auth.ts src/lib/auth-config.ts 2>/dev/null | head` to find the NextAuth session callback. Likely at `src/lib/auth.ts` or `src/auth.ts`.
- Modify: that file
- Test: `src/lib/auth.test.ts` (create if absent)

- [ ] **Step 1: Locate the session callback**

```bash
grep -rn "callbacks:\|async session\|async jwt" /Users/manu/1o8Hub/src/lib/auth*.ts /Users/manu/1o8Hub/src/auth*.ts 2>/dev/null
```

Note the exact file and line range. Read the current callback fully (the surrounding 50 lines) before editing.

- [ ] **Step 2: Write the failing test**

Create `/Users/manu/1o8Hub/src/lib/auth.test.ts` (or extend existing one). Test the new helper that resolves sections:

```ts
import { describe, expect, it, vi } from "vitest";

// We'll extract the resolution logic into a pure helper for testability.
import { resolveClientAllowedSections } from "./auth-helpers";

describe("resolveClientAllowedSections", () => {
  it("returns empty when user has no clientIdCode", async () => {
    const fetchRows = vi.fn().mockResolvedValue([]);
    const result = await resolveClientAllowedSections(null, fetchRows);
    expect(result).toEqual([]);
    expect(fetchRows).not.toHaveBeenCalled();
  });

  it("unions allowed_sections across multiple assigned clients", async () => {
    const fetchRows = vi.fn().mockResolvedValue([
      { allowedSections: ["timeline", "sales"] },
      { allowedSections: ["sales", "aplus"] },
    ]);
    const result = await resolveClientAllowedSections("C1,C2", fetchRows);
    expect(new Set(result)).toEqual(new Set(["timeline", "sales", "aplus"]));
    expect(fetchRows).toHaveBeenCalledWith(["C1", "C2"]);
  });

  it("trims and deduplicates client codes", async () => {
    const fetchRows = vi.fn().mockResolvedValue([{ allowedSections: ["timeline"] }]);
    await resolveClientAllowedSections("  C1 , C1 ", fetchRows);
    expect(fetchRows).toHaveBeenCalledWith(["C1"]);
  });

  it("returns empty when all codes are blank", async () => {
    const fetchRows = vi.fn().mockResolvedValue([]);
    const result = await resolveClientAllowedSections(" , , ", fetchRows);
    expect(result).toEqual([]);
    expect(fetchRows).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test (expect fail — helper doesn't exist yet)**

```bash
npx vitest run src/lib/auth.test.ts
```

Expected: import error / module not found.

- [ ] **Step 4: Implement the helper**

Create `/Users/manu/1o8Hub/src/lib/auth-helpers.ts`:

```ts
/**
 * Resolves a client/prospect user's effective portal section access by
 * unioning aac.allowed_sections across every assigned client id code.
 *
 * Returns [] when no codes are present.
 */
export async function resolveClientAllowedSections(
  clientIdCode: string | null,
  fetchRows: (codes: string[]) => Promise<{ allowedSections: string[] }[]>,
): Promise<string[]> {
  if (!clientIdCode) return [];
  const codes = Array.from(
    new Set(
      clientIdCode
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  if (codes.length === 0) return [];
  const rows = await fetchRows(codes);
  const union = new Set<string>();
  for (const r of rows) {
    for (const s of r.allowedSections ?? []) union.add(s);
  }
  return Array.from(union);
}
```

- [ ] **Step 5: Run test (expect pass)**

```bash
npx vitest run src/lib/auth.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Wire into the NextAuth session callback**

In the session callback file (located in Step 1), import the helper and replace the existing line that assigns `session.user.allowedSections` for client/prospect roles:

```ts
import { resolveClientAllowedSections } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

// inside the session callback, after the user record is loaded:
if (user.role === "client" || user.role === "prospect") {
  session.user.allowedSections = await resolveClientAllowedSections(
    user.clientIdCode,
    async (codes) => {
      const rows = await db
        .select({ allowedSections: aac.allowedSections })
        .from(aac)
        .where(inArray(aac.clientIdCode, codes));
      return rows;
    },
  );
} else {
  // admin / editor / viewer / pending — keep existing per-user array
  session.user.allowedSections = user.allowedSections ?? [];
}
```

If the existing callback already reads `user.allowedSections` unconditionally, this replaces that line. Preserve all other session fields.

- [ ] **Step 7: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth-helpers.ts src/lib/auth.test.ts <session-callback-file>
git commit -m "$(cat <<'EOF'
feat(auth): resolve client portal sections from aac.allowed_sections

For client/prospect roles, session.user.allowedSections becomes the
union of aac.allowed_sections across assigned client codes. Internal
roles continue reading users.allowed_sections.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — API endpoint

### Task 5: PATCH /api/clients/[clientIdCode]/sections

**Files:**
- Create: `/Users/manu/1o8Hub/src/app/api/clients/[clientIdCode]/sections/route.ts`
- Test: `/Users/manu/1o8Hub/src/app/api/clients/[clientIdCode]/sections/route.test.ts`

- [ ] **Step 1: Read existing pattern for activity_log writes**

```bash
grep -n "activity_log\|activityLog\|insertActivityLog" /Users/manu/1o8Hub/src/app/api/admin/users/route.ts | head
```

Read 20 lines around any hit. Mirror the same pattern in the new route.

- [ ] **Step 2: Write the failing test**

Create `/Users/manu/1o8Hub/src/app/api/clients/[clientIdCode]/sections/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
  },
}));

import { auth } from "@/lib/auth";

function makeReq(body: unknown) {
  return new Request("http://test/api/clients/C1/sections", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/clients/[clientIdCode]/sections", () => {
  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "client", id: "u1" } } as never);
    const res = await PATCH(makeReq({ allowedSections: ["timeline"] }), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid section id", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(makeReq({ allowedSections: ["timeline", "not-a-real-section"] }), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid section/i);
  });

  it("returns 400 when allowedSections is missing or not an array", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(makeReq({}), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 with body on success", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(makeReq({ allowedSections: ["timeline", "sales"] }), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientIdCode).toBe("C1");
    expect(body.allowedSections).toEqual(["timeline", "sales"]);
  });
});
```

- [ ] **Step 3: Run test (expect fail — route doesn't exist)**

```bash
npx vitest run src/app/api/clients/\[clientIdCode\]/sections/route.test.ts
```

Expected: module-not-found / no PATCH export.

- [ ] **Step 4: Implement route**

Create `/Users/manu/1o8Hub/src/app/api/clients/[clientIdCode]/sections/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aac, activityLog } from "@/lib/db/schema";
import { VALID_SECTION_IDS } from "@/lib/permissions";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientIdCode: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowedSections = (body as { allowedSections?: unknown })?.allowedSections;
  if (!Array.isArray(allowedSections) || !allowedSections.every((s) => typeof s === "string")) {
    return NextResponse.json(
      { error: "allowedSections must be an array of strings" },
      { status: 400 },
    );
  }

  const validSet = new Set(VALID_SECTION_IDS);
  const invalid = allowedSections.filter((s) => !validSet.has(s));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid section IDs: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await db
    .update(aac)
    .set({ allowedSections, updatedAt: new Date() })
    .where(eq(aac.clientIdCode, clientIdCode))
    .returning({ clientIdCode: aac.clientIdCode, allowedSections: aac.allowedSections });

  if (result.length === 0) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Activity log — mirror /api/admin/users PUT pattern (replace field
  // names with whatever activityLog schema uses; see Task 5 step 1).
  await db.insert(activityLog).values({
    actorId: session.user.id,
    actorEmail: session.user.email ?? null,
    action: "portal.sections.update",
    targetType: "aac",
    targetId: clientIdCode,
    metadata: { allowedSections },
  });

  return NextResponse.json(result[0]);
}
```

If `activityLog` schema fields don't match what the existing /api/admin/users PUT does, ADAPT this insert to mirror that handler exactly.

- [ ] **Step 5: Run test (expect pass)**

```bash
npx vitest run src/app/api/clients/\[clientIdCode\]/sections/route.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/clients/\[clientIdCode\]/sections/
git commit -m "$(cat <<'EOF'
feat(api): PATCH /api/clients/[clientIdCode]/sections

Admin-only endpoint to write aac.allowed_sections. Validates against
VALID_SECTION_IDS, writes activity log row on success.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Extend GET /api/clients to include allowedSections

**Files:**
- Modify: `/Users/manu/1o8Hub/src/app/api/clients/route.ts`

- [ ] **Step 1: Read the current handler**

Read the full file. Note the current select shape.

- [ ] **Step 2: Add `allowedSections: aac.allowedSections` to the select**

Inside the select object, add the new field. Example shape (adapt to actual current code):

```ts
const rows = await db
  .select({
    clientIdCode: aac.clientIdCode,
    clientName: aac.clientName,
    clientStatus: aac.clientStatus,
    // ...existing fields...
    allowedSections: aac.allowedSections,
  })
  .from(aac)
  // ...existing where/order...
```

- [ ] **Step 3: Run typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clients/route.ts
git commit -m "$(cat <<'EOF'
feat(api): include allowedSections in GET /api/clients

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — ClientSectionsSheet component + AdminPortalLanding integration

### Task 7: Create ClientSectionsSheet component

**Files:**
- Create: `/Users/manu/1o8Hub/src/components/portal/client-sections-sheet.tsx`

- [ ] **Step 1: Verify shadcn Sheet primitive exists**

```bash
ls /Users/manu/1o8Hub/src/components/ui/sheet.tsx
```

If missing, install with `npx shadcn@latest add sheet`. If present, proceed.

- [ ] **Step 2: Write the component**

Create the file:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2, RotateCcw, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CONFIGURABLE_SECTIONS, DEFAULT_CLIENT_SECTIONS } from "@/lib/permissions";

// Sections relevant to the client portal. Excludes admin-only ids
// (activity, import, publish, export, clients, calendar, sync).
const CLIENT_VISIBLE_IDS = new Set<string>([
  "timeline",
  "sales",
  "products",
  "seo",
  "design",
  "brandstory",
  "aplus",
  "listing-images",
  "storefront",
  "files",
  "reports",
  "finances",
  "finance-reports",
]);

const CLIENT_SECTIONS = CONFIGURABLE_SECTIONS.filter((s) => CLIENT_VISIBLE_IDS.has(s.id));

type SheetClient = {
  clientIdCode: string;
  clientName: string;
  count: number;
  allowedSections: string[];
};

export function ClientSectionsSheet({
  client,
  open,
  onOpenChange,
}: {
  client: SheetClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string[]>(client?.allowedSections ?? []);

  // Reset local draft when a different client is opened
  // (cheap; runs only on open transitions)
  useMemo(() => {
    setDraft(client?.allowedSections ?? []);
  }, [client?.clientIdCode, client?.allowedSections]);

  const dirty =
    !!client &&
    (draft.length !== client.allowedSections.length ||
      draft.some((s) => !client.allowedSections.includes(s)));

  const mutation = useMutation({
    mutationFn: async (payload: { code: string; allowedSections: string[] }) => {
      const res = await fetch(`/api/clients/${payload.code}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedSections: payload.allowedSections }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-clients"] });
      toast.success("Section visibility updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!client) return null;

  function toggle(id: string) {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handleSaveAndPreview() {
    await mutation.mutateAsync({ code: client!.clientIdCode, allowedSections: draft });
    onOpenChange(false);
    router.push(`/portal?client=${client!.clientIdCode}`);
  }

  // Group by department for scannability
  const groups = new Map<string, typeof CLIENT_SECTIONS>();
  for (const s of CLIENT_SECTIONS) {
    const key = s.dept ?? s.id; // standalone uses its own id as group key
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-[family-name:var(--font-geist-sans)] tracking-tight">
            {client.clientName}
          </SheetTitle>
          <SheetDescription>
            {client.clientIdCode} ·{" "}
            {client.count > 0
              ? `${client.count} user${client.count === 1 ? "" : "s"} assigned`
              : "0 users assigned — visibility will apply when users are added"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 mt-4 mb-2">
          <Settings2 className="size-4 text-portal-accent" />
          <h3 className="text-sm font-semibold">Section Visibility</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Toggle which portal sections this client can see.
        </p>

        <div className="flex-1 overflow-y-auto space-y-3">
          {Array.from(groups.entries()).map(([groupKey, items]) => (
            <div
              key={groupKey}
              className="rounded-md border border-border/60 bg-card p-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                {groupKey === items[0].id
                  ? items[0].label
                  : groupKey.charAt(0).toUpperCase() + groupKey.slice(1)}
              </div>
              <div className="space-y-1.5">
                {items.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={draft.includes(s.id)}
                      onCheckedChange={() => toggle(s.id)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-4 border-t mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft(DEFAULT_CLIENT_SECTIONS.slice())}
            disabled={mutation.isPending}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSaveAndPreview}
            disabled={!dirty || mutation.isPending}
            className="gap-1.5"
          >
            Save & preview
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/portal/client-sections-sheet.tsx
git commit -m "$(cat <<'EOF'
feat(portal): ClientSectionsSheet — Sheet editor for per-client section visibility

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire ClientSectionsSheet into AdminPortalLanding

**Files:**
- Modify: `/Users/manu/1o8Hub/src/app/portal/page.tsx` (`AdminPortalLanding`, lines 405-841)

- [ ] **Step 1: Update ClientSummary type to carry allowedSections**

In `src/app/portal/page.tsx` around line 145, extend:

```ts
type ClientSummary = {
  clientIdCode: string;
  clientName: string;
  count: number;
  activeCount: number;
  allowedSections: string[];
};
```

- [ ] **Step 2: Add state + import**

In `AdminPortalLanding` (around line 405), add imports at top of file:

```ts
import { ClientSectionsSheet } from "@/components/portal/client-sections-sheet";
```

Add state inside the component (after `expandedUsers`):

```ts
const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);
```

- [ ] **Step 3: Add gear icon to each client card**

In the client card `<Link>` (line ~594), the card needs to expose a gear button that does NOT navigate. Convert the card wrapper from `<Link>` to a `<div>` containing the navigation Link + a separate gear button. Around line 594-641, replace with:

```tsx
{activeClients.map((client) => {
  const assignedUsers = usersByClient.get(client.clientIdCode) ?? [];
  return (
    <div
      key={client.clientIdCode}
      className="relative group rounded-xl border border-border/60 bg-card p-5 transition-all hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-brand/30"
    >
      <Link
        href={`/portal?client=${client.clientIdCode}`}
        className="block"
      >
        <div className="flex items-start justify-between pr-8">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-foreground font-[family-name:var(--font-geist-sans)] tracking-tight truncate">
              {client.clientName || client.clientIdCode}
            </h3>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {client.clientIdCode}
            </p>
          </div>
          <Eye className="size-4 text-muted-foreground/40 group-hover:text-portal-accent transition-colors shrink-0 ml-2" />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{client.activeCount} active</span>
            <span className="text-border">|</span>
            <span>{client.count} total</span>
          </div>
          {assignedUsers.length > 0 && (
            <div className="flex -space-x-1.5">
              {assignedUsers.slice(0, 3).map((u) => (
                <Avatar key={u.id} className="size-5 border border-background">
                  <AvatarImage src={u.image ?? undefined} />
                  <AvatarFallback className="text-[8px]">
                    {(u.name ?? u.email).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {assignedUsers.length > 3 && (
                <div className="size-5 rounded-full bg-muted border border-background flex items-center justify-center text-[8px] font-medium text-muted-foreground">
                  +{assignedUsers.length - 3}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-portal-accent opacity-60 group-hover:opacity-100 transition-opacity">
          Preview portal
          <ArrowRight className="size-3" />
        </div>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditingClient(client);
        }}
        title={`Configure section visibility for ${client.clientName || client.clientIdCode}`}
        className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-border transition-all"
      >
        <Settings2 className="size-3.5" />
      </button>
    </div>
  );
})}
```

Add `Settings2` to the lucide-react import at the top of the file if not already present.

- [ ] **Step 4: Render the Sheet at the bottom of AdminPortalLanding**

Right before the closing `</div>` of the component's return (just after the `<DeleteConfirmDialog />`), add:

```tsx
<ClientSectionsSheet
  client={editingClient}
  open={!!editingClient}
  onOpenChange={(o) => { if (!o) setEditingClient(null); }}
/>
```

- [ ] **Step 5: Smoke test in dev**

```bash
PORT=3000 npm run dev
```

Visit `http://localhost:3000/portal` as admin. Click gear icon on a client card. Sheet should open. Toggle one section. Click "Save & preview". Should toast, close, navigate to `/portal?client=<code>`. Re-open Sheet on same client → toggle persisted.

- [ ] **Step 6: Commit**

```bash
git add src/app/portal/page.tsx
git commit -m "$(cat <<'EOF'
feat(portal): gear icon + Sheet on AdminPortalLanding client cards

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Remove inline toggles + rewrite ClientDashboard dimming

### Task 9: Strip per-card toggles from ClientDashboard

**Files:**
- Modify: `/Users/manu/1o8Hub/src/app/portal/page.tsx` (`ClientDashboard`, lines 166-401)

- [ ] **Step 1: Remove inline-toggle state and mutations**

Delete these blocks from `ClientDashboard`:
- `previewBulkMutation` (lines ~218-239)
- `cardBulkState` function (lines ~210-216)
- `togglePreviewSection` function (lines ~241-256)

- [ ] **Step 2: Fetch the previewed client's allowedSections via /api/clients query**

Replace the existing `allUsers` query usage for dimming purposes. Add (inside `ClientDashboard`, near the top alongside existing `useQuery`):

```ts
const { data: portalClients = [] } = useQuery<ClientSummary[]>({
  queryKey: ["portal-clients"],
  queryFn: async () => {
    const res = await fetch("/api/clients");
    if (!res.ok) return [];
    return res.json();
  },
  enabled: !!(isAdmin && previewClient),
  staleTime: 5 * 60 * 1000,
});

const previewedClient = portalClients.find((c) => c.clientIdCode === previewClient);
const previewedAllowedSections = previewedClient?.allowedSections ?? [];
```

You may remove the `allUsers` query in this component if no other code uses it; leave it if `previewGroup` is still referenced anywhere else.

- [ ] **Step 3: Replace card-state derivation with direct check**

In the `visibleCards.map((card) => { ... })` block (line ~324), replace `const state = isAdminPreview && card.permission ? cardBulkState(card.permission) : "all";` with:

```ts
const cardAllowed = !card.permission
  ? true
  : isAdminPreview
    ? previewedAllowedSections.includes(card.permission)
    : true; // for real client, visibleCards is already filtered
const isDimmed = isAdminPreview && !cardAllowed;
```

Remove all references to `isMixed` and the "partial" badge.

- [ ] **Step 4: Remove the per-card toggle button**

Delete the entire `{isAdminPreview && card.permission && previewGroup.length > 0 && (<button ...>)}` block at lines ~355-371. Keep the card's `<Link>` and dimming class.

- [ ] **Step 5: Update the "No users — toggles disabled" badge**

In the admin preview banner (line ~298), remove the `previewGroup.length === 0 && (...)` badge — there are no toggles to disable anymore. Banner becomes purely informational.

You may also delete the `previewGroup` computation (lines ~198-208) if nothing else references it.

- [ ] **Step 6: Run typecheck and dev smoke test**

```bash
npx tsc --noEmit
PORT=3000 npm run dev
```

Visit `/portal?client=<code>` as admin. Dashboard should render with disabled cards dimmed. No toggle buttons or "partial" badges. Banner shows preview info + Exit link only.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/page.tsx
git commit -m "$(cat <<'EOF'
refactor(portal): strip inline section toggles from ClientDashboard

Dimming on admin-preview now reads from the previewed client's
aac.allowed_sections via /api/clients, not from per-user fan-out.
Per-card Eye/EyeOff buttons and the "partial" badge are removed —
the new home for visibility config is the AdminPortalLanding Sheet.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Remove AdminPreviewToggle banner

**Files:**
- Modify: `/Users/manu/1o8Hub/src/app/portal/layout.tsx`
- Delete: `/Users/manu/1o8Hub/src/components/portal/admin-preview-toggle.tsx`

- [ ] **Step 1: Remove from layout**

Open `/Users/manu/1o8Hub/src/app/portal/layout.tsx`. Remove the `<AdminPreviewToggle />` render and its import.

- [ ] **Step 2: Delete the component file**

```bash
git rm /Users/manu/1o8Hub/src/components/portal/admin-preview-toggle.tsx
```

- [ ] **Step 3: Verify no stale references**

```bash
grep -rn "admin-preview-toggle\|AdminPreviewToggle" /Users/manu/1o8Hub/src
```

Expected: no hits.

- [ ] **Step 4: Smoke test**

```bash
PORT=3000 npm run dev
```

Visit `/portal/sales?client=<code>` as admin. No banner toggle should appear. The subpage renders normally.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/layout.tsx
git commit -m "$(cat <<'EOF'
refactor(portal): remove AdminPreviewToggle banner

Section visibility is now managed in the AdminPortalLanding Sheet.
The per-subpage banner toggle is no longer needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Simplify AdminPortalLanding "Client Users & Section Access" table

**Files:**
- Modify: `/Users/manu/1o8Hub/src/app/portal/page.tsx` (the table block, lines 647-817)

- [ ] **Step 1: Rename heading**

Change "Client Users & Section Access" (line ~660) to "Client User Assignments".

- [ ] **Step 2: Drop section-checkbox columns from header and body**

Remove the `CLIENT_SECTIONS.map(...)` header cells (lines ~689-696) and the `CLIENT_SECTIONS.map((section) => <TableCell><Checkbox ... /></TableCell>)` body cells (lines ~782-790).

Also remove the `CLIENT_SECTIONS` constant declaration at the top of the file (lines ~133-141) if no other component references it. Run `grep -n "CLIENT_SECTIONS" src/app/portal/page.tsx` to confirm before deleting.

- [ ] **Step 3: Remove the now-unused `sectionMutation` and `toggleSection`**

Delete the `sectionMutation` block (lines ~445-462) and the `toggleSection` function (lines ~502-508).

- [ ] **Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke test**

Visit `/portal` as admin. The "Client User Assignments" expander should show: User / Email / Assigned Client / Last Login / Remove. No section checkboxes.

- [ ] **Step 6: Commit**

```bash
git add src/app/portal/page.tsx
git commit -m "$(cat <<'EOF'
refactor(portal): simplify Client User Assignments table

Section-checkbox columns removed from the user table — visibility is
managed per-client in the new Sheet. Table now shows User/Email/
Client/LastLogin/Remove only.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — /admin/users page cleanup

### Task 12: Remove client-row section controls from /admin/users

**Files:**
- Modify: `/Users/manu/1o8Hub/src/app/admin/users/page.tsx`

- [ ] **Step 1: Read the current page**

Read the entire file to locate:
- The per-client-group bulk toggle row (from commit `46b15b1d`)
- The per-user section checkbox row for client/prospect rows
- Where roles are grouped (look for `roleGroups` / `usersByClient` / similar)

- [ ] **Step 2: Gate the bulk-toggle row to internal roles only**

Find where the per-client-group bulk toggle row is rendered. Wrap its render in a condition that excludes `client` and `prospect` groups:

```tsx
{groupRole !== "client" && groupRole !== "prospect" && (
  // ...existing bulk-row JSX...
)}
```

If the bulk row currently renders for client-groups via comma-separated `clientIdCode`, the gate is on the role, not on the group key.

- [ ] **Step 3: Replace per-user section checkboxes for client/prospect rows**

Find where each user row renders the `CONFIGURABLE_SECTIONS.map(section => <Checkbox ... />)` cells. Wrap the rendering branch:

```tsx
{(user.role === "client" || user.role === "prospect") ? (
  <td colSpan={CONFIGURABLE_SECTIONS.length} className="text-center text-xs text-muted-foreground py-3">
    <Link href="/portal" className="text-portal-accent hover:underline inline-flex items-center gap-1">
      Managed in Client Portal
      <ArrowRight className="size-3" />
    </Link>
  </td>
) : (
  // existing per-section <td><Checkbox ... /></td> cells
)}
```

(Adapt `colSpan` to whatever the existing column count is.)

Add `Link` from `next/link` and `ArrowRight` from lucide-react if not already imported.

- [ ] **Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke test**

Visit `/admin/users` as admin. Internal team rows (admin/editor/viewer) still show per-section checkboxes and bulk toggle. Client/prospect rows show only "Managed in Client Portal →" link.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/users/page.tsx
git commit -m "$(cat <<'EOF'
refactor(admin/users): hide section controls for client/prospect rows

Per-user section checkboxes and per-client-group bulk toggle are
hidden for client/prospect users — section visibility is now managed
per-client in the Client Portal Sheet. Internal roles unchanged.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — End-to-end verification

### Task 13: Acceptance checklist

**Files:** none modified — verification only.

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: all tests pass, including the new ones from Task 4 and Task 5.

- [ ] **Step 2: Run lint and build**

```bash
npm run lint
npm run build
```

Expected: zero errors, zero new warnings.

- [ ] **Step 3: Manual verification — admin flow**

Log in as admin. Visit `/portal`:

- [ ] Each Active Client card shows a gear icon on hover (top-right, next to Eye).
- [ ] Clicking the card body navigates to `/portal?client=<code>` (preview).
- [ ] Clicking the gear opens the Sheet from the right (480px wide).
- [ ] Sheet header shows client name, code, user count.
- [ ] Sheet shows checkboxes for ~13 client-visible sections, grouped by department.
- [ ] Toggling a checkbox enables "Save & preview" button.
- [ ] "Reset to defaults" sets all default sections checked, others unchecked.
- [ ] "Save & preview" → success toast → Sheet closes → navigates to `/portal?client=<code>`.
- [ ] Dashboard dims the cards corresponding to disabled sections.
- [ ] Re-opening Sheet on same client shows the saved state.
- [ ] `/portal/sales?client=<code>` no longer shows the banner toggle.
- [ ] `/admin/users` shows internal section checkboxes for admin/editor/viewer; "Managed in Client Portal →" link for client/prospect.

- [ ] **Step 4: Manual verification — real client login**

Pick an existing client user (from a client that has a non-default `allowed_sections` after migration). Open an incognito window and log in as that user. Visit `/portal`:

- [ ] `ClientDashboard` renders only the cards whose `permission` matches the client's `allowed_sections`.
- [ ] Top nav does not expose sections the client can't access.
- [ ] Direct-URL access to a disabled subsection (e.g., `/portal/aplus` when `aplus` is not in the client's set) is denied by `canAccess` (currently: redirects or 403; whatever existing behavior is).

- [ ] **Step 5: Manual verification — multi-client user (if available)**

If any user has comma-separated `clientIdCode` (e.g., `"C1,C2"`):

- [ ] Log in as that user.
- [ ] Verify visible sections = union of C1.allowed_sections ∪ C2.allowed_sections.
- [ ] Admin toggles one section ON for C2 only → user (re-login or next session refresh) sees that section.

- [ ] **Step 6: Activity log spot-check**

In Drizzle Studio or via psql:

```sql
SELECT * FROM activity_log
WHERE action = 'portal.sections.update'
ORDER BY created_at DESC
LIMIT 10;
```

Expected: one row per Sheet save with actor, target (clientIdCode), and metadata.

- [ ] **Step 7: Final commit if any verification doc updates**

If acceptance produced documentation updates (e.g., README notes), commit them:

```bash
git add <any-doc-updates>
git commit -m "$(cat <<'EOF'
docs(portal): per-client section panel verification notes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

If no doc updates, skip.

---

## Open items to resolve during execution

These are NOT placeholders for the design — they are routine lookups that the executing engineer performs at the start of the relevant task:

1. **Session callback file location** (Task 4 Step 1) — confirmed by grep; not a design ambiguity.
2. **Activity log schema field names** (Task 5 Step 1 + Step 4) — mirror the exact insert pattern from `/api/admin/users` PUT handler.
3. **Whether `CLIENT_SECTIONS` constant in `src/app/portal/page.tsx` has any other readers** (Task 11 Step 2) — grep before deleting.

## Rollback

If something goes wrong after the migration runs:

```sql
-- Restore aac
TRUNCATE "aac";
INSERT INTO "aac" SELECT * FROM "_backup_aac_2026_05_28";

-- users.allowed_sections was not modified by migration.sql, so no
-- restore needed for users. The backup table exists as defense-in-depth.
```

For code-level rollback: `git revert` the relevant commits in reverse order (Task 12 → Task 11 → Task 10 → Task 9 → Task 8 → Task 7 → Task 6 → Task 5 → Task 4 → Task 3). The schema migration column is additive — leaving it in place after code revert is safe (column becomes unread).

End of plan.
