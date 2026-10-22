# A+2 Premium Q&A — Populate from SEO Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Populate from SEO" project selector to the A+2 Premium Q&A module editor that fills the module's Q&A pairs from the chosen SEO project's `seo_qa.aplusQaSubset`, auto-matched to the set's ASIN.

**Architecture:** A pure helper module holds the testable logic (ASIN candidate list, truncation, best-row selection). Two new module-scoped API routes use it: a GET that lists choosable projects for the set's client, and a POST that re-resolves the matching `seo_qa` row server-side and replaces the module's items in a transaction. A small client component adds the dropdown + populate button to the qa module editor.

**Tech Stack:** Next.js 16 App Router route handlers, Drizzle ORM (postgres), React 19 + TanStack Query + shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-aplus2-premium-qa-populate-from-seo-design.md`

---

## File Structure

- **Create** `src/lib/aplus2/qa-from-seo.ts` — pure logic: constants, `candidateAsins`, `subsetToItems`, `pickQaRow`. No DB/IO. Unit-tested.
- **Create** `src/lib/aplus2/qa-from-seo.test.ts` — Vitest unit tests for the helper.
- **Create** `src/app/api/aplus2/modules/[moduleId]/seo-qa-sources/route.ts` — GET list of choosable SEO projects.
- **Create** `src/app/api/aplus2/modules/[moduleId]/populate-qa/route.ts` — POST populate action.
- **Create** `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-qa-populate.tsx` — dropdown + button client component.
- **Modify** `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-module-editor.tsx` — render the populate toolbar for qa modules.

---

## Task 1: Pure helper + tests

**Files:**
- Create: `src/lib/aplus2/qa-from-seo.ts`
- Test: `src/lib/aplus2/qa-from-seo.test.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/aplus2/qa-from-seo.ts`:

```ts
// Pure logic for populating an A+2 Premium Q&A module from SEO Manager output.
// No DB / IO here so it can be unit-tested in isolation.

// Module spec limits for the "qa" module (see src/lib/aplus2/module-specs.ts).
export const QA_QUESTION_MAX = 120;
export const QA_ANSWER_MAX = 250;

export type SeoQaSubsetPair = { id: string; question: string; answer: string };
export type QaItemData = { type: "qa"; question: string; answer: string };

/** Deduped, non-empty ASIN list to match against seo_asins.asin. */
export function candidateAsins(set: {
  scopeIdentifier: string;
  coveredAsins: string[] | null;
}): string[] {
  const all = [set.scopeIdentifier, ...(set.coveredAsins ?? [])]
    .map((a) => (a ?? "").trim())
    .filter((a) => a.length > 0);
  return Array.from(new Set(all));
}

/** Map an aplusQaSubset to module item data, truncating to the qa field limits. */
export function subsetToItems(subset: SeoQaSubsetPair[]): {
  items: QaItemData[];
  truncated: boolean;
} {
  let truncated = false;
  const items = subset.map((p) => {
    const rawQ = p.question ?? "";
    const rawA = p.answer ?? "";
    const question = rawQ.slice(0, QA_QUESTION_MAX);
    const answer = rawA.slice(0, QA_ANSWER_MAX);
    if (question.length < rawQ.length || answer.length < rawA.length) truncated = true;
    return { type: "qa" as const, question, answer };
  });
  return { items, truncated };
}

export type QaRow = { asin: string; asinId: string; subset: SeoQaSubsetPair[] };

/**
 * Choose the best seo_qa row for a set. Prefer the row whose ASIN matches the
 * set's scopeIdentifier, else the first row that has a non-empty subset.
 * Rows must already be reduced to the latest version per ASIN.
 */
export function pickQaRow(rows: QaRow[], scopeIdentifier: string): QaRow | null {
  const withSubset = rows.filter((r) => Array.isArray(r.subset) && r.subset.length > 0);
  if (withSubset.length === 0) return null;
  return withSubset.find((r) => r.asin === scopeIdentifier) ?? withSubset[0];
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/aplus2/qa-from-seo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  candidateAsins,
  subsetToItems,
  pickQaRow,
  QA_QUESTION_MAX,
  QA_ANSWER_MAX,
} from "./qa-from-seo";

describe("candidateAsins", () => {
  it("dedupes and drops empties, scopeIdentifier first", () => {
    expect(
      candidateAsins({ scopeIdentifier: "B01", coveredAsins: ["B02", "B01", "", "B03"] })
    ).toEqual(["B01", "B02", "B03"]);
  });
  it("handles null coveredAsins", () => {
    expect(candidateAsins({ scopeIdentifier: "B01", coveredAsins: null })).toEqual(["B01"]);
  });
});

describe("subsetToItems", () => {
  it("maps pairs to qa item data", () => {
    const { items, truncated } = subsetToItems([{ id: "1", question: "Q?", answer: "A." }]);
    expect(items).toEqual([{ type: "qa", question: "Q?", answer: "A." }]);
    expect(truncated).toBe(false);
  });
  it("truncates overlong text and flags it", () => {
    const longQ = "x".repeat(QA_QUESTION_MAX + 5);
    const longA = "y".repeat(QA_ANSWER_MAX + 5);
    const { items, truncated } = subsetToItems([{ id: "1", question: longQ, answer: longA }]);
    expect(items[0].question).toHaveLength(QA_QUESTION_MAX);
    expect(items[0].answer).toHaveLength(QA_ANSWER_MAX);
    expect(truncated).toBe(true);
  });
});

describe("pickQaRow", () => {
  const rows = [
    { asin: "B02", asinId: "a2", subset: [{ id: "1", question: "q", answer: "a" }] },
    { asin: "B01", asinId: "a1", subset: [{ id: "2", question: "q", answer: "a" }] },
  ];
  it("prefers the scopeIdentifier match", () => {
    expect(pickQaRow(rows, "B01")?.asinId).toBe("a1");
  });
  it("falls back to first row with a non-empty subset", () => {
    expect(pickQaRow(rows, "B99")?.asinId).toBe("a2");
  });
  it("returns null when no row has a subset", () => {
    expect(pickQaRow([{ asin: "B01", asinId: "a1", subset: [] }], "B01")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm run test -- src/lib/aplus2/qa-from-seo.test.ts`
Expected: PASS (all 7 tests). If FAIL, fix `qa-from-seo.ts` until green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/aplus2/qa-from-seo.ts src/lib/aplus2/qa-from-seo.test.ts
git commit -F - <<'EOF'
feat(aplus2): qa-from-seo helper for SEO Q&A populate

Pure logic + tests: ASIN candidate list, truncation to 120/250,
best seo_qa row selection.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: GET seo-qa-sources route

**Files:**
- Create: `src/app/api/aplus2/modules/[moduleId]/seo-qa-sources/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/aplus2/modules/[moduleId]/seo-qa-sources/route.ts`:

```ts
/**
 * GET /api/aplus2/modules/[moduleId]/seo-qa-sources
 *   Lists SEO projects (for the module's set's client) that have a Premium A+
 *   Q&A subset matching one of the set's ASINs.
 *   Response: { sources: Array<{ projectId, projectName, asin, asinId, pairCount }> }
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Modules,
  aplus2Versions,
  aplus2Sets,
  seoProjects,
  seoAsins,
  seoQa,
} from "@/lib/db/schema";
import { candidateAsins, pickQaRow, type QaRow } from "@/lib/aplus2/qa-from-seo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  const [mod] = await db
    .select({
      moduleType: aplus2Modules.moduleType,
      clientIdCode: aplus2Sets.clientIdCode,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      coveredAsins: aplus2Sets.coveredAsins,
    })
    .from(aplus2Modules)
    .innerJoin(aplus2Versions, eq(aplus2Versions.id, aplus2Modules.versionId))
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });
  if (mod.moduleType !== "qa") return NextResponse.json({ sources: [] });

  const asins = candidateAsins(mod);
  if (asins.length === 0) return NextResponse.json({ sources: [] });

  const rows = await db
    .select({
      projectId: seoProjects.id,
      projectName: seoProjects.name,
      asin: seoAsins.asin,
      asinId: seoAsins.id,
      subset: seoQa.aplusQaSubset,
      version: seoQa.version,
    })
    .from(seoProjects)
    .innerJoin(seoAsins, eq(seoAsins.projectId, seoProjects.id))
    .innerJoin(seoQa, eq(seoQa.asinId, seoAsins.id))
    .where(and(eq(seoProjects.clientIdCode, mod.clientIdCode), inArray(seoAsins.asin, asins)))
    .orderBy(seoAsins.id, desc(seoQa.version));

  // Reduce to latest version per asinId (first occurrence wins due to ORDER BY version DESC).
  const latestByAsin = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!latestByAsin.has(r.asinId)) latestByAsin.set(r.asinId, r);
  }

  // Group latest rows by project, then pick the best row per project.
  const byProject = new Map<string, { name: string; rows: QaRow[] }>();
  for (const r of latestByAsin.values()) {
    const entry = byProject.get(r.projectId) ?? { name: r.projectName, rows: [] };
    entry.rows.push({ asin: r.asin, asinId: r.asinId, subset: r.subset ?? [] });
    byProject.set(r.projectId, entry);
  }

  const sources = [];
  for (const [projectId, entry] of byProject) {
    const picked = pickQaRow(entry.rows, mod.scopeIdentifier);
    if (!picked) continue;
    sources.push({
      projectId,
      projectName: entry.name,
      asin: picked.asin,
      asinId: picked.asinId,
      pairCount: picked.subset.length,
    });
  }
  sources.sort((a, b) => a.projectName.localeCompare(b.projectName));

  return NextResponse.json({ sources });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing this file. (If the project has pre-existing tsc errors elsewhere, confirm none mention `seo-qa-sources`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/aplus2/modules/[moduleId]/seo-qa-sources/route.ts"
git commit -F - <<'EOF'
feat(aplus2): GET seo-qa-sources route

Lists SEO projects for the set's client that have a Premium A+ Q&A
subset matching one of the set's ASINs.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: POST populate-qa route

**Files:**
- Create: `src/app/api/aplus2/modules/[moduleId]/populate-qa/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/aplus2/modules/[moduleId]/populate-qa/route.ts`:

```ts
/**
 * POST /api/aplus2/modules/[moduleId]/populate-qa
 *   Body: { projectId: string }
 *   Re-resolves the matching seo_qa.aplusQaSubset server-side and REPLACES the
 *   module's Q&A items in a transaction. Truncates text to the qa field limits.
 *   Response: { items: [...], truncated: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Modules,
  aplus2Versions,
  aplus2Sets,
  aplus2ModuleItems,
  seoAsins,
  seoQa,
} from "@/lib/db/schema";
import { candidateAsins, pickQaRow, subsetToItems, type QaRow } from "@/lib/aplus2/qa-from-seo";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const body = (await req.json().catch(() => null)) as { projectId?: string } | null;
  if (!body?.projectId) {
    return NextResponse.json({ error: "Body must contain 'projectId'" }, { status: 400 });
  }

  const [mod] = await db
    .select({
      moduleType: aplus2Modules.moduleType,
      versionId: aplus2Modules.versionId,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      coveredAsins: aplus2Sets.coveredAsins,
    })
    .from(aplus2Modules)
    .innerJoin(aplus2Versions, eq(aplus2Versions.id, aplus2Modules.versionId))
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });
  if (mod.moduleType !== "qa") {
    return NextResponse.json({ error: "Module is not a Premium Q&A module" }, { status: 400 });
  }

  const asins = candidateAsins(mod);
  if (asins.length === 0) {
    return NextResponse.json({ error: "Set has no ASINs to match" }, { status: 400 });
  }

  const rows = await db
    .select({
      asin: seoAsins.asin,
      asinId: seoAsins.id,
      subset: seoQa.aplusQaSubset,
      version: seoQa.version,
    })
    .from(seoAsins)
    .innerJoin(seoQa, eq(seoQa.asinId, seoAsins.id))
    .where(and(eq(seoAsins.projectId, body.projectId), inArray(seoAsins.asin, asins)))
    .orderBy(seoAsins.id, desc(seoQa.version));

  const latestByAsin = new Map<string, QaRow>();
  for (const r of rows) {
    if (!latestByAsin.has(r.asinId)) {
      latestByAsin.set(r.asinId, { asin: r.asin, asinId: r.asinId, subset: r.subset ?? [] });
    }
  }

  const picked = pickQaRow([...latestByAsin.values()], mod.scopeIdentifier);
  if (!picked) {
    return NextResponse.json(
      { error: "No SEO Q&A found for this project and ASIN" },
      { status: 400 }
    );
  }

  const { items, truncated } = subsetToItems(picked.subset);

  const inserted = await db.transaction(async (tx) => {
    await tx.delete(aplus2ModuleItems).where(eq(aplus2ModuleItems.moduleId, moduleId));
    const values = items.map((data, i) => ({ moduleId, position: i + 1, data }));
    const result = values.length
      ? await tx.insert(aplus2ModuleItems).values(values).returning()
      : [];
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, mod.versionId));
    return result;
  });

  return NextResponse.json({ items: inserted, truncated });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing this file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/aplus2/modules/[moduleId]/populate-qa/route.ts"
git commit -F - <<'EOF'
feat(aplus2): POST populate-qa route

Re-resolves seo_qa.aplusQaSubset server-side and replaces the module's
Q&A items in a transaction, truncating to 120/250.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: UI — populate component + wire into editor

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-qa-populate.tsx`
- Modify: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-module-editor.tsx`

- [ ] **Step 1: Write the populate component**

Create `aplus2-qa-populate.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

type Source = { projectId: string; projectName: string; asin: string; asinId: string; pairCount: number };

export function Aplus2QaPopulate({ moduleId }: { moduleId: string }) {
  const [projectId, setProjectId] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["aplus2-qa-sources", moduleId],
    queryFn: async () => {
      const r = await fetch(`/api/aplus2/modules/${moduleId}/seo-qa-sources`);
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed");
      return (d as { sources: Source[] }).sources;
    },
  });
  const sources = data ?? [];

  const populateMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/aplus2/modules/${moduleId}/populate-qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed");
      return d as { items: unknown[]; truncated: boolean };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["aplus2-set"] });
      toast.success(
        `Loaded ${d.items.length} Q&A pair${d.items.length === 1 ? "" : "s"} from SEO` +
          (d.truncated ? " (some text truncated to fit limits)" : "")
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  if (!isLoading && sources.length === 0) {
    return <span className="text-[11px] text-muted-foreground">No SEO Q&A available for this client.</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={projectId} onValueChange={setProjectId}>
        <SelectTrigger className="h-7 text-xs w-[280px]">
          <SelectValue placeholder={isLoading ? "Loading…" : "Select SEO project…"} />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.projectId} value={s.projectId} className="text-xs">
              {s.projectName} · {s.asin} · {s.pairCount} pairs
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={!projectId || populateMut.isPending}
        onClick={() => {
          if (confirm("Replace the current Q&A pairs with SEO content?")) populateMut.mutate();
        }}
      >
        <Sparkles className="size-3 mr-1" /> Populate from SEO
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Import the component in the editor**

In `aplus2-module-editor.tsx`, add to the imports block (after the `Aplus2VideoSlot` import on line 17):

```tsx
import { Aplus2QaPopulate } from "./aplus2-qa-populate";
```

- [ ] **Step 3: Render the toolbar for qa modules**

In `aplus2-module-editor.tsx`, the module body opens with `<div className="p-4 space-y-4">` (line 150). Insert this block as the FIRST child of that div, immediately before the `{hasTwoCol ? (` expression:

```tsx
        {module.moduleType === "qa" && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-stone-200 dark:border-zinc-800 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">Populate from SEO Manager</span>
            <Aplus2QaPopulate moduleId={module.id} />
          </div>
        )}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: no new errors referencing `aplus2-qa-populate` or `aplus2-module-editor`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-qa-populate.tsx" "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-module-editor.tsx"
git commit -F - <<'EOF'
feat(aplus2): SEO project selector + Populate button on Premium Q&A

Adds a dropdown of the client's SEO projects with Q&A and a Populate
button to the qa module editor; replaces pairs via populate-qa route.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Smoke test (manual, in-browser) + full test run

**Files:** none (verification only)

- [ ] **Step 1: Run the full test + lint suite**

Run: `npm run test && npm run lint`
Expected: tests pass, no lint errors in the new/modified files.

- [ ] **Step 2: Start the dev server**

Run: `PORT=3000 npm run dev`

- [ ] **Step 3: Manual smoke test**

Open an A+2 set page for a client that also has an SEO project with a completed S6 (Q&A) for a matching ASIN: `/aplus2/{clientIdCode}/{marketplace}/{setIdentifier}`. Verify:
  1. A "Populate from SEO Manager" toolbar appears on the Premium Q&A (M07) module only.
  2. The dropdown lists that client's SEO projects as `Name · ASIN · N pairs`.
  3. Selecting a project and clicking "Populate from SEO" shows the confirm dialog.
  4. Confirming replaces the Q&A pairs with the SEO content; a success toast appears.
  5. The pair count and `(x/120)` / `(x/250)` counters reflect the loaded (and any truncated) text.
  6. For a client with no matching SEO Q&A, the toolbar shows "No SEO Q&A available for this client."

- [ ] **Step 4: Report results**

Report pass/fail with what was observed. Do NOT push — the user confirms pushes per-push.

---

## Notes for the implementer

- Auth pattern: every route checks `getAuthSession()` then `role` ∈ {admin, editor}, matching the sibling `items` route. Keep it.
- `seoQa.asinId` is nullable in the schema; the `innerJoin` on `seoQa.asinId = seoAsins.id` naturally excludes null rows.
- React Query invalidation key for the set snapshot is `["aplus2-set"]` (see `aplus2-repeatable-items.tsx`). Reuse it so the editor re-renders after populate.
- Do NOT touch the S7 stub (`src/lib/seo/phases/s7.ts`) or the SEO pipeline. This feature only reads `seo_qa`.
- No DB migration is needed — all tables already exist.
```
