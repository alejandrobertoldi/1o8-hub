# Dynamic Inline Editing of Logged Hours — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editing an already-logged hours row on `/hours-log` immediate — click a cell to edit, move to another row whenever you like, never wait for a confirmation.

**Architecture:** Replace the single `editingId` + five scalar edit states in `hours-tracker.tsx` with a per-row `Map<string, Draft>` plus one `activeRowId`. Commit is driven off `activeRowId` **transitions** (never DOM `blur`, because shadcn `Select` portals fire spurious blurs), writes optimistically into the react-query cache via `setQueryData`, and never calls `invalidateQueries`. Success is silent; failures roll the cache back and pin a red, still-editable row. All decision logic lives in a new pure module `src/lib/hours/inline-edit.ts` so it is unit-testable without auth or a DOM.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, shadcn/ui (Radix), Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-30-hours-inline-edit-design.md` — read it before Task 1.

## Global Constraints

- Work **only** in the worktree `/Users/manu/MFHub-wt-hours-inline-edit`, branch `feat/hours-inline-edit`. Never edit `/Users/manu/MFHub` (that is the shared dev-server checkout — but *do* run the dev server from there).
- Tests: `node_modules/.bin/vitest run <path>`. Never `npm run build`.
- Typecheck: `node_modules/.bin/tsc --noEmit` — slow (~2 min), run in background.
- Vitest does **not** typecheck. Green tests do not prove the branch compiles; run `tsc` before claiming a task is done.
- Never `git add .`. Explicit pathspec on both `add` and `commit`; verify the staged diff. Keep `graphify-out/*` and `.claude/*` out of every commit.
- Commit flag order: `git commit -m "msg" -- <pathspec>`.
- One task per commit. Trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- No API route, DB query, or schema change. `src/app/api/hours/[id]/route.ts` is read-only reference.
- Existing helpers to reuse, never reimplement: `normalizeRange` (`src/lib/hours/validation.ts:118`), `findOverlaps`, `formatHoursMinutes`.
- `ApiEntry` shape (declared at `src/components/hours/hours-tracker.tsx:43`): `{ id: string; userId: string; clientIdCode: string; entryDate: string; startTime: string; endTime: string; hours: number; note: string | null; category: string | null }`.

---

### Task 1: `Draft` type, `draftFromEntry`, `isDraftDirty`

**Files:**
- Create: `src/lib/hours/inline-edit.ts`
- Test: `src/lib/hours/inline-edit.test.ts`

**Interfaces:**
- Consumes: `ApiEntry` — redeclare it as an exported type in `inline-edit.ts` (the component currently declares it locally; Task 4 switches the component to import it from here).
- Produces: `export type DraftStatus = "editing" | "saving" | "error"`, `export type Draft`, `export function draftFromEntry(entry: ApiEntry): Draft`, `export function isDraftDirty(draft: Draft): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/hours/inline-edit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftFromEntry, isDraftDirty, type ApiEntry } from "./inline-edit";

const entry: ApiEntry = {
  id: "e1",
  userId: "u1",
  clientIdCode: "INTERNAL",
  entryDate: "2026-07-22",
  startTime: "15:00",
  endTime: "15:30",
  hours: 0.5,
  note: "Checking emails",
  category: "Gmail",
};

describe("draftFromEntry", () => {
  it("seeds every editable field from the entry", () => {
    const d = draftFromEntry(entry);
    expect(d.clientIdCode).toBe("INTERNAL");
    expect(d.category).toBe("Gmail");
    expect(d.startTime).toBe("15:00");
    expect(d.endTime).toBe("15:30");
    expect(d.note).toBe("Checking emails");
    expect(d.status).toBe("editing");
    expect(d.error).toBeUndefined();
  });

  it("normalizes null note and category to empty strings", () => {
    const d = draftFromEntry({ ...entry, note: null, category: null });
    expect(d.note).toBe("");
    expect(d.category).toBe("");
  });

  it("keeps the original entry as the rollback snapshot", () => {
    expect(draftFromEntry(entry).snapshot).toEqual(entry);
  });
});

describe("isDraftDirty", () => {
  it("is false for an untouched draft", () => {
    expect(isDraftDirty(draftFromEntry(entry))).toBe(false);
  });

  it("is false when a null note is untouched (null vs empty string)", () => {
    expect(isDraftDirty(draftFromEntry({ ...entry, note: null }))).toBe(false);
  });

  it("detects a changed note", () => {
    expect(isDraftDirty({ ...draftFromEntry(entry), note: "Refining report" })).toBe(true);
  });

  it("detects a changed client, category, start and end", () => {
    const base = draftFromEntry(entry);
    expect(isDraftDirty({ ...base, clientIdCode: "DRC_SC_US" })).toBe(true);
    expect(isDraftDirty({ ...base, category: "Research" })).toBe(true);
    expect(isDraftDirty({ ...base, startTime: "14:00" })).toBe(true);
    expect(isDraftDirty({ ...base, endTime: "16:00" })).toBe(true);
  });

  it("treats a whitespace-only note change as clean", () => {
    expect(isDraftDirty({ ...draftFromEntry(entry), note: "  Checking emails  " })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/inline-edit.test.ts`
Expected: FAIL — cannot resolve `./inline-edit`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/hours/inline-edit.ts`:

```ts
/**
 * Pure decision logic for inline editing of logged hours rows.
 * No React, no DOM — all of this is unit-tested.
 */

export type ApiEntry = {
  id: string;
  userId: string;
  clientIdCode: string;
  entryDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
  category: string | null;
};

export type DraftStatus = "editing" | "saving" | "error";

export type Draft = {
  clientIdCode: string;
  category: string;
  startTime: string;
  endTime: string;
  note: string;
  status: DraftStatus;
  error?: string;
  /** Pre-edit row, used to roll the cache back on failure. */
  snapshot: ApiEntry;
};

export function draftFromEntry(entry: ApiEntry): Draft {
  return {
    clientIdCode: entry.clientIdCode,
    category: entry.category ?? "",
    startTime: entry.startTime,
    endTime: entry.endTime,
    note: entry.note ?? "",
    status: "editing",
    snapshot: entry,
  };
}

export function isDraftDirty(draft: Draft): boolean {
  const s = draft.snapshot;
  return (
    draft.clientIdCode !== s.clientIdCode ||
    draft.category !== (s.category ?? "") ||
    draft.startTime !== s.startTime ||
    draft.endTime !== s.endTime ||
    draft.note.trim() !== (s.note ?? "").trim()
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/inline-edit.test.ts`
Expected: PASS, 9 assertions across 2 describes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/inline-edit.ts src/lib/hours/inline-edit.test.ts
git commit -m "feat(hours): Draft type, draftFromEntry and isDraftDirty

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/inline-edit.ts src/lib/hours/inline-edit.test.ts
```

---

### Task 2: `isDraftValid`

**Files:**
- Modify: `src/lib/hours/inline-edit.ts`
- Test: `src/lib/hours/inline-edit.test.ts`

**Interfaces:**
- Consumes: `Draft` from Task 1; `normalizeRange` from `src/lib/hours/validation.ts` (signature: `normalizeRange({ startTime, endTime }) => { ok: true; range: { startTime: string; endTime: string; hours: number } } | { ok: false; error: string }`).
- Produces: `export function isDraftValid(draft: Draft): { ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/hours/inline-edit.test.ts` (and add `isDraftValid` to the import at the top of the file):

```ts
describe("isDraftValid", () => {
  it("accepts a well-formed draft", () => {
    expect(isDraftValid(draftFromEntry(entry))).toEqual({ ok: true });
  });

  it("rejects a missing client with a user-facing reason", () => {
    const r = isDraftValid({ ...draftFromEntry(entry), clientIdCode: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Pick a client");
  });

  it("rejects a zero-length range", () => {
    const r = isDraftValid({ ...draftFromEntry(entry), startTime: "15:00", endTime: "15:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects a midnight-crossing range before it can reach the server", () => {
    const r = isDraftValid({ ...draftFromEntry(entry), startTime: "23:00", endTime: "01:00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/midnight/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/inline-edit.test.ts`
Expected: FAIL — `isDraftValid` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Add to `src/lib/hours/inline-edit.ts` (import `normalizeRange` at the top):

```ts
import { normalizeRange } from "./validation";

export function isDraftValid(draft: Draft): { ok: true } | { ok: false; error: string } {
  if (!draft.clientIdCode) return { ok: false, error: "Pick a client" };
  const r = normalizeRange({ startTime: draft.startTime, endTime: draft.endTime });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/inline-edit.test.ts`
Expected: PASS, all 3 describes.

Note: the midnight assertion passes because `normalizeRange` returns `"Entry would cross midnight — log it in the tracker to split it"` (`src/lib/hours/validation.ts:124`). The server's own midnight 400 is now only a backstop.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/inline-edit.ts src/lib/hours/inline-edit.test.ts
git commit -m "feat(hours): isDraftValid gates client and time range

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/inline-edit.ts src/lib/hours/inline-edit.test.ts
```

---

### Task 3: `applyDraftToRows` and `applyServerEntry`

**Files:**
- Modify: `src/lib/hours/inline-edit.ts`
- Test: `src/lib/hours/inline-edit.test.ts`

**Interfaces:**
- Consumes: `Draft`, `ApiEntry`, `normalizeRange`.
- Produces: `export function applyDraftToRows(rows: ApiEntry[], id: string, draft: Draft): ApiEntry[]`, `export function applyServerEntry(rows: ApiEntry[], entry: ApiEntry): ApiEntry[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/hours/inline-edit.test.ts` (add both functions to the top import):

```ts
const other: ApiEntry = {
  id: "e2",
  userId: "u1",
  clientIdCode: "DRC_SC_US",
  entryDate: "2026-07-22",
  startTime: "16:30",
  endTime: "17:00",
  hours: 0.5,
  note: null,
  category: "Research",
};

describe("applyDraftToRows", () => {
  it("patches only the target row and recomputes hours locally", () => {
    const draft = { ...draftFromEntry(entry), startTime: "15:00", endTime: "17:00" };
    const out = applyDraftToRows([entry, other], "e1", draft);
    expect(out[0].startTime).toBe("15:00");
    expect(out[0].endTime).toBe("17:00");
    expect(out[0].hours).toBe(2);
    expect(out[1]).toEqual(other);
  });

  it("writes empty note and category back as null", () => {
    const draft = { ...draftFromEntry(entry), note: "", category: "" };
    const out = applyDraftToRows([entry], "e1", draft);
    expect(out[0].note).toBeNull();
    expect(out[0].category).toBeNull();
  });

  it("trims the note", () => {
    const draft = { ...draftFromEntry(entry), note: "  Refining report  " };
    expect(applyDraftToRows([entry], "e1", draft)[0].note).toBe("Refining report");
  });

  it("preserves row order and identity fields", () => {
    const out = applyDraftToRows([entry, other], "e1", draftFromEntry(entry));
    expect(out.map((r) => r.id)).toEqual(["e1", "e2"]);
    expect(out[0].userId).toBe("u1");
    expect(out[0].entryDate).toBe("2026-07-22");
  });

  it("leaves rows untouched when the id is absent", () => {
    const rows = [entry, other];
    expect(applyDraftToRows(rows, "nope", draftFromEntry(entry))).toEqual(rows);
  });

  it("keeps the previous hours when the draft range is invalid", () => {
    const draft = { ...draftFromEntry(entry), startTime: "23:00", endTime: "01:00" };
    expect(applyDraftToRows([entry], "e1", draft)[0].hours).toBe(0.5);
  });
});

describe("applyServerEntry", () => {
  it("replaces the matching row wholesale", () => {
    const fromServer: ApiEntry = { ...entry, startTime: "15:00", endTime: "16:00", hours: 1 };
    const out = applyServerEntry([entry, other], fromServer);
    expect(out[0]).toEqual(fromServer);
    expect(out[1]).toEqual(other);
  });

  it("is a no-op when the row is gone", () => {
    expect(applyServerEntry([other], entry)).toEqual([other]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/hours/inline-edit.test.ts`
Expected: FAIL — `applyDraftToRows` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Add to `src/lib/hours/inline-edit.ts`:

```ts
/**
 * Optimistic cache patch. `hours` is recomputed locally so the row and the
 * day total update before the request resolves; an invalid range keeps the
 * previous hours rather than writing a bogus number.
 */
export function applyDraftToRows(rows: ApiEntry[], id: string, draft: Draft): ApiEntry[] {
  return rows.map((row) => {
    if (row.id !== id) return row;
    const r = normalizeRange({ startTime: draft.startTime, endTime: draft.endTime });
    const note = draft.note.trim();
    const category = draft.category.trim();
    return {
      ...row,
      clientIdCode: draft.clientIdCode,
      category: category === "" ? null : category,
      startTime: r.ok ? r.range.startTime : draft.startTime,
      endTime: r.ok ? r.range.endTime : draft.endTime,
      hours: r.ok ? r.range.hours : row.hours,
      note: note === "" ? null : note,
    };
  });
}

/** Authoritative patch with the row the server returned. */
export function applyServerEntry(rows: ApiEntry[], entry: ApiEntry): ApiEntry[] {
  return rows.map((row) => (row.id === entry.id ? entry : row));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/lib/hours/inline-edit.test.ts`
Expected: PASS, all 5 describes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hours/inline-edit.ts src/lib/hours/inline-edit.test.ts
git commit -m "feat(hours): optimistic and authoritative row patchers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/lib/hours/inline-edit.ts src/lib/hours/inline-edit.test.ts
```

---

### Task 4: Click-to-edit activation and the optimistic commit loop

This is the task that makes the feature work end-to-end. No unit tests — the behaviour is auth-gated and Radix-portal dependent. It is gated on `tsc` plus the dogfood steps below.

**Files:**
- Modify: `src/components/hours/hours-tracker.tsx` — remove the local `ApiEntry` declaration (`:43-53`) in favour of the import; replace the edit state block (`:305-371`); rewrite the edit row and display row (`:762-907`).

**Interfaces:**
- Consumes: everything exported from `src/lib/hours/inline-edit.ts` (Tasks 1-3).
- Produces: nothing importable — this is component-internal. Task 5 and Task 6 extend the same handlers by name: `openRow`, `commitRow`, `discardRow`, `patchDraft`.

- [ ] **Step 1: Replace the edit state block**

Delete `editingId`, `editClientIdCode`, `editStartTime`, `editEndTime`, `editNote`, `editCategory`, `startEdit`, `cancelEdit`, `saveEdit`, `editValid`, and the `updateEntry` mutation. In their place:

```tsx
const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
const [activeRowId, setActiveRowId] = useState<string | null>(null);
const [selectOpen, setSelectOpen] = useState(false);

const queryKey = ["hours", range.from, range.to] as const;

function patchDraft(id: string, patch: Partial<Draft>) {
  setDrafts((prev) => {
    const cur = prev.get(id);
    if (!cur) return prev;
    const next = new Map(prev);
    next.set(id, { ...cur, ...patch });
    return next;
  });
}

/** PATCH one row. Cache is already optimistically patched by commitRow. */
async function sendDraft(id: string, draft: Draft) {
  const res = await fetch(`/api/hours/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entryDate: draft.snapshot.entryDate,
      clientIdCode: draft.clientIdCode,
      category: draft.category.trim() || null,
      startTime: draft.startTime,
      endTime: draft.endTime,
      note: draft.note.trim() || null,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to update entry");
  return json.entry as ApiEntry;
}
```

- [ ] **Step 2: Add the open / commit / discard handlers**

```tsx
type FocusField = "client" | "category" | "time" | "note";

function openRow(entry: ApiEntry, field: FocusField) {
  setDrafts((prev) => {
    const next = new Map(prev);
    const existing = prev.get(entry.id);
    // Resuming a red or in-flight row keeps the typed values AND its original
    // snapshot, so a rollback still lands on the pre-first-edit row rather than
    // on a value that was itself never confirmed.
    next.set(
      entry.id,
      existing
        ? { ...existing, status: "editing", error: undefined }
        : draftFromEntry(entry)
    );
    return next;
  });
  setActiveRowId(entry.id);
  setFocusField(field);
}
```

Declare the focus state beside the others in Step 1:

```tsx
const [focusField, setFocusField] = useState<FocusField | null>(null);
```

`discardRow` and `commitRow` both call `setFocusField(null)` when they clear `activeRowId`.

```tsx
function discardRow(id: string) {
  setDrafts((prev) => {
    const next = new Map(prev);
    next.delete(id);
    return next;
  });
  setActiveRowId((cur) => (cur === id ? null : cur));
}

/** Optimistic, non-blocking. Returns immediately; the request settles later. */
function commitRow(id: string) {
  const draft = drafts.get(id);
  if (!draft) return;

  if (!isDraftDirty(draft)) {
    discardRow(id);
    return;
  }

  const valid = isDraftValid(draft);
  if (!valid.ok) {
    patchDraft(id, { status: "error", error: valid.error });
    setActiveRowId((cur) => (cur === id ? null : cur));
    return;
  }

  queryClient.setQueryData<ApiEntry[]>(queryKey, (rows) =>
    rows ? applyDraftToRows(rows, id, draft) : rows
  );
  patchDraft(id, { status: "saving", error: undefined });
  setActiveRowId((cur) => (cur === id ? null : cur));

  void sendDraft(id, draft).then((entry) => {
    queryClient.setQueryData<ApiEntry[]>(queryKey, (rows) =>
      rows ? applyServerEntry(rows, entry) : rows
    );
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  });
}
```

Failure handling is deliberately absent here — Task 5 adds the `.catch`. Leaving it out now keeps this task's diff reviewable; a failed save in this intermediate state logs an unhandled rejection, which Task 5 removes.

- [ ] **Step 3: Wire activation into the display row**

In the non-editing row (`:860-907`), make the four editable cells activate the row on click, delete the pencil button, and show the pending indicator. Each of the Client, Category, Time, and Note `TableCell`s gets:

```tsx
<TableCell className="cursor-text py-0.5" onClick={() => openRow(e, "client")}>
<TableCell className="cursor-text py-0.5" onClick={() => openRow(e, "category")}>
<TableCell className="cursor-text py-0.5" onClick={() => openRow(e, "time")}>
<TableCell className="cursor-text py-0.5" onClick={() => openRow(e, "note")}>
```

— in that column order (Client, Category, Time, Note), each replacing that cell's existing opening tag. The Hours cell (`:878`) gets no handler; it is computed.

Replace the pencil `Button` (`:886-894`) with the pending indicator, keeping the trash button as-is:

```tsx
{drafts.get(e.id)?.status === "saving" && (
  <span
    className="size-1.5 rounded-full bg-muted-foreground/50"
    aria-label="Saving"
  />
)}
```

The actions `TableCell` must **not** carry `onClick={() => openRow(e)}` — clicking near the trash must never open the row.

- [ ] **Step 4: Rewire the edit row to the draft**

The edit row renders when `e.id === activeRowId`. Read every value from `drafts.get(e.id)` and write through `patchDraft`. Replace the five control bindings (`:775`, `:795`, `:808-818`, `:825-827`) with:

```tsx
const d = drafts.get(e.id)!;
// Client
<Select
  value={d.clientIdCode}
  onValueChange={(v) => patchDraft(e.id, { clientIdCode: v })}
  onOpenChange={setSelectOpen}
>
// Category
<Select
  value={d.category}
  onValueChange={(v) => patchDraft(e.id, { category: v })}
  onOpenChange={setSelectOpen}
>
// Times
<TimeSelect value={d.startTime} onChange={(v) => patchDraft(e.id, { startTime: v })} ariaLabel="Edit start time" />
<TimeSelect value={d.endTime}   onChange={(v) => patchDraft(e.id, { endTime: v })}   ariaLabel="Edit end time" />
// Note
<Input
  value={d.note}
  onChange={(ev) => patchDraft(e.id, { note: ev.target.value })}
  autoFocus={focusField === "note"}
  onKeyDown={(ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); commitRow(e.id); }
    if (ev.key === "Escape") { ev.preventDefault(); discardRow(e.id); }
  }}
  placeholder="Note"
  aria-label="Edit note"
  className="h-8 text-sm"
/>
```

Add `const [focusField, setFocusField] = useState<"client" | "category" | "time" | "note" | null>(null);` beside the other state, set it in `openRow` via a second argument (`openRow(e, "note")`) from each cell's `onClick`, and clear it in `discardRow`/`commitRow`. The `hours` cell keeps rendering from `normalizeRange` as it does today, reading `d.startTime`/`d.endTime`.

The ✓ button calls `commitRow(e.id)` and is disabled only while `isDraftValid(d).ok === false`; ✕ calls `discardRow(e.id)`.

- [ ] **Step 5: Verify it compiles**

Run in background: `cd /Users/manu/MFHub-wt-hours-inline-edit && node_modules/.bin/tsc --noEmit`
Expected: exit 0, no output. Fix every error before continuing — Vitest would not have caught them.

- [ ] **Step 6: Run the existing hours tests for regressions**

Run: `node_modules/.bin/vitest run src/lib/hours src/components/hours`
Expected: PASS. If `src/components/hours` has no test files, that is fine — `src/lib/hours` must stay green.

- [ ] **Step 7: Dogfood the core loop**

Ask the user to run the dev server from `/Users/manu/MFHub` (`PORT=3000 npm run dev`, after checking out this branch there or pulling it) and confirm on `/hours-log`, in **both light and dark mode**:

1. Clicking a note cell opens the row with the caret already in the note field. No pencil exists.
2. Typing, then clicking a time cell on a **different** row: the first row closes and shows the new value immediately, the second row opens, and there is no toast and no perceptible wait.
3. Opening the client dropdown on the open row does **not** close or commit the row.
4. Editing three rows in quick succession lands all three; the day totals update.
5. Clicking through rows without changing anything fires **zero** PATCH requests (devtools Network tab).

- [ ] **Step 8: Commit**

```bash
git add src/components/hours/hours-tracker.tsx
git commit -m "feat(hours): click-to-edit rows with optimistic background commit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/hours/hours-tracker.tsx
```

---

### Task 5: Failure handling, red rows, retry, stale-response guard

**Files:**
- Modify: `src/components/hours/hours-tracker.tsx`

**Interfaces:**
- Consumes: `openRow`, `commitRow`, `patchDraft`, `sendDraft`, `applyServerEntry` from Task 4.
- Produces: nothing importable.

- [ ] **Step 1: Roll the cache back and mark the row on failure**

First, in `commitRow`, replace Task 4's `patchDraft(id, { status: "saving", error: undefined })` line with a captured object identity, so the stale-response guard below is a genuine `!==` identity check rather than a deep-equality guess:

```tsx
const savedDraft: Draft = { ...draft, status: "saving", error: undefined };
setDrafts((prev) => {
  const next = new Map(prev);
  next.set(id, savedDraft);
  return next;
});
```

Then replace the `void sendDraft(...)` chain with the version below — it adds the `.catch` and guards the success path against a response for a draft the user has since re-opened:

```tsx
void sendDraft(id, draft)
  .then((entry) => {
    // A second edit may have re-opened this row while the request was in
    // flight. Patch the cache, but never delete the newer draft.
    setDrafts((prev) => {
      const cur = prev.get(id);
      const superseded = cur !== undefined && cur !== savedDraft;
      if (!superseded) {
        queryClient.setQueryData<ApiEntry[]>(queryKey, (rows) =>
          rows ? applyServerEntry(rows, entry) : rows
        );
      }
      if (superseded) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  })
  .catch((err: Error) => {
    queryClient.setQueryData<ApiEntry[]>(queryKey, (rows) =>
      rows ? applyServerEntry(rows, draft.snapshot) : rows
    );
    patchDraft(id, { status: "error", error: err.message });
  });
```

Note that the rollback patches `draft.snapshot` back into the cache via `applyServerEntry` — that function replaces a row by `id`, and `snapshot` is a full `ApiEntry`, so it is the correct tool for a rollback as well as for a server response.

- [ ] **Step 2: Render error rows as red, open controls**

Change the edit-row condition from `e.id === activeRowId` to:

```tsx
const draft = drafts.get(e.id);
const isEditing = e.id === activeRowId || draft?.status === "error";
```

On the edit `TableRow`, when `draft?.status === "error"`, add `border border-brand-red/60` to the className and render the message plus a retry in the actions cell:

```tsx
{draft?.status === "error" && (
  <div className="flex items-center gap-1">
    <span className="text-xs text-brand-red" role="alert">{draft.error}</span>
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      onClick={() => commitRow(e.id)}
      aria-label="Retry save"
    >
      <RotateCcw className="h-4 w-4" />
    </Button>
  </div>
)}
```

Import `RotateCcw` from `lucide-react` alongside the existing icons. Retry works without special handling: `commitRow` re-reads the current draft, which still holds the typed values.

- [ ] **Step 3: Clear a draft when its row is deleted**

In the `removeEntry` mutation's `onSuccess`, drop any draft for the deleted id so a red row cannot outlive its entry:

```tsx
setDrafts((prev) => {
  if (!prev.has(deletedId)) return prev;
  const next = new Map(prev);
  next.delete(deletedId);
  return next;
});
```

Thread the id through by changing the mutation to `mutationFn: async (id: string) => { …; return id; }` and reading it in `onSuccess`.

- [ ] **Step 4: Verify it compiles**

Run in background: `cd /Users/manu/MFHub-wt-hours-inline-edit && node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Dogfood the failure paths**

Ask the user to confirm on the dev server, light and dark:

1. Clear the client on a row and click away → the row stays open, turns red, shows "Pick a client", and other rows remain editable.
2. Edit a row into a midnight crossing (e.g. `23:00`–`01:00`) → red row with the midnight message, no request sent.
3. Kill the network (devtools offline) and edit a row → the row reverts visually, then goes red with a network error; retry with the network back on succeeds and the red clears.
4. Delete a row that is showing red → no orphan row remains.

- [ ] **Step 6: Commit**

```bash
git add src/components/hours/hours-tracker.tsx
git commit -m "feat(hours): roll back and pin failed inline edits to their row

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/hours/hours-tracker.tsx
```

---

### Task 6: Outside-click commit, refetch safety, full dogfood

**Files:**
- Modify: `src/components/hours/hours-tracker.tsx`

**Interfaces:**
- Consumes: `commitRow`, `activeRowId`, `selectOpen`, `drafts` from Tasks 4-5.
- Produces: nothing importable.

- [ ] **Step 1: Commit on a click outside the open row**

Add one document-level listener. It must be suppressed while a `Select` dropdown is open, because Radix renders that dropdown in a portal outside the row — without the guard, opening the client dropdown would commit the row.

```tsx
useEffect(() => {
  if (!activeRowId) return;
  function onPointerDown(ev: PointerEvent) {
    if (selectOpen) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest(`[data-row-id="${activeRowId}"]`)) return;
    commitRow(activeRowId!);
  }
  document.addEventListener("pointerdown", onPointerDown);
  return () => document.removeEventListener("pointerdown", onPointerDown);
}, [activeRowId, selectOpen, drafts]);
```

Add `data-row-id={e.id}` to both the display and edit `TableRow`s so the containment check has something to match.

- [ ] **Step 2: Commit on range change and unmount**

```tsx
useEffect(() => {
  return () => {
    if (activeRowId) commitRow(activeRowId);
  };
  // Commit the open row when the visible range changes or the tracker unmounts.
}, [range.from, range.to]);
```

- [ ] **Step 3: Stop background refetches from clobbering drafts**

On the hours `useQuery` (`:191-198`), add:

```tsx
refetchOnWindowFocus: drafts.size === 0,
```

Confirm by reading the file that no `invalidateQueries({ queryKey: ["hours"] })` call remains in the update path. The one in `createEntry.onSuccess` (`:235`) and the one in `removeEntry.onSuccess` stay — those are user-initiated and have no open draft.

- [ ] **Step 4: Verify it compiles and the suite is green**

Run in background: `cd /Users/manu/MFHub-wt-hours-inline-edit && node_modules/.bin/tsc --noEmit`
Expected: exit 0.

Run: `node_modules/.bin/vitest run src/lib/hours src/app/api/hours`
Expected: PASS.

- [ ] **Step 5: Full dogfood — the spec's nine-item checklist**

Ask the user to walk the complete checklist in `docs/superpowers/specs/2026-07-30-hours-inline-edit-design.md` ("Dogfood checklist"), in **both light and dark mode**. Items 3 and 8 are the two most likely to be quietly broken:

3. Opening the client dropdown on the active row must not commit the row.
8. Clicking through three rows changing nothing must fire zero network requests.

Plus, specific to this task:

- Clicking the "This Week" preset while a row is open commits it, then the range refetches.
- Clicking in the log form above the table commits the open row.
- Alt-tabbing away and back while a row is mid-save does not revert the row.

- [ ] **Step 6: Commit**

```bash
git add src/components/hours/hours-tracker.tsx
git commit -m "feat(hours): commit open row on outside click, range change, unmount

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- src/components/hours/hours-tracker.tsx
```

- [ ] **Step 7: Whole-branch review**

Use `superpowers:requesting-code-review` against `main` before proposing a PR. Do not push or open a PR without the user's explicit per-action OK.

---

## Notes for the executor

- Tasks 1-3 are test-gated and can be verified without a browser. Tasks 4-6 are auth-gated UI; they end in a user dogfood step and **cannot** be marked done on your own judgement.
- The dev server runs from `/Users/manu/MFHub`, not this worktree. The user drives it.
- If a dogfood step fails, use `superpowers:systematic-debugging` before proposing a fix.
- Do not add a success toast back in. Silence on success is the point of the feature.
